import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * download_document_attachment ツールを登録する
 *
 * ドキュメントに添付されたファイルをローカルに保存します。
 */
export function registerDownloadDocumentAttachmentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'download_document_attachment',
        {
            description: 'ドキュメントに添付されたファイルをローカルに保存します。ドキュメントID、添付ファイルID、保存先パスを指定してください。',
            inputSchema: {
                documentId: z.string().describe('ドキュメントID'),
                attachmentId: z.number().describe('添付ファイルID'),
                outputPath: z.string().describe('保存先の絶対パス'),
            },
        },
        async ({ documentId, attachmentId, outputPath }) => {
            try {
                const file = await ctx.documents.downloadAttachment(documentId, attachmentId, outputPath);
                return jsonResult({
                    id: attachmentId,
                    documentId,
                    path: file.path,
                    bytes: file.bytes,
                    message: `添付ファイル（ID: ${attachmentId}）を ${file.path} に保存しました。`,
                });
            } catch (error) {
                return errorResult('ドキュメント添付ファイルのダウンロードに失敗しました', error);
            }
        }
    );
}
