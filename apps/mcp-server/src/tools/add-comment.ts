import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatBacklogError } from '@backlog-integration/backlog-client';
import type { ToolContext } from '../lib/context.js';
import { jsonResult, errorResult } from '../lib/tool-result.js';
import { toCommentSummary } from '../lib/comment-format.js';

/**
 * add_comment ツールを登録する
 *
 * 課題にコメントを追加します。担当者・状態の変更を同時に行うこともできます。
 */
export function registerAddCommentTool(server: McpServer, ctx: ToolContext) {
    server.registerTool(
        'add_comment',
        {
            description: '課題にコメントを追加します。課題IDまたはキーとコメント内容を指定してください。'
                + '返却にはコメントIDと、そのコメントに直接飛べる url が含まれます。',
            inputSchema: {
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
        },
        async ({ issueIdOrKey, content, notifiedUserId, attachmentId, uploadFilePaths, assigneeId, statusId }) => {
            try {
                const combinedAttachmentIds: number[] = [...(attachmentId || [])];

                if (uploadFilePaths && uploadFilePaths.length > 0) {
                    for (const filePath of uploadFilePaths) {
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

                // アサイン変更やステータス変更の指定がある場合は updateIssue を使用する
                let comment: unknown;
                let issueKey: string | undefined;
                let commentLookupFailed = false;

                if (assigneeId !== undefined || statusId !== undefined) {
                    // 状態は明示されたときだけ送る。現在の状態を読んで送り返すと、
                    // その間に他の担当者が状態を変えていた場合に黙って元に戻してしまう。
                    const updatedIssue = await ctx.issues.updateIssue(issueIdOrKey, {
                        comment: content,
                        notifiedUserId: notifiedUserId ?? undefined,
                        attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                        assigneeId: assigneeId,
                        statusId,
                    });
                    issueKey = (updatedIssue as { issueKey?: string }).issueKey;

                    // PATCH /issues のレスポンスはコメントを含まないため、投稿直後のコメントを引き当てる
                    // （コメントを別途 POST するとお知らせが二重に飛ぶため、この方式を採る）
                    comment = await ctx.issues.findRecentCommentByContent(issueIdOrKey, content);
                    commentLookupFailed = comment === undefined;
                } else {
                    comment = await ctx.issues.addComment(issueIdOrKey, {
                        content,
                        notifiedUserId: notifiedUserId ?? undefined,
                        attachmentId: combinedAttachmentIds.length > 0 ? combinedAttachmentIds : undefined,
                    });
                    issueKey = await ctx.api.resolveIssueKey(issueIdOrKey);
                }

                const summary = comment !== undefined
                    ? toCommentSummary(comment, issueKey, ctx.api)
                    : { id: null, issueKey, url: ctx.api.getIssueUrl(issueKey), content, created: null };

                const messageLines = ['コメントを追加しました。'];
                if (combinedAttachmentIds.length > 0) {
                    messageLines.push(`添付ファイルID: ${combinedAttachmentIds.join(', ')}`);
                }
                if (commentLookupFailed) {
                    messageLines.push('※ 課題更新と同時に投稿したため、コメントIDを特定できませんでした（投稿自体は成功しています）。');
                }

                return jsonResult({
                    ...summary,
                    attachmentIds: combinedAttachmentIds,
                    message: messageLines.join('\n'),
                });
            } catch (error) {
                return errorResult('コメントの追加に失敗しました', error);
            }
        }
    );
}
