import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BacklogApiClient } from '@backlog-integration/backlog-client';

import type { ToolContext } from '../src/lib/context.js';
import { IssueFieldResolver } from '../src/lib/field-resolver.js';
import { FakeMcpServer } from './helpers/tool-server.js';

import { registerListIssuesTool } from '../src/tools/list-issues.js';
import { registerCountIssuesTool } from '../src/tools/count-issues.js';
import { registerGetIssueTool } from '../src/tools/get-issue.js';
import { registerAddCommentTool } from '../src/tools/add-comment.js';
import { registerCreateIssueTool } from '../src/tools/create-issue.js';
import { registerUpdateIssueTool } from '../src/tools/update-issue.js';
import { registerUpdateCommentTool } from '../src/tools/update-comment.js';
import { registerDeleteCommentTool } from '../src/tools/delete-comment.js';
import { registerCountCommentsTool } from '../src/tools/count-comments.js';
import { registerGetCommentTool } from '../src/tools/get-comment.js';
import { registerListCommentsTool } from '../src/tools/list-comments.js';
import { registerDownloadIssueAttachmentsTool } from '../src/tools/download-issue-attachments.js';
import { registerListIssueAttachmentsTool } from '../src/tools/list-issue-attachments.js';
import { registerUploadAttachmentTool } from '../src/tools/upload-attachment.js';
import { registerListMilestonesTool } from '../src/tools/list-milestones.js';
import { registerGetMyselfTool } from '../src/tools/get-myself.js';
import { registerGetProjectTool } from '../src/tools/get-project.js';
import { registerListStatusesTool } from '../src/tools/list-statuses.js';

