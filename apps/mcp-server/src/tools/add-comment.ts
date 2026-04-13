import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IssueService } from '@backlog-integration/backlog-client';

/**
 * add_comment ツールを登録する
 *
 * 課題にコメントを追加します。
 */
export function registerAddCommentTool(server: McpServer, issueService: IssueService) {
    server.tool(
        'add_comment',
        '課題にコメントを追加します。課題IDまたはキーとコメント内容を指定してください。',
        {
            issueIdOrKey: z.string().describe('課題IDまたは課題キー（例: PROJECT-123）'),
            content: z.string().describe('コメント本文'),
            notifiedUserId: z.array(z.number()).optional()
                .describe('通知先のユーザーIDの配列'),
            attachmentId: z.array(z.number()).optional()
                .describe('添付ファイルIDの配列'),
            uploadFilePaths: z.array(z.string()).optional()
                .describe('ローカルファイルの絶対パスの配列（同時にアップロードして添付します）'),
            assigneeId: z.number().nullable().optional()
                .describe('【拡張機能】担当者IDを変更する場合に指定（nullを指定すると未割り当て）'),
            statusId: z.number().optional()
                .describe('【拡張機能】状態IDを変更する場合に指定（1:未対応, 2:処理中, 3:処理済み, 4:完了）'),
        },
        async ({ issueIdOrKey, content, notifiedUserId, attachmentId, uploadFilePaths, assigneeId, statusId }) => {
            try {
                const combinedAttachmentIds: number[] = [...(attachmentId || [])];
                
                if (uploadFilePaths && uploadFilePaths.length > 0) {
                    for (const filePath of uploadFilePaths) {
                        try {
                            const fileInfo = await issueService.uploadAttachment(filePath);
                            if (fileInfo && typeof fileInfo === 'object' && 'id' in fileInfo) {
                                combinedAttachmentIds.push(fileInfo.id as number);
                            }
                        } catch (uploadError) {
                            throw new Error(`ファイル '${filePath}' のアップロードに失敗しました: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
                        }
                    }
                }

                // アサイン変更やステータス変更の指定がある場合は updateIssue を使用する
                let commentResult: any;
                if (assigneeId !== undefined || statusId !== undefined) {
                    // updateIssue には現状のステータスIDが必要な場合があるため、statusIdが未指定の場合は取得する
                    let resolvedStatusId = statusId ?? undefined;
                    if (resolvedStatusId === undefined) {
                        const currentIssue = await issueService.getIssue(issueIdOrKey);
                        resolvedStatusId = (currentIssue as { status?: { id?: number } }).status?.id;
                    }

                    commentResult = await issueService.updateIssue(issueIdOrKey, {
                        comment: content,
                        notifiedUserId: notifiedUserId ?? undefined,
                        attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                        assigneeId: assigneeId,
                        statusId: resolvedStatusId,
                    });
                } else {
                    commentResult = await issueService.addComment(issueIdOrKey, {
                        content,
                        notifiedUserId: notifiedUserId ?? undefined,
                        attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                    });
                }

                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `コメントを追加しました\n${combinedAttachmentIds.length > 0 ? `添付ファイルID: ${combinedAttachmentIds.join(', ')}\n` : ''}\n内容:\n${content}`,
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `コメントの追加に失敗しました: ${message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
}
