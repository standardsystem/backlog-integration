import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    BacklogApiClient, ISSUE_TYPE_COLORS, PROJECT_STATUS_COLORS,
    ISSUE_TYPE_NAME_MAX_LENGTH, PROJECT_STATUS_NAME_MAX_LENGTH,
} from '@backlog-integration/backlog-client';

import type { ToolContext } from '../src/lib/context.js';
import { IssueFieldResolver } from '../src/lib/field-resolver.js';
import { FakeMcpServer } from './helpers/tool-server.js';

import { registerAddMilestoneTool } from '../src/tools/add-milestone.js';
import { registerAddCategoryTool } from '../src/tools/add-category.js';
import { registerAddIssueTypeTool } from '../src/tools/add-issue-type.js';
import { registerAddStatusTool } from '../src/tools/add-status.js';
import { registerDeleteIssueTypeTool } from '../src/tools/delete-issue-type.js';

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
 * 追加系のスタブは「追加した項目が次の一覧に現れる」ところまで真似て、
 * ツールがキャッシュを捨てた結果として名前解決が新しい項目を見つけられることを確かめられるようにします。
 *
 * @returns コンテキストと、サービスに渡された引数・呼び出し回数の記録
 */
function makeContext() {
    const calls: string[] = [];
    const captured: Record<string, unknown> = {};

    const milestones: Array<Record<string, unknown>> = [
        { id: 31, name: 'v1.0', description: null, startDate: null, releaseDueDate: null, archived: false, displayOrder: 0 },
    ];
    const categories: Array<Record<string, unknown>> = [{ id: 41, name: 'バッチ', displayOrder: 0 }];
    const issueTypes: Array<{ id: number; name: string; color: string; displayOrder: number }> = [
        { id: 21, name: 'タスク', color: '#7ea800', displayOrder: 0 },
        { id: 22, name: 'バグ', color: '#990000', displayOrder: 1 },
        { id: 23, name: '要望', color: '#ff9200', displayOrder: 2 },
    ];
    const statuses: Array<Record<string, unknown>> = [{ id: 1, name: '未対応', color: '#ed8077', displayOrder: 0 }];

    const api = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });
    const projects = {
        listMilestones: async () => { calls.push('listMilestones'); return milestones; },
        listCategories: async () => { calls.push('listCategories'); return categories; },
        listIssueTypes: async () => { calls.push('listIssueTypes'); return issueTypes; },
        listStatuses: async () => { calls.push('listStatuses'); return statuses; },
        listPriorities: async () => [{ id: 2, name: '高' }, { id: 3, name: '中' }, { id: 4, name: '低' }],
        addMilestone: async (p: string, o: Record<string, unknown>) => {
            captured.addMilestone = { projectIdOrKey: p, ...o };
            const created = { id: 35, projectId: 77, name: o.name as string, description: o.description ?? null, startDate: o.startDate ?? null, releaseDueDate: o.releaseDueDate ?? null, archived: false, displayOrder: 1 };
            milestones.push(created);
            return created;
        },
        addCategory: async (p: string, name: string) => {
            captured.addCategory = { projectIdOrKey: p, name };
            const created = { id: 45, projectId: 77, name, displayOrder: 1 };
            categories.push(created);
            return created;
        },
        addIssueType: async (p: string, o: Record<string, unknown>) => {
            captured.addIssueType = { projectIdOrKey: p, ...o };
            const created = { id: 25, projectId: 77, name: o.name as string, color: o.color as string, displayOrder: 3 };
            issueTypes.push(created);
            return created;
        },
        addStatus: async (p: string, o: Record<string, unknown>) => {
            captured.addStatus = { projectIdOrKey: p, ...o };
            const created = { id: 4000200, projectId: 77, name: o.name as string, color: o.color as string, displayOrder: 4 };
            statuses.push(created);
            return created;
        },
        deleteIssueType: async (p: string, id: number, substituteId: number) => {
            captured.deleteIssueType = { projectIdOrKey: p, issueTypeId: id, substituteIssueTypeId: substituteId };
            const index = issueTypes.findIndex((t) => t.id === id);
            const [removed] = issueTypes.splice(index, 1);
            return removed;
        },
    };

    const ctx = {
        api,
        projects,
        resolver: new IssueFieldResolver(projects as never),
    } as unknown as ToolContext;

    return { ctx, calls, captured, projects };
}

/**
 * プロジェクト設定ツールをすべて登録した偽サーバーを作る
 *
 * @param ctx - ツールコンテキスト
 * @returns 偽サーバー
 */