const tempDirs: string[] = [];
after(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

const ISSUE = {
    id: 1001, projectId: 77, issueKey: 'PROJ-12', summary: '親課題', description: '本文',
    status: { id: 4, name: '完了' },
    assignee: { id: 5, name: '山田 太郎' },
    createdUser: { id: 9, name: '鈴木 花子' },
    priority: { id: 3, name: '中' },
    issueType: { id: 21, name: 'タスク' },
    milestone: [{ id: 31, name: 'v1.0' }],
    resolution: null, parentIssueId: null,
    startDate: '2026-09-01', dueDate: '2026-09-30',
    created: '2026-09-01T00:00:00Z', updated: '2026-09-05T00:00:00Z',
    attachments: [],
};
const ISSUE_NO_META = { ...ISSUE, id: 1002, issueKey: 'PROJ-13', dueDate: null, milestone: [] };
const MYSELF = { id: 7, userId: 'bot', name: 'bot', mailAddress: 'b@example.com', roleType: 2 };

/** 403 を返す backlog-js 風のエラー */
class Forbidden extends Error {
    readonly status = 403;
    readonly body = { errors: [{ message: 'You do not have permission.', code: 6 }] };
    constructor() { super('Forbidden'); }
    override get name(): string { return 'BacklogApiError'; }
}

/**
 * ネットワークに出ないスタブで ToolContext を組み立てる
 *
 * @returns コンテキストと、呼び出し内容の記録
 */
function makeContext() {
    const calls: string[] = [];
    const captured: { create?: Record<string, unknown>; update?: Record<string, unknown> } = {};

    const api = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });
    api.resolveProjectId = async (p) => { calls.push(`resolveProjectId:${p}`); return 77; };

    const projects = {
        getProject: async () => ({ id: 77, projectKey: 'PROJ', name: '案件', textFormattingRule: 'markdown', archived: false, subtaskingEnabled: true, useResolvedForChart: false }),
        listProjectUsers: async (p: string | number) => { calls.push(`listProjectUsers:${p}`); return [{ id: 5, userId: 'taro', name: '山田 太郎', mailAddress: 't@example.com', roleType: 2 }, MYSELF]; },
        listMilestones: async (p: string | number, inc?: boolean) => {
            calls.push(`listMilestones:${p}:${inc}`);
            const all = [
                { id: 31, name: 'v1.0', description: null, startDate: null, releaseDueDate: '2026-10-01', archived: false, displayOrder: 0 },
                { id: 32, name: 'v0.9', description: null, startDate: null, releaseDueDate: null, archived: true, displayOrder: 1 },
                { id: 33, name: '重複', archived: false, displayOrder: 2 },
                { id: 34, name: '重複', archived: false, displayOrder: 3 },
            ];
            return inc ? all : all.filter((m) => !m.archived);
        },
        listStatuses: async (p: string | number) => { calls.push(`listStatuses:${p}`); return [{ id: 1, name: '未対応', color: '#ed8077', displayOrder: 0 }, { id: 4000123, name: 'trialデプロイ済', color: '#2779ca', displayOrder: 4 }]; },
        listIssueTypes: async (p: string | number) => { calls.push(`listIssueTypes:${p}`); return [{ id: 21, name: 'タスク', color: '#7ea800', displayOrder: 0 }, { id: 22, name: 'バグ', color: '#990000', displayOrder: 1 }]; },
        listCategories: async () => [{ id: 41, name: 'バッチ', displayOrder: 0 }],
        listPriorities: async () => [{ id: 2, name: '高' }, { id: 3, name: '中' }, { id: 4, name: '低' }],
        getMyself: async () => MYSELF,
    };

    const issues = {
        getIssue: async () => { calls.push('getIssue'); return ISSUE; },
        listIssues: async (o: Record<string, unknown>) => { calls.push(`listIssues:${JSON.stringify(o.parentIssueId ?? null)}`); return [ISSUE, ISSUE_NO_META]; },
        countIssues: async () => 253,
        addComment: async (_k: string, o: { content: string }) => ({ id: 555, content: o.content, created: '2026-09-09T10:00:00Z', createdUser: MYSELF, changeLog: [] }),
        updateIssue: async (_k: string, o: Record<string, unknown>) => { captured.update = o; return { ...ISSUE, status: { id: (o.statusId as number) ?? 4, name: 'x' } }; },
        createIssue: async (o: Record<string, unknown>) => { captured.create = o; return o.dueDate ? ISSUE : ISSUE_NO_META; },
        findRecentCommentByContent: async (_k: string, c: string) => ({ id: 777, content: c, created: '2026-09-09T11:00:00Z', createdUser: MYSELF, changeLog: [] }),
        getComment: async (_k: string, id: number) => ({ id, content: '既存', changeLog: [{ field: 'status' }], stars: [], created: 'x' }),
        listComments: async () => [{ id: 1, content: 'a', changeLog: [], stars: [] }],
        updateComment: async (_k: string, id: number, c: string) => ({ id, content: c, created: 'x', createdUser: MYSELF }),
        deleteComment: async (_k: string, id: number) => ({ id, content: '消された本文', created: 'x', createdUser: MYSELF }),
        countComments: async () => 42,
        listAttachments: async () => [
            { id: 1, name: '設計:書.xlsx', size: 10, created: 'x', createdUser: MYSELF },
            { id: 3, name: 'CON.txt', size: 30, created: 'x', createdUser: MYSELF },
        ],
        downloadAttachments: async (_k: string, dir: string, ids?: number[]) => ({
            count: ids?.length ?? 2,
            outputDir: dir,
            files: [{ id: 1, name: '設計:書.xlsx', size: 10, path: join(dir, '設計_書.xlsx'), bytes: 10 }],
        }),
        uploadAttachment: async () => ({ id: 900, name: 'f.bin', size: 1 }),
    };

    const ctx = {
        api,
        issues,
        documents: {},
        projects,
        resolver: new IssueFieldResolver(projects as never),
    } as unknown as ToolContext;

    return { ctx, calls, captured, api };
}

