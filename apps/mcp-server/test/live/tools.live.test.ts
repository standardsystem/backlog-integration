import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    BacklogApiClient,
    ProjectService,
    resolveBacklogConfig,
} from '@backlog-integration/backlog-client';

import { getLiveConfig, LIVE_SKIP_REASON } from '../helpers/env.js';

const SERVER_ENTRY = join(process.cwd(), 'dist', 'index.js');

/** MCP サーバーを stdio で動かして tools/call するクライアント */
class LiveClient {
    private readonly child: ChildProcessWithoutNullStreams;
    private readonly pending = new Map<number, (message: Record<string, any>) => void>();
    private nextId = 1;
    readonly stderr: string[] = [];

    constructor(env: Record<string, string>) {
        this.child = spawn(process.execPath, [SERVER_ENTRY], {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams;

        createInterface({ input: this.child.stdout }).on('line', (line) => {
            let message: Record<string, any>;
            try {
                message = JSON.parse(line);
            } catch {
                return;
            }
            const resolve = this.pending.get(message.id);
            if (resolve) {
                this.pending.delete(message.id);
                resolve(message);
            }
        });
        createInterface({ input: this.child.stderr }).on('line', (line) => { this.stderr.push(line); });
    }

    private send(method: string, params?: unknown): Promise<Record<string, any>> {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, resolve);
            const payload: Record<string, unknown> = { jsonrpc: '2.0', id, method };
            if (params !== undefined) payload.params = params;
            this.child.stdin.write(`${JSON.stringify(payload)}\n`);
            setTimeout(() => reject(new Error(`timeout: ${method} ${JSON.stringify(params)}`)), 30000).unref();
        });
    }

    /** MCP のハンドシェイクを済ませる */
    async initialize(): Promise<void> {
        await this.send('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'live-test', version: '0' },
        });
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    }

    /**
     * ツールを呼び出して JSON を取り出す
     *
     * @param name - ツール名
     * @param args - 引数
     * @returns 呼び出し結果
     */
    async call(name: string, args?: Record<string, unknown>): Promise<{ isError: boolean; text: string; json: any }> {
        const { result } = await this.send('tools/call', { name, arguments: args ?? {} });
        const text = (result.content as Array<{ text: string }>).map((c) => c.text).join('\n');
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch {
            json = undefined;
        }
        return { isError: result.isError === true, text, json };
    }

    close(): void { this.child.kill(); }
}

/**
 * MCP ツールを実 Backlog に対して動かすテスト
 *
 * `.env` に認証情報とテスト用プロジェクトキーがある場合だけ実行されます。
 * 作成した課題・マイルストーン・カテゴリは終了時に必ず削除します。
 */
