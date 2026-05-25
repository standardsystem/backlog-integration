import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * delete_issue_attachment ツールを登録する
 *
 * 課題に添付されたファイルを削除します。
 */
export function registerDeleteIssueAttachmentTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'delete_issue_attachment',
        '課題に添付されたファイルを削除します。課題IDまたはキーと添付ファイルIDを指定してください。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            attachmentId: z.number().describe('削除する添付ファイルID'),
        },
        async ({ issueIdOrKey, attachmentId }) => {
            try {
                const result = await issueService.deleteAttachment(issueIdOrKey, attachmentId);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `添付ファイル（ID: ${attachmentId}）を削除しました。\n${JSON.stringify(result, null, 2)}`,
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `課題添付ファイルの削除に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
