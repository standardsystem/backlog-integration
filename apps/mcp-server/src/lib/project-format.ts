/**
 * Backlog のユーザ権限（roleType）の名称
 *
 * @see https://developer.nulab.com/docs/backlog/api/2/get-user-list/
 */
const ROLE_TYPE_NAMES: Record<number, string> = {
    1: '管理者',
    2: '一般ユーザー',
    3: '報告者',
    4: '閲覧者',
    5: 'ゲスト報告者',
    6: 'ゲスト閲覧者',
};

/** ユーザの生レスポンスのうち、整形で参照する部分 */
interface RawUser {
    id?: number;
    userId?: string;
    name?: string;
    mailAddress?: string;
    roleType?: number;
}

/** マイルストーン（バージョン）の生レスポンスのうち、整形で参照する部分 */
interface RawVersion {
    id?: number;
    name?: string;
    description?: string | null;
    startDate?: string | null;
    releaseDueDate?: string | null;
    archived?: boolean;
    displayOrder?: number;
}

/** 状態（ステータス）の生レスポンスのうち、整形で参照する部分 */
interface RawStatus {
    id?: number;
    name?: string;
    displayOrder?: number;
    color?: string;
}

/**
 * ユーザを ID 参照に必要な項目に整形する
 *
 * @param user - Backlog API のユーザ
 * @returns id / userId / name / mailAddress / roleType を持つオブジェクト
 */
export function toUserSummary(user: unknown): Record<string, unknown> {
    const raw = user as RawUser;
    return {
        id: raw.id,
        userId: raw.userId,
        name: raw.name,
        mailAddress: raw.mailAddress,
        roleType: raw.roleType,
        roleTypeName: raw.roleType === undefined ? '不明' : (ROLE_TYPE_NAMES[raw.roleType] ?? '不明'),
    };
}

/**
 * マイルストーン（バージョン）を整形する
 *
 * @param version - Backlog API のバージョン
 * @returns id / name / releaseDueDate / archived などを持つオブジェクト
 */
export function toMilestoneSummary(version: unknown): Record<string, unknown> {
    const raw = version as RawVersion;
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description ?? null,
        startDate: raw.startDate ?? null,
        releaseDueDate: raw.releaseDueDate ?? null,
        archived: raw.archived,
        displayOrder: raw.displayOrder,
    };
}

/**
 * 状態（ステータス）を整形する
 *
 * @param status - Backlog API のプロジェクトステータス
 * @returns id / name / displayOrder / color を持つオブジェクト
 */
export function toStatusSummary(status: unknown): Record<string, unknown> {
    const raw = status as RawStatus;
    return {
        id: raw.id,
        name: raw.name,
        displayOrder: raw.displayOrder,
        color: raw.color,
    };
}
