import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectService } from '@backlog-integration/backlog-client';

import { IssueFieldResolver } from '../src/lib/field-resolver.js';

const ISSUE_TYPES = [
    { id: 4449353, name: 'タスク' },
    { id: 4449352, name: 'バグ' },
    { id: 4449354, name: '要望' },
];
const PRIORITIES = [{ id: 2, name: '高' }, { id: 3, name: '中' }, { id: 4, name: '低' }];
const STATUSES = [
    { id: 1, name: '未対応' },
    { id: 2, name: '処理中' },
    { id: 4000123, name: 'trialデプロイ済' },
];
const MILESTONES = [
    { id: 31, name: 'v1.0' },
    { id: 32, name: '2026' },
    { id: 33, name: '重複' },
    { id: 34, name: '重複' },
];
const CATEGORIES = [{ id: 41, name: 'バッチ' }];
const USERS = [
    { id: 5, userId: 'taro', name: '山田 太郎' },
    { id: 9, userId: 'hanako', name: '鈴木 花子' },
    { id: 7, userId: 'bot', name: 'bot' },
];
const MYSELF = { id: 7, userId: 'bot', name: 'bot' };

/**
 * 呼び出し回数を数える ProjectService のスタブを作る
 *
 * @returns リゾルバと呼び出しログ
 */
function makeResolver() {
    const calls: string[] = [];
    const projects = {
        listIssueTypes: async (p: string | number) => { calls.push(`issueTypes:${p}`); return ISSUE_TYPES; },
        listPriorities: async () => { calls.push('priorities'); return PRIORITIES; },
        listStatuses: async (p: string | number) => { calls.push(`statuses:${p}`); return STATUSES; },
        listMilestones: async (p: string | number, inc?: boolean) => { calls.push(`milestones:${p}:${inc}`); return MILESTONES; },
        listCategories: async (p: string | number) => { calls.push(`categories:${p}`); return CATEGORIES; },
        listProjectUsers: async (p: string | number) => { calls.push(`users:${p}`); return USERS; },
        getMyself: async () => { calls.push('myself'); return MYSELF; },
    } as unknown as ProjectService;

    return { resolver: new IssueFieldResolver(projects), calls };
}

describe('課題種別の解決', () => {
    test('名前から ID を引く', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolveIssueType('PROJ', 'タスク'), 4449353);
    });

    test('数値はそのまま通す', async () => {
        const { resolver, calls } = makeResolver();
        assert.equal(await resolver.resolveIssueType('PROJ', 999), 999);
        assert.equal(calls.length, 0, 'API を呼ばないこと');
    });

    test('前後の空白・全角半角・大文字小文字を無視する', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolveIssueType('PROJ', '  タスク  '), 4449353);
        assert.equal(await resolver.resolveIssueType('PROJ', 'ﾊﾞｸﾞ'), 4449352, '半角カナも NFKC で一致すること');
    });

    test('見つからない場合は候補一覧つきのエラー', async () => {
        const { resolver } = makeResolver();
        await assert.rejects(
            () => resolver.resolveIssueType('PROJ', '存在しない'),
            (error: Error) => {
                assert.match(error.message, /課題種別「存在しない」を解決できませんでした/);
                assert.match(error.message, /タスク\(4449353\)/);
                assert.match(error.message, /バグ\(4449352\)/);
                return true;
            },
        );
    });
});

describe('優先度の解決', () => {
    test('日本語名で引ける', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolvePriority('高'), 2);
        assert.equal(await resolver.resolvePriority('中'), 3);
        assert.equal(await resolver.resolvePriority('低'), 4);
    });

    test('英語名で引ける', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolvePriority('high'), 2);
        assert.equal(await resolver.resolvePriority('normal'), 3);
        assert.equal(await resolver.resolvePriority('LOW'), 4);
    });

    test('別名（medium など）でも引ける', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolvePriority('medium'), 3);
    });

    test('未知の名前は候補つきエラー', async () => {
        const { resolver } = makeResolver();
        await assert.rejects(() => resolver.resolvePriority('至急すぎる'), /高\(2\)/);
    });
});

describe('状態の解決', () => {
    test('カスタムステータスも引ける', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolveStatus('PROJ', 'trialデプロイ済'), 4000123);
    });
});

