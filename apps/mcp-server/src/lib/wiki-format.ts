import { readFile } from 'node:fs/promises';
import type { BacklogApiClient } from '@backlog-integration/backlog-client';

/** Wiki ページの生レスポンスのうち、整形で参照する部分 */
interface RawWiki {
    id?: number;
    projectId?: number;
    name?: string;
    content?: string;
    tags?: Array<{ id?: number; name?: string }> | null;
    created?: string;
    createdUser?: { id?: number; name?: string } | null;
    updated?: string;
    updatedUser?: { id?: number; name?: string } | null;
    [key: string]: unknown;
}

/**
 * ユーザ参照を `{ id, name }` に縮める
 *
 * @param user - Backlog API のユーザ
 * @returns id / name を持つオブジェクト。値が無ければ null
 */
function toUserRef(user: { id?: number; name?: string } | null | undefined) {
    return user ? { id: user.id, name: user.name } : null;
}

/**
 * Wiki ページを本文を除いたサマリに整形する
 *
 * 一覧では本文が返らず、作成・更新の返却では本文を繰り返す必要が無いため、
 * ページの特定と次の更新（`expectedUpdated`）に必要な項目だけを返します。
 *
 * @param wiki - Backlog API の Wiki ページ
 * @param api - URL 組み立てに使う Backlog クライアント
 * @returns Wiki ページのサマリ（`url` 付き）
 */
export function toWikiSummary(wiki: unknown, api: BacklogApiClient): Record<string, unknown> {
    const raw = wiki as RawWiki;
    return {
        id: raw.id,
        projectId: raw.projectId,
        name: raw.name,
        url: api.getWikiUrl(raw.id),
        tags: (raw.tags ?? []).map((tag) => tag.name),
        created: raw.created,
        createdUser: toUserRef(raw.createdUser),
        updated: raw.updated,
        updatedUser: toUserRef(raw.updatedUser),
    };
}

/**
 * Wiki ページの生レスポンスに `url` を付与する
 *
 * @param wiki - Backlog API の Wiki ページ
 * @param api - URL 組み立てに使う Backlog クライアント
 * @returns url 付きの Wiki ページ
 */
export function withWikiUrl(wiki: unknown, api: BacklogApiClient): Record<string, unknown> {
    const raw = wiki as RawWiki;
    return { ...raw, url: api.getWikiUrl(raw.id) };
}

/**
 * 本文の指定（`content` または `contentFilePath`）から本文を取り出す
 *
 * 長い本文をツール引数に載せずに済むよう、ローカルファイルからの読み込みも受け付けます。
 * 両方の指定は意図が曖昧なためエラーにします。
 *
 * @param content - 本文（文字列で直接指定）
 * @param contentFilePath - 本文を読み込むローカルファイルの絶対パス
 * @returns 本文。どちらも指定されていなければ undefined
 */
export async function resolveWikiContent(
    content: string | undefined,
    contentFilePath: string | undefined,
): Promise<string | undefined> {
    if (content !== undefined && contentFilePath !== undefined) {
        throw new Error('content と contentFilePath は同時に指定できません');
    }
    if (contentFilePath !== undefined) return await readFile(contentFilePath, 'utf8');
    return content;
}
