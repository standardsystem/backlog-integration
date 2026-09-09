import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';

/**
 * get_issue ツールを登録する
 *
 * 課題IDまたはキーを指定して、課題の詳細を取得します。
 */
export function registerGetIssueTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_issue',
        {
            description: '課題の詳細を取得します。課題IDまたはキー（例: PROJECT-123）を指定してください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            },
        },
        async ({ issueIdOrKey }) => {
            try {
                const issue = await ctx.issues.getIssue(issueIdOrKey);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(issue, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `課題の取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
