import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * get_issue ツールを登録する
 *
 * 課題IDまたはキーを指定して、課題の詳細を取得します。
 */
export function registerGetIssueTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_issue',
        {
            description: '課題の詳細を取得します。課題IDまたはキー（例: PROJECT-123）を指定してください。'
                + '返却の url は接続中のスペースから組み立てた課題URLです（スペース名を推測しないでください）。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            },
        },
        async ({ issueIdOrKey }) => {
            try {
                const issue = await ctx.issues.getIssue(issueIdOrKey);
                const issueKey = (issue as { issueKey?: string }).issueKey;
                return jsonResult({
                    ...issue,
                    url: ctx.api.getIssueUrl(issueKey),
                });
            } catch (error) {
                return errorResult('課題の取得に失敗しました', error);
            }
        }
    );
}
