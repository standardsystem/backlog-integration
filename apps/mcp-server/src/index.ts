#!/usr/bin/env node

/**
 * Backlog連携 MCPサーバー
 *
 * StdioトランスポートでBacklog操作ツールを提供します。
 *
 * 環境変数:
 * - BACKLOG_SPACE_ID: BacklogスペースID（URL やドメイン付きでも可）
 * - BACKLOG_API_KEY: Backlog APIキー
 * - BACKLOG_SKIP_STARTUP_CHECK: 1 を指定すると起動時の疎通確認を省略する
 *
 * 起動時の疎通確認は認証失敗（HTTP 401）でのみ起動を中止します。
 * 一時的な失敗では起動を続け、背景で指数バックオフしながら再試行します。
 *
 * 使用方法:
 *   BACKLOG_SPACE_ID=xxx BACKLOG_API_KEY=yyy node dist/index.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    BacklogApiClient,
    IssueService,
    DocumentService,
    ProjectService,
    resolveBacklogConfig,
} from '@backlog-integration/backlog-client';

import type { ToolContext } from './lib/context.js';
import { verifyBacklogConnection } from './lib/startup-check.js';
import { IssueFieldResolver } from './lib/field-resolver.js';
import { registerGetIssueTool } from './tools/get-issue.js';
import { registerListIssuesTool } from './tools/list-issues.js';
import { registerCountIssuesTool } from './tools/count-issues.js';
import { registerAddCommentTool } from './tools/add-comment.js';
import { registerAssignToReporterTool } from './tools/assign-to-reporter.js';
import { registerUpdateIssueTool } from './tools/update-issue.js';
import { registerDownloadAttachmentTool } from './tools/download-attachment.js';
import { registerGetCommentTool } from './tools/get-comment.js';
import { registerListCommentsTool } from './tools/list-comments.js';
import { registerCreateIssueTool } from './tools/create-issue.js';
import { registerUploadAttachmentTool } from './tools/upload-attachment.js';
import { registerGetDocumentTool } from './tools/get-document.js';
import { registerListDocumentsTool } from './tools/list-documents.js';
import { registerGetDocumentTreeTool } from './tools/get-document-tree.js';
import { registerAddDocumentTool } from './tools/add-document.js';
import { registerDownloadDocumentAttachmentTool } from './tools/download-document-attachment.js';
import { registerDownloadDocumentMarkdownTool } from './tools/download-document-markdown.js';
import { registerUploadDocumentMarkdownTool } from './tools/upload-document-markdown.js';
import { registerDeleteIssueAttachmentTool } from './tools/delete-issue-attachment.js';
import { registerDeleteDocumentAttachmentTool } from './tools/delete-document-attachment.js';
import { registerDownloadIssueAttachmentsTool } from './tools/download-issue-attachments.js';
import { registerListIssueAttachmentsTool } from './tools/list-issue-attachments.js';
import { registerUpdateCommentTool } from './tools/update-comment.js';
import { registerDeleteCommentTool } from './tools/delete-comment.js';
import { registerCountCommentsTool } from './tools/count-comments.js';
import { registerGetProjectTool } from './tools/get-project.js';
import { registerListProjectUsersTool } from './tools/list-project-users.js';
import { registerListMilestonesTool } from './tools/list-milestones.js';
import { registerListStatusesTool } from './tools/list-statuses.js';
import { registerListIssueTypesTool } from './tools/list-issue-types.js';
import { registerListCategoriesTool } from './tools/list-categories.js';
import { registerListPrioritiesTool } from './tools/list-priorities.js';
import { registerGetMyselfTool } from './tools/get-myself.js';

/**
 * 起動時に Backlog への疎通を確認する
 *
 * 認証情報が誤っている（HTTP 401）ときだけ起動を中止します。
 * レート制限・Backlog 側の障害・ネットワーク断のような一時的な失敗では起動を続け、
 * 背景で指数バックオフしながら再試行します（ツールを失わせないため）。
 * 疎通確認そのものを省きたい場合は `BACKLOG_SKIP_STARTUP_CHECK=1` を設定してください。
 *
 * @param projects - メタ情報参照サービス
 * @param host - 接続先ホスト名（ログ出力用）
 */
