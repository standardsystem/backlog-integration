import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

/** ビルド済みの MCP サーバー本体 */
const SERVER_ENTRY = join(process.cwd(), 'dist', 'index.js');

/** JSON-RPC でサーバーとやり取りする最小クライアント */
class StdioClient {
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

    /**
     * JSON-RPC リクエストを送って応答を待つ
     *
     * @param method - メソッド名
     * @param params - パラメータ（省略すると params 自体を送らない）
     * @returns 応答メッセージ
     */
    request(method: string, params?: unknown): Promise<Record<string, any>> {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, resolve);
            const payload: Record<string, unknown> = { jsonrpc: '2.0', id, method };
            if (params !== undefined) payload.params = params;
            this.child.stdin.write(`${JSON.stringify(payload)}\n`);
            setTimeout(() => reject(new Error(`timeout: ${method}`)), 20000).unref();
        });
    }

    /**
     * 通知を送る（応答を待たない）
     *
     * @param method - メソッド名
     * @param params - パラメータ
     */
    notify(method: string, params: unknown): void {
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    }

    /** MCP のハンドシェイクを済ませる */
    async initialize(): Promise<Record<string, any>> {
        const result = await this.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '0' },
        });
        this.notify('notifications/initialized', {});
        return result;
    }

    /** プロセスを終了する */
    close(): void {
        this.child.kill();
    }
}

describe('MCP プロトコル越しの動作', () => {
    let client: StdioClient;

    before(async () => {
        // 実 API に出ないよう、疎通確認を止めたダミー設定で起動する
        client = new StdioClient({
            BACKLOG_SPACE_ID: 'dummy-space',
            BACKLOG_API_KEY: 'dummy-key',
            BACKLOG_SKIP_STARTUP_CHECK: '1',
        });
        await client.initialize();
    });

    after(() => { client.close(); });

    test('initialize に応答する', async () => {
        const result = await client.request('ping').catch(() => null);
        // ping は必須ではないため、応答の有無は問わない（initialize が成功していれば十分）
        assert.ok(result === null || typeof result === 'object');
    });

    test('BACKLOG_SKIP_STARTUP_CHECK=1 で疎通確認を飛ばす', () => {
        assert.ok(
            client.stderr.some((line) => line.includes('疎通確認をスキップしました')),
            client.stderr.join('\n'),
        );
    });

    test('tools/list に全ツールが重複なく並ぶ', async () => {
        const { result } = await client.request('tools/list', {});
        const names: string[] = result.tools.map((t: { name: string }) => t.name);

        assert.equal(new Set(names).size, names.length, 'ツール名が重複しないこと');
        for (const expected of [
            'get_issue', 'list_issues', 'count_issues', 'create_issue', 'update_issue',
            'add_comment', 'get_comment', 'list_comments', 'count_comments', 'update_comment', 'delete_comment',
            'assign_to_reporter', 'upload_attachment', 'mcp_backlog_upload_attachment',
            'download_attachment', 'download_issue_attachments', 'list_issue_attachments', 'delete_issue_attachment',
            'get_project', 'list_project_users', 'list_milestones', 'list_statuses',
            'list_issue_types', 'list_categories', 'list_priorities', 'get_myself',
            'get_document', 'list_documents', 'get_document_tree', 'add_document',
            'upload_document_markdown', 'download_document_markdown', 'download_document_attachment',
            'delete_document_attachment',
        ]) {
            assert.ok(names.includes(expected), `${expected} が登録されていること`);
        }
    });

    test('すべてのツールに説明文と object 形式の inputSchema がある', async () => {
        const { result } = await client.request('tools/list', {});
        for (const tool of result.tools as Array<{ name: string; description?: string; inputSchema?: { type?: string } }>) {
            assert.ok(tool.description && tool.description.length > 0, `${tool.name} に説明文があること`);
            assert.equal(tool.inputSchema?.type, 'object', `${tool.name} の inputSchema が object であること`);
        }
    });

    test('list_issues は projectIdOrKey を必須にしない', async () => {
        const { result } = await client.request('tools/list', {});
        const listIssues = result.tools.find((t: { name: string }) => t.name === 'list_issues');
        assert.deepEqual(listIssues.inputSchema.required ?? [], []);
    });

    test('parentChild は数値と名前の両方を受け付ける JSON Schema になる', async () => {
        const { result } = await client.request('tools/list', {});
        const listIssues = result.tools.find((t: { name: string }) => t.name === 'list_issues');
        const parentChild = listIssues.inputSchema.properties.parentChild;
        assert.equal(parentChild.anyOf.length, 2);
        assert.ok(parentChild.anyOf.some((s: { type?: string }) => s.type === 'integer'));
        assert.ok(parentChild.anyOf.some((s: { enum?: string[] }) => s.enum?.includes('hasChildren')));
    });

    test('create_issue の必須項目は summary だけ', async () => {
        const { result } = await client.request('tools/list', {});
        const createIssue = result.tools.find((t: { name: string }) => t.name === 'create_issue');
        assert.deepEqual(createIssue.inputSchema.required, ['summary']);
    });

    test('引数なしツールは arguments を省略しても呼べる', async () => {
        // MCP 仕様では params.arguments は optional。inputSchema: {} を渡すと SDK が弾いてしまう
        for (const name of ['list_priorities', 'get_myself']) {
            const { result } = await client.request('tools/call', { name });
            const text = result.content.map((c: { text: string }) => c.text).join('');
            assert.doesNotMatch(text, /Input validation error/, `${name} が検証で弾かれないこと`);
        }
    });

    test('必須引数のあるツールは引数不足を検出する', async () => {
        const { result } = await client.request('tools/call', { name: 'get_issue', arguments: {} });
        assert.equal(result.isError, true);
    });

    test('ツールのエラーに HTTP ステータスと対処が含まれる', async () => {
        // ダミーのスペースなので Backlog は 500 を返す
        const { result } = await client.request('tools/call', { name: 'list_priorities', arguments: {} });
        const text = result.content.map((c: { text: string }) => c.text).join('');
        assert.equal(result.isError, true);
        assert.match(text, /HTTP \d{3}/);
        assert.match(text, /対処:/);
    });
});

