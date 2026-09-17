import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { withWikiUrl } from '../lib/wiki-format.js';

/**
 * get_wiki ツールを登録する
 *
 * Wiki ページの詳細（本文を含む）を取得します。
 */
export function registerGetWikiTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_wiki',
        {
            description: 'Wiki ページの詳細（本文 content を含む）を取得します。Wiki ページIDは list_wikis で確認してください。'
                + '返却の updated は update_wiki の expectedUpdated に渡すと、他者の編集を上書きする事故を防げます。',
            inputSchema: {
                wikiId: z.number().describe('Wiki ページID'),
            },
        },
        async ({ wikiId }) => {
            try {
                const wiki = await ctx.wikis.getWiki(wikiId);
                return jsonResult(withWikiUrl(wiki, ctx.api));
            } catch (error) {
                return errorResult('Wiki ページの取得に失敗しました', error);
            }
        }
    );
}
