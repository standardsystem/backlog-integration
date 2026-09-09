import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toUserSummary } from '../lib/project-format.js';

/**
 * list_project_users ツールを登録する
 *
 * プロジェクトに参加しているユーザの一覧を取得します。
 */
export function registerListProjectUsersTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_project_users',
        {
            description: 'プロジェクトに参加しているユーザの一覧を取得します。'
                + '担当者名から assigneeId / notifiedUserId に指定する数値IDを引くときに使ってください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                const users = await ctx.projects.listProjectUsers(projectIdOrKey);
                return jsonResult(users.map(toUserSummary));
            } catch (error) {
                return errorResult('プロジェクトユーザー一覧の取得に失敗しました', error);
            }
        }
    );
}