describe('list_issues', () => {
    test('既定のサマリに url / dueDate / milestone / parentIssueId を含む', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerListIssuesTool(s.server, ctx);

        const result = await s.call('list_issues', { projectIdOrKey: 'PROJ' });
        assert.equal(result.json.length, 2);
        assert.equal(result.json[0].url, 'https://my-space.backlog.jp/view/PROJ-12');
        assert.equal(result.json[0].dueDate, '2026-09-30');
        assert.deepEqual(result.json[0].milestone, [{ id: 31, name: 'v1.0' }]);
        assert.equal(result.json[0].parentIssueId, null);
        assert.equal(result.json[0].description, undefined);
    });

    test('parentIssueId を backlog-client に渡す', async () => {
        const { ctx, calls } = makeContext();
        const s = new FakeMcpServer();
        registerListIssuesTool(s.server, ctx);

        await s.call('list_issues', { projectIdOrKey: 'PROJ', parentIssueId: [1001] });
        assert.ok(calls.includes('listIssues:[1001]'));
    });

    test('fields で項目を絞り、["*"] で生レスポンスを返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerListIssuesTool(s.server, ctx);

        const picked = await s.call('list_issues', { projectIdOrKey: 'PROJ', fields: ['issueKey', 'description'] });
        assert.deepEqual(Object.keys(picked.json[0]), ['issueKey', 'description']);
        assert.equal(picked.json[0].description, '本文');

        const raw = await s.call('list_issues', { projectIdOrKey: 'PROJ', fields: ['*'] });
        assert.equal(raw.json[0].projectId, 77);
        assert.equal(raw.json[0].url, 'https://my-space.backlog.jp/view/PROJ-12');
    });

    test('parentChild を名前で指定できる', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerListIssuesTool(s.server, ctx);
        assert.equal((await s.call('list_issues', { projectIdOrKey: 'PROJ', parentChild: 'hasChildren' })).isError, false);
    });
});

describe('count_issues', () => {
    test('総件数を返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerCountIssuesTool(s.server, ctx);
        assert.deepEqual((await s.call('count_issues', { projectIdOrKey: 'PROJ' })).json, { count: 253 });
    });
});

describe('get_issue', () => {
    test('生レスポンスに url を足す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerGetIssueTool(s.server, ctx);
        const result = await s.call('get_issue', { issueIdOrKey: 'PROJ-12' });
        assert.equal(result.json.url, 'https://my-space.backlog.jp/view/PROJ-12');
        assert.equal(result.json.description, '本文', '既存の項目を落とさないこと');
    });
});

describe('add_comment', () => {
    test('コメントIDと url を返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerAddCommentTool(s.server, ctx);
        const result = await s.call('add_comment', { issueIdOrKey: 'PROJ-12', content: 'やりました' });
        assert.equal(result.json.id, 555);
        assert.equal(result.json.url, 'https://my-space.backlog.jp/view/PROJ-12#comment-555');
    });

    test('statusId 併用（patchIssue 経由）でもコメントIDを返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerAddCommentTool(s.server, ctx);
        const result = await s.call('add_comment', { issueIdOrKey: 'PROJ-12', content: '状態も変更', statusId: 3 });
        assert.equal(result.json.id, 777);
        assert.equal(result.json.url, 'https://my-space.backlog.jp/view/PROJ-12#comment-777');
    });

    test('担当者だけ変える場合は statusId を送らない（他者の状態変更を巻き戻さない）', async () => {
        const { ctx, captured, calls } = makeContext();
        const s = new FakeMcpServer();
        registerAddCommentTool(s.server, ctx);

        await s.call('add_comment', { issueIdOrKey: 'PROJ-12', content: 'x', assigneeId: 5 });

        assert.equal(captured.update?.statusId, undefined, 'statusId を渡さないこと');
        assert.equal(captured.update?.assigneeId, 5);
        assert.ok(!calls.includes('getIssue'), '現在の状態を読みに行かないこと');
    });

    test('コメントを引き当てられない場合は message で知らせる', async () => {
        const { ctx } = makeContext();
        (ctx.issues as unknown as { findRecentCommentByContent: () => Promise<undefined> })
            .findRecentCommentByContent = async () => undefined;
        const s = new FakeMcpServer();
        registerAddCommentTool(s.server, ctx);

        const result = await s.call('add_comment', { issueIdOrKey: 'PROJ-12', content: 'x', statusId: 3 });
        assert.equal(result.json.id, null);
        assert.match(result.json.message, /コメントIDを特定できませんでした/);
    });
});