function makeServer(ctx: ToolContext) {
    const s = new FakeMcpServer();
    registerAddMilestoneTool(s.server, ctx);
    registerAddCategoryTool(s.server, ctx);
    registerAddIssueTypeTool(s.server, ctx);
    registerAddStatusTool(s.server, ctx);
    registerDeleteIssueTypeTool(s.server, ctx);
    return s;
}

describe('add_milestone', () => {
    test('引数をサービスに渡し、id / name / message を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_milestone', {
            projectIdOrKey: 'PROJ', name: 'フェーズ1', description: '説明', startDate: '2026-10-01', releaseDueDate: '2026-12-31',
        });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.addMilestone, {
            projectIdOrKey: 'PROJ', name: 'フェーズ1', description: '説明', startDate: '2026-10-01', releaseDueDate: '2026-12-31',
        });
        assert.equal(result.json.id, 35);
        assert.equal(result.json.name, 'フェーズ1');
        assert.equal(result.json.releaseDueDate, '2026-12-31');
        assert.match(result.json.message, /「フェーズ1」（ID: 35）を追加しました/);
    });

    test('期限なしでも追加できる', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_milestone', { projectIdOrKey: 'PROJ', name: 'フェーズ2' });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.addMilestone, {
            projectIdOrKey: 'PROJ', name: 'フェーズ2', description: undefined, startDate: undefined, releaseDueDate: undefined,
        });
        assert.equal(result.json.releaseDueDate, null);
    });

    test('追加した直後に同じプロセスで名前解決できる（キャッシュを捨てる）', async () => {
        const { ctx, calls } = makeContext();
        // 先にキャッシュを温めておく
        assert.deepEqual(await ctx.resolver.resolveMilestones('PROJ', ['v1.0']), [31]);
        assert.equal(calls.filter((c) => c === 'listMilestones').length, 1);

        await makeServer(ctx).call('add_milestone', { projectIdOrKey: 'PROJ', name: 'フェーズ1' });

        assert.deepEqual(await ctx.resolver.resolveMilestones('PROJ', ['フェーズ1']), [35]);
        assert.equal(calls.filter((c) => c === 'listMilestones').length, 2, '一覧を取り直すこと');
    });
});

describe('add_category', () => {
    test('引数をサービスに渡し、id / name / message を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_category', { projectIdOrKey: 'PROJ', name: '朝会' });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.addCategory, { projectIdOrKey: 'PROJ', name: '朝会' });
        assert.deepEqual(result.json, { id: 45, name: '朝会', displayOrder: 1, message: 'カテゴリ「朝会」（ID: 45）を追加しました。' });
    });

    test('追加した直後に同じプロセスで名前解決できる（キャッシュを捨てる）', async () => {
        const { ctx } = makeContext();
        assert.deepEqual(await ctx.resolver.resolveCategories('PROJ', ['バッチ']), [41]);
        await assert.rejects(() => ctx.resolver.resolveCategories('PROJ', ['朝会']), /解決できませんでした/);

        await makeServer(ctx).call('add_category', { projectIdOrKey: 'PROJ', name: '朝会' });

        assert.deepEqual(await ctx.resolver.resolveCategories('PROJ', ['朝会']), [45]);
    });
});

describe('add_issue_type', () => {
    test('引数をサービスに渡し、id / name / color / message を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_issue_type', { projectIdOrKey: 'PROJ', name: '定型作業', color: '#2779ca' });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.addIssueType, { projectIdOrKey: 'PROJ', name: '定型作業', color: '#2779ca' });
        assert.equal(result.json.id, 25);
        assert.equal(result.json.name, '定型作業');
        assert.equal(result.json.color, '#2779ca');
        assert.match(result.json.message, /「定型作業」（ID: 25）を追加しました/);
    });

    test('color のスキーマが backlog-js の 10 色だけを受け付ける', () => {
        const { ctx } = makeContext();
        const schema = makeServer(ctx).definition('add_issue_type').inputSchema!.color as { safeParse: (v: unknown) => { success: boolean } };
        for (const color of ISSUE_TYPE_COLORS) {
            assert.equal(schema.safeParse(color).success, true, `${color} は受け付けること`);
        }
        assert.equal(ISSUE_TYPE_COLORS.length, 10);
        assert.equal(schema.safeParse('#000000').success, false, '候補外の色は弾くこと');
        assert.equal(schema.safeParse('#E30000').success, false, '大文字表記は候補外として弾くこと');
        assert.equal(schema.safeParse('赤').success, false);
    });

    test('name のスキーマが 20 文字までを受け付ける', () => {
        const { ctx } = makeContext();
        const definition = makeServer(ctx).definition('add_issue_type');
        const schema = definition.inputSchema!.name as { safeParse: (v: unknown) => { success: boolean } };
        assert.equal(ISSUE_TYPE_NAME_MAX_LENGTH, 20);
        assert.equal(schema.safeParse('あ'.repeat(20)).success, true, '20 文字は受け付けること');
        assert.equal(schema.safeParse('あ'.repeat(21)).success, false, '21 文字は弾くこと');
        assert.equal(schema.safeParse('').success, false);
        assert.match(definition.description, /20 文字まで/);
    });

    test('説明文に色の候補が載っている', () => {
        const { ctx } = makeContext();
        const description = makeServer(ctx).definition('add_issue_type').description;
        for (const color of ISSUE_TYPE_COLORS) assert.ok(description.includes(color), `${color} が説明文にあること`);
        assert.match(description, /403/);
    });

    test('追加した直後に同じプロセスで名前解決できる（キャッシュを捨てる）', async () => {
        const { ctx } = makeContext();
        assert.equal(await ctx.resolver.resolveIssueType('PROJ', 'タスク'), 21);
        await makeServer(ctx).call('add_issue_type', { projectIdOrKey: 'PROJ', name: '定型作業', color: '#2779ca' });
        assert.equal(await ctx.resolver.resolveIssueType('PROJ', '定型作業'), 25);
    });
});

