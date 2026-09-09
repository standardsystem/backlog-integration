import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * list_categories ツールを登録する
 *
 * プロジェクトのカテゴリ一覧を取得します。
 */
export function registerListCategoriesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_categories',
        {
            description: 'プロジェクトのカテゴリ一覧を取得します。'
                + 'create_issue / update_issue の categoryId に指定する数値IDを引くときに使ってください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                const categories = await ctx.projects.listCategories(projectIdOrKey);
                return jsonResult(categories.map((category) => ({
                    id: category.id,
                    name: category.name,
                    displayOrder: category.displayOrder,
                })));
            } catch (error) {
                return errorResult('カテゴリ一覧の取得に失敗しました', error);
            }
        }
    );
}
