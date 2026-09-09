import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/** 添付ファイルの生レスポンスのうち、整形で参照する部分 */
interface RawAttachment {
    id?: number;
    name?: string;
    size?: number;
    created?: string;
    createdUser?: { id?: number; name?: string } | null;
}

/**
 * list_issue_attachments ツールを登録する
 *
 * 課題の添付ファイル一覧だけを取得します。
 */
export function registerListIssueAttachmentsTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'list_issue_attachments',
        {
            description: '課題の添付ファイル一覧を取得します。get_issue で課題全体を取得せずに'
                + '添付だけ確認したいときに使ってください。実際の保存は download_issue_attachments で行います。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            },
        },
        async ({ issueIdOrKey }) => {
            try {
                const attachments = await ctx.issues.listAttachments(issueIdOrKey);
                return jsonResult(attachments.map((attachment) => {
                    const raw = attachment as RawAttachment;
                    return {
                        id: raw.id,
                        name: raw.name,
                        size: raw.size,
                        created: raw.created,
                        createdUser: raw.createdUser
                            ? { id: raw.createdUser.id, name: raw.createdUser.name }
                            : null,
                    };
                }));
            } catch (error) {
                return errorResult('添付ファイル一覧の取得に失敗しました', error);
            }
        }
    );
}