describe('create_issue', () => {
    test('名前指定を ID に解決して作成する', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);

        const result = await s.call('create_issue', {
            projectIdOrKey: 'PROJ', summary: '新規', issueType: 'タスク', priority: '中',
            milestone: ['v1.0'], category: ['バッチ'], assignee: '@me', dueDate: '2026-10-01',
        });

        assert.equal(result.isError, false, result.text);
        assert.equal(captured.create?.projectId, 77);
        assert.equal(captured.create?.issueTypeId, 21);
        assert.equal(captured.create?.priorityId, 3);
        assert.deepEqual(captured.create?.milestoneId, [31]);
        assert.deepEqual(captured.create?.categoryId, [41]);
        assert.equal(captured.create?.assigneeId, 7);
        assert.equal(result.json.url, 'https://my-space.backlog.jp/view/PROJ-12');
        assert.deepEqual(result.json.warnings, []);
    });

    test('優先度を英語でも指定できる', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);
        await s.call('create_issue', { projectIdOrKey: 'PROJ', summary: 'x', issueType: 'バグ', priority: 'high' });
        assert.equal(captured.create?.priorityId, 2);
    });

    test('期限日・マイルストーン未設定を warnings に載せる', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);
        const result = await s.call('create_issue', { projectIdOrKey: 'PROJ', summary: 'x', issueTypeId: 21, priorityId: 3 });
        assert.deepEqual(result.json.warnings, ['dueDate 未設定', 'milestone 未設定']);
    });

    test('ID と名前を両方指定したら ID を優先する', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);
        await s.call('create_issue', { projectIdOrKey: 'PROJ', summary: 'x', issueTypeId: 22, issueType: 'タスク', priorityId: 4, priority: '高' });
        assert.equal(captured.create?.issueTypeId, 22);
        assert.equal(captured.create?.priorityId, 4);
    });

    test('projectId と projectIdOrKey の併用時は名前解決も projectId 側を見る', async () => {
        const { ctx, calls, captured } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);

        await s.call('create_issue', { projectIdOrKey: 'OTHER', projectId: 99, summary: 'x', issueType: 'タスク', priority: '中' });
        assert.equal(captured.create?.projectId, 99);
        assert.ok(calls.includes('listIssueTypes:99'));
        assert.ok(!calls.some((c) => c.includes('OTHER')), '作成先と違うプロジェクトを参照しないこと');
    });

    test('マイルストーン名が重複していたら候補つきエラー', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);
        const result = await s.call('create_issue', { projectIdOrKey: 'PROJ', summary: 'x', issueType: 'タスク', priority: '中', milestone: ['重複'] });
        assert.equal(result.isError, true);
        assert.match(result.text, /重複\(33\)/);
        assert.match(result.text, /重複\(34\)/);
    });

    test('課題種別を省くと候補つきエラー', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);
        const result = await s.call('create_issue', { projectIdOrKey: 'PROJ', summary: 'x', priority: '中' });
        assert.equal(result.isError, true);
        assert.match(result.text, /タスク\(21\)/);
    });

    test('プロジェクト未指定はエラー', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerCreateIssueTool(s.server, ctx);
        const result = await s.call('create_issue', { summary: 'x', issueTypeId: 21, priorityId: 3 });
        assert.equal(result.isError, true);
        assert.match(result.text, /projectIdOrKey/);
    });
});

