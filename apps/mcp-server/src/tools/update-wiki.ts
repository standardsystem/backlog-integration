import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { resolveWikiContent, toWikiSummary } from '../lib/wiki-format.js';

/**
 * update_wiki ツールを登録する
 *
 * Wiki ページのページ名・本文を更新します。本文は全文置換です。
 */
export function registerUpdateWikiTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'update_wiki',
        {
            description: 'Wiki ページのページ名・本文を更新します。【注意】本文は全文置換です。get_wiki（または '
                + 'download_wiki_content）で現在の本文を取得し、変更を反映した全文を content か contentFilePath で渡してください。'
                + '取得時の version を expectedVersion に渡すと、その後に他者が編集していた場合は上書きせずにエラーになります'
                + '（Backlog API に競合検知が無いため、原則として指定してください）。',
            inputSchema: {
                wikiId: z.number().describe('Wiki ページID'),
                name: z.string().min(1).optional().describe('新しいページ名'),
                content: z.string().optional().describe('新しい本文（全文置換）'),
                contentFilePath: z.string().optional()
                    .describe('新しい本文を読み込むローカルファイルの絶対パス（UTF-8、全文置換）'),
                expectedVersion: z.number().int().min(0).optional()
                    .describe('本文を取得したときの version（get_wiki / download_wiki_content の返却）。最新の版と違えば更新しない'),
                mailNotify: z.boolean().optional().describe('true のときお知らせメールを送る（既定: false）'),
            },
        },
        async ({ wikiId, name, content, contentFilePath, expectedVersion, mailNotify }) => {
            try {
                const body = await resolveWikiContent(content, contentFilePath);
                const wiki = await ctx.wikis.updateWiki(wikiId, {
                    name,
                    content: body,
                    expectedVersion,
                    mailNotify,
                });

                // 更新後の版を返し、続けて編集するときの expectedVersion に使えるようにする
                const { version } = await ctx.wikis.getLatestVersion(wikiId);

                const warnings: string[] = [];
                if (body !== undefined && expectedVersion === undefined) {
                    warnings.push('expectedVersion 未指定のため、他者の編集との競合を確認していません');
                }

                return jsonResult({
                    ...toWikiSummary(wiki, ctx.api),
                    version,
                    warnings,
                    message: `Wiki ページ「${wiki.name}」（ID: ${wiki.id}）を更新しました。`,
                });
            } catch (error) {
                return errorResult('Wiki ページの更新に失敗しました', error);
            }
        }
    );
}
