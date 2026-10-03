/**
 * Backlog スペースのドメイン
 *
 * スペースの契約により `backlog.com` / `backlog.jp` / `backlogtool.com` のいずれかになります。
 */
export type BacklogDomain = 'backlog.com' | 'backlog.jp' | 'backlogtool.com';

/**
 * Backlog API v2 クライアントの設定
 */
export interface BacklogClientConfig {
    /** BacklogスペースID（例: "your-space" → your-space.backlog.com） */
    spaceId: string;
    /** Backlog API キー */
    apiKey: string;
    /** スペースのドメイン（省略時: backlog.com） */
    domain?: BacklogDomain;
}

/**
 * 課題一覧のソートキー
 */
export type IssueSortKey = 'issueType' | 'category' | 'version' | 'milestone' | 'summary'
    | 'status' | 'priority' | 'attachment' | 'sharedFile' | 'created'
    | 'createdUser' | 'updated' | 'updatedUser' | 'assignee'
    | 'startDate' | 'dueDate' | 'estimatedHours' | 'actualHours'
    | 'childIssue';

/**
 * 親子課題の絞込条件（Backlog API の parentChild パラメータ）
 *
 * 0:すべて, 1:子課題以外, 2:子課題・孫課題, 3:子でも親でもない課題,
 * 4:子課題を持つ課題, 5:孫課題のみ, 6:子課題のみ, 7:最上位課題のみ,
 * 8:孫課題を除く, 9:最上位課題を除く, 10:末端の課題のみ
 */
export type IssueParentChild = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * 課題一覧取得のオプション
 *
 * Backlog API「課題一覧の取得」のパラメータに対応します。
 * @see https://developer.nulab.com/docs/backlog/api/2/get-issue-list/
 */
export interface ListIssuesOptions {
    /** プロジェクトID もしくはキー（省略時はスペース横断で検索する） */
    projectIdOrKey?: string | number;
    /** 課題ID（複数指定可） */
    id?: number[];
    /** 親課題ID（この課題の子課題に絞り込む） */
    parentIssueId?: number[];
    /** 課題タイプID */
    issueTypeId?: number[];
    /** カテゴリID */
    categoryId?: number[];
    /** 発生バージョンID */
    versionId?: number[];
    /** マイルストーンID */
    milestoneId?: number[];
    /** 状態ID (1:未対応, 2:処理中, 3:処理済み, 4:完了 ＋ カスタムステータス) */
    statusId?: number[];
    /** 優先度ID (2:高, 3:中, 4:低) */
    priorityId?: number[];
    /** 完了理由ID */
    resolutionId?: number[];
    /** 担当者ID */
    assigneeId?: number[];
    /** 登録者ID */
    createdUserId?: number[];
    /** 親子課題の絞込 */
    parentChild?: IssueParentChild;
    /** true:添付ファイルあり / false:なし */
    attachment?: boolean;
    /** true:共有ファイルあり / false:なし */
    sharedFile?: boolean;
    /** true:期限日あり / false:なし */
    hasDueDate?: boolean;
    /** 登録日の下限（YYYY-MM-DD） */
    createdSince?: string;
    /** 登録日の上限（YYYY-MM-DD） */
    createdUntil?: string;
    /** 更新日の下限（YYYY-MM-DD） */
    updatedSince?: string;
    /** 更新日の上限（YYYY-MM-DD） */
    updatedUntil?: string;
    /** 開始日の下限（YYYY-MM-DD） */
    startDateSince?: string;
    /** 開始日の上限（YYYY-MM-DD） */
    startDateUntil?: string;
    /** 期限日の下限（YYYY-MM-DD） */
    dueDateSince?: string;
    /** 期限日の上限（YYYY-MM-DD） */
    dueDateUntil?: string;
    /** キーワード */
    keyword?: string;
    /** 取得件数 (デフォルト: 20, 最大: 100) */
    count?: number;
    /** オフセット */
    offset?: number;
    /** ソートキー */
    sort?: IssueSortKey;
    /** ソート順 */
    order?: 'asc' | 'desc';
}

/**
 * ローカルに保存したファイルの情報
 */
export interface DownloadedFile {
    /** 保存先の絶対パス */
    path: string;
    /** 書き出したバイト数 */
    bytes: number;
}

