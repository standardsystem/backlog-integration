import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BacklogApiClient } from '@backlog-integration/backlog-client';

import type { ToolContext } from '../src/lib/context.js';
import { FakeMcpServer } from './helpers/tool-server.js';

import { registerGetWikiTool } from '../src/tools/get-wiki.js';
import { registerListWikisTool } from '../src/tools/list-wikis.js';
import { registerCountWikisTool } from '../src/tools/count-wikis.js';
import { registerAddWikiTool } from '../src/tools/add-wiki.js';
import { registerUpdateWikiTool } from '../src/tools/update-wiki.js';
import { registerDownloadWikiContentTool } from '../src/tools/download-wiki-content.js';

const tempDirs: string[] = [];
after(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

const WIKI = {
    id: 50, projectId: 77, name: '設計/API', content: '本文',
    tags: [{ id: 1, name: '仕様' }], attachments: [], sharedFiles: [], stars: [],
    createdUser: { id: 1, name: 'a', mailAddress: 'a@example.com' }, created: '2026-09-01T00:00:00Z',
    updatedUser: { id: 2, name: 'b', mailAddress: 'b@example.com' }, updated: '2026-09-02T00:00:00Z',
};

/**
 * ネットワークに出ないスタブで ToolContext を組み立てる
 *
 * @returns コンテキストと、サービスに渡された引数の記録
 */
function makeContext() {
    const captured: { add?: Record<string, unknown>; update?: Record<string, unknown> } = {};
    const api = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });

    const wikis = {
        getWikiWithVersion: async () => ({ ...WIKI, version: 4 }),
        getLatestVersion: async () => ({ version: 5, created: WIKI.updated, createdUser: { id: 2, name: 'b' } }),
        listWikis: async () => [{ ...WIKI, content: undefined }],
        countWikis: async () => 3,
        addWiki: async (o: Record<string, unknown>) => { captured.add = o; return { ...WIKI, name: o.name }; },
        updateWiki: async (_id: number, o: Record<string, unknown>) => { captured.update = o; return WIKI; },
        downloadContent: async (id: number, path: string) => ({ id, name: WIKI.name, updated: WIKI.updated, version: 4, path, bytes: 6 }),
    };

    const ctx = { api, wikis } as unknown as ToolContext;
    return { ctx, captured };
}

/**
 * 全 Wiki ツールを登録した偽サーバーを作る
 *
 * @param ctx - ツールコンテキスト
 * @returns 偽サーバー
 */
function makeServer(ctx: ToolContext) {
    const s = new FakeMcpServer();
    registerGetWikiTool(s.server, ctx);
    registerListWikisTool(s.server, ctx);
    registerCountWikisTool(s.server, ctx);
    registerAddWikiTool(s.server, ctx);
    registerUpdateWikiTool(s.server, ctx);
    registerDownloadWikiContentTool(s.server, ctx);
    return s;
}

/**
 * 本文ファイルを一時ディレクトリに書き出す
 *
 * @param content - 本文
 * @returns ファイルの絶対パス
 */
async function writeTempContent(content: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'wikitool-'));
    tempDirs.push(dir);
    const path = join(dir, 'page.md');
    await writeFile(path, content, 'utf8');
    return path;
}

describe('Wiki 読み取りツール', () => {
    test('get_wiki が本文・版番号・url を返す', async () => {
        const { ctx } = makeContext();
        const result = await makeServer(ctx).call('get_wiki', { wikiId: 50 });
        assert.equal(result.json.content, '本文');
        assert.equal(result.json.version, 4);
        assert.equal(result.json.url, 'https://my-space.backlog.jp/alias/wiki/50');
    });

    test('list_wikis がサマリ（タグ名・url・updated）を返す', async () => {
        const { ctx } = makeContext();
        const result = await makeServer(ctx).call('list_wikis', { projectIdOrKey: 'PROJ' });
        assert.deepEqual(result.json[0].tags, ['仕様']);
        assert.equal(result.json[0].url, 'https://my-space.backlog.jp/alias/wiki/50');
        assert.equal(result.json[0].updated, '2026-09-02T00:00:00Z');
        assert.deepEqual(result.json[0].updatedUser, { id: 2, name: 'b' }, 'メールアドレスを含めないこと');
    });

    test('count_wikis が件数を返す', async () => {
        const { ctx } = makeContext();
        assert.deepEqual((await makeServer(ctx).call('count_wikis', { projectIdOrKey: 'PROJ' })).json, { projectIdOrKey: 'PROJ', count: 3 });
    });

    test('download_wiki_content が保存先と版番号を返す', async () => {
        const { ctx } = makeContext();
        const result = await makeServer(ctx).call('download_wiki_content', { wikiId: 50, outputPath: '/tmp/x.md' });
        assert.equal(result.json.path, '/tmp/x.md');
        assert.equal(result.json.version, 4);
        assert.equal(result.json.url, 'https://my-space.backlog.jp/alias/wiki/50');
    });
});

