import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * download_document_attachment ツールを登録する
 *
 * ドキュメントに添付されたファイルをローカルに保存します。
 */
export function registerDownloadDocumentAttachmentTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'download_document_attachment',
        'ドキュメントに添付されたファイルをローカルに保存します。ドキュメントID、添付ファイルID、保存先パスを指定してください。',
        {
            documentId: z.string().describe('ドキュメントID'),
            attachmentId: z.number().describe('添付ファイルID'),
            outputPath: z.string().describe('保存先の絶対パス'),
        },
        async ({ documentId, attachmentId, outputPath }) => {
            try {
                await documentService.downloadAttachment(documentId, attachmentId, outputPath);
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
                            text: `ドキュメント添付ファイルのダウンロードに失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
