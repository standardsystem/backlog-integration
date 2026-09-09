import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * delete_document_attachment ツールを登録する
 *
 * ドキュメントに添付されたファイルを削除します。
 */
export function registerDeleteDocumentAttachmentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'delete_document_attachment',
        {
            description: 'ドキュメントに添付されたファイルを削除します。ドキュメントIDと添付ファイルIDを指定してください。',
            inputSchema: {
                documentId: z.string().describe('ドキュメントID'),
                attachmentId: z.number().describe('削除する添付ファイルID'),
            },
        },
        async ({ documentId, attachmentId }) => {
            try {
                const result = await ctx.documents.deleteAttachment(documentId, attachmentId);
                return jsonResult({
                    result,
                    documentId,
                    deleted: true,
                    message: `添付ファイル（ID: ${attachmentId}）を削除しました。`,
                });
            } catch (error) {
                return errorResult('ドキュメント添付ファイルの削除に失敗しました', error);
            }
        }
    );
}
