/**
 * Backlog API v2 クライアントの設定
 */
export interface BacklogClientConfig {
    /** BacklogスペースID（例: "your-space" → your-space.backlog.com） */
    spaceId: string;
    /** Backlog API キー */
    apiKey: string;
}

/**
 * 課題一覧取得のオプション
 */
export interface ListIssuesOptions {
    /** プロジェクトID もしくはキー */
    projectIdOrKey?: string | number;
    /** 課題タイプID */
    issueTypeId?: number[];
    /** カテゴリID */
    categoryId?: number[];
    /** 状態ID (1:未対応, 2:処理中, 3:処理済み, 4:完了) */
    statusId?: number[];
    /** 担当者ID */
    assigneeId?: number[];
    /** 登録者ID */
    createdUserId?: number[];
    /** キーワード */
    keyword?: string;
    /** 取得件数 (デフォルト: 20, 最大: 100) */
    count?: number;
    /** オフセット */
    offset?: number;
    /** ソートキー */
    sort?: 'issueType' | 'category' | 'version' | 'milestone' | 'summary'
    | 'status' | 'priority' | 'attachment' | 'sharedFile' | 'created'
    | 'createdUser' | 'updated' | 'updatedUser' | 'assignee'
    | 'startDate' | 'dueDate' | 'estimatedHours' | 'actualHours'
    | 'childIssue';
    /** ソート順 */
    order?: 'asc' | 'desc';
}

/**
 * コメント追加のオプション
 */
export interface AddCommentOptions {
    /** コメント本文 */
    content: string;
    /** 通知先ユーザーID */
    notifiedUserId?: number[];
}

/**
 * 課題更新のオプション
 */
export interface UpdateIssueOptions {
    /** 担当者ID */
    assigneeId?: number;
    /** コメント */
    comment?: string;
    /** 状態ID */
    statusId?: number;
    /** 期限日（YYYY-MM-DD形式） */
    dueDate?: string;
}

/**
 * コメント一覧取得のオプション
 */
export interface ListCommentsOptions {
    /** 最小コメントID */
    minId?: number;
    /** 最大コメントID */
    maxId?: number;
    /** 取得件数（デフォルト: 20, 最大: 100） */
    count?: number;
    /** ソート順 */
    order?: 'asc' | 'desc';
}
