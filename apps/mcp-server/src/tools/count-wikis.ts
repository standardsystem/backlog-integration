import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * count_wikis ツールを登録する
 *
 * プロジェクトの Wiki ページ数を取得します。
 */
export function registerCountWikisTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'count_wikis',
        {
            description: 'プロジェクトの Wiki ページ数を取得します。list_wikis は全件を返すため、'
                + 'ページ数が多いプロジェクトで一覧を取る前の見積もりに使ってください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                const count = await ctx.wikis.countWikis(projectIdOrKey);
                return jsonResult({ projectIdOrKey, count });
            } catch (error) {
                return errorResult('Wiki ページ数の取得に失敗しました', error);
            }
        }
    );
}
