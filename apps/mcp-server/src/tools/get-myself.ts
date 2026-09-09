import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toUserSummary } from '../lib/project-format.js';

/**
 * get_myself ツールを登録する
 *
 * API キーで接続しているユーザ自身の情報を取得します。
 */
export function registerGetMyselfTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_myself',
        {
            description: '接続中のアカウント（このMCPサーバーが使っているAPIキーの持ち主）の情報を取得します。'
                + '自分のユーザIDを固定値で持たずに済むよう、担当者を自分に設定するときなどに使ってください。',
            inputSchema: {},
        },
        async () => {
            try {
                const myself = await ctx.projects.getMyself();
                return jsonResult({
                    ...toUserSummary(myself),
                    spaceId: ctx.api.getSpaceId(),
                    host: ctx.api.getHost(),
                });
            } catch (error) {
                return errorResult('接続中アカウントの取得に失敗しました', error);
            }
        }
    );
}