describe('add_wiki', () => {
    test('content で作成し id と url を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_wiki', { projectIdOrKey: 'PROJ', name: '新規', content: 'x' });
        assert.equal(result.isError, false, result.text);
        assert.deepEqual(captured.add, { projectIdOrKey: 'PROJ', name: '新規', content: 'x', mailNotify: undefined });
        assert.equal(result.json.id, 50);
        assert.equal(result.json.content, undefined, '本文を繰り返さないこと');
        assert.match(result.json.message, /作成しました/);
    });

    test('contentFilePath から本文を読み込む', async () => {
        const { ctx, captured } = makeContext();
        const path = await writeTempContent('ファイルの本文\n');
        await makeServer(ctx).call('add_wiki', { projectIdOrKey: 'PROJ', name: '新規', contentFilePath: path });
        assert.equal(captured.add?.content, 'ファイルの本文\n');
    });

    test('本文の指定が無ければエラー', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_wiki', { projectIdOrKey: 'PROJ', name: '新規' });
        assert.equal(result.isError, true);
        assert.match(result.text, /content または contentFilePath/);
        assert.equal(captured.add, undefined);
    });

    test('content と contentFilePath の併用はエラー', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('add_wiki', { projectIdOrKey: 'PROJ', name: '新規', content: 'x', contentFilePath: '/tmp/x' });
        assert.equal(result.isError, true);
        assert.match(result.text, /同時に指定できません/);
        assert.equal(captured.add, undefined);
    });
});

describe('update_wiki', () => {
    test('expectedVersion をサービスに渡し、更新後の版を返す', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('update_wiki', { wikiId: 50, content: 'y', expectedVersion: 4 });
        assert.equal(captured.update?.expectedVersion, 4);
        assert.equal(captured.update?.content, 'y');
        assert.deepEqual(result.json.warnings, []);
        assert.equal(result.json.version, 5, '続けて更新するときに使う版を返すこと');
    });

    test('本文を expectedVersion なしで置き換えると warnings で知らせる', async () => {
        const { ctx } = makeContext();
        const result = await makeServer(ctx).call('update_wiki', { wikiId: 50, content: 'y' });
        assert.equal(result.isError, false);
        assert.equal(result.json.warnings.length, 1);
    });

    test('ページ名だけの変更では warnings を出さない', async () => {
        const { ctx, captured } = makeContext();
        const result = await makeServer(ctx).call('update_wiki', { wikiId: 50, name: '改名' });
        assert.equal(captured.update?.content, undefined);
        assert.deepEqual(result.json.warnings, []);
    });

    test('contentFilePath から本文を読み込む', async () => {
        const { ctx, captured } = makeContext();
        const path = await writeTempContent('編集後');
        await makeServer(ctx).call('update_wiki', { wikiId: 50, contentFilePath: path });
        assert.equal(captured.update?.content, '編集後');
    });

    test('競合エラーを isError で返す', async () => {
        const { ctx } = makeContext();
        (ctx.wikis as unknown as { updateWiki: () => Promise<never> }).updateWiki = async () => {
            throw new Error('Wiki ページ（ID: 50）は読み込み後に更新されています');
        };
        const result = await makeServer(ctx).call('update_wiki', { wikiId: 50, content: 'y', expectedVersion: 1 });
        assert.equal(result.isError, true);
        assert.match(result.text, /Wiki ページの更新に失敗しました: .*読み込み後に更新されています/);
    });

    test('説明文が全文置換と expectedVersion を案内している', () => {
        const { ctx } = makeContext();
        const description = makeServer(ctx).definition('update_wiki').description;
        assert.match(description, /全文置換/);
        assert.match(description, /expectedVersion/);
    });
});
