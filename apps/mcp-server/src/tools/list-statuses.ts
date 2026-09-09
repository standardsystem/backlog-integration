import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toStatusSummary } from '../lib/project-format.js';

/**
 * list_statuses ツールを登録する
 *
 * プロジェクトの状態（ステータス）一覧を取得します。カスタムステータスも含まれます。
 */
export function registerListStatusesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_statuses',
        {
            description: 'プロジェクトの状態（ステータス）一覧を取得します。'
                + 'プロジェクト独自のカスタムステータスも含まれるため、update_issue の statusId は'
                + '固定値ではなくこのツールで引いた値を使ってください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                const statuses = await ctx.projects.listStatuses(projectIdOrKey);
                return jsonResult(statuses.map(toStatusSummary));
            } catch (error) {
                return errorResult('状態一覧の取得に失敗しました', error);
            }
        }
    );
}
