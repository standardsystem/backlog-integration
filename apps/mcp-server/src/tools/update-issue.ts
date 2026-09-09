import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatBacklogError } from '@backlog-integration/backlog-client';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toIssueWriteResult, collectIssueWarnings } from '../lib/issue-format.js';

/** ID でも名前でも受け付ける項目 */
const idOrName = z.union([z.string(), z.number()]);

/**
 * update_issue ツールを登録する
 *
 * 課題のステータス変更、担当者変更、期限日の設定などを行います。
 */
export function registerUpdateIssueTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'update_issue',
        {
            description: '課題を更新します。ステータス変更、担当者変更、期限日の設定などが可能です。'
                + '状態・課題種別・優先度・マイルストーン・カテゴリ・担当者は ID でも名前でも指定できます'
                + '（名前が一意に決まらない場合は候補一覧つきのエラーになります）。'
                + '期限日やマイルストーンが未設定の場合は返却の warnings に載ります。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                summary: z.string().optional().describe('件名'),
                parentIssueId: z.number().nullable().optional().describe('親課題ID（nullを指定すると解除）'),
                description: z.string().optional().describe('詳細'),
                statusId: z.number().optional()
                    .describe('状態ID（1:未対応, 2:処理中, 3:処理済み, 4:完了）。status より優先'),
                status: idOrName.optional()
                    .describe('状態名またはID（カスタムステータス可。例: "処理中"）'),
                assigneeId: z.number().nullable().optional()
                    .describe('担当者ID（nullを指定すると未割り当て）。assignee より優先'),
                assignee: idOrName.optional()
                    .describe('担当者の名前・ログイン用ユーザID・ID。"@me" で接続中のアカウント自身。'
                        + '未割り当てにする場合は assigneeId に null を指定してください'),
                issueTypeId: z.number().optional().describe('課題タイプID（issueType より優先）'),
                issueType: idOrName.optional().describe('課題タイプ名またはID（例: "タスク"）'),
                categoryId: z.array(z.number()).optional()
                    .describe('カテゴリIDの配列（category より優先）。空配列 [] を渡すとカテゴリを解除します'),
                category: z.array(idOrName).optional()
                    .describe('カテゴリ名またはIDの配列。空配列 [] で解除'),
                versionId: z.array(z.number()).optional()
                    .describe('発生バージョンIDの配列。空配列 [] で解除'),
                milestoneId: z.array(z.number()).optional()
                    .describe('マイルストーンIDの配列（milestone より優先）。空配列 [] を渡すとマイルストーンを解除します'),
                milestone: z.array(idOrName).optional()
                    .describe('マイルストーン名またはIDの配列。空配列 [] で解除'),
                priorityId: z.number().optional().describe('優先度ID (2:高, 3:中, 4:低)。priority より優先'),
                priority: idOrName.optional().describe('優先度名またはID（"高" / "中" / "低" / high / normal / low）'),
                startDate: z.string().optional().describe('開始日（YYYY-MM-DD形式）'),
                dueDate: z.string().optional()
                    .describe('期限日（YYYY-MM-DD形式）'),
                estimatedHours: z.number().optional().describe('予定時間'),
                actualHours: z.number().optional().describe('実績時間'),
                resolutionId: z.number().optional().describe('完了理由ID (0:対応済み, 1:対応しない, 2:無効, 3:重複, 4:再現しない)'),
                notifiedUserId: z.array(z.number()).optional().describe('通知先ユーザーIDの配列'),
                comment: z.string().optional()
                    .describe('更新時に追加するコメント'),
                attachmentId: z.array(z.number()).optional()
                    .describe('添付ファイルIDの配列'),
                uploadFilePaths: z.array(z.string()).optional()
                    .describe('ローカルファイルの絶対パスの配列（同時にアップロードして添付します）'),
            },
        },
        async (params) => {
            try {
                const combinedAttachmentIds: number[] = [...(params.attachmentId || [])];

                if (params.uploadFilePaths && params.uploadFilePaths.length > 0) {
                    for (const filePath of params.uploadFilePaths) {
                        try {
                            const fileInfo = await ctx.issues.uploadAttachment(filePath);
                            if (fileInfo && typeof fileInfo === 'object' && 'id' in fileInfo) {
                                combinedAttachmentIds.push(fileInfo.id as number);
                            }
                        } catch (uploadError) {
                            // HTTP ステータスや Backlog の errors[] を落とさないよう、原因は formatBacklogError で整形する
                            throw new Error(`ファイル '${filePath}' のアップロードに失敗しました: ${formatBacklogError(uploadError)}`, { cause: uploadError });
                        }
                    }
                }

                // 課題の詳細は「statusId の自動補完」と「名前解決に使うプロジェクトの特定」で必要になる。
                // どちらの用途でも 1 回だけ取得する。
                let currentIssue: unknown;
                const loadCurrentIssue = async (): Promise<unknown> => {
                    currentIssue ??= await ctx.issues.getIssue(params.issueIdOrKey);
                    return currentIssue;
                };

                // 名前解決に使うプロジェクト（課題キーの接頭辞、無理なら課題の projectId）
                const projectRef = async (): Promise<string | number> => {
                    const issueKey = await ctx.api.resolveIssueKey(params.issueIdOrKey);
                    const separator = issueKey?.lastIndexOf('-') ?? -1;
                    if (issueKey && separator > 0) return issueKey.slice(0, separator);
                    const issue = await loadCurrentIssue() as { projectId?: number };
                    if (issue.projectId === undefined) {
                        throw new Error(`課題 ${params.issueIdOrKey} のプロジェクトを特定できませんでした。`);
                    }
                    return issue.projectId;
                };

                // ID 指定があればそちらを優先し、無ければ名前から解決する
                const issueTypeId = params.issueTypeId
                    ?? (params.issueType !== undefined
                        ? await ctx.resolver.resolveIssueType(await projectRef(), params.issueType)
                        : undefined);

                const priorityId = params.priorityId
                    ?? (params.priority !== undefined
                        ? await ctx.resolver.resolvePriority(params.priority)
                        : undefined);

                const milestoneId = params.milestoneId
                    ?? (params.milestone !== undefined
                        ? await ctx.resolver.resolveMilestones(await projectRef(), params.milestone)
                        : undefined);

                const categoryId = params.categoryId
                    ?? (params.category !== undefined
                        ? await ctx.resolver.resolveCategories(await projectRef(), params.category)
                        : undefined);

                // assigneeId は null（未割り当て）に意味があるため undefined 判定で分岐する
                const assigneeId = params.assigneeId !== undefined
                    ? params.assigneeId
                    : (params.assignee !== undefined
                        ? await ctx.resolver.resolveAssignee(await projectRef(), params.assignee)
                        : undefined);

                // statusId が省略された場合、現在のステータスIDを自動付与
                // Backlog API は patchIssue 時に statusId を必須とするため
                let resolvedStatusId = params.statusId
                    ?? (params.status !== undefined
                        ? await ctx.resolver.resolveStatus(await projectRef(), params.status)
                        : undefined);
                if (resolvedStatusId === undefined) {
                    const issue = await loadCurrentIssue() as { status?: { id?: number } };
                    resolvedStatusId = issue.status?.id;
                }

                const updatedIssue = await ctx.issues.updateIssue(params.issueIdOrKey, {
                    summary: params.summary ?? undefined,
                    parentIssueId: params.parentIssueId,
                    description: params.description ?? undefined,
                    statusId: resolvedStatusId,
                    assigneeId,
                    issueTypeId,
                    categoryId,
                    versionId: params.versionId ?? undefined,
                    milestoneId,
                    priorityId,
                    startDate: params.startDate ?? undefined,
                    dueDate: params.dueDate ?? undefined,
                    estimatedHours: params.estimatedHours ?? undefined,
                    actualHours: params.actualHours ?? undefined,
                    resolutionId: params.resolutionId ?? undefined,
                    notifiedUserId: params.notifiedUserId ?? undefined,
                    comment: params.comment ?? undefined,
                    attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                });

                const issueKey = (updatedIssue as { issueKey?: string }).issueKey;
                return jsonResult({
                    ...toIssueWriteResult(
                        updatedIssue,
                        ctx.api,
                        `課題 ${issueKey ?? params.issueIdOrKey} を更新しました。`,
                    ),
                    warnings: collectIssueWarnings(updatedIssue),
                    attachmentIds: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : [],
                });
            } catch (error) {
                return errorResult('課題の更新に失敗しました', error);
            }
        }
    );
}
