import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * get_document_tree ツールを登録する
 *
 * プロジェクトのドキュメントツリー（階層）を取得します。
 */
export function registerGetDocumentTreeTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'get_document_tree',
        'プロジェクトのドキュメントツリーを取得します。プロジェクトIDまたはキーを指定してください。',
        {
            projectIdOrKey: z.string().describe('プロジェクトIDまたはプロジェクトキー'),
        },
        async ({ projectIdOrKey }) => {
            try {
                // 数値文字列も許容して数値に変換する
                const key = /^\d+$/.test(projectIdOrKey) ? Number(projectIdOrKey) : projectIdOrKey;
                const tree = await documentService.getDocumentTree(key);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(tree, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `ドキュメントツリーの取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
