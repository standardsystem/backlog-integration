import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PROJECT_STATUS_COLORS, PROJECT_STATUS_NAME_MAX_LENGTH } from '@backlog-integration/backlog-client';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toStatusSummary } from '../lib/project-format.js';
import { PROJECT_STATUS_COLOR_GUIDE } from '../lib/project-settings-format.js';

/**
 * add_status ツールを登録する
 *
 * プロジェクトに状態（カスタムステータス）を追加します。色は Backlog が許す 10 色から選びます。
 */
export function registerAddStatusTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_status',
        {
            description: 'プロジェクトに状態（カスタムステータス）を追加します。'
                + '管理者またはプロジェクト管理者の権限が必要です（権限が無い場合は HTTP 403）。'
                + 'カスタムステータスはスタンダードプラン以上でのみ使えます。'
                + `name は ${PROJECT_STATUS_NAME_MAX_LENGTH} 文字までです。`
                + `color は次の 10 色からのみ選べます: ${PROJECT_STATUS_COLOR_GUIDE}。`
                + '追加した名前は同じ MCP サーバーのまま update_issue / add_comment の status に指定できます。'
                + '返却には作成した状態の id と name が含まれます。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                name: z.string().min(1).max(PROJECT_STATUS_NAME_MAX_LENGTH)
                    .describe(`状態名（${PROJECT_STATUS_NAME_MAX_LENGTH} 文字まで。例: 待ち）`),
                color: z.enum(PROJECT_STATUS_COLORS).describe('色コード（候補外の値は受け付けません）'),
            },
        },
        async ({ projectIdOrKey, name, color }) => {
            try {
                const status = await ctx.projects.addStatus(projectIdOrKey, { name, color });
                // 直後の名前解決が新しい状態を見つけられるようにする
                ctx.resolver.clear();
                return jsonResult({
                    ...toStatusSummary(status),
                    message: `状態「${status.name}」（ID: ${status.id}）を追加しました。`,
                });
            } catch (error) {
                return errorResult('状態の追加に失敗しました', error);
            }
        }
    );
}
