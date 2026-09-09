import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { issueSearchSchema, toListIssuesOptions } from '../lib/issue-search-schema.js';

/**
 * count_issues ツールを登録する
 *
 * list_issues と同じ絞込条件で、条件に一致する課題の総件数を返します。
 */
export function registerCountIssuesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'count_issues',
        {
            description: '条件に一致する課題の総件数を取得します。絞込条件は list_issues と同じです。'
                + 'list_issues は最大100件しか返さないため、全件走査の要否やページングの終端判定に使ってください。',
            inputSchema: issueSearchSchema,
        },
        async (filters) => {
            try {
                const count = await ctx.issues.countIssues(toListIssuesOptions(filters));

                return jsonResult({ count });
            } catch (error) {
                return errorResult('課題件数の取得に失敗しました', error);
            }
        }
    );
}
