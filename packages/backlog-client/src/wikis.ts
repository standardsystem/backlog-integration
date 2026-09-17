import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Entity } from 'backlog-js';
import type { BacklogApiClient } from './client.js';
import type { AddWikiOptions, UpdateWikiOptions, DownloadedFile, WikiVersion } from './types.js';

/** 最新の版を探すときに取得する履歴の件数（API の上限） */
const HISTORY_LOOKUP_COUNT = 100;

/**
 * Backlog Wiki 操作モジュール
 *
 * Wiki ページの取得・一覧・件数・作成・更新・削除と、本文のファイル保存を提供します。
 *
 * 更新の競合検知には履歴の版番号（`version`）を使います。`updated` は秒単位のため、
 * 同じ 1 秒の間に入った他者の編集を見分けられないからです。
 *
 * @example
 * ```typescript
 * import { BacklogApiClient, WikiService } from '@backlog-integration/backlog-client';
 *
 * const apiClient = new BacklogApiClient({ spaceId: '...', apiKey: '...' });
 * const wikis = new WikiService(apiClient);
 *
 * const pages = await wikis.listWikis('PROJECT');
 * const page = await wikis.getWikiWithVersion(pages[0].id);
 * await wikis.updateWiki(page.id, { content: '新しい本文', expectedVersion: page.version });
 * ```
 */
export class WikiService {
    private readonly client: BacklogApiClient;

    constructor(client: BacklogApiClient) {
        this.client = client;
    }

    /**
     * Wiki ページの詳細（本文を含む）を取得する
     *
     * @param wikiId - Wiki ページID
     * @returns Wiki ページ
     */
    async getWiki(wikiId: number): Promise<Entity.Wiki.Wiki> {
        const backlog = this.client.getClient();
        return await backlog.getWiki(wikiId);
    }

    /**
     * Wiki ページの詳細に最新の版番号を添えて取得する
     *
     * 版を本文より先に読みます。逆順にすると、間に入った他者の編集の版を古い本文と組にして返し、
     * その版を `expectedVersion` に渡した更新が他者の編集を上書きしてしまうためです
     * （この順なら、間に編集が入っても更新が競合エラーになるだけで済みます）。
     *
     * @param wikiId - Wiki ページID
     * @returns 最新の版番号（`version`）付きの Wiki ページ
     */
    async getWikiWithVersion(wikiId: number): Promise<Entity.Wiki.Wiki & { version: number }> {
        const { version } = await this.getLatestVersion(wikiId);
        const wiki = await this.getWiki(wikiId);
        return { ...wiki, version };
    }

    /**
     * Wiki ページの最新の版を取得する
     *
     * 版番号は API で作成したページでは 1 から始まり、ページ名・本文の更新のたびに（内容が同じでも）1 ずつ増えます。
     * 履歴 API の並び順は同じ秒の中で版番号順にならないため、取得した範囲の最大値を採ります。
     *
     * プロジェクト作成時に用意されるページ（Home など）は、編集されるまで履歴が空です。
     * その場合は版 0 として扱います。編集されれば履歴が必ず 1 件以上になるため、比較で変化を検知できます。
     *
     * @param wikiId - Wiki ページID
     * @returns 最新の版番号と、その版の作成者・作成日時（履歴が空なら版 0、作成者・日時は null）
     */
    async getLatestVersion(wikiId: number): Promise<WikiVersion> {
        const backlog = this.client.getClient();
        const history = await backlog.getWikisHistory(wikiId, {
            count: HISTORY_LOOKUP_COUNT,
            order: 'desc',
        });

        const latest = history.reduce<(typeof history)[number] | undefined>(
            (max, entry) => (max === undefined || entry.version > max.version ? entry : max),
            undefined,
        );
        if (latest === undefined) {
            return { version: 0, created: null, createdUser: null };
        }

        return {
            version: latest.version,
            created: latest.created,
            createdUser: { id: latest.createdUser?.id, name: latest.createdUser?.name },
        };
    }

    /**
     * プロジェクトの Wiki ページ一覧を取得する
     *
     * Backlog API はページングを持たず、条件に合うページをすべて返します（本文は含まない）。
     *
     * @param projectIdOrKey - プロジェクトID もしくはキー
     * @param keyword - ページ名・本文に対する検索キーワード
     * @returns Wiki ページの配列
     */
    async listWikis(projectIdOrKey: string | number, keyword?: string): Promise<Entity.Wiki.WikiListItem[]> {
        const backlog = this.client.getClient();
        const params: { projectIdOrKey: string | number; keyword?: string } = { projectIdOrKey };
        if (keyword !== undefined && keyword !== '') params.keyword = keyword;
        return await backlog.getWikis(params);
    }

