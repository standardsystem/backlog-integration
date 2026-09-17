import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Entity } from 'backlog-js';
import type { BacklogApiClient } from './client.js';
import type { AddWikiOptions, UpdateWikiOptions, DownloadedFile } from './types.js';

/**
 * Backlog Wiki 操作モジュール
 *
 * Wiki ページの取得・一覧・件数・作成・更新・削除と、本文のファイル保存を提供します。
 *
 * @example
 * ```typescript
 * import { BacklogApiClient, WikiService } from '@backlog-integration/backlog-client';
 *
 * const apiClient = new BacklogApiClient({ spaceId: '...', apiKey: '...' });
 * const wikis = new WikiService(apiClient);
 *
 * const pages = await wikis.listWikis('PROJECT');
 * const page = await wikis.getWiki(pages[0].id);
 * await wikis.updateWiki(page.id, { content: '新しい本文', expectedUpdated: page.updated });
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
     * 本文は全文置換です。`expectedUpdated` を指定すると、更新直前に現在の `updated` と比べ、
     * 読み込んだ後に他者が編集していた場合は更新せずにエラーにします
     * （Backlog API に楽観ロックが無いため、黙って他者の編集を上書きしないための確認です）。
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

        if (options.expectedUpdated !== undefined) {
            const current = await backlog.getWiki(wikiId);
            if (current.updated !== options.expectedUpdated) {
                const editor = current.updatedUser?.name ?? '不明なユーザー';
                throw new Error(
                    `Wiki ページ（ID: ${wikiId}）は読み込み後に更新されています`
                    + `（想定: ${options.expectedUpdated} / 現在: ${current.updated}、最終更新者: ${editor}）。`
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
     * @returns 保存したページの id / name / updated と、保存先パス・バイト数
     */
    async downloadContent(
        wikiId: number,
        outputPath: string,
    ): Promise<DownloadedFile & { id: number; name: string; updated: string }> {
        const wiki = await this.getWiki(wikiId);
        const content = wiki.content ?? '';

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, content, 'utf8');

        return {
            id: wiki.id,
            name: wiki.name,
            updated: wiki.updated,
            path: outputPath,
            bytes: Buffer.byteLength(content, 'utf8'),
        };
    }
}
