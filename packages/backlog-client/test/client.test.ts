import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { BacklogApiClient } from '../src/client.js';

/**
 * backlog-js クライアントを差し替えた BacklogApiClient を作る
 *
 * `getClient()` を上書きしてネットワークに出ないようにします。
 *
 * @param stub - backlog-js クライアントの代わりに使うオブジェクト
 * @param config - クライアント設定
 * @returns 差し替え済みのクライアント
 */
function makeClient(stub: Record<string, unknown>, config = { spaceId: 'my-space', apiKey: 'k' }): BacklogApiClient {
    const client = new BacklogApiClient(config);
    (client as unknown as { getClient: () => unknown }).getClient = () => stub;
    return client;
}

describe('ホスト名と URL の組み立て', () => {
    test('既定は backlog.com', () => {
        const client = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k' });
        assert.equal(client.getHost(), 'my-space.backlog.com');
        assert.equal(client.getBaseUrl(), 'https://my-space.backlog.com');
        assert.equal(client.getDomain(), 'backlog.com');
    });

    test('backlog.jp のスペースはホスト名が切り替わる', () => {
        const client = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });
        assert.equal(client.getHost(), 'my-space.backlog.jp');
        assert.equal(client.getIssueUrl('PROJ-1'), 'https://my-space.backlog.jp/view/PROJ-1');
    });

    test('課題・コメント・ドキュメントの URL', () => {
        const client = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k' });
        assert.equal(client.getIssueUrl('PROJ-1'), 'https://my-space.backlog.com/view/PROJ-1');
        assert.equal(client.getCommentUrl('PROJ-1', 42), 'https://my-space.backlog.com/view/PROJ-1#comment-42');
        assert.equal(client.getDocumentUrl('abc123'), 'https://my-space.backlog.com/document/abc123');
    });

    test('値が無い場合は undefined を返す', () => {
        const client = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k' });
        assert.equal(client.getIssueUrl(undefined), undefined);
        assert.equal(client.getIssueUrl(null), undefined);
        assert.equal(client.getCommentUrl('PROJ-1', undefined), undefined);
        assert.equal(client.getCommentUrl(undefined, 1), undefined);
        assert.equal(client.getDocumentUrl(''), undefined);
    });
});

describe('resolveProjectId', () => {
    test('数値はそのまま返し API を呼ばない', async () => {
        let calls = 0;
        const client = makeClient({ getProject: async () => { calls += 1; return { id: 1 }; } });
        assert.equal(await client.resolveProjectId(77), 77);
        assert.equal(calls, 0);
    });

    test('数値形式の文字列もそのまま扱う', async () => {
        let calls = 0;
        const client = makeClient({ getProject: async () => { calls += 1; return { id: 1 }; } });
        assert.equal(await client.resolveProjectId('77'), 77);
        assert.equal(calls, 0);
    });

    test('プロジェクトキーは API で解決してキャッシュする', async () => {
        let calls = 0;
        const client = makeClient({ getProject: async () => { calls += 1; return { id: 829224 }; } });
        assert.equal(await client.resolveProjectId('BL_I'), 829224);
        assert.equal(await client.resolveProjectId('BL_I'), 829224);
        assert.equal(calls, 1, 'API 呼び出しは 1 回だけ');
    });

    test('キャッシュは大文字小文字を区別しない', async () => {
        let calls = 0;
        const client = makeClient({ getProject: async () => { calls += 1; return { id: 5 }; } });
        await client.resolveProjectId('proj');
        await client.resolveProjectId('PROJ');
        assert.equal(calls, 1);
    });
});

describe('resolveIssueKey', () => {
    test('課題キー形式はそのまま返し API を呼ばない', async () => {
        let calls = 0;
        const client = makeClient({ getIssue: async () => { calls += 1; return { issueKey: 'X-1' }; } });
        assert.equal(await client.resolveIssueKey('PROJ-123'), 'PROJ-123');
        assert.equal(calls, 0);
    });

    test('数値IDは API で解決してキャッシュする', async () => {
        let calls = 0;
        const client = makeClient({ getIssue: async () => { calls += 1; return { issueKey: 'PROJ-9' }; } });
        assert.equal(await client.resolveIssueKey(1001), 'PROJ-9');
        assert.equal(await client.resolveIssueKey(1001), 'PROJ-9');
        assert.equal(calls, 1);
    });

    test('数値形式の文字列も API で解決する', async () => {
        const client = makeClient({ getIssue: async () => ({ issueKey: 'PROJ-9' }) });
        assert.equal(await client.resolveIssueKey('1001'), 'PROJ-9');
    });
});