    /**
     * プロジェクトの Wiki ページ数を取得する
     *
     * @param projectIdOrKey - プロジェクトID もしくはキー
     * @returns ページ数
     */
    async countWikis(projectIdOrKey: string | number): Promise<number> {
        const backlog = this.client.getClient();
        const result = await backlog.getWikisCount(projectIdOrKey);
        return result.count;
    }

    /**
     * Wiki ページを作成する
     *
     * @param options - 作成パラメータ（プロジェクトはキーでも指定できる）
     * @returns 作成された Wiki ページ
     */
    async addWiki(options: AddWikiOptions): Promise<Entity.Wiki.Wiki> {
        const projectId = await this.client.resolveProjectId(options.projectIdOrKey);
        const backlog = this.client.getClient();
        return await backlog.postWiki({
            projectId,
            name: options.name,
            content: options.content,
            ...(options.mailNotify !== undefined ? { mailNotify: options.mailNotify } : {}),
        });
    }

    /**
     * Wiki ページのページ名・本文を更新する
     *
     * 本文は全文置換です。`expectedVersion` を指定すると、更新直前に最新の版と比べ、
     * 読み込んだ後に他者が編集していた場合は更新せずにエラーにします
     * （Backlog API に楽観ロックが無いため、黙って他者の編集を上書きしないための確認です）。
     * 確認と更新の間に入った編集までは検知できません。
     *
     * @param wikiId - Wiki ページID
     * @param options - 更新パラメータ
     * @returns 更新後の Wiki ページ
     */
    async updateWiki(wikiId: number, options: UpdateWikiOptions): Promise<Entity.Wiki.Wiki> {
        if (options.name === undefined && options.content === undefined) {
            throw new Error('更新する項目がありません（name または content を指定してください）');
        }

        const backlog = this.client.getClient();

        if (options.expectedVersion !== undefined) {
            const latest = await this.getLatestVersion(wikiId);
            if (latest.version !== options.expectedVersion) {
                const editor = latest.createdUser?.name ?? '不明なユーザー';
                throw new Error(
                    `Wiki ページ（ID: ${wikiId}）は読み込み後に更新されています`
                    + `（想定の版: ${options.expectedVersion} / 最新の版: ${latest.version}、`
                    + `更新者: ${editor}、更新日時: ${latest.created}）。`
                    + '最新の内容を取得し、変更を反映し直してから更新してください。',
                );
            }
        }

        const params: { name?: string; content?: string; mailNotify?: boolean } = {};
        if (options.name !== undefined) params.name = options.name;
        if (options.content !== undefined) params.content = options.content;
        if (options.mailNotify !== undefined) params.mailNotify = options.mailNotify;

        return await backlog.patchWiki(wikiId, params);
    }

    /**
     * Wiki ページを削除する
     *
     * @param wikiId - Wiki ページID
     * @param mailNotify - true のときお知らせメールを送る（既定: false）
     * @returns 削除された Wiki ページ
     */
    async deleteWiki(wikiId: number, mailNotify = false): Promise<Entity.Wiki.Wiki> {
        const backlog = this.client.getClient();
        return await backlog.deleteWiki(wikiId, mailNotify);
    }

    /**
     * Wiki ページの本文をローカルファイルに保存する
     *
     * 本文はそのまま書き出します（ページ名の見出しは付けません）。
     * 編集したファイルを本文として送り返したときに、見出しが本文に紛れ込まないようにするためです。
     *
     * @param wikiId - Wiki ページID
     * @param outputPath - 保存先の絶対パス
     * @returns 保存したページの id / name / updated / version と、保存先パス・バイト数
     */
    async downloadContent(
        wikiId: number,
        outputPath: string,
    ): Promise<DownloadedFile & { id: number; name: string; updated: string; version: number }> {
        const wiki = await this.getWikiWithVersion(wikiId);
        const content = wiki.content ?? '';

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, content, 'utf8');

        return {
            id: wiki.id,
            name: wiki.name,
            updated: wiki.updated,
            version: wiki.version,
            path: outputPath,
            bytes: Buffer.byteLength(content, 'utf8'),
        };
    }
}
