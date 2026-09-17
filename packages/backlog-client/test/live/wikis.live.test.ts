import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BacklogApiClient } from '../../src/client.js';
import { WikiService } from '../../src/wikis.js';
import { resolveBacklogConfig } from '../../src/config.js';
import { getLiveConfig, LIVE_SKIP_REASON } from '../helpers/env.js';

/**
 * 実 API に接続する Wiki 操作のテスト
 *
 * `.env` に BACKLOG_SPACE_ID / BACKLOG_API_KEY / BACKLOG_TEST_PROJECT_KEY が
 * 設定されている場合だけ実行されます。作成した Wiki ページはテスト終了時に必ず削除します。
 */
describe('live: WikiService', { skip: LIVE_SKIP_REASON }, () => {
    const live = getLiveConfig()!;
    let wikis: WikiService;
    let wikiId: number | undefined;
    let tempDir: string | undefined;

    before(async () => {
        const api = new BacklogApiClient(resolveBacklogConfig(live.spaceId, live.apiKey));
        wikis = new WikiService(api);
    });

    after(async () => {
        if (wikiId !== undefined) {
            try {
                await wikis.deleteWiki(wikiId);
            } catch (error) {
                console.error('後片付けに失敗:', error instanceof Error ? error.message : error);
            }
        }
        if (tempDir) await rm(tempDir, { recursive: true, force: true });
    });

    test('作成・取得・一覧・競合検知つき更新・本文保存', async () => {
        const name = `live-test/wiki-${Date.now()}`;
        const created = await wikis.addWiki({ projectIdOrKey: live.projectKey, name, content: '初版' });
        wikiId = created.id;
        assert.equal(created.name, name);

        const fetched = await wikis.getWiki(created.id);
        assert.equal(fetched.content, '初版');

        const listed = await wikis.listWikis(live.projectKey, name);
        assert.ok(listed.some((w) => w.id === created.id), 'キーワードで作成したページが見つかること');
        assert.ok(await wikis.countWikis(live.projectKey) >= 1);

        const updated = await wikis.updateWiki(created.id, { content: '第2版', expectedUpdated: fetched.updated });
        assert.equal(updated.content, '第2版');

        // 読み込み後に他者が更新した状況を、古い updated を渡して再現する
        if (updated.updated !== fetched.updated) {
            await assert.rejects(
                wikis.updateWiki(created.id, { content: '第3版', expectedUpdated: fetched.updated }),
                /読み込み後に更新されています/,
            );
            assert.equal((await wikis.getWiki(created.id)).content, '第2版', '上書きされていないこと');
        }

        tempDir = await mkdtemp(join(tmpdir(), 'wiki-live-'));
        const saved = await wikis.downloadContent(created.id, join(tempDir, 'page.md'));
        assert.equal(await readFile(saved.path, 'utf8'), '第2版');
    });
});
