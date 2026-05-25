import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * add_document ツールを登録する
 *
 * 新しいドキュメントを作成します。本文はインライン文字列で指定します。
 * ローカルの Markdown ファイルから作成したい場合は upload_document_markdown を使用してください。
 */
export function registerAddDocumentTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'add_document',
        '新しいドキュメントを作成します。プロジェクトIDは必須。タイトル/本文/絵文字/親ドキュメントIDを指定できます。',
        {
            projectId: z.number().describe('プロジェクトID'),
            title: z.string().optional().describe('ドキュメントタイトル'),
            content: z.string().optional().describe('ドキュメント本文（Markdown / プレーンテキスト）'),
            emoji: z.string().optional().describe('絵文字（任意）'),
            parentId: z.string().optional().describe('親ドキュメントID（ツリー階層の親）'),
            addLast: z.boolean().optional().describe('true のとき末尾に追加'),
        },
        async (params) => {
            try {
                const doc = await documentService.addDocument(params);
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
                            text: `ドキュメントの作成に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
