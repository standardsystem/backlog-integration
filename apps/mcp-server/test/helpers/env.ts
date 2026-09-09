import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * リポジトリルートの .env を読み込んで process.env に反映する
 *
 * テストだけのために dotenv へ依存したくないので、必要最小限の実装にしています。
 * 既に環境変数が設定されている場合は上書きしません（CI での注入を優先するため）。
 *
 * @param startDir - 探索を開始するディレクトリ（既定: カレントディレクトリ）
 */
export function loadDotEnv(startDir?: string): void {
    let dir = startDir ?? process.cwd();

    for (let depth = 0; depth < 6; depth += 1) {
        let content: string;
        try {
            content = readFileSync(join(dir, '.env'), 'utf8');
        } catch {
            const parent = dirname(dir);
            if (parent === dir) return;
            dir = parent;
            continue;
        }

        for (const line of content.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
            if (!match) continue;
            const key = match[1];
            // 値を囲む引用符があれば外す
            const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
            if (process.env[key] === undefined) process.env[key] = value;
        }
        return;
    }
}

/** 実 API に接続するテストに必要な設定 */
export interface LiveConfig {
    spaceId: string;
    apiKey: string;
    projectKey: string;
}

/**
 * 実 API に接続するテスト用の設定を取得する
 *
 * `BACKLOG_SPACE_ID` / `BACKLOG_API_KEY` / `BACKLOG_TEST_PROJECT_KEY` が
 * すべて揃っている場合だけ設定を返します。揃っていなければ null を返し、
 * 呼び出し側のテストはスキップされます。
 *
 * @returns 設定。認証情報が無ければ null
 */
export function getLiveConfig(): LiveConfig | null {
    loadDotEnv();

    const spaceId = process.env.BACKLOG_SPACE_ID?.trim();
    const apiKey = process.env.BACKLOG_API_KEY?.trim();
    const projectKey = process.env.BACKLOG_TEST_PROJECT_KEY?.trim();

    if (!spaceId || !apiKey || !projectKey) return null;
    return { spaceId, apiKey, projectKey };
}

/** live テストをスキップする理由（実行できる場合は false） */
export const LIVE_SKIP_REASON: string | false = getLiveConfig()
    ? false
    : 'BACKLOG_SPACE_ID / BACKLOG_API_KEY / BACKLOG_TEST_PROJECT_KEY が未設定のためスキップ';
