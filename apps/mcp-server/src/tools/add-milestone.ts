import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toMilestoneSummary } from '../lib/project-format.js';

/**
 * add_milestone ツールを登録する
 *
 * プロジェクトにマイルストーン（バージョン）を追加します。
 */
export function registerAddMilestoneTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_milestone',
        {
            description: 'プロジェクトにマイルストーン（バージョン）を追加します。'
                + '管理者またはプロジェクト管理者の権限が必要です（権限が無い場合は HTTP 403）。'
                + '追加した名前は同じ MCP サーバーのまま create_issue / update_issue の milestone に指定できます。'
                + '返却には作成したマイルストーンの id と name が含まれます。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                name: z.string().min(1).describe('マイルストーン名'),
                description: z.string().optional().describe('説明'),
                startDate: z.string().optional().describe('開始日（YYYY-MM-DD形式）'),
                releaseDueDate: z.string().optional().describe('期限日（YYYY-MM-DD形式）'),
            },
        },
        async ({ projectIdOrKey, name, description, startDate, releaseDueDate }) => {
            try {
                const milestone = await ctx.projects.addMilestone(projectIdOrKey, {
                    name,
                    description,
                    startDate,
                    releaseDueDate,
                });
                // 直後の名前解決が新しいマイルストーンを見つけられるようにする
                ctx.resolver.clear();
                return jsonResult({
                    ...toMilestoneSummary(milestone),
                    message: `マイルストーン「${milestone.name}」（ID: ${milestone.id}）を追加しました。`,
                });
            } catch (error) {
                return errorResult('マイルストーンの追加に失敗しました', error);
            }
        }
    );
}