describe('update_issue', () => {
    test('カスタムステータスを名前で指定できる', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);
        await s.call('update_issue', { issueIdOrKey: 'PROJ-12', status: 'trialデプロイ済' });
        assert.equal(captured.update?.statusId, 4000123);
    });

    test('担当者をログイン用ユーザIDで指定できる', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);
        await s.call('update_issue', { issueIdOrKey: 'PROJ-12', assignee: 'taro' });
        assert.equal(captured.update?.assigneeId, 5);
    });

    test('assigneeId: null を未割り当てとして通す', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);
        await s.call('update_issue', { issueIdOrKey: 'PROJ-12', assigneeId: null });
        assert.equal(captured.update?.assigneeId, null);
    });

    test('空配列を渡すと解除の意図として backlog-client に届く', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);
        await s.call('update_issue', { issueIdOrKey: 'PROJ-12', milestoneId: [], categoryId: [] });
        assert.deepEqual(captured.update?.milestoneId, []);
        assert.deepEqual(captured.update?.categoryId, []);
    });

    test('状態を指定しなければ statusId を送らない（他者の状態変更を巻き戻さない）', async () => {
        // 現在の状態を読んで送り返すと、GET と PATCH の間の他者の変更を打ち消してしまう
        const { ctx, captured, calls } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);

        await s.call('update_issue', { issueIdOrKey: 'PROJ-12', dueDate: '2026-12-31' });

        assert.equal(captured.update?.statusId, undefined, 'statusId を渡さないこと');
        assert.ok(!calls.includes('getIssue'), '現在の状態を読みに行かないこと');
    });

    test('状態を指定したときだけ statusId を送る', async () => {
        const { ctx, captured } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);

        await s.call('update_issue', { issueIdOrKey: 'PROJ-12', statusId: 2 });
        assert.equal(captured.update?.statusId, 2);
    });

    test('返却に url / message / warnings を含む', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateIssueTool(s.server, ctx);
        const result = await s.call('update_issue', { issueIdOrKey: 'PROJ-12', summary: 'x' });
        assert.equal(result.json.url, 'https://my-space.backlog.jp/view/PROJ-12');
        assert.match(result.json.message, /更新しました/);
        assert.ok(Array.isArray(result.json.warnings));
    });
});

describe('コメント系ツール', () => {
    test('update / delete / count / get が期待どおり返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerUpdateCommentTool(s.server, ctx);
        registerDeleteCommentTool(s.server, ctx);
        registerCountCommentsTool(s.server, ctx);
        registerGetCommentTool(s.server, ctx);
        registerListCommentsTool(s.server, ctx);

        const updated = await s.call('update_comment', { issueIdOrKey: 'PROJ-12', commentId: 555, content: '直しました' });
        assert.equal(updated.json.content, '直しました');
        assert.equal(updated.json.url, 'https://my-space.backlog.jp/view/PROJ-12#comment-555');

        const deleted = await s.call('delete_comment', { issueIdOrKey: 'PROJ-12', commentId: 555 });
        assert.equal(deleted.json.deleted, true);
        assert.equal(deleted.json.content, '消された本文', '削除した本文を残すこと');

        assert.equal((await s.call('count_comments', { issueIdOrKey: 'PROJ-12' })).json.count, 42);

        const got = await s.call('get_comment', { issueIdOrKey: 'PROJ-12', commentId: 1 });
        assert.equal(got.json.changeLog.length, 1, 'changeLog を保つこと');
        assert.equal(got.json.url, 'https://my-space.backlog.jp/view/PROJ-12#comment-1');

        const listed = await s.call('list_comments', { issueIdOrKey: 'PROJ-12' });
        assert.equal(listed.json[0].url, 'https://my-space.backlog.jp/view/PROJ-12#comment-1');
    });

    test('403 のときエラーに HTTP ステータスと Backlog のメッセージを含む', async () => {
        const { ctx } = makeContext();
        (ctx.issues as unknown as { updateComment: () => Promise<never> }).updateComment = async () => { throw new Forbidden(); };
        const s = new FakeMcpServer();
        registerUpdateCommentTool(s.server, ctx);

        const result = await s.call('update_comment', { issueIdOrKey: 'PROJ-12', commentId: 1, content: 'x' });
        assert.equal(result.isError, true);
        assert.match(result.text, /HTTP 403/);
        assert.match(result.text, /権限不足/);
        assert.match(result.text, /You do not have permission\./);
    });

    test('delete_comment の説明文が事前確認を促している', () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerDeleteCommentTool(s.server, ctx);
        const description = s.definition('delete_comment').description;
        assert.match(description, /取り消せません/);
        assert.match(description, /get_comment/);
    });
});

