import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';

/**
 * get_comment ツールを登録する
 *
 * 課題の特定コメントをIDで取得します。
 */
export function registerGetCommentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_comment',
        {
            description: '課題の特定コメントを取得します。課題IDまたはキーとコメントIDを指定してください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                commentId: z.number().describe('コメントID'),
            },
        },
        async ({ issueIdOrKey, commentId }) => {
            try {
                const comment = await ctx.issues.getComment(issueIdOrKey, commentId);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(comment, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `コメントの取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
