import type { BacklogApiClient } from '@backlog-integration/backlog-client';

/** コメントの生レスポンスのうち、整形で参照する部分 */
interface RawComment {
    id?: number;
    content?: string | null;
    created?: string;
    updated?: string;
    createdUser?: { id?: number; name?: string } | null;
    [key: string]: unknown;
}

/**
 * コメントを `{ id, issueKey, url, content, created }` 形式に整形する
 *
 * @param comment - Backlog API のコメント
 * @param issueKey - 課題キー（URL 組み立てに使う）
 * @param api - URL 組み立てに使う Backlog クライアント
 * @returns コメントサマリ
 */
export function toCommentSummary(
    comment: unknown,
    issueKey: string | undefined,
    api: BacklogApiClient,
): Record<string, unknown> {
    const raw = comment as RawComment;
    return {
        id: raw.id,
        issueKey,
        url: api.getCommentUrl(issueKey, raw.id),
        content: raw.content ?? null,
        created: raw.created,
        updated: raw.updated,
        createdUser: raw.createdUser
            ? { id: raw.createdUser.id, name: raw.createdUser.name }
            : null,
    };
}

/**
 * コメントの生レスポンスに `issueKey` と `url` を付与する
 *
 * `get_comment` / `list_comments` は変更履歴（changeLog）など既存の項目をそのまま返す必要があるため、
 * サマリに縮めずに URL だけを足します。
 *
 * @param comment - Backlog API のコメント
 * @param issueKey - 課題キー
 * @param api - URL 組み立てに使う Backlog クライアント
 * @returns url 付きのコメント
 */
export function withCommentUrl(
    comment: unknown,
    issueKey: string | undefined,
    api: BacklogApiClient,
): Record<string, unknown> {
    const raw = comment as RawComment;
    return {
        ...raw,
        issueKey,
        url: api.getCommentUrl(issueKey, raw.id),
    };
}
