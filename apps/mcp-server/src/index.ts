#!/usr/bin/env node

/**
 * Backlog連携 MCPサーバー
 *
 * StdioトランスポートでBacklog操作ツールを提供します。
 *
 * 環境変数:
 * - BACKLOG_SPACE_ID: BacklogスペースID
 * - BACKLOG_API_KEY: Backlog APIキー
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
} from '@backlog-integration/backlog-client';

import type { ToolContext } from './lib/context.js';
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

async function main() {
    // 環境変数の検証
    const spaceId = process.env.BACKLOG_SPACE_ID;
    const apiKey = process.env.BACKLOG_API_KEY;

    if (!spaceId || !apiKey) {
        console.error('エラー: 環境変数 BACKLOG_SPACE_ID と BACKLOG_API_KEY を設定してください。');
        console.error('');
        console.error('例:');
        console.error('  BACKLOG_SPACE_ID=your-space BACKLOG_API_KEY=your-api-key node dist/index.js');
        process.exit(1);
    }

    // Backlog クライアントの初期化
    const apiClient = new BacklogApiClient({ spaceId, apiKey });
    const ctx: ToolContext = {
        api: apiClient,
        issues: new IssueService(apiClient),
        documents: new DocumentService(apiClient),
        projects: new ProjectService(apiClient),
    };

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
