import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { resolveWikiContent, toWikiSummary } from '../lib/wiki-format.js';

/**
 * add_wiki ツールを登録する
 *
 * Wiki ページを作成します。本文は文字列またはローカルファイルで指定できます。
 */
export function registerAddWikiTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_wiki',
        {
            description: 'Wiki ページを作成します。本文は content（文字列）か contentFilePath（ローカルファイル）の'
                + 'どちらか一方で指定してください。本文の記法（markdown / backlog）はプロジェクトの設定に従うため、'
                + '必要なら get_project の textFormattingRule で確認してください。返却には作成したページの id と url が含まれます。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                name: z.string().min(1).describe('ページ名（"親/子" のように / 区切りで階層を表す）'),
                content: z.string().optional().describe('本文'),
                contentFilePath: z.string().optional().describe('本文を読み込むローカルファイルの絶対パス（UTF-8）'),
                mailNotify: z.boolean().optional().describe('true のときお知らせメールを送る（既定: false）'),
            },
        },
        async ({ projectIdOrKey, name, content, contentFilePath, mailNotify }) => {
            try {
                const body = await resolveWikiContent(content, contentFilePath);
                if (body === undefined) {
                    throw new Error('content または contentFilePath を指定してください');
                }

                const wiki = await ctx.wikis.addWiki({ projectIdOrKey, name, content: body, mailNotify });
                return jsonResult({
                    ...toWikiSummary(wiki, ctx.api),
                    message: `Wiki ページ「${wiki.name}」（ID: ${wiki.id}）を作成しました。`,
                });
            } catch (error) {
                return errorResult('Wiki ページの作成に失敗しました', error);
            }
        }
    );
}
