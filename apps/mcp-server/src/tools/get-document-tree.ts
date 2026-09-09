import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';

/**
 * get_document_tree ツールを登録する
 *
 * プロジェクトのドキュメントツリー（階層）を取得します。
 */
export function registerGetDocumentTreeTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'get_document_tree',
        {
            description: 'プロジェクトのドキュメントツリーを取得します。プロジェクトIDまたはキーを指定してください。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはプロジェクトキー'),
            },
        },
        async ({ projectIdOrKey }) => {
            try {
                // 数値文字列も許容して数値に変換する
                const key = /^\d+$/.test(projectIdOrKey) ? Number(projectIdOrKey) : projectIdOrKey;
                const tree = await ctx.documents.getDocumentTree(key);
                return jsonResult(tree);
            } catch (error) {
                return errorResult('ドキュメントツリーの取得に失敗しました', error);
            }
        }
    );
}
