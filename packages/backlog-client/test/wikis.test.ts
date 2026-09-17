import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BacklogApiClient } from '../src/client.js';
import { WikiService } from '../src/wikis.js';

const tempDirs: string[] = [];
after(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

const WIKI = {
    id: 50, projectId: 77, name: '設計/API', content: '# 見出し\r\n本文',
    tags: [], attachments: [], sharedFiles: [], stars: [],
    createdUser: { id: 1, name: 'a' }, created: '2026-09-01T00:00:00Z',
    updatedUser: { id: 2, name: '山田 太郎' }, updated: '2026-09-02T00:00:00Z',
};

/** 同じ秒の中で版番号順に並ばない履歴（実 API で観測した並び） */
const HISTORY = [
    { pageId: 50, version: 2, name: 'x', content: 'b', createdUser: { id: 1, name: 'a' }, created: '2026-09-02T00:00:00Z' },
    { pageId: 50, version: 3, name: 'x', content: 'c', createdUser: { id: 2, name: '山田 太郎' }, created: '2026-09-02T00:00:00Z' },
    { pageId: 50, version: 1, name: 'x', content: 'a', createdUser: { id: 1, name: 'a' }, created: '2026-09-01T00:00:00Z' },
];

/**
 * backlog-js クライアントを差し替えた WikiService を作る
 *
 * @param stub - backlog-js クライアントの代わりに使うオブジェクト
 * @returns サービスと API クライアント
 */
function makeService(stub: Record<string, unknown>) {
    const client = new BacklogApiClient({ spaceId: 's', apiKey: 'k' });
    (client as unknown as { getClient: () => unknown }).getClient = () => stub;
    return { wikis: new WikiService(client), client };
}

describe('WikiService', () => {
    test('listWikis は空のキーワードを送らない', async () => {
        const received: Array<Record<string, unknown>> = [];
        const { wikis } = makeService({ getWikis: async (p: Record<string, unknown>) => { received.push(p); return []; } });

        await wikis.listWikis('PROJ', '');
        await wikis.listWikis('PROJ', '設計');
        assert.deepEqual(received, [{ projectIdOrKey: 'PROJ' }, { projectIdOrKey: 'PROJ', keyword: '設計' }]);
    });

    test('countWikis は件数を数値で返す', async () => {
        const { wikis } = makeService({ getWikisCount: async () => ({ count: 12 }) });
        assert.equal(await wikis.countWikis('PROJ'), 12);
    });

    test('addWiki はプロジェクトキーを projectId に解決する', async () => {
        let received: Record<string, unknown> = {};
        const { wikis } = makeService({
            getProject: async () => ({ id: 77 }),
            postWiki: async (p: Record<string, unknown>) => { received = p; return WIKI; },
        });

        await wikis.addWiki({ projectIdOrKey: 'PROJ', name: 'x', content: '' });
        assert.deepEqual(received, { projectId: 77, name: 'x', content: '' }, '未指定の mailNotify は送らないこと');
    });

    test('updateWiki は指定した項目だけ送る', async () => {
        let received: Record<string, unknown> = {};
        const { wikis } = makeService({ patchWiki: async (_id: number, p: Record<string, unknown>) => { received = p; return WIKI; } });

        await wikis.updateWiki(50, { name: '新名' });
        assert.deepEqual(received, { name: '新名' });
    });

    test('updateWiki は更新項目が無ければ API を呼ばずにエラー', async () => {
        let patched = false;
        const { wikis } = makeService({ patchWiki: async () => { patched = true; return WIKI; } });

        await assert.rejects(wikis.updateWiki(50, { mailNotify: true }), /更新する項目がありません/);
        assert.equal(patched, false);
    });

    test('getLatestVersion は並び順に頼らず版番号の最大値を採る', async () => {
        // 実 API では同じ秒の中の履歴が版番号順に並ばないことを確認している
        let received: Record<string, unknown> = {};
        const { wikis } = makeService({
            getWikisHistory: async (_id: number, p: Record<string, unknown>) => { received = p; return HISTORY; },
        });

        const latest = await wikis.getLatestVersion(50);
        assert.equal(latest.version, 3);
        assert.equal(latest.createdUser?.name, '山田 太郎');
        assert.deepEqual(received, { count: 100, order: 'desc' });
    });

    test('getLatestVersion は履歴が空（未編集の初期ページ）なら版 0', async () => {
        const { wikis } = makeService({ getWikisHistory: async () => [] });
        assert.deepEqual(await wikis.getLatestVersion(50), { version: 0, created: null, createdUser: null });
    });

    test('updateWiki は版 0 を渡すと、編集されていなければ更新し、編集済みなら拒否する', async () => {
        let history: unknown[] = [];
        let patched = 0;
        const { wikis } = makeService({
            getWikisHistory: async () => history,
            patchWiki: async () => { patched += 1; return WIKI; },
        });

        await wikis.updateWiki(50, { content: 'y', expectedVersion: 0 });
        assert.equal(patched, 1);

        history = HISTORY;
        await assert.rejects(wikis.updateWiki(50, { content: 'y', expectedVersion: 0 }), /読み込み後に更新されています/);
        assert.equal(patched, 1);
    });

    test('getWikiWithVersion は版を本文より先に読む', async () => {
        const order: string[] = [];
        const { wikis } = makeService({
            getWikisHistory: async () => { order.push('history'); return HISTORY; },
            getWiki: async () => { order.push('wiki'); return WIKI; },
        });

        const wiki = await wikis.getWikiWithVersion(50);
        assert.equal(wiki.version, 3);
        assert.equal(wiki.content, WIKI.content);
        assert.deepEqual(order, ['history', 'wiki']);
    });

    test('updateWiki は expectedVersion が一致すれば更新する', async () => {
        let patched = false;
        const { wikis } = makeService({
            getWikisHistory: async () => HISTORY,
            patchWiki: async () => { patched = true; return WIKI; },
        });

        await wikis.updateWiki(50, { content: 'y', expectedVersion: 3 });
        assert.equal(patched, true);
    });

    test('updateWiki は expectedVersion が食い違えば更新しない（他者の編集を上書きしない）', async () => {
        let patched = false;
        const { wikis } = makeService({
            getWikisHistory: async () => HISTORY,
            patchWiki: async () => { patched = true; return WIKI; },
        });

        await assert.rejects(
            wikis.updateWiki(50, { content: 'y', expectedVersion: 2 }),
            /読み込み後に更新されています.*最新の版: 3.*山田 太郎/,
        );
        assert.equal(patched, false);
    });

    test('downloadContent は本文だけをそのまま書き出す', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'wiki-'));
        tempDirs.push(dir);
        const { wikis } = makeService({ getWiki: async () => WIKI, getWikisHistory: async () => HISTORY });

        const outputPath = join(dir, 'nested', 'page.md');
        const result = await wikis.downloadContent(50, outputPath);

        assert.equal(await readFile(outputPath, 'utf8'), WIKI.content, '見出しを足さず改行も変えないこと');
        assert.equal(result.bytes, Buffer.byteLength(WIKI.content, 'utf8'));
        assert.equal(result.updated, WIKI.updated);
        assert.equal(result.version, 3);
        assert.equal(result.name, '設計/API');
    });

    test('getWikiUrl は ID で引ける URL を返す', () => {
        const client = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });
        assert.equal(client.getWikiUrl(50), 'https://my-space.backlog.jp/alias/wiki/50');
        assert.equal(client.getWikiUrl(undefined), undefined);
    });
});
