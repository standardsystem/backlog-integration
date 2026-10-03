import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toCategorySummary } from '../lib/project-settings-format.js';

/**
 * add_category ツールを登録する
 *
 * プロジェクトにカテゴリを追加します。
 */
export function registerAddCategoryTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_category',
        {
            description: 'プロジェクトにカテゴリを追加します。'
                + '管理者またはプロジェクト管理者の権限が必要です（権限が無い場合は HTTP 403）。'
                + '追加した名前は同じ MCP サーバーのまま create_issue / update_issue の category に指定できます。'
                + '返却には作成したカテゴリの id と name が含まれます。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                name: z.string().min(1).describe('カテゴリ名'),
            },
        },
        async ({ projectIdOrKey, name }) => {
            try {
                const category = await ctx.projects.addCategory(projectIdOrKey, name);
                // 直後の名前解決が新しいカテゴリを見つけられるようにする
                ctx.resolver.clear();
                return jsonResult({
                    ...toCategorySummary(category),
                    message: `カテゴリ「${category.name}」（ID: ${category.id}）を追加しました。`,
                });
            } catch (error) {
                return errorResult('カテゴリの追加に失敗しました', error);
            }
        }
    );
}