describe('add_status', () => {
    test('引数をサービスに渡し、id / name / color / message を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_status', { projectIdOrKey: 'PROJ', name: '待ち', color: '#eda62a' });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.addStatus, { projectIdOrKey: 'PROJ', name: '待ち', color: '#eda62a' });
        assert.deepEqual(result.json, {
            id: 4000200, name: '待ち', displayOrder: 4, color: '#eda62a',
            message: '状態「待ち」（ID: 4000200）を追加しました。',
        });
    });

    test('color のスキーマが backlog-js の 10 色だけを受け付ける', () => {
        const { ctx } = makeContext();
        const schema = makeServer(ctx).definition('add_status').inputSchema!.color as { safeParse: (v: unknown) => { success: boolean } };
        for (const color of PROJECT_STATUS_COLORS) {
            assert.equal(schema.safeParse(color).success, true, `${color} は受け付けること`);
        }
        assert.equal(PROJECT_STATUS_COLORS.length, 10);
        // 課題種別の色は状態には使えない
        assert.equal(schema.safeParse('#e30000').success, false, '課題種別のパレットの色は弾くこと');
        assert.equal(schema.safeParse('#000000').success, false);
    });

    test('name のスキーマが 20 文字までを受け付ける', () => {
        const { ctx } = makeContext();
        const definition = makeServer(ctx).definition('add_status');
        const schema = definition.inputSchema!.name as { safeParse: (v: unknown) => { success: boolean } };
        assert.equal(PROJECT_STATUS_NAME_MAX_LENGTH, 20);
        assert.equal(schema.safeParse('あ'.repeat(20)).success, true, '20 文字は受け付けること');
        assert.equal(schema.safeParse('あ'.repeat(21)).success, false, '21 文字は弾くこと');
        assert.equal(schema.safeParse('').success, false);
        assert.match(definition.description, /20 文字まで/);
    });

    test('説明文がプラン制限と色の候補を案内している', () => {
        const { ctx } = makeContext();
        const description = makeServer(ctx).definition('add_status').description;
        assert.match(description, /スタンダードプラン/);
        for (const color of PROJECT_STATUS_COLORS) assert.ok(description.includes(color), `${color} が説明文にあること`);
    });

    test('追加した直後に同じプロセスで名前解決できる（キャッシュを捨てる）', async () => {
        const { ctx } = makeContext();
        assert.equal(await ctx.resolver.resolveStatus('PROJ', '未対応'), 1);
        await makeServer(ctx).call('add_status', { projectIdOrKey: 'PROJ', name: '待ち', color: '#eda62a' });
        assert.equal(await ctx.resolver.resolveStatus('PROJ', '待ち'), 4000200);
    });
});