describe('live: MCP ツール', { skip: LIVE_SKIP_REASON }, () => {
    const live = getLiveConfig()!;
    let client: LiveClient;
    let api: BacklogApiClient;
    let projects: ProjectService;
    let host: string;
    const cleanup: Array<() => Promise<unknown>> = [];
    const tempDirs: string[] = [];

    before(async () => {
        api = new BacklogApiClient(resolveBacklogConfig(live.spaceId, live.apiKey));
        projects = new ProjectService(api);
        host = api.getHost();

        client = new LiveClient({
            BACKLOG_SPACE_ID: live.spaceId,
            BACKLOG_API_KEY: live.apiKey,
        });
        await client.initialize();
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
        client?.close();
    });

    /**
     * MCP の create_issue で課題を作り、後片付けに登録する
     *
     * @param args - create_issue の引数（projectIdOrKey / summary は既定値あり）
     * @returns 作成結果の JSON
     */
    async function createIssue(args: Record<string, unknown> = {}) {
        const result = await client.call('create_issue', {
            projectIdOrKey: live.projectKey,
            summary: `[自動テスト] ${new Date().toISOString()}`,
            issueType: 'タスク',
            priority: '中',
            ...args,
        });
        assert.equal(result.isError, false, result.text);
        cleanup.push(() => api.getClient().deleteIssue(result.json.issueKey));
        return result.json;
    }

    test('起動時の疎通確認が成功したことをログに出す', () => {
        assert.ok(
            client.stderr.some((line) => line.includes('に接続しました')),
            client.stderr.join('\n'),
        );
    });

    test('get_myself が接続中アカウントを返す', async () => {
        const result = await client.call('get_myself');
        assert.equal(result.isError, false, result.text);
        const me = await projects.getMyself();
        assert.equal(result.json.id, me.id);
        assert.equal(result.json.host, host);
    });

    test('メタ情報ツールで名前から ID を引ける', async () => {
        const types = await client.call('list_issue_types', { projectIdOrKey: live.projectKey });
        assert.ok(types.json.some((t: { name: string }) => t.name === 'タスク'));

        const priorities = await client.call('list_priorities');
        assert.ok(priorities.json.some((p: { name: string }) => p.name === '中'));

        const statuses = await client.call('list_statuses', { projectIdOrKey: live.projectKey });
        assert.ok(statuses.json.some((s: { name: string }) => s.name === '未対応'));

        const project = await client.call('get_project', { projectIdOrKey: live.projectKey });
        assert.equal(project.json.projectKey, live.projectKey);
        assert.ok(['markdown', 'backlog'].includes(project.json.textFormattingRule));
    });

    test('create_issue が名前指定で課題を作り、url と warnings を返す', async () => {
        const issue = await createIssue({ summary: '[自動テスト] 名前指定で作成' });

        assert.match(issue.issueKey, new RegExp(`^${live.projectKey}-\\d+$`));
        assert.equal(issue.url, `https://${host}/view/${issue.issueKey}`);
        assert.deepEqual(issue.warnings, ['dueDate 未設定', 'milestone 未設定']);
        assert.match(issue.message, /を作成しました/);
    });

    test('存在しない課題種別を指定すると候補一覧つきのエラーになる', async () => {
        const result = await client.call('create_issue', {
            projectIdOrKey: live.projectKey,
            summary: '[自動テスト] 失敗するはず',
            issueType: 'そんな種別はない',
            priority: '中',
        });
        assert.equal(result.isError, true);
        assert.match(result.text, /解決できませんでした/);
        assert.match(result.text, /タスク\(\d+\)/);
    });

    test('list_issues と count_issues が親課題で絞り込める', async () => {
        const parent = await createIssue({ summary: '[自動テスト] 親（MCP）' });
        const child = await createIssue({ summary: '[自動テスト] 子（MCP）', parentIssueId: parent.id });

        const listed = await client.call('list_issues', {
            projectIdOrKey: live.projectKey,
            parentIssueId: [parent.id],
        });
        assert.deepEqual(listed.json.map((i: { id: number }) => i.id), [child.id]);
        assert.ok(listed.json[0].status.id > 0, 'status.id が取れること');
        assert.equal(listed.json[0].url, `https://${host}/view/${child.issueKey}`);

        const counted = await client.call('count_issues', {
            projectIdOrKey: live.projectKey,
            parentIssueId: [parent.id],
        });
        assert.equal(counted.json.count, 1);
    });

    test('list_issues の fields と "*" が効く', async () => {
        await createIssue({ summary: '[自動テスト] fields 確認', description: '説明文' });

        const picked = await client.call('list_issues', {
            projectIdOrKey: live.projectKey, count: 1, sort: 'created', order: 'desc',
            fields: ['issueKey', 'description'],
        });
        assert.deepEqual(Object.keys(picked.json[0]).sort(), ['description', 'issueKey']);

        const raw = await client.call('list_issues', {
            projectIdOrKey: live.projectKey, count: 1, sort: 'created', order: 'desc', fields: ['*'],
        });
        assert.ok('projectId' in raw.json[0], '生レスポンスが返ること');
        assert.ok(String(raw.json[0].url).startsWith(`https://${host}/view/`));
    });

    test('update_issue が名前指定の状態変更とマイルストーン解除を行う', async () => {
        const stamp = Date.now();
        const backlog = api.getClient();
        const milestone = await backlog.postVersions(live.projectKey, { name: `zz-mcp-ms-${stamp}` });
        cleanup.push(() => backlog.deleteVersions(live.projectKey, milestone.id));

        const issue = await createIssue({
            summary: '[自動テスト] 更新（MCP）',
            milestone: [`zz-mcp-ms-${stamp}`],
            dueDate: '2030-12-31',
        });
        assert.equal(issue.milestone.length, 1, '名前指定でマイルストーンが付くこと');
        assert.deepEqual(issue.warnings, [], '期限日とマイルストーンが揃えば警告なし');

        const updated = await client.call('update_issue', {
            issueIdOrKey: issue.issueKey,
            status: '処理中',
            assignee: '@me',
        });
        assert.equal(updated.isError, false, updated.text);
        assert.equal(updated.json.status.name, '処理中');
        assert.equal(updated.json.assignee.id, (await projects.getMyself()).id);

        const cleared = await client.call('update_issue', {
            issueIdOrKey: issue.issueKey,
            milestoneId: [],
        });
        assert.equal(cleared.isError, false, cleared.text);
        assert.deepEqual(cleared.json.milestone, [], '空配列でマイルストーンを解除できること');
        assert.ok(
            cleared.json.warnings.includes('milestone 未設定'),
            '解除後は未設定として警告されること',
        );
    });

    test('add_comment が状態変更と同時でもコメントIDと url を返す', async () => {
        const issue = await createIssue({ summary: '[自動テスト] コメント（MCP）' });

        const plain = await client.call('add_comment', {
            issueIdOrKey: issue.issueKey,
            content: '通常のコメント',
        });
        assert.equal(plain.isError, false, plain.text);
        assert.ok(plain.json.id > 0);
        assert.equal(plain.json.url, `https://${host}/view/${issue.issueKey}#comment-${plain.json.id}`);

        const withStatus = await client.call('add_comment', {
            issueIdOrKey: issue.issueKey,
            content: `状態変更と同時のコメント ${Date.now()}`,
            statusId: 2,
        });
        assert.equal(withStatus.isError, false, withStatus.text);
        assert.ok(withStatus.json.id > 0, 'patchIssue 経由でもコメントIDが取れること');
        assert.equal(withStatus.json.url, `https://${host}/view/${issue.issueKey}#comment-${withStatus.json.id}`);

        const updated = await client.call('update_comment', {
            issueIdOrKey: issue.issueKey,
            commentId: plain.json.id,
            content: '直したコメント',
        });
        assert.equal(updated.json.content, '直したコメント');

        const counted = await client.call('count_comments', { issueIdOrKey: issue.issueKey });
        assert.ok(counted.json.count >= 2);

        const deleted = await client.call('delete_comment', {
            issueIdOrKey: issue.issueKey,
            commentId: plain.json.id,
        });
        assert.equal(deleted.json.deleted, true);
        assert.equal(deleted.json.content, '直したコメント', '削除した本文が返ること');
    });

    test('添付のアップロード・一覧・一括ダウンロードが通る', async () => {
        const uploadDir = await mkdtemp(join(tmpdir(), 'mcpup-'));
        tempDirs.push(uploadDir);
        const outputDir = join(await mkdtemp(join(tmpdir(), 'mcpdl-')), 'sub');
        tempDirs.push(outputDir);

        const filePath = join(uploadDir, 'メモ.txt');
        await writeFile(filePath, 'テスト用の中身', 'utf8');

        const uploaded = await client.call('upload_attachment', { filePath });
        assert.equal(uploaded.isError, false, uploaded.text);
        assert.ok(uploaded.json.id > 0);

        const issue = await createIssue({
            summary: '[自動テスト] 添付（MCP）',
            attachmentId: [uploaded.json.id],
        });

        const listed = await client.call('list_issue_attachments', { issueIdOrKey: issue.issueKey });
        assert.equal(listed.json.length, 1);
        assert.equal(listed.json[0].name, 'メモ.txt');

        const downloaded = await client.call('download_issue_attachments', {
            issueIdOrKey: issue.issueKey,
            outputDir,
        });
        assert.equal(downloaded.isError, false, downloaded.text);
        assert.equal(downloaded.json.count, 1);
        assert.deepEqual(await readdir(outputDir), ['メモ.txt']);
        assert.ok(downloaded.json.files[0].bytes > 0);

        const deleted = await client.call('delete_issue_attachment', {
            issueIdOrKey: issue.issueKey,
            attachmentId: listed.json[0].id,
        });
        assert.equal(deleted.isError, false, deleted.text);
        assert.equal((await client.call('list_issue_attachments', { issueIdOrKey: issue.issueKey })).json.length, 0);
    });

    test('assign_to_reporter が担当者を起票者に戻す', async () => {
        const issue = await createIssue({ summary: '[自動テスト] レポーターに戻す' });
        const result = await client.call('assign_to_reporter', { issueIdOrKey: issue.issueKey });

        assert.equal(result.isError, false, result.text);
        assert.equal(result.json.assignee.id, (await projects.getMyself()).id);
        assert.equal(result.json.url, `https://${host}/view/${issue.issueKey}`);
    });

    test('存在しない課題を指定すると HTTP ステータス付きのエラーになる', async () => {
        const result = await client.call('get_issue', { issueIdOrKey: `${live.projectKey}-99999999` });
        assert.equal(result.isError, true);
        assert.match(result.text, /HTTP 404/);
        assert.match(result.text, /対処:/);
    });

    test('APIキーが誤っていると（HTTP 401）起動を中止する', async () => {
        // 実在するスペースに誤ったキーで接続し、401 でのみ終了することを確かめる
        const child = spawn(process.execPath, [SERVER_ENTRY], {
            env: {
                ...process.env,
                BACKLOG_SPACE_ID: live.spaceId,
                BACKLOG_API_KEY: 'this-api-key-is-invalid',
                BACKLOG_SKIP_STARTUP_CHECK: '',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const chunks: string[] = [];
        child.stderr.on('data', (chunk: Buffer) => { chunks.push(chunk.toString()); });

        const exitCode = await new Promise<number | null>((resolve) => {
            const timer = setTimeout(() => { child.kill(); resolve(null); }, 20000);
            child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
        });

        const stderr = chunks.join('');
        assert.equal(exitCode, 1, `401 では終了すること。stderr=${stderr}`);
        assert.match(stderr, /認証に失敗/);
        assert.match(stderr, /HTTP 401/);
        assert.match(stderr, /BACKLOG_API_KEY/);
        assert.doesNotMatch(stderr, /再試行します/, '401 では再試行しないこと');
    });
});
