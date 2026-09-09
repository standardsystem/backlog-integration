import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * list_documents ツールを登録する
 *
 * ドキュメント一覧を取得します。
 */
export function registerListDocumentsTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_documents',
        {
            description: 'ドキュメントの一覧を取得します。projectId, keyword 等で絞り込みできます。',
            inputSchema: {
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
        },
        async (params) => {
            try {
                const docs = await ctx.documents.listDocuments(params);
                return jsonResult(docs);
            } catch (error) {
                return errorResult('ドキュメント一覧の取得に失敗しました', error);
            }
        }
    );
}