describe('delete_issue_type', () => {
    test('名前を ID に解決して削除し、代わりの種別を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('delete_issue_type', {
            projectIdOrKey: 'PROJ', issueType: 'バグ', substituteIssueType: 'タスク',
        });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.deleteIssueType, { projectIdOrKey: 'PROJ', issueTypeId: 22, substituteIssueTypeId: 21 });
        assert.equal(result.json.id, 22);
        assert.equal(result.json.name, 'バグ');
        assert.equal(result.json.deleted, true);
        assert.deepEqual(result.json.substituteIssueType, { id: 21, name: 'タスク' });
        assert.match(result.json.message, /「バグ」（ID: 22）を削除しました/);
        assert.match(result.json.message, /「タスク」（ID: 21）に移っています/);
    });

    test('ID でも指定できる', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('delete_issue_type', {
            projectIdOrKey: 'PROJ', issueType: 23, substituteIssueType: 21,
        });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.deleteIssueType, { projectIdOrKey: 'PROJ', issueTypeId: 23, substituteIssueTypeId: 21 });
        assert.equal(result.json.name, '要望');
    });

    test('削除した種別は直後の名前解決で引けなくなる（キャッシュを捨てる）', async () => {
        const { ctx } = makeContext();
        assert.equal(await ctx.resolver.resolveIssueType('PROJ', 'バグ'), 22);

        await makeServer(ctx).call('delete_issue_type', { projectIdOrKey: 'PROJ', issueType: 'バグ', substituteIssueType: 'タスク' });

        await assert.rejects(() => ctx.resolver.resolveIssueType('PROJ', 'バグ'), /課題種別「バグ」を解決できませんでした/);
    });

    test('削除対象と代わりが同じならサービスを呼ばずにエラー', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('delete_issue_type', {
            projectIdOrKey: 'PROJ', issueType: 'タスク', substituteIssueType: 21,
        });
        assert.equal(result.isError, true);
        assert.match(result.text, /代わりの課題種別が同じです/);
        assert.equal(captured.deleteIssueType, undefined);
    });

    test('代わりの種別がプロジェクトに無ければ削除せずにエラー', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('delete_issue_type', {
            projectIdOrKey: 'PROJ', issueType: 'バグ', substituteIssueType: 999,
        });
        assert.equal(result.isError, true);
        assert.match(result.text, /代わりの課題種別（ID: 999）がプロジェクトにありません/);
        assert.match(result.text, /タスク\(21\)/);
        assert.equal(captured.deleteIssueType, undefined);
    });

    test('名前を解決できなければ候補つきエラー', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('delete_issue_type', {
            projectIdOrKey: 'PROJ', issueType: '存在しない', substituteIssueType: 'タスク',
        });
        assert.equal(result.isError, true);
        assert.match(result.text, /課題種別「存在しない」を解決できませんでした/);
        assert.equal(captured.deleteIssueType, undefined);
    });

    test('説明文が取り消せない操作と課題の移動を案内している', () => {
        const { ctx } = makeContext();
        const description = makeServer(ctx).definition('delete_issue_type').description;
        assert.match(description, /取り消せません/);
        assert.match(description, /substituteIssueType/);
        assert.match(description, /list_issue_types/);
    });
});

describe('権限不足（403）のエラー整形', () => {
    for (const [tool, method, args] of [
        ['add_milestone', 'addMilestone', { projectIdOrKey: 'PROJ', name: 'x' }],
        ['add_category', 'addCategory', { projectIdOrKey: 'PROJ', name: 'x' }],
        ['add_issue_type', 'addIssueType', { projectIdOrKey: 'PROJ', name: 'x', color: '#e30000' }],
        ['add_status', 'addStatus', { projectIdOrKey: 'PROJ', name: 'x', color: '#ea2c00' }],
        ['delete_issue_type', 'deleteIssueType', { projectIdOrKey: 'PROJ', issueType: 'バグ', substituteIssueType: 'タスク' }],
    ] as const) {
        test(`${tool} が HTTP ステータスと Backlog のメッセージを含む`, async () => {
            const { ctx, projects } = makeContext();
            (projects as unknown as Record<string, unknown>)[method] = async () => { throw new Forbidden(); };

            const result = await makeServer(ctx).call(tool, args as Record<string, unknown>);
            assert.equal(result.isError, true);
            assert.match(result.text, /HTTP 403/);
            assert.match(result.text, /権限不足/);
            assert.match(result.text, /You do not have permission\./);
        });
    }

    test('失敗したときはキャッシュを捨てない', async () => {
        const { ctx, projects, calls } = makeContext();
        assert.equal(await ctx.resolver.resolveIssueType('PROJ', 'タスク'), 21);
        (projects as unknown as Record<string, unknown>).addIssueType = async () => { throw new Forbidden(); };

        await makeServer(ctx).call('add_issue_type', { projectIdOrKey: 'PROJ', name: 'x', color: '#e30000' });

        const before = calls.filter((c) => c === 'listIssueTypes').length;
        assert.equal(await ctx.resolver.resolveIssueType('PROJ', 'タスク'), 21);
        assert.equal(calls.filter((c) => c === 'listIssueTypes').length, before, '一覧を取り直さないこと');
    });
});
