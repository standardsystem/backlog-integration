import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { BacklogApiClient } from './client.js';
import type {
    ListIssuesOptions,
    AddCommentOptions,
    UpdateIssueOptions,
    ListCommentsOptions,
    CreateIssueOptions,
} from './types.js';

/**
 * Backlog 課題操作モジュール
 *
 * 課題の取得、一覧表示、コメント追加、担当者変更などの操作を提供します。
 *
 * @example
 * ```typescript
 * import { BacklogApiClient } from './client';
 * import { IssueService } from './issues';
 *
 * const apiClient = new BacklogApiClient({ spaceId: '...', apiKey: '...' });
 * const issues = new IssueService(apiClient);
 *
 * // 課題を取得
 * const issue = await issues.getIssue('PROJECT-123');
 *
 * // コメントを追加
 * await issues.addComment('PROJECT-123', { content: '対応しました。' });
 *
 * // 担当者をレポーター（起票者）に変更
 * await issues.assignToReporter('PROJECT-123');
 * ```
 */
export class IssueService {
    private readonly client: BacklogApiClient;

    constructor(client: BacklogApiClient) {
        this.client = client;
    }

    /**
     * 課題の詳細を取得する
     *
     * @param issueIdOrKey - 課題ID または 課題キー（例: "PROJECT-123"）
     * @returns 課題の詳細情報
     */
    async getIssue(issueIdOrKey: string | number) {
        const backlog = this.client.getClient();
        return await backlog.getIssue(issueIdOrKey);
    }

    /**
     * 課題の一覧を取得する
     *
     * @param options - 検索条件
     * @returns 課題の配列
     */
    async listIssues(options: ListIssuesOptions = {}) {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {};

        if (options.projectIdOrKey !== undefined) {
            let projectId: number;
            if (typeof options.projectIdOrKey === 'number') {
                projectId = options.projectIdOrKey;
            } else {
                // プロジェクトキー（文字列）を数値IDに変換
                const project = await backlog.getProject(options.projectIdOrKey);
                projectId = (project as { id: number }).id;
            }
            params.projectId = [projectId];
        }
        if (options.statusId) {
            params.statusId = options.statusId;
        }
        if (options.assigneeId) {
            params.assigneeId = options.assigneeId;
        }
        if (options.createdUserId) {
            params.createdUserId = options.createdUserId;
        }
        if (options.issueTypeId) {
            params.issueTypeId = options.issueTypeId;
        }
        if (options.categoryId) {
            params.categoryId = options.categoryId;
        }
        if (options.keyword) {
            params.keyword = options.keyword;
        }
        if (options.count !== undefined) {
            params.count = options.count;
        }
        if (options.offset !== undefined) {
            params.offset = options.offset;
        }
        if (options.sort) {
            params.sort = options.sort;
        }
        if (options.order) {
            params.order = options.order;
        }

        return await backlog.getIssues(params);
    }

    /**
     * 課題にコメントを追加する
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param options - コメント内容と通知設定
     * @returns 追加されたコメント
     */
    async addComment(issueIdOrKey: string | number, options: AddCommentOptions) {
        const backlog = this.client.getClient();
        const params: {
            content: string;
            notifiedUserId?: number[];
            attachmentId?: number[];
        } = {
            content: options.content,
        };

        if (options.notifiedUserId) {
            params.notifiedUserId = options.notifiedUserId;
        }
        if (options.attachmentId) {
            params.attachmentId = options.attachmentId;
        }

        return await backlog.postIssueComments(issueIdOrKey, params);
    }

    /**
     * 課題を更新する（担当者変更、状態変更など）
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param options - 更新内容
     * @returns 更新された課題
     */
    async updateIssue(issueIdOrKey: string | number, options: UpdateIssueOptions) {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {};

        if (options.summary !== undefined) params.summary = options.summary;
        if (options.parentIssueId !== undefined) params.parentIssueId = options.parentIssueId === null ? '' : options.parentIssueId;
        if (options.description !== undefined) params.description = options.description;
        if (options.statusId !== undefined) params.statusId = options.statusId;
        // 担当者を未割り当てにする場合は空文字を設定する
        if (options.assigneeId !== undefined) params.assigneeId = options.assigneeId === null ? '' : options.assigneeId;
        if (options.issueTypeId !== undefined) params.issueTypeId = options.issueTypeId;
        if (options.categoryId !== undefined) params.categoryId = options.categoryId;
        if (options.versionId !== undefined) params.versionId = options.versionId;
        if (options.milestoneId !== undefined) params.milestoneId = options.milestoneId;
        if (options.priorityId !== undefined) params.priorityId = options.priorityId;
        if (options.startDate !== undefined) params.startDate = options.startDate;
        if (options.dueDate !== undefined) params.dueDate = options.dueDate;
        if (options.estimatedHours !== undefined) params.estimatedHours = options.estimatedHours;
        if (options.actualHours !== undefined) params.actualHours = options.actualHours;
        if (options.resolutionId !== undefined) params.resolutionId = options.resolutionId;
        if (options.notifiedUserId !== undefined) params.notifiedUserId = options.notifiedUserId;
        if (options.attachmentId !== undefined) params.attachmentId = options.attachmentId;
        if (options.comment !== undefined) params.comment = options.comment;

        return await backlog.patchIssue(issueIdOrKey, params);
    }

