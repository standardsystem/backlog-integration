import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * download_attachment ツールを登録する
 *
 * 課題に添付されたファイルをローカルに保存します。
 */
export function registerDownloadAttachmentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'download_attachment',
        {
            description: '課題に添付されたファイルをローカルに保存します。課題キー、添付ファイルID、保存先パスを指定してください。'
                + '添付を全件まとめて取得する場合は download_issue_attachments を使ってください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                attachmentId: z.number().describe('添付ファイルID'),
                outputPath: z.string().describe('保存先の絶対パス'),
            },
        },
        async ({ issueIdOrKey, attachmentId, outputPath }) => {
            try {
                const file = await ctx.issues.downloadAttachment(issueIdOrKey, attachmentId, outputPath);
                return jsonResult({
                    id: attachmentId,
                    path: file.path,
                    bytes: file.bytes,
                    message: `添付ファイル（ID: ${attachmentId}）を ${file.path} に保存しました。`,
                });
            } catch (error) {
                return errorResult('添付ファイルのダウンロードに失敗しました', error);
            }
        }
    );
}