async function verifyConnection(projects: ProjectService, host: string): Promise<void> {
    if (process.env.BACKLOG_SKIP_STARTUP_CHECK === '1') {
        console.error(`[backlog-integration] 起動時の疎通確認をスキップしました（接続先: ${host}）。`);
        return;
    }

    const { first, retrying } = await verifyBacklogConnection(host, {
        probe: () => projects.getMyself(),
        log: (message) => console.error(message),
    });

    if (first.kind === 'failed' && first.failure === 'auth') {
        console.error('  疎通確認を省略して起動する場合は BACKLOG_SKIP_STARTUP_CHECK=1 を設定してください。');
        process.exit(1);
    }

    // 背景の再試行で認証失敗が判明した場合も、原因を出して終了する
    retrying?.then((outcome) => {
        if (outcome.kind === 'failed' && outcome.failure === 'auth') process.exit(1);
    }).catch((error: unknown) => {
        console.error('[backlog-integration] 疎通確認の再試行中に想定外のエラーが発生しました:', error);
    });
}

async function main() {
    // 環境変数の検証（前後の空白除去とスペースIDの正規化を含む）
    let config;
    try {
        config = resolveBacklogConfig(process.env.BACKLOG_SPACE_ID, process.env.BACKLOG_API_KEY);
    } catch (error) {
        console.error(`エラー: ${error instanceof Error ? error.message : String(error)}`);
        console.error('');
        console.error('例:');
        console.error('  BACKLOG_SPACE_ID=your-space BACKLOG_API_KEY=your-api-key node dist/index.js');
        console.error('');
        console.error('BACKLOG_SPACE_ID には "your-space" のほか "your-space.backlog.jp" や');
        console.error('"https://your-space.backlog.com" の形式も指定できます。');
        process.exit(1);
    }

    // Backlog クライアントの初期化
    const apiClient = new BacklogApiClient(config);
    const projectService = new ProjectService(apiClient);
    const ctx: ToolContext = {
        api: apiClient,
        issues: new IssueService(apiClient),
        documents: new DocumentService(apiClient),
        projects: projectService,
        resolver: new IssueFieldResolver(projectService),
    };

    // 起動時に認証と接続先を確認する（失敗したら原因を出して終了する）
    await verifyConnection(projectService, apiClient.getHost());

    // MCPサーバーの作成
    const server = new McpServer({
        name: 'backlog-integration',
        version: '1.0.0',
    });

    // ツールの登録（課題）
    registerGetIssueTool(server, ctx);
    registerListIssuesTool(server, ctx);
    registerCountIssuesTool(server, ctx);
    registerAddCommentTool(server, ctx);
    registerAssignToReporterTool(server, ctx);
    registerUpdateIssueTool(server, ctx);
    registerDownloadAttachmentTool(server, ctx);
    registerDownloadIssueAttachmentsTool(server, ctx);
    registerListIssueAttachmentsTool(server, ctx);
    registerGetCommentTool(server, ctx);
    registerListCommentsTool(server, ctx);
    registerUpdateCommentTool(server, ctx);
    registerDeleteCommentTool(server, ctx);
    registerCountCommentsTool(server, ctx);
    registerCreateIssueTool(server, ctx);
    registerUploadAttachmentTool(server, ctx);
    registerDeleteIssueAttachmentTool(server, ctx);

    // ツールの登録（プロジェクトのメタ情報・自分自身）
    registerGetProjectTool(server, ctx);
    registerListProjectUsersTool(server, ctx);
    registerListMilestonesTool(server, ctx);
    registerListStatusesTool(server, ctx);
    registerListIssueTypesTool(server, ctx);
    registerListCategoriesTool(server, ctx);
    registerListPrioritiesTool(server, ctx);
    registerGetMyselfTool(server, ctx);

    // ツールの登録（ドキュメント）
    registerGetDocumentTool(server, ctx);
    registerListDocumentsTool(server, ctx);
    registerGetDocumentTreeTool(server, ctx);
    registerAddDocumentTool(server, ctx);
    registerDownloadDocumentAttachmentTool(server, ctx);
    registerDownloadDocumentMarkdownTool(server, ctx);
    registerUploadDocumentMarkdownTool(server, ctx);
    registerDeleteDocumentAttachmentTool(server, ctx);

    // Stdioトランスポートで起動
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error('MCPサーバーの起動に失敗しました:', error);
    process.exit(1);
});
