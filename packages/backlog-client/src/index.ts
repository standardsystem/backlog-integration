/**
 * @backlog-integration/backlog-client
 *
 * Backlog API v2 のクライアントラッパーパッケージ。
 * 課題の取得、コメント追加、担当者変更などの操作を提供します。
 *
 * @example
 * ```typescript
 * import { BacklogApiClient, IssueService } from '@backlog-integration/backlog-client';
 *
 * const apiClient = new BacklogApiClient({
 *   spaceId: 'your-space',
 *   apiKey: 'your-api-key',
 * });
 * const issues = new IssueService(apiClient);
 *
 * const issue = await issues.getIssue('PROJECT-123');
 * ```
 */

export { BacklogApiClient } from './client.js';
export { IssueService } from './issues.js';
export type {
    BacklogClientConfig,
    ListIssuesOptions,
    AddCommentOptions,
    UpdateIssueOptions,
} from './types.js';
