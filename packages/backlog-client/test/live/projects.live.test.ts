import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { BacklogApiClient } from '../../src/client.js';
import { ProjectService } from '../../src/projects.js';
import { resolveBacklogConfig } from '../../src/config.js';
import { getLiveConfig, LIVE_SKIP_REASON } from '../helpers/env.js';

/**
 * 実 API に接続するメタ情報参照のテスト
 *
 * Issue #3 の受け入れ条件（名前から ID を引く一連の操作が MCP だけで完結する）を確かめます。
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

    test('list_resolutions が完了理由を返す', async () => {
        const resolutions = await projects.listResolutions();
        assert.ok(resolutions.length > 0);
        assert.ok(resolutions.some((r) => r.name === '対応済み'));
    });
});
