import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * download_document_markdown ツールを登録する
 *
 * ドキュメント本文を Markdown (.md) ファイルとしてローカルに保存します。
 * タイトルは `# title` として先頭に付与されます。
 */
export function registerDownloadDocumentMarkdownTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'download_document_markdown',
        {
            description: 'ドキュメント本文を Markdown ファイルとしてローカルに保存します。ドキュメントIDと保存先パスを指定してください。',
            inputSchema: {
                documentId: z.string().describe('ドキュメントID'),
                outputPath: z.string().describe('保存先の絶対パス（拡張子 .md 推奨）'),
            },
        },
        async ({ documentId, outputPath }) => {
            try {
                const result = await ctx.documents.downloadAsMarkdown(documentId, outputPath);
                return jsonResult({
                    id: result.id,
                    title: result.title,
                    path: result.path,
                    bytes: result.bytes,
                    url: ctx.api.getDocumentUrl(result.id),
                    message: [
                        `ドキュメント（ID: ${result.id}）を Markdown として保存しました。`,
                        `タイトル: ${result.title}`,
                        `保存先: ${result.path}`,
                        `サイズ: ${result.bytes} bytes`,
                    ].join('\n'),
                });
            } catch (error) {
                return errorResult('Markdown としてのダウンロードに失敗しました', error);
            }
        }
    );
}
