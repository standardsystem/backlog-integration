import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toMilestoneSummary } from '../lib/project-format.js';

/**
 * list_milestones ツールを登録する
 *
 * プロジェクトのマイルストーン（バージョン）一覧を取得します。
 */
export function registerListMilestonesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_milestones',
        {
            description: 'プロジェクトのマイルストーン（バージョン）一覧を取得します。'
                + 'マイルストーン名から milestoneId / versionId に指定する数値IDを引くときに使ってください。'
                + '既定ではアーカイブ済みを除外します。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                includeArchived: z.boolean().optional()
                    .describe('true にするとアーカイブ済みのマイルストーンも含める（既定: false）'),
            },
        },
        async ({ projectIdOrKey, includeArchived }) => {
            try {
                const milestones = await ctx.projects.listMilestones(projectIdOrKey, includeArchived ?? false);
                return jsonResult(milestones.map(toMilestoneSummary));
            } catch (error) {
                return errorResult('マイルストーン一覧の取得に失敗しました', error);
            }
        }
    );
}
