import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toWikiSummary } from '../lib/wiki-format.js';

/**
 * list_wikis ツールを登録する
 *
 * プロジェクトの Wiki ページ一覧（本文なし）を取得します。
 */
export function registerListWikisTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_wikis',
        {
            description: 'プロジェクトの Wiki ページ一覧を取得します（本文は含みません。本文は get_wiki で取得してください）。'
                + 'ページングは無く、条件に合うページをすべて返します。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                keyword: z.string().optional().describe('ページ名・本文に対する検索キーワード'),
            },
        },
        async ({ projectIdOrKey, keyword }) => {
            try {
                const wikis = await ctx.wikis.listWikis(projectIdOrKey, keyword);
                return jsonResult(wikis.map((wiki) => toWikiSummary(wiki, ctx.api)));
            } catch (error) {
                return errorResult('Wiki ページ一覧の取得に失敗しました', error);
            }
        }
    );
}
