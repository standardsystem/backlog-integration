import type { BacklogClientConfig, BacklogDomain } from './types.js';

/** Backlog が使うスペースのドメイン */
const KNOWN_DOMAINS: BacklogDomain[] = ['backlog.com', 'backlog.jp', 'backlogtool.com'];

/**
 * スペースIDの指定を「スペースID」と「ドメイン」に分解する
 *
 * 設定ファイルへの貼り付けでよくある次の形式を受け付けます。
 * - `your-space`
 * - `your-space.backlog.com` / `your-space.backlog.jp` / `your-space.backlogtool.com`
 * - `https://your-space.backlog.jp/dashboard`
 *
 * @param raw - 環境変数などから読んだスペースID
 * @returns スペースIDと、判別できた場合のドメイン
 */
export function parseSpaceId(raw: string): { spaceId: string; domain?: BacklogDomain } {
    // URL 形式で貼られた場合に備えてスキーム・パス・ポートを落とす
    let host = raw.trim()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
        .split('/')[0]
        .split(':')[0]
        .trim();

    // 末尾のドットを除去（"your-space.backlog.com." のような入力）
    host = host.replace(/\.+$/, '');

    const lowerHost = host.toLowerCase();
    for (const domain of KNOWN_DOMAINS) {
        if (lowerHost.endsWith(`.${domain}`)) {
            return { spaceId: host.slice(0, host.length - domain.length - 1), domain };
        }
    }

    // 未知のドメインが付いている場合は先頭ラベルだけをスペースIDとして扱う
    const dotIndex = host.indexOf('.');
    if (dotIndex > 0) return { spaceId: host.slice(0, dotIndex) };

    return { spaceId: host };
}

/**
 * 環境変数から読んだ値を Backlog クライアントの設定に正規化する
 *
 * 前後の空白（設定ファイルへの貼り付けで混入しやすい）を取り除き、
 * スペースIDに URL やドメインが含まれていた場合はサブドメインだけを取り出します。
 *
 * @param spaceId - BACKLOG_SPACE_ID の値
 * @param apiKey - BACKLOG_API_KEY の値
 * @returns 正規化した設定
 * @throws いずれかが未設定・空文字の場合
 */
export function resolveBacklogConfig(
    spaceId: string | undefined,
    apiKey: string | undefined,
): BacklogClientConfig {
    const trimmedSpaceId = (spaceId ?? '').trim();
    const trimmedApiKey = (apiKey ?? '').trim();

    if (trimmedSpaceId === '' || trimmedApiKey === '') {
        throw new Error('環境変数 BACKLOG_SPACE_ID と BACKLOG_API_KEY を設定してください。');
    }

    const parsed = parseSpaceId(trimmedSpaceId);
    if (parsed.spaceId === '') {
        throw new Error(`BACKLOG_SPACE_ID の値 "${trimmedSpaceId}" からスペースIDを判別できませんでした。`);
    }

    return {
        spaceId: parsed.spaceId,
        apiKey: trimmedApiKey,
        domain: parsed.domain,
    };
}
