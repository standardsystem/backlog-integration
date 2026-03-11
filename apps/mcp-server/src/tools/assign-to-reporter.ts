import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * assign_to_reporter ツールを登録する
 *
 * 課題の担当者をレポーター（起票者）に変更します。
 */
export function registerAssignToReporterTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'assign_to_reporter',
        '課題の担当者をレポーター（起票者）に変更します。対応完了後に起票者に確認を戻す際などに使用します。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            comment: z.string().optional()
                .describe('変更時に追加するコメント（省略時はデフォルトメッセージ）'),
        },
        async ({ issueIdOrKey, comment }) => {
            try {
                const updatedIssue = await issueService.assignToReporter(
                    issueIdOrKey,
                    comment ?? undefined,
                );

                const assignee = (updatedIssue as { assignee?: { name?: string } | null }).assignee;

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `課題 ${issueIdOrKey} の担当者をレポーターに変更しました。\n新しい担当者: ${assignee?.name ?? '不明'}`,
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `担当者の変更に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
