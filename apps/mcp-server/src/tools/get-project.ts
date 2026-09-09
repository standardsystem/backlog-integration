import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * get_project ツールを登録する
 *
 * プロジェクトの詳細（数値ID・本文の記法など）を取得します。
 */
export function registerGetProjectTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_project',
        {
            description: 'プロジェクトの詳細を取得します。プロジェクトキーから数値IDを引くとき、'
                + 'および本文の記法（textFormattingRule: markdown / backlog）を確認するときに使ってください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                const project = await ctx.projects.getProject(projectIdOrKey);
                return jsonResult({
                    id: project.id,
                    projectKey: project.projectKey,
                    name: project.name,
                    textFormattingRule: project.textFormattingRule,
                    archived: project.archived,
                    subtaskingEnabled: project.subtaskingEnabled,
                    useResolvedForChart: project.useResolvedForChart,
                    url: `${ctx.api.getBaseUrl()}/projects/${project.projectKey}`,
                });
            } catch (error) {
                return errorResult('プロジェクトの取得に失敗しました', error);
            }
        }
    );
}
