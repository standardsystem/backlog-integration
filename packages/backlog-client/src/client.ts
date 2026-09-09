import * as Backlog from 'backlog-js';
import type { BacklogClientConfig, BacklogDomain } from './types.js';

/** スペースIDのみ指定された場合に使う既定ドメイン */
const DEFAULT_DOMAIN: BacklogDomain = 'backlog.com';

/**
 * Backlog API v2 のクライアントラッパー
 *
 * @example
 * ```typescript
 * const client = new BacklogApiClient({
 *   spaceId: 'your-space',
 *   apiKey: 'your-api-key',
 * });
 *
 * const backlog = client.getClient();
 * ```
 */
export class BacklogApiClient {
    private readonly client: InstanceType<typeof Backlog.Backlog>;
    private readonly config: BacklogClientConfig;
    private readonly domain: BacklogDomain;
    /** プロジェクトキー → プロジェクトID の解決結果キャッシュ（プロセス内） */
    private readonly projectIdCache = new Map<string, number>();
    /** 課題ID → 課題キー の解決結果キャッシュ（プロセス内） */
    private readonly issueKeyCache = new Map<number, string>();

    constructor(config: BacklogClientConfig) {
        this.config = config;
        this.domain = config.domain ?? DEFAULT_DOMAIN;
        this.client = new Backlog.Backlog({
            host: `${config.spaceId}.${this.domain}`,
            apiKey: config.apiKey,
        });
    }

    /**
     * 内部の backlog-js クライアントインスタンスを取得
     */
    getClient(): InstanceType<typeof Backlog.Backlog> {
        return this.client;
    }

    /**
     * スペースIDを取得
     */
    getSpaceId(): string {
        return this.config.spaceId;
    }

    /**
     * スペースのドメイン（backlog.com / backlog.jp / backlogtool.com）を取得
     */
    getDomain(): BacklogDomain {
        return this.domain;
    }

    /**
     * スペースのホスト名（例: your-space.backlog.com）を取得
     */
    getHost(): string {
        return `${this.config.spaceId}.${this.domain}`;
    }

    /**
     * スペースのベースURL（例: https://your-space.backlog.com）を取得
     */
    getBaseUrl(): string {
        return `https://${this.getHost()}`;
    }

    /**
     * 課題のWeb URLを組み立てる
     *
     * @param issueKey - 課題キー（例: "PROJECT-123"）
     * @returns 課題のURL。issueKey が未指定の場合は undefined
     */
    getIssueUrl(issueKey: string | undefined | null): string | undefined {
        if (!issueKey) return undefined;
        return `${this.getBaseUrl()}/view/${issueKey}`;
    }

    /**
     * 課題コメントのWeb URLを組み立てる
     *
     * @param issueKey - 課題キー（例: "PROJECT-123"）
     * @param commentId - コメントID
     * @returns コメントのURL。いずれかが未指定の場合は undefined
     */
    getCommentUrl(issueKey: string | undefined | null, commentId: number | undefined | null): string | undefined {
        const issueUrl = this.getIssueUrl(issueKey);
        if (!issueUrl || commentId === undefined || commentId === null) return undefined;
        return `${issueUrl}#comment-${commentId}`;
    }

    /**
     * ドキュメントのWeb URLを組み立てる
     *
     * @param documentId - ドキュメントID
     * @returns ドキュメントのURL。documentId が未指定の場合は undefined
     */
    getDocumentUrl(documentId: string | undefined | null): string | undefined {
        if (!documentId) return undefined;
        return `${this.getBaseUrl()}/document/${documentId}`;
    }

    /**
     * プロジェクトキー（文字列）を数値のプロジェクトIDに解決する
     *
     * 数値または数値形式の文字列はそのまま返します。
     * 解決結果はプロセス内にキャッシュするため、同じキーで何度呼んでも API は 1 回しか呼ばれません。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー（例: "PROJECT"）
     * @returns プロジェクトID
     */
    async resolveProjectId(projectIdOrKey: string | number): Promise<number> {
        if (typeof projectIdOrKey === 'number') return projectIdOrKey;

        const trimmed = projectIdOrKey.trim();
        // 数値形式の文字列はそのままIDとして扱う
        if (/^\d+$/.test(trimmed)) return Number(trimmed);

        const cacheKey = trimmed.toUpperCase();
        const cached = this.projectIdCache.get(cacheKey);
        if (cached !== undefined) return cached;

        // 内部でも getClient() を経由する（テストでクライアントを差し替えられるようにするため）
        const project = await this.getClient().getProject(trimmed);
        const projectId = (project as { id: number }).id;
        this.projectIdCache.set(cacheKey, projectId);
        return projectId;
    }

    /**
     * 課題ID または 課題キーから、URL 組み立てに使う課題キーを解決する
     *
     * 課題キー（例: "PROJECT-123"）が渡された場合はそのまま返します。
     * 数値ID が渡された場合のみ API を 1 回呼び、結果はプロセス内にキャッシュします。
     *
     * @param issueIdOrKey - 課題ID または 課題キー
     * @returns 課題キー。解決できなかった場合は undefined
     */
    async resolveIssueKey(issueIdOrKey: string | number): Promise<string | undefined> {
        if (typeof issueIdOrKey === 'string') {
            const trimmed = issueIdOrKey.trim();
            // 「PROJECT-123」形式はそのまま課題キーとして扱う
            if (/-\d+$/.test(trimmed)) return trimmed;
            if (!/^\d+$/.test(trimmed)) return trimmed;
            issueIdOrKey = Number(trimmed);
        }

        const cached = this.issueKeyCache.get(issueIdOrKey);
        if (cached !== undefined) return cached;

        const issue = await this.getClient().getIssue(issueIdOrKey);
        const issueKey = (issue as { issueKey?: string }).issueKey;
        if (issueKey) this.issueKeyCache.set(issueIdOrKey, issueKey);
        return issueKey;
    }
}
