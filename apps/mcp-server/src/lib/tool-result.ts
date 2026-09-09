import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { formatBacklogError } from '@backlog-integration/backlog-client';

/**
 * 任意の値を JSON テキストとしてツールの返却値に整形する
 *
 * @param data - 返却するデータ
 * @returns MCP ツールの結果
 */
export function jsonResult(data: unknown): CallToolResult {
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}

/**
 * プレーンテキストをツールの返却値に整形する
 *
 * @param text - 返却する文字列
 * @returns MCP ツールの結果
 */
export function textResult(text: string): CallToolResult {
    return {
        content: [{ type: 'text' as const, text }],
    };
}

/**
 * 例外をツールのエラー返却値に整形する
 *
 * Backlog API 由来の例外は HTTP ステータス・`errors[].message`・対処方法を添えます。
 *
 * @param prefix - 失敗内容を表す日本語の見出し（例: 「課題の取得に失敗しました」）
 * @param error - 捕捉した例外
 * @returns isError を立てた MCP ツールの結果
 */
export function errorResult(prefix: string, error: unknown): CallToolResult {
    return {
        content: [{ type: 'text' as const, text: `${prefix}: ${formatBacklogError(error)}` }],
        isError: true,
    };
}
