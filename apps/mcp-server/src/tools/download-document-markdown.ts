import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DocumentService } from '@backlog-integration/backlog-client';

/**
 * download_document_markdown ツールを登録する
 *
 * ドキュメント本文を Markdown (.md) ファイルとしてローカルに保存します。
 * タイトルは `# title` として先頭に付与されます。
 */
export function registerDownloadDocumentMarkdownTool(server: McpServer, documentService: DocumentService) {
    server.tool(
        'download_document_markdown',
        'ドキュメント本文を Markdown ファイルとしてローカルに保存します。ドキュメントIDと保存先パスを指定してください。',
        {
            documentId: z.string().describe('ドキュメントID'),
            outputPath: z.string().describe('保存先の絶対パス（拡張子 .md 推奨）'),
        },
        async ({ documentId, outputPath }) => {
            try {
                const result = await documentService.downloadAsMarkdown(documentId, outputPath);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: [
                                `ドキュメント（ID: ${result.id}）を Markdown として保存しました。`,
                                `タイトル: ${result.title}`,
                                `保存先: ${outputPath}`,
                                `サイズ: ${result.bytes} bytes`,
                            ].join('\n'),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Markdown としてのダウンロードに失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
