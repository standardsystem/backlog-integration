import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toIssueTypeSummary } from '../lib/project-settings-format.js';

/** ID でも名前でも受け付ける項目 */
const idOrName = z.union([z.string(), z.number()]);

/**
 * delete_issue_type ツールを登録する
 *
 * 課題種別を削除します。削除は取り消せません。使用中の課題は代わりの種別に移ります。
 */
export function registerDeleteIssueTypeTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'delete_issue_type',
        {
            description: 'プロジェクトの課題種別を削除します。【注意】削除は取り消せません。'
                + '削除する種別を使っている課題は substituteIssueType で指定した種別に移ります。'
                + '実行前に list_issue_types で対象と代わりの種別を確認してください。'
                + 'issueType / substituteIssueType は ID でも名前でも指定できます'
                + '（名前が一意に決まらない場合は候補一覧つきのエラーになります）。'
                + '管理者またはプロジェクト管理者の権限が必要です（権限が無い場合は HTTP 403）。'
                + '返却には削除した課題種別の id と name、代わりの課題種別が含まれます。',
            inputSchema: {
                projectIdOrKey: z.string().describe('プロジェクトIDまたはキー（例: PROJECT）'),
                issueType: idOrName.describe('削除する課題種別の名前またはID（例: "バグ"）'),
                substituteIssueType: idOrName
                    .describe('削除する種別を使っている課題に代わりに割り当てる課題種別の名前またはID（例: "タスク"）'),
            },
        },
        async ({ projectIdOrKey, issueType, substituteIssueType }) => {
            try {
                const issueTypeId = await ctx.resolver.resolveIssueType(projectIdOrKey, issueType);
                const substituteIssueTypeId = await ctx.resolver.resolveIssueType(projectIdOrKey, substituteIssueType);

                if (issueTypeId === substituteIssueTypeId) {
                    throw new Error(
                        `削除する課題種別（ID: ${issueTypeId}）と代わりの課題種別が同じです。別の課題種別を指定してください。`,
                    );
                }

                // 取り消せない操作なので、代わりの種別が実在することを削除前に確かめる
                // （ID 指定の打ち間違いで Backlog 側のエラーになる前に止める）。名前は返却の message にも使う
                const candidates = await ctx.projects.listIssueTypes(projectIdOrKey);
                const substitute = candidates.find((candidate) => candidate.id === substituteIssueTypeId);
                if (!substitute) {
                    throw new Error(
                        `代わりの課題種別（ID: ${substituteIssueTypeId}）がプロジェクトにありません。`
                        + `候補: ${candidates.map((t) => `${t.name}(${t.id})`).join(', ') || 'なし'}`,
                    );
                }

                const deleted = await ctx.projects.deleteIssueType(projectIdOrKey, issueTypeId, substituteIssueTypeId);
                // 消した種別を名前で引けないようにし、以後の解決が最新の一覧を見るようにする
                ctx.resolver.clear();
                return jsonResult({
                    ...toIssueTypeSummary(deleted),
                    deleted: true,
                    substituteIssueType: { id: substitute.id, name: substitute.name },
                    message: `課題種別「${deleted.name}」（ID: ${deleted.id}）を削除しました。`
                        + `この種別を使っていた課題は「${substitute.name}」（ID: ${substitute.id}）に移っています。`,
                });
            } catch (error) {
                return errorResult('課題種別の削除に失敗しました', error);
            }
        }
    );
}
