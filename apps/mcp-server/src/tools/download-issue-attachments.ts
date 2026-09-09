import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * download_issue_attachments ツールを登録する
 *
 * 課題の添付ファイルを 1 回の呼び出しでまとめてローカルに保存します。
 */
export function registerDownloadIssueAttachmentsTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'download_issue_attachments',
        {
            description: '課題の添付ファイルをまとめてローカルに保存します。attachmentIds を省略すると全件保存します。'
                + 'Backlog 上のファイル名で保存し、同名がある場合は「name (2).ext」のように連番を付けます。'
                + '保存先ディレクトリが無ければ作成します。添付を全件確認する手順ではこのツールを使ってください。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                outputDir: z.string().describe('保存先ディレクトリの絶対パス（存在しなければ作成します）'),
                attachmentIds: z.array(z.number()).optional()
                    .describe('ダウンロードする添付ファイルIDの配列（省略時は課題の全添付）'),
            },
        },
        async ({ issueIdOrKey, outputDir, attachmentIds }) => {
            try {
                const result = await ctx.issues.downloadAttachments(
                    issueIdOrKey,
                    outputDir,
                    attachmentIds ?? undefined,
                );

                return jsonResult({
                    ...result,
                    message: result.count === 0
                        ? `課題 ${issueIdOrKey} に添付ファイルはありません。`
                        : `添付ファイル ${result.count} 件を ${result.outputDir} に保存しました。`,
                });
            } catch (error) {
                return errorResult('添付ファイルの一括ダウンロードに失敗しました', error);
            }
        }
    );
}
