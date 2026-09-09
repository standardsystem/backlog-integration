import { describeBacklogError, type BacklogErrorDetail } from '@backlog-integration/backlog-client';

/** 疎通確認で得たいユーザ情報（`GET /users/myself` の一部） */
export interface StartupProbeUser {
    id: number;
    userId: string;
    name: string;
}

/**
 * 疎通確認の失敗の種類
 *
 * - `auth`: 認証情報が誤っている。再試行しても直らず、MCP サーバーを動かす意味が無い
 * - `permanent`: 設定や権限の誤り。再試行しても直らないが、他のプロジェクトなど
 *   一部の操作は成功しうるのでサーバーは動かし続ける
 * - `transient`: レート制限・Backlog 側の障害・ネットワーク断。時間をおけば回復しうる
 */
export type StartupFailureKind = 'auth' | 'permanent' | 'transient';

/** 疎通確認の結果 */
export type StartupCheckOutcome =
    | { kind: 'ok'; user: StartupProbeUser }
    | { kind: 'failed'; failure: StartupFailureKind; detail: BacklogErrorDetail; attempts: number };

/** 指数バックオフの設定 */
export interface BackoffOptions {
    /** 初回の待ち時間（ミリ秒） */
    baseDelayMs: number;
    /** 待ち時間の上限（ミリ秒） */
    maxDelayMs: number;
    /** 0〜1 の乱数を返す関数（テストで固定するために差し替え可能） */
    random: () => number;
}

/** 疎通確認の設定 */
export interface StartupCheckOptions {
    /** 実際に Backlog を呼ぶ処理 */
    probe: () => Promise<StartupProbeUser>;
    /** ログ出力（既定は stderr） */
    log: (message: string) => void;
    /** 1 回あたりの待ち時間の上限（ミリ秒） */
    timeoutMs?: number;
    /** 背景での再試行の最大回数 */
    maxRetries?: number;
    /** バックオフの設定 */
    backoff?: Partial<BackoffOptions>;
    /** 待機処理（テストで差し替え可能） */
    sleep?: (ms: number) => Promise<void>;
}

/** 疎通確認の呼び出し結果 */
export interface StartupCheckHandle {
    /** 初回の確認結果（起動を止めるかどうかの判断に使う） */
    first: StartupCheckOutcome;
    /** 背景で再試行している場合、その完了を表す Promise。再試行しない場合は null */
    retrying: Promise<StartupCheckOutcome> | null;
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BACKOFF: BackoffOptions = {
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    random: Math.random,
};

/**
 * 失敗の内容から、再試行すべきかどうかを分類する
 *
 * @param detail - 整形済みのエラー情報
 * @returns 失敗の種類
 */
export function classifyStartupFailure(detail: BacklogErrorDetail): StartupFailureKind {
    // 401 は API キーが誤っているか失効している。再試行しても直らない
    if (detail.status === 401) return 'auth';

    // 429（レート制限）と 5xx（Backlog 側の障害）は時間をおけば回復しうる
    if (detail.status === 429) return 'transient';
    if (detail.status !== undefined && detail.status >= 500) return 'transient';

    // それ以外の 4xx（権限不足・スペース名の誤りなど）は再試行しても直らない
    if (detail.status !== undefined) return 'permanent';

    // ステータスを持たない＝ネットワーク不通やタイムアウト
    return 'transient';
}

/**
 * 指数バックオフの待ち時間を求める
 *
 * `base * 2^(attempt-1)` を上限で頭打ちにし、同時再試行が重ならないよう
 * 半分を固定・半分を乱数にする（equal jitter）方式でばらつかせます。
 * サーバーが `Retry-After` を返している場合はそちらを優先します。
 *
 * @param attempt - 何回目の再試行か（1 始まり）
 * @param options - バックオフの設定
 * @param retryAfterMs - `Retry-After` ヘッダで指定された待ち時間
 * @returns 待つべきミリ秒
 */
export function backoffDelayMs(
    attempt: number,
    options: BackoffOptions,
    retryAfterMs?: number,
): number {
    if (retryAfterMs !== undefined) {
        return Math.min(Math.max(retryAfterMs, 0), options.maxDelayMs);
    }

    const exponential = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
    return Math.round(exponential / 2 + options.random() * (exponential / 2));
}

/**
 * 1 回だけ疎通確認する
 *
 * @param probe - Backlog を呼ぶ処理
 * @param timeoutMs - 応答を待つ上限
 * @param attempts - これまでの試行回数（結果に含める）
 * @returns 確認結果
 */
async function probeOnce(
    probe: () => Promise<StartupProbeUser>,
    timeoutMs: number,
    attempts: number,
): Promise<StartupCheckOutcome> {
    try {
        const user = await Promise.race([
            probe(),
            new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new Error(`${timeoutMs} ms 以内に応答がありませんでした。`)),
                    timeoutMs,
                ).unref();
            }),
        ]);
        return { kind: 'ok', user };
    } catch (error) {
        const detail = describeBacklogError(error);
        return { kind: 'failed', failure: classifyStartupFailure(detail), detail, attempts };
    }
}

