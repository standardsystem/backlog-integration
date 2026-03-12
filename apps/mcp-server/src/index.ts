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
import { BacklogApiClient, IssueService } from '@backlog-integration/backlog-client';

import { registerGetIssueTool } from './tools/get-issue.js';
import { registerListIssuesTool } from './tools/list-issues.js';
import { registerAddCommentTool } from './tools/add-comment.js';
import { registerAssignToReporterTool } from './tools/assign-to-reporter.js';
import { registerUpdateIssueTool } from './tools/update-issue.js';
import { registerDownloadAttachmentTool } from './tools/download-attachment.js';

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
    const issueService = new IssueService(apiClient);

    // MCPサーバーの作成
    const server = new McpServer({
        name: 'backlog-integration',
        version: '1.0.0',
    });

    // ツールの登録
    registerGetIssueTool(server, issueService);
    registerListIssuesTool(server, issueService);
    registerAddCommentTool(server, issueService);
    registerAssignToReporterTool(server, issueService);
    registerUpdateIssueTool(server, issueService);
    registerDownloadAttachmentTool(server, issueService);

    // Stdioトランスポートで起動
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error('MCPサーバーの起動に失敗しました:', error);
    process.exit(1);
});
