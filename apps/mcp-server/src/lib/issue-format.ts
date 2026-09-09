import type { BacklogApiClient } from '@backlog-integration/backlog-client';

/** `fields` に指定すると API の生レスポンスをそのまま返す特別な値 */
export const RAW_FIELD = '*';

/**
 * 課題サマリの既定項目
 *
 * 親子課題の連動クローズ判定・起票必須項目の点検に必要な範囲を既定で含めます。
 */
export const DEFAULT_ISSUE_FIELDS = [
    'id', 'issueKey', 'summary', 'status', 'assignee', 'createdUser', 'priority',
    'issueType', 'milestone', 'resolution', 'parentIssueId', 'startDate', 'dueDate',
    'created', 'updated', 'url',
] as const;

/** id と name だけを持つ参照オブジェクト */
interface NamedRef {
    id: number;
    name: string;
}

/** 課題の生レスポンスのうち、サマリ生成で参照する部分 */
interface RawIssue {
    id?: number;
    issueKey?: string;
    summary?: string;
    status?: { id?: number; name?: string } | null;
    assignee?: { id?: number; name?: string } | null;
    createdUser?: { id?: number; name?: string } | null;
    priority?: { id?: number; name?: string } | null;
    issueType?: { id?: number; name?: string } | null;
    milestone?: Array<{ id?: number; name?: string }> | null;
    resolution?: { id?: number; name?: string } | null;
    parentIssueId?: number | null;
    startDate?: string | null;
    dueDate?: string | null;
    created?: string;
    updated?: string;
    [key: string]: unknown;
}

/**
 * `{ id, name }` 形式の参照オブジェクトに整形する
 *
 * @param value - 課題レスポンス中の参照オブジェクト
 * @returns id / name を持つオブジェクト。値が無ければ null
 */
function toNamedRef(value: { id?: number; name?: string } | null | undefined): NamedRef | null {
    if (!value || value.id === undefined) return null;
    return { id: value.id, name: value.name ?? '' };
}

/**
 * 課題の生レスポンスを、判定に必要な項目を持つサマリに整形する
 *
 * @param issue - Backlog API の課題レスポンス
 * @param api - URL 組み立てに使う Backlog クライアント
 * @returns 課題サマリ（`url` 付き）
 */
export function toIssueSummary(issue: unknown, api: BacklogApiClient): Record<string, unknown> {
    const raw = issue as RawIssue;
    return {
        id: raw.id,
        issueKey: raw.issueKey,
        summary: raw.summary,
        status: toNamedRef(raw.status),
        assignee: toNamedRef(raw.assignee),
        createdUser: toNamedRef(raw.createdUser),
        priority: toNamedRef(raw.priority),
        issueType: toNamedRef(raw.issueType),
        milestone: (raw.milestone ?? []).map((m) => toNamedRef(m)).filter((m): m is NamedRef => m !== null),
        resolution: toNamedRef(raw.resolution),
        parentIssueId: raw.parentIssueId ?? null,
        startDate: raw.startDate ?? null,
        dueDate: raw.dueDate ?? null,
        created: raw.created,
        updated: raw.updated,
        url: api.getIssueUrl(raw.issueKey),
    };
}

/**
 * 課題の未設定項目を警告として洗い出す
 *
 * 期限日とマイルストーンを必須運用にしているプロジェクトで、設定漏れにエージェントが
 * 気付けるようにするためのものです。処理は止めません。
 *
 * @param issue - Backlog API の課題レスポンス
 * @returns 未設定項目の警告文の配列（すべて設定済みなら空配列）
 */
export function collectIssueWarnings(issue: unknown): string[] {
    const raw = issue as RawIssue;
    const warnings: string[] = [];
    if (!raw.dueDate) warnings.push('dueDate 未設定');
    if (!raw.milestone || raw.milestone.length === 0) warnings.push('milestone 未設定');
    return warnings;
}

/**
 * 更新系ツール（create_issue / update_issue / assign_to_reporter）の返却を組み立てる
 *
 * 後続処理が `id` / `issueKey` / `url` を取り出せるよう JSON で返しつつ、
 * 従来の人向けの要約は `message` として残します。
 *
 * @param issue - Backlog API の課題レスポンス
 * @param api - URL 組み立てに使う Backlog クライアント
 * @param headline - `message` の 1 行目（例: 「課題 PROJECT-1 を更新しました。」）
 * @returns 課題の要点と `message` を持つオブジェクト
 */
export function toIssueWriteResult(
    issue: unknown,
    api: BacklogApiClient,
    headline: string,
): Record<string, unknown> {
    const raw = issue as RawIssue;
    const milestone = (raw.milestone ?? [])
        .map((m) => toNamedRef(m))
        .filter((m): m is NamedRef => m !== null);

    const message = [
        headline,
        `件名: ${raw.summary ?? '不明'}`,
        `状態: ${raw.status?.name ?? '不明'}`,
        `担当者: ${raw.assignee?.name ?? '未割当'}`,
        `期限日: ${raw.dueDate ?? '未設定'}`,
        `マイルストーン: ${milestone.length > 0 ? milestone.map((m) => m.name).join(', ') : '未設定'}`,
    ].join('\n');

    return {
        id: raw.id,
        issueKey: raw.issueKey,
        summary: raw.summary,
        status: toNamedRef(raw.status),
        assignee: toNamedRef(raw.assignee),
        dueDate: raw.dueDate ?? null,
        milestone,
        url: api.getIssueUrl(raw.issueKey),
        message,
    };
}

/**
 * `fields` 指定に従って課題を整形する
 *
 * - 未指定: 既定のサマリ項目を返す
 * - `["*"]`: API の生レスポンスをそのまま返す
 * - それ以外: 指定した項目だけを返す。サマリに無い項目名は生レスポンスから拾う
 *   （`description` や `attachments` など、既定サマリ外の項目も取得できる）
 *
 * @param issue - Backlog API の課題レスポンス
 * @param api - URL 組み立てに使う Backlog クライアント
 * @param fields - 返却したい項目名の配列
 * @returns 整形済みの課題
 */
export function formatIssue(issue: unknown, api: BacklogApiClient, fields?: string[]): unknown {
    if (fields && fields.includes(RAW_FIELD)) {
        // 生レスポンスにも url だけは足しておく（スペース名の推測事故を防ぐため）
        const raw = issue as RawIssue;
        return { ...raw, url: api.getIssueUrl(raw.issueKey) };
    }

    const summary = toIssueSummary(issue, api);
    if (!fields || fields.length === 0) return summary;

    const raw = issue as RawIssue;
    const picked: Record<string, unknown> = {};
    for (const field of fields) {
        picked[field] = field in summary ? summary[field] : raw[field];
    }
    return picked;
}
