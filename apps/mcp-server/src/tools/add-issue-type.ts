import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ISSUE_TYPE_COLORS } from '@backlog-integration/backlog-client';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { ISSUE_TYPE_COLOR_GUIDE, toIssueTypeSummary } from '../lib/project-settings-format.js';

/**
 * add_issue_type ツールを登録する
 *
 * プロジェクトに課題種別を追加します。色は Backlog が許す 10 色から選びます。
 */
export function registerAddIssueTypeTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_issue_type',
        {
            description: 'プロジェクトに課題種別を追加します。'
                + '管理者またはプロジェクト管理者の権限が必要です（権限が無い場合は HTTP 403）。'
                + `color は次の 10 色からのみ選べます: ${ISSUE_TYPE_COLOR_GUIDE}。`
                + '追加した名前は同じ MCP サーバーのまま create_issue / update_issue の issueType に指定できます。'
                + '返却には作成した課題種別の id と name が含まれます。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                name: z.string().min(1).describe('課題種別名（例: タスク）'),
                color: z.enum(ISSUE_TYPE_COLORS).describe('色コード（候補外の値は受け付けません）'),
            },
        },
        async ({ projectIdOrKey, name, color }) => {
            try {
                const issueType = await ctx.projects.addIssueType(projectIdOrKey, { name, color });
                // 直後の名前解決が新しい課題種別を見つけられるようにする
                ctx.resolver.clear();
                return jsonResult({
                    ...toIssueTypeSummary(issueType),
                    message: `課題種別「${issueType.name}」（ID: ${issueType.id}）を追加しました。`,
                });
            } catch (error) {
                return errorResult('課題種別の追加に失敗しました', error);
            }
        }
    );
}
