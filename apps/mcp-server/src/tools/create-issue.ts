import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toIssueWriteResult, collectIssueWarnings } from '../lib/issue-format.js';

/** ID でも名前でも受け付ける項目 */
const idOrName = z.union([z.string(), z.number()]);

/**
 * create_issue ツールを登録する
 *
 * 新しい課題を作成します。課題種別・優先度などは ID でも名前でも指定できます。
 */
export function registerCreateIssueTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'create_issue',
        {
            description: '新しい課題を作成します。プロジェクトは projectIdOrKey（キー可）または projectId で指定します。'
                + '課題種別・優先度・マイルストーン・カテゴリ・担当者は ID でも名前でも指定できます'
                + '（名前が一意に決まらない場合は候補一覧つきのエラーになります）。'
                + '期限日やマイルストーンが未設定の場合は返却の warnings に載ります。',
            inputSchema: {
                projectIdOrKey: z.string().optional()
                    .describe('プロジェクトIDまたはキー（例: PROJECT）。projectId と併用した場合は projectId が優先されます'),
                projectId: z.number().optional().describe('プロジェクトID（数値）'),
                summary: z.string().describe('件名'),
                issueTypeId: z.number().optional().describe('課題タイプID（issueType より優先）'),
                issueType: idOrName.optional().describe('課題タイプ名またはID（例: "タスク"）'),
                priorityId: z.number().optional().describe('優先度ID (2:高, 3:中, 4:低)。priority より優先'),
                priority: idOrName.optional().describe('優先度名またはID（"高" / "中" / "低" / high / normal / low）'),
                description: z.string().optional()
                    .describe('詳細'),
                startDate: z.string().optional()
                    .describe('開始日（YYYY-MM-DD形式）'),
                dueDate: z.string().optional()
                    .describe('期限日（YYYY-MM-DD形式）'),
                estimatedHours: z.number().optional()
                    .describe('予定時間'),
                actualHours: z.number().optional()
                    .describe('実績時間'),
                assigneeId: z.number().optional()
                    .describe('担当者ID（assignee より優先）'),
                assignee: idOrName.optional()
                    .describe('担当者の名前・ログイン用ユーザID・ID。"@me" で接続中のアカウント自身'),
                categoryId: z.array(z.number()).optional()
                    .describe('カテゴリIDの配列（category より優先）'),
                category: z.array(idOrName).optional()
                    .describe('カテゴリ名またはIDの配列'),
                versionId: z.array(z.number()).optional()
                    .describe('発生バージョンIDの配列'),
                milestoneId: z.array(z.number()).optional()
                    .describe('マイルストーンIDの配列（milestone より優先）'),
                milestone: z.array(idOrName).optional()
                    .describe('マイルストーン名またはIDの配列'),
                notifiedUserId: z.array(z.number()).optional()
                    .describe('通知先ユーザーIDの配列'),
                parentIssueId: z.number().optional()
                    .describe('親課題ID'),
                attachmentId: z.array(z.number()).optional()
                    .describe('添付ファイルIDの配列'),
                uploadFilePaths: z.array(z.string()).optional()
                    .describe('ローカルファイルの絶対パスの配列（同時にアップロードして添付します）'),
            },
        },
        async (params) => {
            try {
                if (params.projectId === undefined && params.projectIdOrKey === undefined) {
                    throw new Error('projectIdOrKey（プロジェクトキー）または projectId のどちらかを指定してください。');
                }

                // 名前解決に使うプロジェクト指定（キーがあればキーを優先してキャッシュを共有する）
                const projectRef = params.projectIdOrKey ?? params.projectId!;
                const projectId = params.projectId ?? await ctx.api.resolveProjectId(params.projectIdOrKey!);

                // ID 指定があればそちらを優先し、無ければ名前から解決する
                const issueTypeId = params.issueTypeId
                    ?? (params.issueType !== undefined
                        ? await ctx.resolver.resolveIssueType(projectRef, params.issueType)
                        : undefined);
                if (issueTypeId === undefined) {
                    const candidates = await ctx.projects.listIssueTypes(projectRef);
                    throw new Error(
                        'issueType（課題種別）または issueTypeId を指定してください。'
                        + `候補: ${candidates.map((t) => `${t.name}(${t.id})`).join(', ') || 'なし'}`,
                    );
                }

                const priorityId = params.priorityId
                    ?? (params.priority !== undefined
                        ? await ctx.resolver.resolvePriority(params.priority)
                        : undefined);
                if (priorityId === undefined) {
                    const candidates = await ctx.projects.listPriorities();
                    throw new Error(
                        'priority（優先度）または priorityId を指定してください。'
                        + `候補: ${candidates.map((p) => `${p.name}(${p.id})`).join(', ') || 'なし'}`,
                    );
                }

                const assigneeId = params.assigneeId
                    ?? (params.assignee !== undefined
                        ? await ctx.resolver.resolveAssignee(projectRef, params.assignee)
                        : undefined);

                const milestoneId = params.milestoneId
                    ?? (params.milestone !== undefined
                        ? await ctx.resolver.resolveMilestones(projectRef, params.milestone)
                        : undefined);

                const categoryId = params.categoryId
                    ?? (params.category !== undefined
                        ? await ctx.resolver.resolveCategories(projectRef, params.category)
                        : undefined);

                const combinedAttachmentIds: number[] = [...(params.attachmentId || [])];

                if (params.uploadFilePaths && params.uploadFilePaths.length > 0) {
                    for (const filePath of params.uploadFilePaths) {
                        try {
                            const fileInfo = await ctx.issues.uploadAttachment(filePath);
                            if (fileInfo && typeof fileInfo === 'object' && 'id' in fileInfo) {
                                combinedAttachmentIds.push(fileInfo.id as number);
                            }
                        } catch (uploadError) {
                            throw new Error(`ファイル '${filePath}' のアップロードに失敗しました: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
                        }
                    }
                }

                const createdIssue = await ctx.issues.createIssue({
                    projectId,
                    summary: params.summary,
                    issueTypeId,
                    priorityId,
                    description: params.description ?? undefined,
                    startDate: params.startDate ?? undefined,
                    dueDate: params.dueDate ?? undefined,
                    estimatedHours: params.estimatedHours ?? undefined,
                    actualHours: params.actualHours ?? undefined,
                    assigneeId,
                    categoryId,
                    versionId: params.versionId ?? undefined,
                    milestoneId,
                    notifiedUserId: params.notifiedUserId ?? undefined,
                    parentIssueId: params.parentIssueId ?? undefined,
                    attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                });

                const issueKey = (createdIssue as { issueKey?: string }).issueKey;
                return jsonResult({
                    ...toIssueWriteResult(createdIssue, ctx.api, `課題 ${issueKey ?? '不明'} を作成しました。`),
                    warnings: collectIssueWarnings(createdIssue),
                    attachmentIds: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : [],
                });
            } catch (error) {
                return errorResult('課題の作成に失敗しました', error);
            }
        }
    );
}
