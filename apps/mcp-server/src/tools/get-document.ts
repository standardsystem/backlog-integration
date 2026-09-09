import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';

/**
 * get_document ツールを登録する
 *
 * ドキュメントIDを指定して、ドキュメントの詳細を取得します。
 */
export function registerGetDocumentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_document',
        {
            description: 'ドキュメントの詳細を取得します。ドキュメントIDを指定してください。',
            inputSchema: {
                documentId: z.string().describe('ドキュメントID'),
            },
        },
        async ({ documentId }) => {
            try {
                const doc = await ctx.documents.getDocument(documentId);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(doc, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `ドキュメントの取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
