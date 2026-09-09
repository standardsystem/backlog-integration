import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * add_document ツールを登録する
 *
 * 新しいドキュメントを作成します。本文はインライン文字列で指定します。
 * ローカルの Markdown ファイルから作成したい場合は upload_document_markdown を使用してください。
 */
export function registerAddDocumentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_document',
        {
            description: '新しいドキュメントを作成します。プロジェクトIDは必須。タイトル/本文/絵文字/親ドキュメントIDを指定できます。',
            inputSchema: {
                projectId: z.number().describe('プロジェクトID'),
                title: z.string().optional().describe('ドキュメントタイトル'),
                content: z.string().optional().describe('ドキュメント本文（Markdown / プレーンテキスト）'),
                emoji: z.string().optional().describe('絵文字（任意）'),
                parentId: z.string().optional().describe('親ドキュメントID（ツリー階層の親）'),
                addLast: z.boolean().optional().describe('true のとき末尾に追加'),
            },
        },
        async (params) => {
            try {
                const doc = await ctx.documents.addDocument(params);
                return jsonResult(doc);
            } catch (error) {
                return errorResult('ドキュメントの作成に失敗しました', error);
            }
        }
    );
}
