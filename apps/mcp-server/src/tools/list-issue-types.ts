import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * list_issue_types ツールを登録する
 *
 * プロジェクトの課題種別一覧を取得します。
 */
export function registerListIssueTypesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_issue_types',
        {
            description: 'プロジェクトの課題種別（タスク・バグなど）の一覧を取得します。'
                + 'create_issue の issueTypeId に指定する数値IDを引くときに使ってください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                const issueTypes = await ctx.projects.listIssueTypes(projectIdOrKey);
                return jsonResult(issueTypes.map((issueType) => ({
                    id: issueType.id,
                    name: issueType.name,
                    color: issueType.color,
                    displayOrder: issueType.displayOrder,
                })));
            } catch (error) {
                return errorResult('課題種別一覧の取得に失敗しました', error);
            }
        }
    );
}
