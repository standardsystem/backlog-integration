import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { withCommentUrl } from '../lib/comment-format.js';

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
                const issueKey = await ctx.api.resolveIssueKey(issueIdOrKey);
                return jsonResult(withCommentUrl(comment, issueKey, ctx.api));
            } catch (error) {
                return errorResult('コメントの取得に失敗しました', error);
            }
        }
    );
}
