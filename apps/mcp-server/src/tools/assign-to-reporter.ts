import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toIssueWriteResult } from '../lib/issue-format.js';

/**
 * assign_to_reporter ツールを登録する
 *
 * 課題の担当者をレポーター（起票者）に変更します。
 */
export function registerAssignToReporterTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'assign_to_reporter',
        {
            description: '課題の担当者をレポーター（起票者）に変更します。対応完了後に起票者に確認を戻す際などに使用します。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                comment: z.string().optional()
                    .describe('変更時に追加するコメント（省略時はデフォルトメッセージ）'),
            },
        },
        async ({ issueIdOrKey, comment }) => {
            try {
                const updatedIssue = await ctx.issues.assignToReporter(
                    issueIdOrKey,
                    comment ?? undefined,
                );

                const issueKey = (updatedIssue as { issueKey?: string }).issueKey;
                const assigneeName = (updatedIssue as { assignee?: { name?: string } | null }).assignee?.name;

                return jsonResult(toIssueWriteResult(
                    updatedIssue,
                    ctx.api,
                    `課題 ${issueKey ?? issueIdOrKey} の担当者をレポーター（${assigneeName ?? '不明'}）に変更しました。`,
                ));
            } catch (error) {
                return errorResult('担当者の変更に失敗しました', error);
            }
        }
    );
}
