import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BacklogApiClient } from '../../src/client.js';
import { IssueService } from '../../src/issues.js';
import { ProjectService } from '../../src/projects.js';
import { resolveBacklogConfig } from '../../src/config.js';
import { getLiveConfig, LIVE_SKIP_REASON } from '../helpers/env.js';

/**
 * 実 API に接続する課題操作のテスト
 *
 * `.env` に BACKLOG_SPACE_ID / BACKLOG_API_KEY / BACKLOG_TEST_PROJECT_KEY が
 * 設定されている場合だけ実行されます。作成した課題・マイルストーン・カテゴリは
 * テスト終了時に必ず削除します。
 */
describe('live: IssueService', { skip: LIVE_SKIP_REASON }, () => {
    const live = getLiveConfig()!;
    let api: BacklogApiClient;
    let issues: IssueService;
    let projects: ProjectService;
    let projectId: number;
    let issueTypeId: number;
    let priorityId: number;

    /** テスト終了時に実行する後片付け処理 */
    const cleanup: Array<() => Promise<unknown>> = [];
    const tempDirs: string[] = [];

    before(async () => {
        api = new BacklogApiClient(resolveBacklogConfig(live.spaceId, live.apiKey));
        issues = new IssueService(api);
        projects = new ProjectService(api);

        const project = await projects.getProject(live.projectKey);
        projectId = project.id;
        issueTypeId = (await projects.listIssueTypes(live.projectKey))[0].id;
        priorityId = (await projects.listPriorities()).find((p) => p.name === '中')!.id;
    });

    after(async () => {
        for (const fn of cleanup.reverse()) {
            try {
                await fn();
            } catch (error) {
                console.error('後片付けに失敗:', error instanceof Error ? error.message : error);
            }
        }
        for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
    });

    /**
     * 後片付け対象の課題を作る
     *
     * @param overrides - createIssue に上書きで渡すパラメータ
     * @returns 作成された課題
     */
    async function createTestIssue(overrides: Record<string, unknown> = {}) {
        const issue = await issues.createIssue({
            projectId,
            summary: `[自動テスト] ${new Date().toISOString()}`,
            issueTypeId,
            priorityId,
            ...overrides,
        } as never);
        cleanup.push(() => api.getClient().deleteIssue(issue.issueKey));
        return issue;
    }

    test('課題を作成して取得できる', async () => {
        const issue = await createTestIssue({ description: '本文', dueDate: '2030-12-31' });
        assert.match(issue.issueKey, new RegExp(`^${live.projectKey}-\\d+$`));

        const fetched = await issues.getIssue(issue.issueKey);
        assert.equal(fetched.id, issue.id);
        // Backlog は日付を ISO 形式（2030-12-31T00:00:00Z）で返す
        assert.ok(fetched.dueDate?.startsWith('2030-12-31'), `dueDate=${fetched.dueDate}`);
        assert.equal(api.getIssueUrl(fetched.issueKey), `https://${api.getHost()}/view/${issue.issueKey}`);
    });

    test('親課題IDで子課題を絞り込める', async () => {
        const parent = await createTestIssue({ summary: '[自動テスト] 親' });
        const child = await createTestIssue({ summary: '[自動テスト] 子', parentIssueId: parent.id });

        const children = await issues.listIssues({ projectIdOrKey: live.projectKey, parentIssueId: [parent.id] });
        assert.deepEqual(children.map((i) => i.id), [child.id]);
        assert.ok(children[0].status.id > 0, 'status.id が取れること');
    });

    test('countIssues が listIssues と同じ条件で総件数を返す', async () => {
        await createTestIssue({ summary: '[自動テスト] 件数確認' });

        const total = await issues.countIssues({ projectIdOrKey: live.projectKey });
        const listed = await issues.listIssues({ projectIdOrKey: live.projectKey, count: 100 });
        assert.ok(total >= listed.length);
        assert.ok(total > 0);
    });

    test('offset でページングできる', async () => {
        await createTestIssue({ summary: '[自動テスト] ページング1' });
        await createTestIssue({ summary: '[自動テスト] ページング2' });

        const first = await issues.listIssues({ projectIdOrKey: live.projectKey, count: 1, sort: 'created', order: 'desc' });
        const second = await issues.listIssues({ projectIdOrKey: live.projectKey, count: 1, offset: 1, sort: 'created', order: 'desc' });

        assert.equal(first.length, 1);
        assert.equal(second.length, 1);
        assert.notEqual(first[0].id, second[0].id, 'offset で別の課題が返ること');
    });

    test('マイルストーン・カテゴリを空配列で解除できる', async () => {
        const stamp = Date.now();
        const backlog = api.getClient();

        const milestone = await backlog.postVersions(live.projectKey, { name: `zz-test-ms-${stamp}` });
        cleanup.push(() => backlog.deleteVersions(live.projectKey, milestone.id));
        const category = await backlog.postCategories(live.projectKey, { name: `zz-test-cat-${stamp}` });
        cleanup.push(() => backlog.deleteCategories(live.projectKey, category.id));

        const issue = await createTestIssue({
            summary: '[自動テスト] 解除',
            milestoneId: [milestone.id],
            categoryId: [category.id],
            versionId: [milestone.id],
        });
        assert.equal(issue.milestone.length, 1, '前提: マイルストーンが設定されていること');
        assert.equal(issue.category.length, 1, '前提: カテゴリが設定されていること');

        const cleared = await issues.updateIssue(issue.issueKey, {
            milestoneId: [],
            categoryId: [],
            versionId: [],
        });

        assert.deepEqual(cleared.milestone, [], 'マイルストーンが解除されること');
        assert.deepEqual(cleared.category, [], 'カテゴリが解除されること');
        assert.deepEqual(cleared.versions, [], '発生バージョンが解除されること');
    });

    test('片方だけ解除しても、もう片方は残る', async () => {
        const stamp = Date.now();
        const backlog = api.getClient();
        const milestone = await backlog.postVersions(live.projectKey, { name: `zz-test-ms2-${stamp}` });
        cleanup.push(() => backlog.deleteVersions(live.projectKey, milestone.id));
        const category = await backlog.postCategories(live.projectKey, { name: `zz-test-cat2-${stamp}` });
        cleanup.push(() => backlog.deleteCategories(live.projectKey, category.id));

        const issue = await createTestIssue({
            summary: '[自動テスト] 片方だけ解除',
            milestoneId: [milestone.id],
            categoryId: [category.id],
        });

        const updated = await issues.updateIssue(issue.issueKey, { milestoneId: [] });
        assert.deepEqual(updated.milestone, [], 'マイルストーンは解除される');
        assert.equal(updated.category.length, 1, 'カテゴリは残る');
    });

    test('statusId を指定しなくても課題を更新できる', async () => {
        // update_issue が現在の statusId を送り返す実装の必要性を確かめるための確認
        const issue = await createTestIssue({ summary: '[自動テスト] statusId 無し更新' });
        const updated = await issues.updateIssue(issue.issueKey, { summary: '[自動テスト] statusId 無し更新（後）' });
        assert.equal(updated.summary, '[自動テスト] statusId 無し更新（後）');
        assert.equal(updated.status.id, issue.status.id, '状態は変わらないこと');
    });

    test('コメントの投稿・取得・更新・件数・削除ができる', async () => {
        const issue = await createTestIssue({ summary: '[自動テスト] コメント' });

        const posted = await issues.addComment(issue.issueKey, { content: '最初の内容' });
        assert.ok(posted.id > 0);
        assert.equal(
            api.getCommentUrl(issue.issueKey, posted.id),
            `https://${api.getHost()}/view/${issue.issueKey}#comment-${posted.id}`,
        );

        const updated = await issues.updateComment(issue.issueKey, posted.id, '直した内容');
        assert.equal(updated.content, '直した内容');
        assert.equal((await issues.getComment(issue.issueKey, posted.id)).content, '直した内容');

        const before = await issues.countComments(issue.issueKey);
        assert.ok(before >= 1);

        await issues.deleteComment(issue.issueKey, posted.id);
        assert.equal(await issues.countComments(issue.issueKey), before - 1);
        await assert.rejects(() => issues.getComment(issue.issueKey, posted.id));
    });

    test('課題更新と同時に投稿したコメントを引き当てられる', async () => {
        const issue = await createTestIssue({ summary: '[自動テスト] 更新と同時のコメント' });
        const content = `更新と同時のコメント ${Date.now()}`;

        await issues.updateIssue(issue.issueKey, { statusId: 2, comment: content });
        const found = await issues.findRecentCommentByContent(issue.issueKey, content);

        assert.ok(found, 'コメントを引き当てられること');
        assert.equal(found.content, content);
    });

    test('添付ファイルのアップロード・一覧・一括ダウンロードができる', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'bllive-'));
        tempDirs.push(dir);
        const uploadDir = await mkdtemp(join(tmpdir(), 'blup-'));
        tempDirs.push(uploadDir);

        const { writeFile } = await import('node:fs/promises');
        // ローカルで使えない文字を含む名前で、保存時に正規化されることも確かめる
        const filePath = join(uploadDir, '設計書.txt');
        await writeFile(filePath, 'あいうえお', 'utf8');

        const uploaded1 = await issues.uploadAttachment(filePath);
        const uploaded2 = await issues.uploadAttachment(filePath, '設計:書.txt');
        const issue = await createTestIssue({
            summary: '[自動テスト] 添付',
            attachmentId: [uploaded1.id, uploaded2.id],
        });

        const listed = await issues.listAttachments(issue.issueKey);
        assert.equal(listed.length, 2);
        assert.ok(listed.every((a) => a.size > 0));

        const downloaded = await issues.downloadAttachments(issue.issueKey, join(dir, 'sub'));
        assert.equal(downloaded.count, 2);
        const saved = (await readdir(join(dir, 'sub'))).sort();
        assert.equal(saved.length, 2);
        assert.ok(
            saved.includes('設計_書.txt'),
            `Windows で使えない ":" が "_" に置換されること: ${saved.join(', ')}`,
        );
        assert.ok(downloaded.files.every((f) => f.bytes > 0));

        const single = await issues.downloadAttachments(issue.issueKey, join(dir, 'one'), [listed[0].id]);
        assert.equal(single.count, 1, 'attachmentIds の指定が効くこと');
    });
});
