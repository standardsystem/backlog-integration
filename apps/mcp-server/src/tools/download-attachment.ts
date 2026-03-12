import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * download_attachment ツールを登録する
 *
 * 課題に添付されたファイルをローカルに保存します。
 */
export function registerDownloadAttachmentTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'download_attachment',
        '課題に添付されたファイルをローカルに保存します。課題キー、添付ファイルID、保存先パスを指定してください。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            attachmentId: z.number().describe('添付ファイルID'),
            outputPath: z.string().describe('保存先の絶対パス'),
        },
        async ({ issueIdOrKey, attachmentId, outputPath }) => {
            try {
                await issueService.downloadAttachment(issueIdOrKey, attachmentId, outputPath);

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `添付ファイル（ID: ${attachmentId}）を ${outputPath} に保存しました。`,
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `添付ファイルのダウンロードに失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
