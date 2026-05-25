import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * delete_document_attachment ツールを登録する
 *
 * ドキュメントに添付されたファイルを削除します。
 */
export function registerDeleteDocumentAttachmentTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'delete_document_attachment',
        'ドキュメントに添付されたファイルを削除します。ドキュメントIDと添付ファイルIDを指定してください。',
        {
            documentId: z.string().describe('ドキュメントID'),
            attachmentId: z.number().describe('削除する添付ファイルID'),
        },
        async ({ documentId, attachmentId }) => {
            try {
                const result = await documentService.deleteAttachment(documentId, attachmentId);
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
                            text: `ドキュメント添付ファイルの削除に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
