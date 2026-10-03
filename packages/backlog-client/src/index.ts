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
export { DocumentService } from './documents.js';
export { ProjectService } from './projects.js';
export { WikiService } from './wikis.js';
export { sanitizeFileName, splitFileName, openUniqueFile } from './file-name.js';
export { resolveBacklogConfig, parseSpaceId } from './config.js';
export { describeBacklogError, formatBacklogError } from './errors.js';
export {
    ISSUE_TYPE_COLORS,
    PROJECT_STATUS_COLORS,
    ISSUE_TYPE_NAME_MAX_LENGTH,
    PROJECT_STATUS_NAME_MAX_LENGTH,
} from './types.js';
export type { BacklogErrorDetail, BacklogErrorMessage } from './errors.js';
export type {
    BacklogClientConfig,
    BacklogDomain,
    IssueSortKey,
    IssueParentChild,
    ListIssuesOptions,
    DownloadedFile,
    DownloadedAttachment,
    DownloadAttachmentsResult,
    AddCommentOptions,
    UpdateIssueOptions,
    ListCommentsOptions,
    CreateIssueOptions,
    ListDocumentsOptions,
    AddDocumentOptions,
    UploadDocumentMarkdownOptions,
    AddWikiOptions,
    UpdateWikiOptions,
    WikiVersion,
    IssueTypeColor,
    ProjectStatusColor,
    AddMilestoneOptions,
    AddIssueTypeOptions,
    AddStatusOptions,
} from './types.js';