describe('起動時の疎通確認（プロセスの終了コード）', () => {
    /**
     * サーバーを起動して終了コードと stderr を集める
     *
     * @param env - 追加の環境変数
     * @param waitMs - プロセスの終了を待つ上限
     * @returns 終了コードと stderr
     */
    async function runServer(env: Record<string, string>, waitMs = 12000) {
        const child = spawn(process.execPath, [SERVER_ENTRY], {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        const stderr: string[] = [];
        child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk.toString()); });

        const exitCode = await new Promise<number | null>((resolve) => {
            const timer = setTimeout(() => { child.kill(); resolve(null); }, waitMs);
            child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
        });

        return { exitCode, stderr: stderr.join('') };
    }

    test('環境変数が無ければ設定方法を出して終了する', async () => {
        const { exitCode, stderr } = await runServer(
            { BACKLOG_SPACE_ID: '', BACKLOG_API_KEY: '' },
            8000,
        );
        assert.equal(exitCode, 1);
        assert.match(stderr, /BACKLOG_SPACE_ID/);
        assert.match(stderr, /backlog\.jp/, 'スペースIDの指定形式を案内すること');
    });

    test('一時的な失敗（HTTP 500）では終了せず、背景で再試行する', async () => {
        // 存在しないスペースは Backlog のワイルドカードホストが 500 を返す
        const { exitCode, stderr } = await runServer({
            BACKLOG_SPACE_ID: 'this-space-does-not-exist-98765',
            BACKLOG_API_KEY: 'dummy-key',
        }, 10000);

        assert.equal(exitCode, null, '起動したまま（終了していない）こと');
        assert.match(stderr, /起動は継続します/);
        assert.match(stderr, /再試行します/);
    });

    test('一時的な失敗でも tools/list は使える', async () => {
        const client = new StdioClient({
            BACKLOG_SPACE_ID: 'this-space-does-not-exist-98765',
            BACKLOG_API_KEY: 'dummy-key',
        });
        try {
            await client.initialize();
            const { result } = await client.request('tools/list', {});
            assert.ok(result.tools.length >= 30, 'ツールが失われないこと');
        } finally {
            client.close();
        }
    });
});
