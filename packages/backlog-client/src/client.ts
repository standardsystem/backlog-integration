import * as Backlog from 'backlog-js';
import type { BacklogClientConfig } from './types.js';

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

    constructor(config: BacklogClientConfig) {
        this.config = config;
        this.client = new Backlog.Backlog({
            host: `${config.spaceId}.backlog.com`,
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
}
