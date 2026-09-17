import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * download_wiki_content ツールを登録する
 *
 * Wiki ページの本文をローカルファイルに保存します。
 */
export function registerDownloadWikiContentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'download_wiki_content',
        {
            description: 'Wiki ページの本文をローカルファイルに保存します（ページ名の見出しは付けず、本文だけを書き出します）。'
                + '長い本文を編集するときは、保存したファイルを編集して update_wiki の contentFilePath に渡し、'
                + '返却の version を expectedVersion に指定してください。',
            inputSchema: {
                wikiId: z.number().describe('Wiki ページID'),
                outputPath: z.string().describe('保存先の絶対パス（プロジェクトの記法が markdown なら .md 推奨）'),
            },
        },
        async ({ wikiId, outputPath }) => {
            try {
                const result = await ctx.wikis.downloadContent(wikiId, outputPath);
                return jsonResult({
                    id: result.id,
                    name: result.name,
                    updated: result.updated,
                    version: result.version,
                    path: result.path,
                    bytes: result.bytes,
                    url: ctx.api.getWikiUrl(result.id),
                    message: [
                        `Wiki ページ「${result.name}」（ID: ${result.id}）の本文を保存しました。`,
                        `保存先: ${result.path}`,
                        `サイズ: ${result.bytes} bytes`,
                    ].join('\n'),
                });
            } catch (error) {
                return errorResult('Wiki ページ本文の保存に失敗しました', error);
            }
        }
    );
}
