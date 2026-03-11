import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * list_issues ツールを登録する
 *
 * プロジェクトの課題一覧を取得します。
 */
export function registerListIssuesTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'list_issues',
        'プロジェクトの課題一覧を取得します。プロジェクトキー（例: PROJECT）を指定してください。',
        {
            projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            statusId: z.array(z.number()).optional()
                .describe('状態ID（1:未対応, 2:処理中, 3:処理済み, 4:完了）'),
            assigneeId: z.array(z.number()).optional()
                .describe('担当者IDの配列'),
            keyword: z.string().optional()
                .describe('キーワード検索'),
            count: z.number().min(1).max(100).optional()
                .describe('取得件数（デフォルト: 20, 最大: 100）'),
            sort: z.enum([
                'issueType', 'category', 'version', 'milestone', 'summary',
                'status', 'priority', 'attachment', 'sharedFile', 'created',
                'createdUser', 'updated', 'updatedUser', 'assignee',
                'startDate', 'dueDate', 'estimatedHours', 'actualHours', 'childIssue',
            ]).optional()
                .describe('ソートキー'),
            order: z.enum(['asc', 'desc']).optional()
                .describe('ソート順'),
        },
        async ({ projectIdOrKey, statusId, assigneeId, keyword, count, sort, order }) => {
            try {
                const issues = await issueService.listIssues({
                    projectIdOrKey,
                    statusId: statusId ?? undefined,
                    assigneeId: assigneeId ?? undefined,
                    keyword: keyword ?? undefined,
                    count: count ?? undefined,
                    sort: sort ?? undefined,
                    order: order ?? undefined,
                });

                // 課題一覧を見やすいサマリ形式で返す
                const summary = (issues as Array<{
                    issueKey?: string;
                    summary?: string;
                    status?: { name?: string };
                    assignee?: { name?: string } | null;
                    priority?: { name?: string };
                }>).map((issue) => ({
                    key: issue.issueKey,
                    summary: issue.summary,
                    status: issue.status?.name,
                    assignee: issue.assignee?.name ?? '未割当',
                    priority: issue.priority?.name,
                }));

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(summary, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `課題一覧の取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
