import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toIssueWriteResult } from '../lib/issue-format.js';

/**
 * update_issue ツールを登録する
 *
 * 課題のステータス変更、担当者変更、期限日の設定などを行います。
 */
export function registerUpdateIssueTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'update_issue',
        {
            description: '課題を更新します。ステータス変更、担当者変更、期限日の設定などが可能です。',
            inputSchema: {
                issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
                summary: z.string().optional().describe('件名'),
                parentIssueId: z.number().nullable().optional().describe('親課題ID（nullを指定すると解除）'),
                description: z.string().optional().describe('詳細'),
                statusId: z.number().optional()
                    .describe('状態ID（1:未対応, 2:処理中, 3:処理済み, 4:完了）'),
                assigneeId: z.number().nullable().optional()
                    .describe('担当者ID（nullを指定すると未割り当て）'),
                issueTypeId: z.number().optional().describe('課題タイプID'),
                categoryId: z.array(z.number()).optional().describe('カテゴリIDの配列'),
                versionId: z.array(z.number()).optional().describe('発生バージョンIDの配列'),
                milestoneId: z.array(z.number()).optional().describe('マイルストーンIDの配列'),
                priorityId: z.number().optional().describe('優先度ID (2:高, 3:中, 4:低)'),
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
                            throw new Error(`ファイル '${filePath}' のアップロードに失敗しました: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
                        }
                    }
                }

                // statusId が省略された場合、現在のステータスIDを自動付与
                // Backlog API は patchIssue 時に statusId を必須とするため
                let resolvedStatusId = params.statusId ?? undefined;
                if (resolvedStatusId === undefined) {
                    const currentIssue = await ctx.issues.getIssue(params.issueIdOrKey);
                    resolvedStatusId = (currentIssue as { status?: { id?: number } }).status?.id;
                }

                const updatedIssue = await ctx.issues.updateIssue(params.issueIdOrKey, {
                    summary: params.summary ?? undefined,
                    parentIssueId: params.parentIssueId,
                    description: params.description ?? undefined,
                    statusId: resolvedStatusId,
                    assigneeId: params.assigneeId,
                    issueTypeId: params.issueTypeId ?? undefined,
                    categoryId: params.categoryId ?? undefined,
                    versionId: params.versionId ?? undefined,
                    milestoneId: params.milestoneId ?? undefined,
                    priorityId: params.priorityId ?? undefined,
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
                    attachmentIds: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : [],
                });
            } catch (error) {
                return errorResult('課題の更新に失敗しました', error);
            }
        }
    );
}
