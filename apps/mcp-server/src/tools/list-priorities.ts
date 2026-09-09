import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * list_priorities ツールを登録する
 *
 * スペースの優先度一覧を取得します。
 */
export function registerListPrioritiesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_priorities',
        {
            description: 'スペースの優先度一覧を取得します。'
                + 'create_issue / update_issue の priorityId に指定する数値IDを引くときに使ってください。',
            inputSchema: {},
        },
        async () => {
            try {
                const priorities = await ctx.projects.listPriorities();
                return jsonResult(priorities.map((priority) => ({
                    id: priority.id,
                    name: priority.name,
                })));
            } catch (error) {
                return errorResult('優先度一覧の取得に失敗しました', error);
            }
        }
    );
}
