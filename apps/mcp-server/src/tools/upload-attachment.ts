import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/** 移行期間中も残す旧ツール名（次のリリースで削除予定） */
const DEPRECATED_TOOL_NAME = 'mcp_backlog_upload_attachment';

const INPUT_SCHEMA = {
    filePath: z.string().describe('アップロードするローカルファイルの絶対パス'),
    fileName: z.string().optional().describe('アップロード時のファイル名（省略時はファイルパスから推測）'),
};

/**
 * upload_attachment ツールを登録する
 *
 * 他のツール（`download_attachment` など）と命名を揃えるため `upload_attachment` に改名しました。
 * 利用側の許可リスト移行のため、旧名 `mcp_backlog_upload_attachment` も 1 リリースだけ残します。
 */
export function registerUploadAttachmentTool(server: McpServer, ctx: ToolContext) {
    /**
     * 指定した名前でアップロードツールを登録する
     *
     * @param name - 登録するツール名
     * @param description - ツールの説明文
     */
    const register = (name: string, description: string) => {
        server.registerTool(
            name,
            { description, inputSchema: INPUT_SCHEMA },
            async ({ filePath, fileName }) => {
                try {
                    const result = await ctx.issues.uploadAttachment(filePath, fileName);
                    return jsonResult(result);
                } catch (error) {
                    return errorResult('添付ファイルのアップロードに失敗しました', error);
                }
            }
        );
    };

    register(
        'upload_attachment',
        'ローカルのファイルをBacklogスペースに添付ファイルとしてアップロードします。'
        + '返却される id（添付ファイルID）を create_issue / add_comment / update_issue の attachmentId 配列に'
        + '指定すると、課題やコメントに添付できます。',
    );

    // 【非推奨】旧名。利用側の許可リスト移行のため残しているだけで、次のリリースで削除します。
    register(
        DEPRECATED_TOOL_NAME,
        '【非推奨】upload_attachment を使ってください。このツール名は次のリリースで削除されます。'
        + '動作は upload_attachment と同じです。',
    );
}