    /**
     * 課題の担当者をレポーター（起票者）に変更する
     *
     * 課題の詳細を取得して起票者のIDを特定し、
     * その起票者を担当者として設定します。
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param comment - 変更時に追加するコメント（任意）
     * @returns 更新された課題
     */
    async assignToReporter(issueIdOrKey: string | number, comment?: string) {
        // まず課題の詳細を取得して起票者（createdUser）のIDを取得
        const issue = await this.getIssue(issueIdOrKey);

        const reporterId = (issue as { createdUser?: { id?: number } }).createdUser?.id;
        if (!reporterId) {
            throw new Error(
                `課題 ${issueIdOrKey} の起票者（レポーター）情報を取得できませんでした。`
            );
        }

        // 担当者をレポーターに変更
        return await this.updateIssue(issueIdOrKey, {
            assigneeId: reporterId,
            comment: comment ?? `担当者をレポーターに変更しました。`,
        });
    }

    /**
     * 課題の特定コメントを取得する
     *
     * @param issueIdOrKey - 課題ID または 課題キー（例: "PROJECT-123"）
     * @param commentId - コメントID
     * @returns コメントの詳細情報
     */
    async getComment(issueIdOrKey: string | number, commentId: number) {
        const backlog = this.client.getClient();
        return await backlog.getIssueComment(issueIdOrKey, commentId);
    }

    /**
     * 課題のコメント一覧を取得する
     *
     * @param issueIdOrKey - 課題ID または 課題キー（例: "PROJECT-123"）
     * @param options - 取得条件（minId, maxId, count, order）
     * @returns コメントの配列
     */
    async listComments(
        issueIdOrKey: string | number,
        options: ListCommentsOptions = {},
    ) {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {};

        if (options.minId !== undefined) params.minId = options.minId;
        if (options.maxId !== undefined) params.maxId = options.maxId;
        if (options.count !== undefined) params.count = options.count;
        if (options.order !== undefined) params.order = options.order;

        return await backlog.getIssueComments(issueIdOrKey, params);
    }

    /**
     * 課題の添付ファイルをダウンロードしてローカルに保存する
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param attachmentId - 添付ファイルID
     * @param outputPath - 保存先の絶対パス
     */
    async downloadAttachment(
        issueIdOrKey: string | number,
        attachmentId: number,
        outputPath: string,
    ): Promise<void> {
        const backlog = this.client.getClient();
        const fileData = await backlog.getIssueAttachment(issueIdOrKey, attachmentId);

        // Node.js 環境: body は PassThrough ストリーム
        const data = fileData as { body: NodeJS.ReadableStream; filename: string };

        // 出力先ディレクトリが存在しない場合は作成
        await mkdir(dirname(outputPath), { recursive: true });

        const writeStream = createWriteStream(outputPath);
        await pipeline(data.body, writeStream);
    }

    /**
     * ローカルファイルをスペースの添付ファイルとしてアップロードする
     *
     * @param filePath - アップロードするファイルの絶対パス
     * @param fileName - (任意) アップロード時のファイル名
     * @returns 添付ファイル情報
     */
    async uploadAttachment(filePath: string, fileName?: string) {
        const backlog = this.client.getClient();
        
        const fileBuffer = await readFile(filePath);
        const name = fileName || basename(filePath);
        
        // Node.jsのグローバルなBlobとFormDataを使用
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append('file', blob, name);

        return await backlog.postSpaceAttachment(formData as any);
    }

    /**
     * 課題を新規作成する
     *
     * @param options - 課題作成パラメータ（projectId, summary, issueTypeId, priorityId は必須）
     * @returns 作成された課題
     */
    async createIssue(options: CreateIssueOptions) {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {
            projectId: options.projectId,
            summary: options.summary,
            issueTypeId: options.issueTypeId,
            priorityId: options.priorityId,
        };

        if (options.description !== undefined) params.description = options.description;
        if (options.startDate !== undefined) params.startDate = options.startDate;
        if (options.dueDate !== undefined) params.dueDate = options.dueDate;
        if (options.estimatedHours !== undefined) params.estimatedHours = options.estimatedHours;
        if (options.actualHours !== undefined) params.actualHours = options.actualHours;
        if (options.assigneeId !== undefined) params.assigneeId = options.assigneeId;
        if (options.categoryId !== undefined) params.categoryId = options.categoryId;
        if (options.versionId !== undefined) params.versionId = options.versionId;
        if (options.milestoneId !== undefined) params.milestoneId = options.milestoneId;
        if (options.notifiedUserId !== undefined) params.notifiedUserId = options.notifiedUserId;
        if (options.parentIssueId !== undefined) params.parentIssueId = options.parentIssueId;
        if (options.attachmentId !== undefined) params.attachmentId = options.attachmentId;

        return await backlog.postIssue(params as any);
    }
}