/**
 * 失敗の内容を人が読める形で出力する
 *
 * @param detail - 整形済みのエラー情報
 * @param host - 接続先ホスト名
 * @param log - ログ出力
 */
function logFailure(detail: BacklogErrorDetail, host: string, log: (message: string) => void): void {
    log(`  接続先: https://${host}/api/v2/users/myself`);
    log(`  原因: ${detail.category}${detail.status !== undefined ? `（HTTP ${detail.status}）` : ''}`);
    log(`  詳細: ${detail.message}`);
    for (const item of detail.errors) log(`  Backlog: ${item.message}`);
    if (detail.remedy) log(`  対処: ${detail.remedy}`);
}

/**
 * 起動時に Backlog への疎通を確認する
 *
 * 認証できていないことに最初のツール呼び出しまで気付けないと原因追跡が難しいため、
 * 起動時に `GET /users/myself` を呼びます。
 *
 * 失敗の種類によって扱いを変えます。
 * - 認証失敗（401）: 呼び出し側が起動を中止する（結果の `failure` が `'auth'`）
 * - 一時的な失敗（429 / 5xx / ネットワーク断）: 起動は続け、背景で指数バックオフしながら再試行する
 * - それ以外の失敗（403 / 404 など）: 警告だけ出して起動を続ける（再試行しても直らないため）
 *
 * @param host - 接続先ホスト名（ログ出力用）
 * @param options - 疎通確認の設定
 * @returns 初回の結果と、背景で再試行している場合はその Promise
 */
export async function verifyBacklogConnection(
    host: string,
    options: StartupCheckOptions,
): Promise<StartupCheckHandle> {
    const {
        probe,
        log,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRetries = DEFAULT_MAX_RETRIES,
        sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms).unref(); }),
    } = options;
    const backoff: BackoffOptions = { ...DEFAULT_BACKOFF, ...options.backoff };

    const first = await probeOnce(probe, timeoutMs, 1);

    if (first.kind === 'ok') {
        log(`[backlog-integration] ${host} に接続しました（${first.user.name} / ${first.user.userId} / id: ${first.user.id}）。`);
        return { first, retrying: null };
    }

    if (first.failure === 'auth') {
        log('[backlog-integration] Backlog の認証に失敗しました。MCP サーバーを起動できません。');
        logFailure(first.detail, host, log);
        return { first, retrying: null };
    }

    if (first.failure === 'permanent') {
        log('[backlog-integration] Backlog への疎通確認に失敗しました（再試行しても解消しない種類のため、このまま起動します）。');
        logFailure(first.detail, host, log);
        log('  この状態でもツールは呼び出せますが、同じ理由で失敗する可能性があります。');
        return { first, retrying: null };
    }

    // 一時的な失敗。ツールを失わせないため起動は続け、背景で再試行する
    log('[backlog-integration] Backlog への疎通確認に失敗しました（一時的な問題の可能性があるため、起動は継続します）。');
    logFailure(first.detail, host, log);

    const retrying = (async (): Promise<StartupCheckOutcome> => {
        let last = first;
        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
            const delay = backoffDelayMs(attempt, backoff, last.kind === 'failed' ? last.detail.retryAfterMs : undefined);
            log(`[backlog-integration] ${Math.round(delay / 1000)} 秒後に疎通確認を再試行します（${attempt}/${maxRetries}）。`);
            await sleep(delay);

            const outcome = await probeOnce(probe, timeoutMs, attempt + 1);
            if (outcome.kind === 'ok') {
                log(`[backlog-integration] ${host} に接続できました（${outcome.user.name} / ${outcome.user.userId} / id: ${outcome.user.id}）。`);
                return outcome;
            }

            last = outcome;
            if (outcome.failure === 'auth') {
                log('[backlog-integration] 再試行の結果、Backlog の認証に失敗しました。');
                logFailure(outcome.detail, host, log);
                return outcome;
            }
            if (outcome.failure === 'permanent') {
                log('[backlog-integration] 再試行しても解消しない種類の失敗に変わりました。再試行を打ち切ります。');
                logFailure(outcome.detail, host, log);
                return outcome;
            }
        }

        log(`[backlog-integration] ${maxRetries} 回再試行しましたが Backlog に接続できませんでした。ツール呼び出し時に再度接続を試みます。`);
        return last;
    })();

    return { first, retrying };
}