/**
 * 一括ダウンロードした添付ファイル 1 件の情報
 */
export interface DownloadedAttachment {
    /** 添付ファイルID */
    id: number;
    /** Backlog 上のファイル名 */
    name: string;
    /** Backlog 上のファイルサイズ（バイト） */
    size: number;
    /** 保存先の絶対パス（ファイル名を正規化・連番付与した結果） */
    path: string;
    /** 実際に書き出したバイト数 */
    bytes: number;
}

/**
 * 添付ファイル一括ダウンロードの結果
 */
export interface DownloadAttachmentsResult {
    /** 保存したファイル数 */
    count: number;
    /** 保存先ディレクトリ */
    outputDir: string;
    /** 保存したファイルの一覧 */
    files: DownloadedAttachment[];
}

/**
 * コメント追加のオプション
 */
export interface AddCommentOptions {
    /** コメント本文 */
    content: string;
    /** 通知先ユーザーID */
    notifiedUserId?: number[];
    /** 添付ファイルIDの配列 */
    attachmentId?: number[];
}

/**
 * 課題更新のオプション
 */
export interface UpdateIssueOptions {
    /** 件名 */
    summary?: string;
    /** 親課題ID */
    parentIssueId?: number | null;
    /** 詳細 */
    description?: string;
    /** 状態ID */
    statusId?: number;
    /** 担当者ID */
    assigneeId?: number | null;
    /** 課題タイプID */
    issueTypeId?: number;
    /** カテゴリID */
    categoryId?: number[];
    /** 発生バージョンID */
    versionId?: number[];
    /** マイルストーンID */
    milestoneId?: number[];
    /** 優先度ID */
    priorityId?: number;
    /** 開始日（YYYY-MM-DD形式） */
    startDate?: string;
    /** 期限日（YYYY-MM-DD形式） */
    dueDate?: string;
    /** 予定時間 */
    estimatedHours?: number;
    /** 実績時間 */
    actualHours?: number;
    /** 完了理由ID */
    resolutionId?: number;
    /** コメント */
    comment?: string;
    /** 通知先ユーザーID */
    notifiedUserId?: number[];
    /** 添付ファイルIDの配列 */
    attachmentId?: number[];
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

/**
 * ドキュメント一覧取得のオプション
 */
export interface ListDocumentsOptions {
    /** プロジェクトIDの配列（指定すると該当プロジェクトに絞り込み） */
    projectId?: number[];
    /** 検索キーワード */
    keyword?: string;
    /** ソートキー */
    sort?: 'created' | 'updated';
    /** ソート順 */
    order?: 'asc' | 'desc';
    /** オフセット（必須: 既定 0） */
    offset?: number;
    /** 取得件数（既定 20、最大 100） */
    count?: number;
}

/**
 * ドキュメント作成のオプション
 */
export interface AddDocumentOptions {
    /** プロジェクトID */
    projectId: number;
    /** ドキュメントタイトル */
    title?: string;
    /** ドキュメント本文（Markdown / プレーンテキスト） */
    content?: string;
    /** 絵文字（任意） */
    emoji?: string;
    /** 親ドキュメントID（ツリー階層の親） */
    parentId?: string;
    /** true のとき末尾に追加（既定: 先頭側に追加される実装に依存） */
    addLast?: boolean;
}

/**
 * Markdown ファイルからドキュメントを作成する際のオプション
 *
 * AddDocumentOptions から content を除いたもの。本文はファイルから読み込まれます。
 */
export interface UploadDocumentMarkdownOptions {
    /** プロジェクトID */
    projectId: number;
    /** ドキュメントタイトル（省略時はファイル名から拡張子を除いたもの） */
    title?: string;
    /** 絵文字（任意） */
    emoji?: string;
    /** 親ドキュメントID */
    parentId?: string;
    /** 末尾追加フラグ */
    addLast?: boolean;
}

/**
 * Wiki ページ作成のオプション
 */
export interface AddWikiOptions {
    /** プロジェクトID もしくはキー */
    projectIdOrKey: string | number;
    /** ページ名（`/` 区切りで階層を表す） */
    name: string;
    /** 本文（プロジェクトの記法: Markdown または Backlog 記法） */
    content: string;
    /** true のときお知らせメールを送る */
    mailNotify?: boolean;
}

/**
 * Wiki ページ更新のオプション
 */
export interface UpdateWikiOptions {
    /** 新しいページ名 */
    name?: string;
    /** 新しい本文（全文置換） */
    content?: string;
    /** true のときお知らせメールを送る */
    mailNotify?: boolean;
    /**
     * 読み込み時点の版番号。指定すると、最新の版と異なる場合は更新せずにエラーにする
     */
    expectedVersion?: number;
}

/**
 * Wiki ページの版
 */
export interface WikiVersion {
    /** 版番号（更新のたびに 1 ずつ増える。履歴が空のページは 0） */
    version: number;
    /** この版の作成日時（履歴が空なら null） */
    created: string | null;
    /** この版を作成したユーザ（履歴が空なら null） */
    createdUser: { id?: number; name?: string } | null;
}

/**
 * 課題作成のオプション
 */
export interface CreateIssueOptions {
    /** プロジェクトID */
    projectId: number;
    /** 件名 */
    summary: string;
    /** 課題タイプID */
    issueTypeId: number;
    /** 優先度ID (2:高, 3:中, 4:低) */
    priorityId: number;
    /** 詳細 */
    description?: string;
    /** 開始日（YYYY-MM-DD形式） */
    startDate?: string;
    /** 期限日（YYYY-MM-DD形式） */
    dueDate?: string;
    /** 予定時間 */
    estimatedHours?: number;
    /** 実績時間 */
    actualHours?: number;
    /** 担当者ID */
    assigneeId?: number;
    /** カテゴリID */
    categoryId?: number[];
    /** 発生バージョンID */
    versionId?: number[];
    /** マイルストーンID */
    milestoneId?: number[];
    /** 通知先ユーザーID */
    notifiedUserId?: number[];
    /** 親課題ID */
    parentIssueId?: number;
    /** 添付ファイルIDの配列 */
    attachmentId?: number[];
}

/**
 * 課題種別の色
 *
 * Backlog が課題種別に許す 10 色（backlog-js の `IssueTypeColor` と同じ）。
 */
export type IssueTypeColor = (typeof ISSUE_TYPE_COLORS)[number];

/**
 * 課題種別に指定できる色の一覧（Backlog API「課題種別の追加」の color）
 *
 * @see https://developer.nulab.com/docs/backlog/api/2/add-issue-type/
 */
export const ISSUE_TYPE_COLORS = [
    '#e30000', '#990000', '#934981', '#814fbc', '#2779ca',
    '#007e9a', '#7ea800', '#ff9200', '#ff3265', '#666665',
] as const;

/**
 * 状態（ステータス）の色
 *
 * Backlog がカスタム状態に許す 10 色（backlog-js の `ProjectStatusColor` と同じ）。
 */
export type ProjectStatusColor = (typeof PROJECT_STATUS_COLORS)[number];

/**
 * 状態（ステータス）に指定できる色の一覧（Backlog API「状態の追加」の color）
 *
 * @see https://developer.nulab.com/docs/backlog/api/2/add-status/
 */
export const PROJECT_STATUS_COLORS = [
    '#ea2c00', '#e87758', '#e07b9a', '#868cb7', '#3b9dbd',
    '#4caf93', '#b0be3c', '#eda62a', '#f42858', '#393939',
] as const;

/**
 * マイルストーン（バージョン）追加のオプション
 */
export interface AddMilestoneOptions {
    /** マイルストーン名 */
    name: string;
    /** 説明 */
    description?: string;
    /** 開始日（YYYY-MM-DD形式） */
    startDate?: string;
    /** 期限日（YYYY-MM-DD形式） */
    releaseDueDate?: string;
}

/**
 * 課題種別追加のオプション
 */
export interface AddIssueTypeOptions {
    /** 課題種別名 */
    name: string;
    /** 色（`ISSUE_TYPE_COLORS` のいずれか） */
    color: IssueTypeColor;
}

/**
 * 状態（ステータス）追加のオプション
 */
export interface AddStatusOptions {
    /** 状態名 */
    name: string;
    /** 色（`PROJECT_STATUS_COLORS` のいずれか） */
    color: ProjectStatusColor;
}
