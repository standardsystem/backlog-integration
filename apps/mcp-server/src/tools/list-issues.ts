import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { formatIssue } from '../lib/issue-format.js';
import { issueSearchSchema, toListIssuesOptions } from '../lib/issue-search-schema.js';

/**
 * list_issues ツールを登録する
 *
 * プロジェクトの課題一覧を、Backlog API の絞込条件・ページング付きで取得します。
 */
export function registerListIssuesTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_issues',
        {
            description: '課題一覧を取得します。プロジェクトキー（例: PROJECT）のほか、親課題ID・マイルストーン・期限日などで絞り込めます。'
                + '100件を超える場合は offset でページングし、総件数は count_issues で確認してください。',
            inputSchema: {
                ...issueSearchSchema,
                count: z.number().min(1).max(100).optional()
                    .describe('取得件数（デフォルト: 20, 最大: 100）'),
                offset: z.number().min(0).optional()
                    .describe('取得開始位置（100件を超える課題を走査する際に使う）'),
                sort: z.enum([
                    'issueType', 'category', 'version', 'milestone', 'summary',
                    'status', 'priority', 'attachment', 'sharedFile', 'created',
                    'createdUser', 'updated', 'updatedUser', 'assignee',
                    'startDate', 'dueDate', 'estimatedHours', 'actualHours', 'childIssue',
                ]).optional()
                    .describe('ソートキー'),
                order: z.enum(['asc', 'desc']).optional()
                    .describe('ソート順'),
                fields: z.array(z.string()).optional()
                    .describe('返却する項目名の配列。省略時は既定のサマリ（id, issueKey, summary, status, assignee, createdUser, priority, issueType, milestone, resolution, parentIssueId, startDate, dueDate, created, updated, url）。'
                        + '["*"] を指定すると API の生レスポンスを返します。既定サマリに無い項目名（description, attachments など）も指定できます'),
            },
        },
        async ({ count, offset, sort, order, fields, ...filters }) => {
            try {
                const issues = await ctx.issues.listIssues({
                    ...toListIssuesOptions(filters),
                    count: count ?? undefined,
                    offset: offset ?? undefined,
                    sort: sort ?? undefined,
                    order: order ?? undefined,
                });

                const formatted = issues.map((issue) => formatIssue(issue, ctx.api, fields));

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(formatted, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `課題一覧の取得に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
