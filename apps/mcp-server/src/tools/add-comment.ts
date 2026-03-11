import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * add_comment ツールを登録する
 *
 * 課題にコメントを追加します。
 */
export function registerAddCommentTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'add_comment',
        '課題にコメントを追加します。課題IDまたはキーとコメント内容を指定してください。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            content: z.string().describe('コメント本文'),
            notifiedUserId: z.array(z.number()).optional()
                .describe('通知先のユーザーIDの配列'),
        },
        async ({ issueIdOrKey, content, notifiedUserId }) => {
            try {
                const comment = await issueService.addComment(issueIdOrKey, {
                    content,
                    notifiedUserId: notifiedUserId ?? undefined,
                });

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `コメントを追加しました（ID: ${(comment as { id?: number }).id}）\n\n内容:\n${content}`,
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `コメントの追加に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
