import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BacklogApiClient } from '../src/client.js';
import { IssueService } from '../src/issues.js';

const tempDirs: string[] = [];
after(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

/**
 * backlog-js クライアントを差し替えた IssueService を作る
 *
 * @param stub - backlog-js クライアントの代わりに使うオブジェクト
 * @returns サービスと、記録された呼び出し内容
 */
function makeService(stub: Record<string, unknown>) {
    const client = new BacklogApiClient({ spaceId: 's', apiKey: 'k' });
    (client as unknown as { getClient: () => unknown }).getClient = () => stub;
    return new IssueService(client);
}

describe('listIssues / countIssues の検索条件', () => {
    test('プロジェクトキーを projectId[] に解決して渡す', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({
            getProject: async () => ({ id: 829224 }),
            getIssues: async (params: Record<string, unknown>) => { received = params; return []; },
        });

        await issues.listIssues({ projectIdOrKey: 'BL_I' });
        assert.deepEqual(received.projectId, [829224]);
    });

    test('絞込条件をそのまま渡す', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({
            getProject: async () => ({ id: 1 }),
            getIssues: async (params: Record<string, unknown>) => { received = params; return []; },
        });

        await issues.listIssues({
            projectIdOrKey: 'P',
            parentIssueId: [10, 11],
            milestoneId: [20],
            statusId: [1, 2],
            hasDueDate: false,
            parentChild: 4,
            dueDateSince: '2026-01-01',
            keyword: 'あ',
            count: 100,
            offset: 100,
            sort: 'dueDate',
            order: 'asc',
        });

        assert.deepEqual(received.parentIssueId, [10, 11]);
        assert.deepEqual(received.milestoneId, [20]);
        assert.deepEqual(received.statusId, [1, 2]);
        assert.equal(received.hasDueDate, false, 'false も送ること');
        assert.equal(received.parentChild, 4);
        assert.equal(received.dueDateSince, '2026-01-01');
        assert.equal(received.count, 100);
        assert.equal(received.offset, 100);
        assert.equal(received.sort, 'dueDate');
        assert.equal(received.order, 'asc');
    });

    test('空配列の絞込は送らない', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({ getIssues: async (p: Record<string, unknown>) => { received = p; return []; } });
        await issues.listIssues({ statusId: [], parentIssueId: [] });
        assert.equal('statusId' in received, false);
        assert.equal('parentIssueId' in received, false);
    });

    test('projectIdOrKey を省くとスペース横断になる', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({ getIssues: async (p: Record<string, unknown>) => { received = p; return []; } });
        await issues.listIssues({ keyword: 'x' });
        assert.equal('projectId' in received, false);
    });

    test('countIssues は count / offset / sort / order を送らない', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({
            getProject: async () => ({ id: 1 }),
            getIssuesCount: async (p: Record<string, unknown>) => { received = p; return { count: 253 }; },
        });

        const count = await issues.countIssues({
            projectIdOrKey: 'P', statusId: [1], count: 100, offset: 100, sort: 'created', order: 'desc',
        });

        assert.equal(count, 253);
        assert.deepEqual(received.statusId, [1]);
        for (const key of ['count', 'offset', 'sort', 'order']) {
            assert.equal(key in received, false, `${key} は送らないこと`);
        }
    });
});

describe('updateIssue の配列項目', () => {
    test('値がある場合はそのまま送る', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({ patchIssue: async (_k: string, p: Record<string, unknown>) => { received = p; return {}; } });
        await issues.updateIssue('P-1', { milestoneId: [1, 2], categoryId: [3], versionId: [4] });
        assert.deepEqual(received.milestoneId, [1, 2]);
        assert.deepEqual(received.categoryId, [3]);
        assert.deepEqual(received.versionId, [4]);
    });

    test('空配列は解除を表す [""] に変換する', async () => {
        // 実 API で確認済み: [] は送信されず無視、"" は error.unknownParameter、[""] だけが解除になる
        let received: Record<string, unknown> = {};
        const issues = makeService({ patchIssue: async (_k: string, p: Record<string, unknown>) => { received = p; return {}; } });
        await issues.updateIssue('P-1', { milestoneId: [], categoryId: [], versionId: [] });
        assert.deepEqual(received.milestoneId, ['']);
        assert.deepEqual(received.categoryId, ['']);
        assert.deepEqual(received.versionId, ['']);
    });

    test('指定しなかった項目は送らない', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({ patchIssue: async (_k: string, p: Record<string, unknown>) => { received = p; return {}; } });
        await issues.updateIssue('P-1', { summary: 'x' });
        for (const key of ['milestoneId', 'categoryId', 'versionId', 'statusId']) {
            assert.equal(key in received, false, `${key} は送らないこと`);
        }
    });

    test('assigneeId / parentIssueId の null は空文字で送る（解除）', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({ patchIssue: async (_k: string, p: Record<string, unknown>) => { received = p; return {}; } });
        await issues.updateIssue('P-1', { assigneeId: null, parentIssueId: null });
        assert.equal(received.assigneeId, '');
        assert.equal(received.parentIssueId, '');
    });

    test('resolutionId の 0 を欠落させない', async () => {
        let received: Record<string, unknown> = {};
        const issues = makeService({ patchIssue: async (_k: string, p: Record<string, unknown>) => { received = p; return {}; } });
        await issues.updateIssue('P-1', { resolutionId: 0 });
        assert.equal(received.resolutionId, 0);
    });
});

