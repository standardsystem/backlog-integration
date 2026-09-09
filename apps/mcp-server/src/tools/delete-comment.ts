import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toCommentSummary } from '../lib/comment-format.js';

/**
 * delete_comment ツールを登録する
 *
 * 課題コメントを削除します。削除は取り消せません。
 */
export function registerDeleteCommentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'delete_comment',
        {
            description: '課題コメントを削除します。【注意】削除は取り消せません。実行前に必ず get_comment で'
                + '対象コメントの内容を確認してください。削除できるのは自分（このMCPサーバーのAPIキーの持ち主）が'
                + '投稿したコメントだけです。誤記の修正が目的なら delete_comment ではなく update_comment を使ってください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                commentId: z.number().describe('削除するコメントID'),
            },
        },
        async ({ issueIdOrKey, commentId }) => {
            try {
                const comment = await ctx.issues.deleteComment(issueIdOrKey, commentId);
                const issueKey = await ctx.api.resolveIssueKey(issueIdOrKey);
                return jsonResult({
                    ...toCommentSummary(comment, issueKey, ctx.api),
                    deleted: true,
                    message: `コメント（ID: ${commentId}）を削除しました。削除した本文は content に残しています。`,
                });
            } catch (error) {
                return errorResult(
                    'コメントの削除に失敗しました（自分が投稿したコメント以外は削除できません）',
                    error,
                );
            }
        }
    );
}
