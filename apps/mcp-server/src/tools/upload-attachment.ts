import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * 添付ファイルアップロードツールを登録する
 */
export function registerUploadAttachmentTool(server: McpServer, issues: IssueService) {
    server.tool(
        'mcp_backlog_upload_attachment',
        `This is a tool from the backlog MCP server.
ローカルのファイルをBacklogスペースに添付ファイルとしてアップロードします。
このツールでアップロードした際に返される id (添付ファイルID) を、
create_issue や add_comment、update_issue の attachmentId 配列に指定することで課題やコメントに添付できます。`,
        {
            filePath: z.string().describe('アップロードするローカルファイルの絶対パス'),
            fileName: z.string().optional().describe('アップロード時のファイル名（省略時はファイルパスから推測）'),
        },
        async (params) => {
            try {
                const { filePath, fileName } = params;
                const result = await issues.uploadAttachment(filePath, fileName);
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to upload attachment: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
