import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * count_comments ツールを登録する
 *
 * 課題のコメント総件数を取得します。
 */
export function registerCountCommentsTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'count_comments',
        {
            description: '課題のコメント総件数を取得します。list_comments は1回に最大100件しか返さないため、'
                + '全件を読む必要があるかの判定・ページングの終端判定に使ってください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            },
        },
        async ({ issueIdOrKey }) => {
            try {
                const count = await ctx.issues.countComments(issueIdOrKey);
                return jsonResult({ issueIdOrKey, count });
            } catch (error) {
                return errorResult('コメント件数の取得に失敗しました', error);
            }
        }
    );
}
