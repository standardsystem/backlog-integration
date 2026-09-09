import type {
    BacklogApiClient,
    IssueService,
    DocumentService,
    ProjectService,
} from '@backlog-integration/backlog-client';
import type { IssueFieldResolver } from './field-resolver.js';

/**
 * 各 MCP ツールに渡す共通コンテキスト
 *
 * ツールは課題/ドキュメント操作だけでなく、レスポンスに付与する URL の組み立てにも
 * スペース情報（`BacklogApiClient`）を必要とするため、サービス群をまとめて渡します。
 */
export interface ToolContext {
    /** Backlog API クライアント（スペースID・URL 組み立て・プロジェクトID 解決に使う） */
    api: BacklogApiClient;
    /** 課題操作サービス */
    issues: IssueService;
    /** ドキュメント操作サービス */
    documents: DocumentService;
    /** プロジェクトのメタ情報参照サービス */
    projects: ProjectService;
    /** 課題の項目を名前から ID に解決するリゾルバ（プロセス内キャッシュ付き） */
    resolver: IssueFieldResolver;
}
