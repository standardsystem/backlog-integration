import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toIssueWriteResult } from '../lib/issue-format.js';

/**
 * create_issue ツールを登録する
 *
 * 新しい課題を作成します。プロジェクトID、件名、課題タイプID、優先度IDは必須です。
 */
export function registerCreateIssueTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'create_issue',
        {
            description: '新しい課題を作成します。プロジェクトID、件名、課題タイプID、優先度IDは必須です。',
            inputSchema: {
                projectId: z.number().describe('プロジェクトID'),
                summary: z.string().describe('件名'),
                issueTypeId: z.number().describe('課題タイプID'),
                priorityId: z.number().describe('優先度ID (2:高, 3:中, 4:低)'),
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
                    .describe('担当者ID'),
                categoryId: z.array(z.number()).optional()
                    .describe('カテゴリIDの配列'),
                versionId: z.array(z.number()).optional()
                    .describe('発生バージョンIDの配列'),
                milestoneId: z.array(z.number()).optional()
                    .describe('マイルストーンIDの配列'),
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
                    projectId: params.projectId,
                    summary: params.summary,
                    issueTypeId: params.issueTypeId,
                    priorityId: params.priorityId,
                    description: params.description ?? undefined,
                    startDate: params.startDate ?? undefined,
                    dueDate: params.dueDate ?? undefined,
                    estimatedHours: params.estimatedHours ?? undefined,
                    actualHours: params.actualHours ?? undefined,
                    assigneeId: params.assigneeId ?? undefined,
                    categoryId: params.categoryId ?? undefined,
                    versionId: params.versionId ?? undefined,
                    milestoneId: params.milestoneId ?? undefined,
                    notifiedUserId: params.notifiedUserId ?? undefined,
                    parentIssueId: params.parentIssueId ?? undefined,
                    attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                });

                const issueKey = (createdIssue as { issueKey?: string }).issueKey;
                return jsonResult({
                    ...toIssueWriteResult(createdIssue, ctx.api, `課題 ${issueKey ?? '不明'} を作成しました。`),
                    attachmentIds: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : [],
                });
            } catch (error) {
                return errorResult('課題の作成に失敗しました', error);
            }
        }
    );
}