describe('マイルストーン・カテゴリの解決', () => {
    test('名前の配列を ID の配列にする', async () => {
        const { resolver } = makeResolver();
        assert.deepEqual(await resolver.resolveMilestones('PROJ', ['v1.0']), [31]);
        assert.deepEqual(await resolver.resolveCategories('PROJ', ['バッチ']), [41]);
    });

    test('空配列はそのまま空配列（解除の意図を保つ）', async () => {
        const { resolver } = makeResolver();
        assert.deepEqual(await resolver.resolveMilestones('PROJ', []), []);
    });

    test('アーカイブ済みも解決対象にする', async () => {
        const { resolver, calls } = makeResolver();
        await resolver.resolveMilestones('PROJ', ['v1.0']);
        assert.ok(calls.includes('milestones:PROJ:true'), 'includeArchived=true で取得すること');
    });

    test('名前が重複する場合は候補つきエラー', async () => {
        const { resolver } = makeResolver();
        await assert.rejects(
            () => resolver.resolveMilestones('PROJ', ['重複']),
            (error: Error) => {
                assert.match(error.message, /複数見つかりました/);
                assert.match(error.message, /重複\(33\)/);
                assert.match(error.message, /重複\(34\)/);
                return true;
            },
        );
    });

    test('数字だけの名前は ID ではなく名前として解決する', async () => {
        const { resolver } = makeResolver();
        assert.deepEqual(await resolver.resolveMilestones('PROJ', ['2026']), [32], '名前一致を優先すること');
    });

    test('名前に一致しない数値文字列は ID とみなす', async () => {
        const { resolver } = makeResolver();
        assert.deepEqual(await resolver.resolveMilestones('PROJ', ['9999']), [9999]);
    });
});

describe('担当者の解決', () => {
    test('表示名で引ける', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolveAssignee('PROJ', '山田 太郎'), 5);
    });

    test('ログイン用ユーザIDで引ける', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolveAssignee('PROJ', 'hanako'), 9);
    });

    test('@me で自分自身を引く', async () => {
        const { resolver, calls } = makeResolver();
        assert.equal(await resolver.resolveAssignee('PROJ', '@me'), 7);
        assert.ok(calls.includes('myself'));
    });

    test('name と userId が同じユーザでも重複扱いにしない', async () => {
        const { resolver } = makeResolver();
        assert.equal(await resolver.resolveAssignee('PROJ', 'bot'), 7);
    });

    test('見つからない場合はエラー', async () => {
        const { resolver } = makeResolver();
        await assert.rejects(() => resolver.resolveAssignee('PROJ', '田中'), /担当者「田中」/);
    });
});

describe('キャッシュ', () => {
    test('同じプロジェクトのメタ情報は 1 回しか取得しない', async () => {
        const { resolver, calls } = makeResolver();
        await resolver.resolveIssueType('PROJ', 'タスク');
        await resolver.resolveIssueType('PROJ', 'バグ');
        await resolver.resolveIssueType('proj', 'タスク');
        assert.equal(calls.filter((c) => c.startsWith('issueTypes')).length, 1);
    });

    test('プロジェクトが違えば別々に取得する', async () => {
        const { resolver, calls } = makeResolver();
        await resolver.resolveIssueType('A', 'タスク');
        await resolver.resolveIssueType('B', 'タスク');
        assert.equal(calls.filter((c) => c.startsWith('issueTypes')).length, 2);
    });

    test('同時に呼んでも取得は 1 回にまとまる', async () => {
        const { resolver, calls } = makeResolver();
        await Promise.all([
            resolver.resolveIssueType('PROJ', 'タスク'),
            resolver.resolveIssueType('PROJ', 'バグ'),
            resolver.resolveIssueType('PROJ', '要望'),
        ]);
        assert.equal(calls.filter((c) => c.startsWith('issueTypes')).length, 1);
    });

    test('取得に失敗したらキャッシュに残さない', async () => {
        let attempts = 0;
        const projects = {
            listIssueTypes: async () => {
                attempts += 1;
                if (attempts === 1) throw new Error('一時的な失敗');
                return ISSUE_TYPES;
            },
        } as unknown as ProjectService;
        const resolver = new IssueFieldResolver(projects);

        await assert.rejects(() => resolver.resolveIssueType('PROJ', 'タスク'), /一時的な失敗/);
        assert.equal(await resolver.resolveIssueType('PROJ', 'タスク'), 4449353, '再取得できること');
        assert.equal(attempts, 2);
    });
});
