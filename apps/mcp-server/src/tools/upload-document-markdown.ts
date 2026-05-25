import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * upload_document_markdown ツールを登録する
 *
 * ローカルの Markdown ファイルを読み込んで新規ドキュメントを作成します。
 * 先頭が `# Title` 行の場合、自動的にタイトルとして抽出します（title 未指定時のみ）。
 */
export function registerUploadDocumentMarkdownTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'upload_document_markdown',
        'ローカルの Markdown ファイルを読み込んで新規ドキュメントを作成します。projectId は必須、filePath は絶対パスで指定してください。',
        {
            filePath: z.string().describe('アップロードする Markdown ファイルの絶対パス'),
            projectId: z.number().describe('プロジェクトID'),
            title: z.string().optional()
                .describe('ドキュメントタイトル（省略時は先頭の見出し行 or ファイル名から推測）'),
            emoji: z.string().optional().describe('絵文字（任意）'),
            parentId: z.string().optional().describe('親ドキュメントID'),
            addLast: z.boolean().optional().describe('true のとき末尾に追加'),
        },
        async ({ filePath, projectId, title, emoji, parentId, addLast }) => {
            try {
                const doc = await documentService.uploadMarkdown(filePath, {
                    projectId,
                    title,
                    emoji,
                    parentId,
                    addLast,
                });
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
                            text: `Markdown ファイルからのドキュメント作成に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
