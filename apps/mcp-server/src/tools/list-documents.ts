import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * list_documents ツールを登録する
 *
 * ドキュメント一覧を取得します。
 */
export function registerListDocumentsTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'list_documents',
        'ドキュメントの一覧を取得します。projectId, keyword 等で絞り込みできます。',
        {
            projectId: z.array(z.number()).optional()
                .describe('プロジェクトIDの配列（指定するとそのプロジェクトに絞り込み）'),
            keyword: z.string().optional()
                .describe('検索キーワード'),
            sort: z.enum(['created', 'updated']).optional()
                .describe('ソートキー（created または updated）'),
            order: z.enum(['asc', 'desc']).optional()
                .describe('ソート順'),
            offset: z.number().optional()
                .describe('オフセット（既定 0）'),
            count: z.number().optional()
                .describe('取得件数（既定 20、最大 100）'),
        },
        async (params) => {
            try {
                const docs = await documentService.listDocuments(params);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(docs, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `ドキュメント一覧の取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
