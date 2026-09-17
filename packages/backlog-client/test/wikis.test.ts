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

    test('updateWiki は expectedUpdated が一致すれば更新する', async () => {
        let patched = false;
        const { wikis } = makeService({
            getWiki: async () => WIKI,
            patchWiki: async () => { patched = true; return WIKI; },
        });

        await wikis.updateWiki(50, { content: 'y', expectedUpdated: '2026-09-02T00:00:00Z' });
        assert.equal(patched, true);
    });

    test('updateWiki は expectedUpdated が食い違えば更新しない（他者の編集を上書きしない）', async () => {
        let patched = false;
        const { wikis } = makeService({
            getWiki: async () => WIKI,
            patchWiki: async () => { patched = true; return WIKI; },
        });

        await assert.rejects(
            wikis.updateWiki(50, { content: 'y', expectedUpdated: '2026-09-01T00:00:00Z' }),
            /読み込み後に更新されています.*山田 太郎/,
        );
        assert.equal(patched, false);
    });

    test('downloadContent は本文だけをそのまま書き出す', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'wiki-'));
        tempDirs.push(dir);
        const { wikis } = makeService({ getWiki: async () => WIKI });

        const outputPath = join(dir, 'nested', 'page.md');
        const result = await wikis.downloadContent(50, outputPath);

        assert.equal(await readFile(outputPath, 'utf8'), WIKI.content, '見出しを足さず改行も変えないこと');
        assert.equal(result.bytes, Buffer.byteLength(WIKI.content, 'utf8'));
        assert.equal(result.updated, WIKI.updated);
        assert.equal(result.name, '設計/API');
    });

    test('getWikiUrl は ID で引ける URL を返す', () => {
        const client = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });
        assert.equal(client.getWikiUrl(50), 'https://my-space.backlog.jp/alias/wiki/50');
        assert.equal(client.getWikiUrl(undefined), undefined);
    });
});
