import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * update_issue ツールを登録する
 *
 * 課題のステータス変更、担当者変更、期限日の設定などを行います。
 */
export function registerUpdateIssueTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'update_issue',
        '課題を更新します。ステータス変更、担当者変更、期限日の設定などが可能です。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            statusId: z.number().optional()
                .describe('状態ID（1:未対応, 2:処理中, 3:処理済み, 4:完了）'),
            assigneeId: z.number().optional()
                .describe('担当者ID'),
            dueDate: z.string().optional()
                .describe('期限日（YYYY-MM-DD形式）'),
            comment: z.string().optional()
                .describe('更新時に追加するコメント'),
        },
        async ({ issueIdOrKey, statusId, assigneeId, dueDate, comment }) => {
            try {
                // statusId が省略された場合、現在のステータスIDを自動付与
                // Backlog API は patchIssue 時に statusId を必須とするため
                let resolvedStatusId = statusId ?? undefined;
                if (resolvedStatusId === undefined) {
                    const currentIssue = await issueService.getIssue(issueIdOrKey);
                    resolvedStatusId = (currentIssue as { status?: { id?: number } }).status?.id;
                }

                const updatedIssue = await issueService.updateIssue(issueIdOrKey, {
                    statusId: resolvedStatusId,
                    assigneeId: assigneeId ?? undefined,
                    dueDate: dueDate ?? undefined,
                    comment: comment ?? undefined,
                });

                const issue = updatedIssue as {
                    issueKey?: string;
                    summary?: string;
                    status?: { name?: string };
                    assignee?: { name?: string } | null;
                    dueDate?: string | null;
                };

                const details = [
                    `課題 ${issue.issueKey ?? issueIdOrKey} を更新しました。`,
                    `件名: ${issue.summary ?? '不明'}`,
                    `状態: ${issue.status?.name ?? '不明'}`,
                    `担当者: ${issue.assignee?.name ?? '未割当'}`,
                    `期限日: ${issue.dueDate ?? '未設定'}`,
                ].join('\n');

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: details,
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `課題の更新に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
