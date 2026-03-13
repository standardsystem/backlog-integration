import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * list_comments ツールを登録する
 *
 * 課題のコメント一覧を取得します。
 */
export function registerListCommentsTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'list_comments',
        '課題のコメント一覧を取得します。課題IDまたはキーを指定してください。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            minId: z.number().optional().describe('最小コメントID'),
            maxId: z.number().optional().describe('最大コメントID'),
            count: z.number().min(1).max(100).optional()
                .describe('取得件数（デフォルト: 20, 最大: 100）'),
            order: z.enum(['asc', 'desc']).optional()
                .describe('ソート順'),
        },
        async ({ issueIdOrKey, minId, maxId, count, order }) => {
            try {
                const comments = await issueService.listComments(issueIdOrKey, {
                    minId: minId ?? undefined,
                    maxId: maxId ?? undefined,
                    count: count ?? undefined,
                    order: order ?? undefined,
                });
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(comments, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `コメント一覧の取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