describe('downloadAttachments', () => {
    /**
     * 添付ダウンロード用のスタブを作る
     *
     * @param attachments - 課題の添付一覧
     * @returns backlog-js クライアントのスタブ
     */
    function attachmentStub(attachments: Array<{ id: number; name: string; size: number }>) {
        return {
            getIssueAttachments: async () => attachments,
            getIssueAttachment: async (_k: string, id: number) => {
                const found = attachments.find((a) => a.id === id)!;
                return { body: Readable.toWeb(Readable.from([Buffer.alloc(found.size, 'x')])) };
            },
        };
    }

    test('全件を元のファイル名で保存し、同名は連番にする', async () => {
        const dir = join(await mkdtemp(join(tmpdir(), 'blattach-')), 'nested');
        tempDirs.push(dir);

        const issues = makeService(attachmentStub([
            { id: 1, name: '設計:書.xlsx', size: 10 },
            { id: 2, name: '設計:書.xlsx', size: 20 },
            { id: 3, name: 'CON.txt', size: 30 },
        ]));

        const result = await issues.downloadAttachments('P-1', dir);

        assert.equal(result.count, 3);
        assert.equal(result.outputDir, dir);
        assert.deepEqual(result.files.map((f) => f.bytes), [10, 20, 30]);
        assert.deepEqual(result.files.map((f) => f.name), ['設計:書.xlsx', '設計:書.xlsx', 'CON.txt']);
        assert.deepEqual(
            (await readdir(dir)).sort(),
            ['_CON.txt', '設計_書 (2).xlsx', '設計_書.xlsx'],
        );
    });

    test('attachmentIds を指定するとその添付だけ保存する', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'blattach-'));
        tempDirs.push(dir);
        const issues = makeService(attachmentStub([
            { id: 1, name: 'a.txt', size: 1 },
            { id: 2, name: 'b.txt', size: 2 },
        ]));

        const result = await issues.downloadAttachments('P-1', dir, [2]);
        assert.equal(result.count, 1);
        assert.deepEqual(await readdir(dir), ['b.txt']);
    });

    test('attachmentIds に空配列を渡した場合は全件扱いにする', async () => {
        // 「0 件指定」と解釈すると、添付があるのに「添付なし」と誤報告してしまう
        const dir = await mkdtemp(join(tmpdir(), 'blattach-'));
        tempDirs.push(dir);
        const issues = makeService(attachmentStub([
            { id: 1, name: 'a.txt', size: 1 },
            { id: 2, name: 'b.txt', size: 2 },
        ]));

        assert.equal((await issues.downloadAttachments('P-1', dir, [])).count, 2);
    });

    test('存在しない添付IDを指定するとエラーにする', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'blattach-'));
        tempDirs.push(dir);
        const issues = makeService(attachmentStub([{ id: 1, name: 'a.txt', size: 1 }]));

        await assert.rejects(
            () => issues.downloadAttachments('P-1', dir, [99]),
            /添付ファイルID 99 が見つかりません/,
        );
    });

    test('添付が無い課題では 0 件を返す', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'blattach-'));
        tempDirs.push(dir);
        const issues = makeService(attachmentStub([]));
        assert.equal((await issues.downloadAttachments('P-1', dir)).count, 0);
    });
});

describe('findRecentCommentByContent', () => {
    test('新しい順に探して本文が一致するコメントを返す', async () => {
        const issues = makeService({
            getIssueComments: async () => [
                { id: 3, content: '別の内容' },
                { id: 2, content: '対応しました' },
                { id: 1, content: '対応しました' },
            ],
        });
        const found = await issues.findRecentCommentByContent('P-1', '対応しました');
        assert.equal(found?.id, 2, '同じ本文が複数あれば新しい方を返すこと');
    });

    test('一致しなければ undefined', async () => {
        const issues = makeService({ getIssueComments: async () => [{ id: 1, content: 'x' }] });
        assert.equal(await issues.findRecentCommentByContent('P-1', 'y'), undefined);
    });
});
