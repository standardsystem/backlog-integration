import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Entity, Option } from 'backlog-js';
import type { BacklogApiClient } from './client.js';
import type {
    ListIssuesOptions,
    AddCommentOptions,
    UpdateIssueOptions,
    ListCommentsOptions,
    CreateIssueOptions,
    DownloadedFile,
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
    async getIssue(issueIdOrKey: string | number): Promise<Entity.Issue.Issue> {
        const backlog = this.client.getClient();
        return await backlog.getIssue(issueIdOrKey);
    }

    /**
     * 課題検索の条件を Backlog API のクエリパラメータに変換する
     *
     * `listIssues` と `countIssues` で同じ絞込条件を使えるように共通化しています。
     * `projectIdOrKey` は数値IDへ解決したうえで `projectId[]` に詰めます。
     *
     * @param options - 検索条件
     * @returns Backlog API「課題一覧の取得」のパラメータ
     */
    private async buildIssueSearchParams(options: ListIssuesOptions): Promise<Option.Issue.GetIssuesParams> {
        const params: Record<string, unknown> = {};

        if (options.projectIdOrKey !== undefined) {
            // プロジェクトキー（文字列）は数値IDに変換する（結果はクライアント側でキャッシュされる）
            params.projectId = [await this.client.resolveProjectId(options.projectIdOrKey)];
        }

        // 配列で指定する絞込条件（空配列は API に送らない）
        const arrayKeys = [
            'id', 'parentIssueId', 'issueTypeId', 'categoryId', 'versionId', 'milestoneId',
            'statusId', 'priorityId', 'resolutionId', 'assigneeId', 'createdUserId',
        ] as const;
        for (const key of arrayKeys) {
            const value = options[key];
            if (value !== undefined && value.length > 0) params[key] = value;
        }

        // 真偽値で指定する絞込条件（false にも意味があるため undefined 判定で分岐する）
        const booleanKeys = ['attachment', 'sharedFile', 'hasDueDate'] as const;
        for (const key of booleanKeys) {
            if (options[key] !== undefined) params[key] = options[key];
        }

        // 日付範囲（YYYY-MM-DD）
        const dateKeys = [
            'createdSince', 'createdUntil', 'updatedSince', 'updatedUntil',
            'startDateSince', 'startDateUntil', 'dueDateSince', 'dueDateUntil',
        ] as const;
        for (const key of dateKeys) {
            if (options[key] !== undefined) params[key] = options[key];
        }

        if (options.parentChild !== undefined) params.parentChild = options.parentChild;
        if (options.keyword !== undefined) params.keyword = options.keyword;
        if (options.count !== undefined) params.count = options.count;
        if (options.offset !== undefined) params.offset = options.offset;
        if (options.sort !== undefined) params.sort = options.sort;
        if (options.order !== undefined) params.order = options.order;

        return params as Option.Issue.GetIssuesParams;
    }

    /**
     * 課題の一覧を取得する
     *
     * @param options - 検索条件
     * @returns 課題の配列
     */
    async listIssues(options: ListIssuesOptions = {}): Promise<Entity.Issue.Issue[]> {
        const backlog = this.client.getClient();
        const params = await this.buildIssueSearchParams(options);
        return await backlog.getIssues(params);
    }

    /**
     * 課題の総件数を取得する
     *
     * `listIssues` と同じ絞込条件を受け取ります。`count` / `offset` / `sort` / `order` は
     * 件数取得では意味を持たないため無視されます。ページングの終端判定に使います。
     *
     * @param options - 検索条件
     * @returns 条件に一致する課題の総件数
     */
    async countIssues(options: ListIssuesOptions = {}): Promise<number> {
        const backlog = this.client.getClient();
        const { count: _count, offset: _offset, sort: _sort, order: _order, ...rest } = options;
        const params = await this.buildIssueSearchParams(rest);
        const result = await backlog.getIssuesCount(params);
        return result.count;
    }

    /**
     * 課題にコメントを追加する
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param options - コメント内容と通知設定
     * @returns 追加されたコメント
     */
    async addComment(issueIdOrKey: string | number, options: AddCommentOptions): Promise<Entity.Issue.Comment> {
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
    async updateIssue(issueIdOrKey: string | number, options: UpdateIssueOptions): Promise<Entity.Issue.Issue> {
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
    async assignToReporter(issueIdOrKey: string | number, comment?: string): Promise<Entity.Issue.Issue> {
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
    async getComment(issueIdOrKey: string | number, commentId: number): Promise<Entity.Issue.Comment> {
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
    ): Promise<Entity.Issue.Comment[]> {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {};

        if (options.minId !== undefined) params.minId = options.minId;
        if (options.maxId !== undefined) params.maxId = options.maxId;
        if (options.count !== undefined) params.count = options.count;
        if (options.order !== undefined) params.order = options.order;

        return await backlog.getIssueComments(issueIdOrKey, params);
    }

    /**
     * 課題のコメント総件数を取得する
     *
     * `listComments` は最大 100 件までしか返さないため、ページングの終端判定に使います。
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @returns コメントの総件数
     */
    async countComments(issueIdOrKey: string | number): Promise<number> {
        const backlog = this.client.getClient();
        const result = await backlog.getIssueCommentsCount(issueIdOrKey);
        return result.count;
    }

    /**
     * 課題コメントの本文を更新する
     *
     * Backlog API の仕様上、更新できるのは自分が投稿したコメントだけです。
     * 他人のコメントを対象にすると権限エラー（HTTP 403）になります。
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param commentId - コメントID
     * @param content - 新しいコメント本文（全文置換）
     * @returns 更新後のコメント
     */
    async updateComment(
        issueIdOrKey: string | number,
        commentId: number,
        content: string,
    ): Promise<Entity.Issue.Comment> {
        const backlog = this.client.getClient();
        return await backlog.patchIssueComment(issueIdOrKey, commentId, { content });
    }

    /**
     * 課題コメントを削除する
     *
     * 削除は取り消せません。実行前に `getComment` で内容を確認してください。
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param commentId - コメントID
     * @returns 削除されたコメント
     */
    async deleteComment(
        issueIdOrKey: string | number,
        commentId: number,
    ): Promise<Entity.Issue.Comment> {
        const backlog = this.client.getClient();
        return await backlog.deleteIssueComment(issueIdOrKey, commentId);
    }

    /**
     * 直近のコメントから、指定した本文と一致するものを探す
     *
     * `updateIssue`（PATCH /issues/:idOrKey）に `comment` を渡した場合、レスポンスは課題本体で
     * コメントIDを含みません。投稿直後にこのメソッドで引き当てることで、通知を二重に飛ばさずに
     * コメントIDとURLを取得します。
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param content - 探すコメント本文
     * @param searchCount - 新しい順に何件まで遡って探すか（既定: 5）
     * @returns 一致したコメント。見つからない場合は undefined
     */
    async findRecentCommentByContent(
        issueIdOrKey: string | number,
        content: string,
        searchCount = 5,
    ): Promise<Entity.Issue.Comment | undefined> {
        const comments = await this.listComments(issueIdOrKey, { count: searchCount, order: 'desc' });
        return comments.find((comment) => comment.content === content);
    }

    /**
     * 課題の添付ファイルをダウンロードしてローカルに保存する
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param attachmentId - 添付ファイルID
     * @param outputPath - 保存先の絶対パス
     * @returns 保存先パスと書き出したバイト数
     */
    async downloadAttachment(
        issueIdOrKey: string | number,
        attachmentId: number,
        outputPath: string,
    ): Promise<DownloadedFile> {
        const backlog = this.client.getClient();
        const fileData = await backlog.getIssueAttachment(issueIdOrKey, attachmentId);

        // Node.js 環境: body は Web ReadableStream（backlog-js 0.17 以降）なので Node.js ストリームに変換する
        const body = Readable.fromWeb(fileData.body as ReadableStream);

        // 出力先ディレクトリが存在しない場合は作成
        await mkdir(dirname(outputPath), { recursive: true });

        const writeStream = createWriteStream(outputPath);
        await pipeline(body, writeStream);

        const { size } = await stat(outputPath);
        return { path: outputPath, bytes: size };
    }

    /**
     * ローカルファイルをスペースの添付ファイルとしてアップロードする
     *
     * @param filePath - アップロードするファイルの絶対パス
     * @param fileName - (任意) アップロード時のファイル名
     * @returns 添付ファイル情報
     */
    async uploadAttachment(filePath: string, fileName?: string): Promise<Entity.File.FileInfo> {
        const backlog = this.client.getClient();
        
        const fileBuffer = await readFile(filePath);
        const name = fileName || basename(filePath);
        
        // Node.jsのグローバルなBlobとFormDataを使用
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append('file', blob, name);

        return await backlog.postSpaceAttachment(formData);
    }

    /**
     * 課題の添付ファイルを削除する
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @param attachmentId - 添付ファイルID
     * @returns 削除された添付ファイル情報
     */
    async deleteAttachment(issueIdOrKey: string | number, attachmentId: number): Promise<Entity.File.IssueFileInfo> {
        const backlog = this.client.getClient();
        return await backlog.deleteIssueAttachment(issueIdOrKey, String(attachmentId));
    }

    /**
     * 課題を新規作成する
     *
     * @param options - 課題作成パラメータ（projectId, summary, issueTypeId, priorityId は必須）
     * @returns 作成された課題
     */
    async createIssue(options: CreateIssueOptions): Promise<Entity.Issue.Issue> {
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
