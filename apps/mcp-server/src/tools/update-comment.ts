import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toCommentSummary } from '../lib/comment-format.js';

/**
 * update_comment ツールを登録する
 *
 * 自分が投稿した課題コメントの本文を更新します。
 */
export function registerUpdateCommentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'update_comment',
        {
            description: '課題コメントの本文を更新します。更新できるのは自分（このMCPサーバーのAPIキーの持ち主）が'
                + '投稿したコメントだけです。本文は全文置換されるため、get_comment で現在の内容を確認してから'
                + '差し替え後の全文を渡してください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                commentId: z.number().describe('更新するコメントID'),
                content: z.string().describe('新しいコメント本文（全文置換）'),
            },
        },
        async ({ issueIdOrKey, commentId, content }) => {
            try {
                const comment = await ctx.issues.updateComment(issueIdOrKey, commentId, content);
                const issueKey = await ctx.api.resolveIssueKey(issueIdOrKey);
                return jsonResult({
                    ...toCommentSummary(comment, issueKey, ctx.api),
                    message: `コメント（ID: ${commentId}）を更新しました。`,
                });
            } catch (error) {
                return errorResult(
                    'コメントの更新に失敗しました（自分が投稿したコメント以外は更新できません）',
                    error,
                );
            }
        }
    );
}