describe('添付系ツール', () => {
    test('一括ダウンロードが件数とパスを返す', async () => {
        const { ctx } = makeContext();
        const dir = await mkdtemp(join(tmpdir(), 'mcptool-'));
        tempDirs.push(dir);
        const s = new FakeMcpServer();
        registerDownloadIssueAttachmentsTool(s.server, ctx);

        const result = await s.call('download_issue_attachments', { issueIdOrKey: 'PROJ-12', outputDir: dir });
        assert.equal(result.json.count, 2);
        assert.equal(result.json.files[0].path, join(dir, '設計_書.xlsx'));
        assert.match(result.json.message, /2 件/);
    });

    test('添付一覧を返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerListIssueAttachmentsTool(s.server, ctx);
        const result = await s.call('list_issue_attachments', { issueIdOrKey: 'PROJ-12' });
        assert.deepEqual(result.json.map((a: { id: number }) => a.id), [1, 3]);
    });

    test('upload_attachment と旧名の両方が登録され、同じ動作をする', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerUploadAttachmentTool(s.server, ctx);

        assert.deepEqual(s.names.sort(), ['mcp_backlog_upload_attachment', 'upload_attachment']);
        assert.equal((await s.call('upload_attachment', { filePath: 'C:/tmp/x.bin' })).json.id, 900);
        assert.equal((await s.call('mcp_backlog_upload_attachment', { filePath: 'C:/tmp/x.bin' })).json.id, 900);
        assert.match(s.definition('mcp_backlog_upload_attachment').description, /非推奨/);
    });
});

describe('メタ情報ツール', () => {
    test('list_milestones が既定でアーカイブ済みを除外する', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerListMilestonesTool(s.server, ctx);

        const defaults = await s.call('list_milestones', { projectIdOrKey: 'PROJ' });
        assert.deepEqual(defaults.json.map((m: { id: number }) => m.id), [31, 33, 34]);
        assert.equal(defaults.json[0].releaseDueDate, '2026-10-01');

        const all = await s.call('list_milestones', { projectIdOrKey: 'PROJ', includeArchived: true });
        assert.equal(all.json.length, 4);
    });

    test('get_myself が接続先と権限名を添えて返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerGetMyselfTool(s.server, ctx);
        const result = await s.call('get_myself');
        assert.equal(result.json.id, 7);
        assert.equal(result.json.roleTypeName, '一般ユーザー');
        assert.equal(result.json.host, 'my-space.backlog.jp');
    });

    test('get_project が textFormattingRule と url を返す', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerGetProjectTool(s.server, ctx);
        const result = await s.call('get_project', { projectIdOrKey: 'PROJ' });
        assert.equal(result.json.textFormattingRule, 'markdown');
        assert.equal(result.json.url, 'https://my-space.backlog.jp/projects/PROJ');
    });

    test('list_statuses にカスタムステータスが含まれる', async () => {
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerListStatusesTool(s.server, ctx);
        const result = await s.call('list_statuses', { projectIdOrKey: 'PROJ' });
        assert.ok(result.json.some((s2: { id: number }) => s2.id === 4000123));
    });

    test('引数を取らないツールは inputSchema を持たない', () => {
        // inputSchema: {} を渡すと MCP SDK が検証を有効にし、arguments 省略の呼び出しが弾かれる
        const { ctx } = makeContext();
        const s = new FakeMcpServer();
        registerGetMyselfTool(s.server, ctx);
        assert.equal('inputSchema' in s.definition('get_myself'), false);
    });
});
