import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { withCommentUrl } from '../lib/comment-format.js';

/**
 * list_comments ツールを登録する
 *
 * 課題のコメント一覧を取得します。
 */
export function registerListCommentsTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_comments',
        {
            description: '課題のコメント一覧を取得します。課題IDまたはキーを指定してください。'
                + '1回の取得は最大100件です。総件数は count_comments で確認してください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                minId: z.number().optional().describe('最小コメントID'),
                maxId: z.number().optional().describe('最大コメントID'),
                count: z.number().min(1).max(100).optional()
                    .describe('取得件数（デフォルト: 20, 最大: 100）'),
                order: z.enum(['asc', 'desc']).optional()
                    .describe('ソート順'),
            },
        },
        async ({ issueIdOrKey, minId, maxId, count, order }) => {
            try {
                const comments = await ctx.issues.listComments(issueIdOrKey, {
                    minId: minId ?? undefined,
                    maxId: maxId ?? undefined,
                    count: count ?? undefined,
                    order: order ?? undefined,
                });
                const issueKey = await ctx.api.resolveIssueKey(issueIdOrKey);
                return jsonResult(comments.map((comment) => withCommentUrl(comment, issueKey, ctx.api)));
            } catch (error) {
                return errorResult('コメント一覧の取得に失敗しました', error);
            }
        }
    );
}
