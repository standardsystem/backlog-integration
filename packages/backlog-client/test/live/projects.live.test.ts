import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { BacklogApiClient } from '../../src/client.js';
import { ProjectService } from '../../src/projects.js';
import { resolveBacklogConfig } from '../../src/config.js';
import { describeBacklogError, formatBacklogError } from '../../src/errors.js';
import { getLiveConfig, LIVE_SKIP_REASON } from '../helpers/env.js';

/** プランで使えない機能を呼んだときに Backlog が返すエラーコード（LicenceError） */
const LICENCE_ERROR_CODE = 2;

/**
 * 実 API に接続するメタ情報のテスト
 *
 * Issue #3 の受け入れ条件（名前から ID を引く一連の操作が MCP だけで完結する）と、
 * Issue #14 のプロジェクト設定の追加・削除を確かめます。
 * 作成したマイルストーン・カテゴリ・課題種別・状態は終了時に削除します。
 */
describe('live: ProjectService', { skip: LIVE_SKIP_REASON }, () => {
    const live = getLiveConfig()!;
    let api: BacklogApiClient;
    let projects: ProjectService;
    const cleanup: Array<() => Promise<unknown>> = [];

    before(() => {
        api = new BacklogApiClient(resolveBacklogConfig(live.spaceId, live.apiKey));
        projects = new ProjectService(api);
    });

    after(async () => {
        for (const fn of cleanup.reverse()) {
            try {
                await fn();
            } catch (error) {
                console.error('後片付けに失敗:', error instanceof Error ? error.message : error);
            }
        }
    });

    test('getProject が textFormattingRule を含む', async () => {
        const project = await projects.getProject(live.projectKey);
        assert.equal(project.projectKey, live.projectKey);
        assert.ok(project.id > 0);
        assert.ok(['markdown', 'backlog'].includes(project.textFormattingRule));
    });

    test('getMyself が接続中アカウントの id / userId / name を返す', async () => {
        const me = await projects.getMyself();
        assert.ok(me.id > 0);
        assert.ok(me.userId.length > 0);
        assert.ok(me.name.length > 0);
    });

    test('list_project_users で担当者IDを引ける', async () => {
        const users = await projects.listProjectUsers(live.projectKey);
        assert.ok(users.length > 0);
        const me = await projects.getMyself();
        assert.ok(users.some((u) => u.id === me.id), '自分がプロジェクトに含まれること');
    });

    test('list_issue_types / list_priorities が ID と名前を返す', async () => {
        const issueTypes = await projects.listIssueTypes(live.projectKey);
        assert.ok(issueTypes.length > 0);
        assert.ok(issueTypes.every((t) => t.id > 0 && t.name.length > 0));

        const priorities = await projects.listPriorities();
        assert.deepEqual(priorities.map((p) => p.id).sort((a, b) => a - b), [2, 3, 4]);
    });

    test('list_statuses がプロジェクトの状態を返す', async () => {
        const statuses = await projects.listStatuses(live.projectKey);
        assert.ok(statuses.length >= 4);
        assert.ok(statuses.every((s) => s.id > 0 && s.name.length > 0));
        assert.ok(statuses.some((s) => s.name === '未対応'));
    });

    test('list_milestones が既定でアーカイブ済みを除外する', async () => {
        const backlog = api.getClient();
        const stamp = Date.now();

        const active = await backlog.postVersions(live.projectKey, { name: `zz-active-${stamp}` });
        cleanup.push(() => backlog.deleteVersions(live.projectKey, active.id));
        const archived = await backlog.postVersions(live.projectKey, { name: `zz-archived-${stamp}` });
        cleanup.push(() => backlog.deleteVersions(live.projectKey, archived.id));
        await backlog.patchVersions(live.projectKey, archived.id, { name: `zz-archived-${stamp}`, archived: true });

        const defaults = await projects.listMilestones(live.projectKey);
        assert.ok(defaults.some((m) => m.id === active.id), 'アーカイブしていないものは含まれる');
        assert.ok(!defaults.some((m) => m.id === archived.id), 'アーカイブ済みは含まれない');

        const all = await projects.listMilestones(live.projectKey, true);
        assert.ok(all.some((m) => m.id === archived.id), 'includeArchived で全件返る');
    });

    test('list_categories がカテゴリを返す', async () => {
        const backlog = api.getClient();
        const category = await backlog.postCategories(live.projectKey, { name: `zz-cat-${Date.now()}` });
        cleanup.push(() => backlog.deleteCategories(live.projectKey, category.id));

        const categories = await projects.listCategories(live.projectKey);
        assert.ok(categories.some((c) => c.id === category.id));
    });

    test('addMilestone / addCategory で追加したものが一覧に現れ、削除で消える', async () => {
        const stamp = Date.now();

        const milestone = await projects.addMilestone(live.projectKey, {
            name: `zz-svc-ms-${stamp}`, description: '説明', startDate: '2030-01-01', releaseDueDate: '2030-12-31',
        });
        cleanup.push(() => projects.deleteMilestone(live.projectKey, milestone.id).catch(() => undefined));
        assert.equal(milestone.name, `zz-svc-ms-${stamp}`);
        assert.equal(milestone.description, '説明');
        assert.equal(milestone.startDate?.slice(0, 10), '2030-01-01');
        assert.equal(milestone.releaseDueDate?.slice(0, 10), '2030-12-31');
        assert.ok((await projects.listMilestones(live.projectKey)).some((m) => m.id === milestone.id));

        const category = await projects.addCategory(live.projectKey, `zz-svc-cat-${stamp}`);
        cleanup.push(() => projects.deleteCategory(live.projectKey, category.id).catch(() => undefined));
        assert.equal(category.name, `zz-svc-cat-${stamp}`);
        assert.ok((await projects.listCategories(live.projectKey)).some((c) => c.id === category.id));

        await projects.deleteMilestone(live.projectKey, milestone.id);
        assert.ok(!(await projects.listMilestones(live.projectKey, true)).some((m) => m.id === milestone.id));
        await projects.deleteCategory(live.projectKey, category.id);
        assert.ok(!(await projects.listCategories(live.projectKey)).some((c) => c.id === category.id));
    });

    test('addIssueType / deleteIssueType で種別を入れ替えられる', async () => {
        // 課題種別・状態の名前は 20 文字まで（超えると HTTP 400 error.maxLength）
        const stamp = Date.now();

        // 残っていれば、別の種別を代わりにして消す
        const removeIfPresent = async (issueTypeId: number) => {
            const types = await projects.listIssueTypes(live.projectKey);
            if (!types.some((t) => t.id === issueTypeId)) return;
            const substitute = types.find((t) => t.id !== issueTypeId)!;
            await projects.deleteIssueType(live.projectKey, issueTypeId, substitute.id);
        };

        // 2 つ目の作成が失敗しても 1 つ目が残らないよう、作成のたびに後片付けを登録する
        const keep = await projects.addIssueType(live.projectKey, { name: `zz-sk-${stamp}`, color: '#7ea800' });
        cleanup.push(() => removeIfPresent(keep.id));
        const doomed = await projects.addIssueType(live.projectKey, { name: `zz-sd-${stamp}`, color: '#e30000' });
        cleanup.push(() => removeIfPresent(doomed.id));
        assert.equal(keep.color, '#7ea800');
        assert.equal(doomed.color, '#e30000');

        const deleted = await projects.deleteIssueType(live.projectKey, doomed.id, keep.id);
        assert.equal(deleted.id, doomed.id);
        const remaining = await projects.listIssueTypes(live.projectKey);
        assert.ok(remaining.some((t) => t.id === keep.id));
        assert.ok(!remaining.some((t) => t.id === doomed.id));
    });

    test('addStatus / deleteStatus（スタンダードプラン以上）', async (t) => {
        const stamp = Date.now();
        let status;
        try {
            status = await projects.addStatus(live.projectKey, { name: `zz-ss-${stamp}`, color: '#4caf93' });
        } catch (error) {
            // スキップするのはプラン制限（Backlog のエラーコード 2: LicenceError）だけ。
            // 引数の不備や 5xx まで飲み込むと、追加の不具合を検出できなくなる
            if (!describeBacklogError(error).errors.some((e) => e.code === LICENCE_ERROR_CODE)) throw error;
            t.skip(`カスタム状態を追加できないプランのためスキップ: ${formatBacklogError(error)}`);
            return;
        }
        cleanup.push(() => projects.deleteStatus(live.projectKey, status.id, 1).catch(() => undefined));
        assert.equal(status.color, '#4caf93');
        assert.ok((await projects.listStatuses(live.projectKey)).some((s) => s.id === status.id));

        await projects.deleteStatus(live.projectKey, status.id, 1);
        assert.ok(!(await projects.listStatuses(live.projectKey)).some((s) => s.id === status.id));
    });

    test('list_resolutions が完了理由を返す', async () => {
        const resolutions = await projects.listResolutions();
        assert.ok(resolutions.length > 0);
        assert.ok(resolutions.some((r) => r.name === '対応済み'));
    });
});
