/** Backlog API が返すエラーメッセージ 1 件 */
export interface BacklogErrorMessage {
    message: string;
    code?: number;
    errorInfo?: string;
    moreInfo?: string;
}

/** 例外を分類・整形した結果 */
export interface BacklogErrorDetail {
    /** 例外の元のメッセージ */
    message: string;
    /** HTTP ステータス（API 起因の場合） */
    status?: number;
    /** 原因の分類（例: 「認証失敗」） */
    category: string;
    /** 対処方法の案内 */
    remedy?: string;
    /** Backlog API が返した errors[] */
    errors: BacklogErrorMessage[];
    /** `Retry-After` ヘッダで指定された待ち時間（ミリ秒）。指定が無ければ undefined */
    retryAfterMs?: number;
}

/**
 * レスポンスの `Retry-After` ヘッダを読み取る
 *
 * 秒数と HTTP-date のどちらの形式にも対応します。
 *
 * @param response - HTTP レスポンス
 * @returns 待つべきミリ秒。指定が無い・解釈できない場合は undefined
 */
function parseRetryAfter(response: unknown): number | undefined {
    const headers = (response as { headers?: { get?: (name: string) => string | null } } | undefined)?.headers;
    const raw = headers?.get?.('retry-after');
    if (!raw) return undefined;

    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const until = Date.parse(raw);
    if (Number.isNaN(until)) return undefined;
    return Math.max(0, until - Date.now());
}

/** HTTP ステータスごとの分類と対処 */
const STATUS_GUIDE: Record<number, { category: string; remedy: string }> = {
    400: {
        category: 'リクエスト不正',
        remedy: '指定した項目の値（ID・日付形式など）を確認してください。',
    },
    401: {
        category: '認証失敗',
        remedy: 'BACKLOG_API_KEY を確認してください（余分な空白の混入、失効、別スペースのキーの可能性）。'
            + 'Backlog の「個人設定 > API」でキーを再発行できます。',
    },
    403: {
        category: '権限不足',
        remedy: '接続中のアカウントに操作権限がありません。'
            + '他人のコメントの更新・削除、プロジェクトへの参加状況を確認してください。',
    },
    404: {
        category: '対象が見つかりません',
        remedy: 'スペースID・プロジェクトキー・課題キー・ドキュメントIDを確認してください。'
            + 'BACKLOG_SPACE_ID が誤っている場合も 404 になります。',
    },
    429: {
        category: 'レート制限',
        remedy: 'Backlog の API レート制限に達しました。しばらく待ってから再実行してください。',
    },
};

/**
 * backlog-js の BacklogError かどうかを判定する
 *
 * 同じパッケージが二重に読み込まれた場合に `instanceof` が効かないことがあるため、
 * 構造（`status` と `name`）で判定します。
 *
 * @param error - 判定する値
 * @returns BacklogError とみなせる場合 true
 */
function isBacklogError(error: unknown): error is {
    message: string;
    name: string;
    status: number;
    body?: { errors?: BacklogErrorMessage[] };
    response?: unknown;
} {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as { name?: unknown; status?: unknown };
    return typeof candidate.status === 'number'
        && (candidate.name === 'BacklogApiError'
            || candidate.name === 'BacklogAuthError'
            || candidate.name === 'UnexpectedError');
}

/**
 * 例外を HTTP ステータス・分類・Backlog 側メッセージに分解する
 *
 * @param error - 捕捉した例外
 * @returns 分類済みのエラー情報
 */
export function describeBacklogError(error: unknown): BacklogErrorDetail {
    if (isBacklogError(error)) {
        const guide = STATUS_GUIDE[error.status];
        return {
            message: error.message || `HTTP ${error.status}`,
            status: error.status,
            category: guide?.category
                ?? (error.status >= 500 ? 'Backlog 側のエラー' : 'APIエラー'),
            remedy: guide?.remedy
                ?? (error.status >= 500
                    ? 'Backlog 側の一時的な障害の可能性があります。時間をおいて再実行してください。'
                    + 'なお存在しないスペースIDを指定した場合もこの応答になるため、BACKLOG_SPACE_ID も確認してください。'
                    : undefined),
            errors: error.body?.errors ?? [],
            retryAfterMs: parseRetryAfter(error.response),
        };
    }

    const message = error instanceof Error ? error.message : String(error);

    // fetch の失敗（DNS 解決不可・ネットワーク不通・プロキシ）はステータスを持たない
    const isNetworkError = error instanceof Error
        && (error.name === 'TypeError' || 'cause' in error)
        && /fetch|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(
            `${message} ${String((error as { cause?: unknown }).cause ?? '')}`,
        );

    if (isNetworkError) {
        return {
            message,
            category: '接続不可',
            remedy: 'ネットワーク接続とスペースのホスト名（BACKLOG_SPACE_ID）を確認してください。',
            errors: [],
        };
    }

    return { message, category: 'エラー', errors: [] };
}

/**
 * 例外を、原因が分かる 1 行の文字列に整形する
 *
 * HTTP ステータスと Backlog API が返した `errors[].message` を含めます。
 *
 * @param error - 捕捉した例外
 * @returns 整形済みメッセージ
 */
export function formatBacklogError(error: unknown): string {
    const detail = describeBacklogError(error);

    const head = detail.status !== undefined
        ? `HTTP ${detail.status} ${detail.category}: ${detail.message}`
        : `${detail.category}: ${detail.message}`;

    const apiMessages = detail.errors
        .map((item) => (item.code !== undefined ? `${item.message} (code: ${item.code})` : item.message))
        .filter((text) => text.length > 0);

    const parts = [head];
    if (apiMessages.length > 0) parts.push(`Backlog: ${apiMessages.join(' / ')}`);
    if (detail.remedy) parts.push(`対処: ${detail.remedy}`);

    return parts.join(' | ');
}
