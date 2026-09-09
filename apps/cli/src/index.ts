#!/usr/bin/env node

/**
 * Backlog連携 CLIツール
 *
 * 環境変数またはカレントディレクトリの .env ファイルから
 * BACKLOG_SPACE_ID と BACKLOG_API_KEY を読み込みます。
 *
 * 使用例:
 *   backlog-cli issue get PROJECT-123
 *   backlog-cli issue list PROJECT --status 1 2
 *   backlog-cli issue comment PROJECT-123 "対応しました"
 *   backlog-cli issue assign-reporter PROJECT-123
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import {
    BacklogApiClient,
    IssueService,
    resolveBacklogConfig,
    formatBacklogError,
    type ListIssuesOptions,
} from '@backlog-integration/backlog-client';

// .env ファイルの読み込み（dotenv 17 以降は既定でログを出力するため quiet を指定）
dotenv.config({ quiet: true });

function createClient(): { apiClient: BacklogApiClient; issueService: IssueService } {
    let config;
    try {
        // 前後の空白除去とスペースIDの正規化（URL・ドメイン付きの指定にも対応）
        config = resolveBacklogConfig(process.env.BACKLOG_SPACE_ID, process.env.BACKLOG_API_KEY);
    } catch (error) {
        console.error(`エラー: ${error instanceof Error ? error.message : String(error)}`);
        console.error('');
        console.error('.env ファイルまたは環境変数で設定できます:');
        console.error('  BACKLOG_SPACE_ID=your-space');
        console.error('  BACKLOG_API_KEY=your-api-key');
        process.exit(1);
    }

    const apiClient = new BacklogApiClient(config);
    const issueService = new IssueService(apiClient);
    return { apiClient, issueService };
}

/**
 * 例外を原因が分かる形で表示して終了する
 *
 * @param error - 捕捉した例外
 */
function exitWithError(error: unknown): never {
    console.error('エラー:', formatBacklogError(error));
    process.exit(1);
}

const program = new Command();

program
    .name('backlog-cli')
    .description('Backlog連携CLIツール')
    .version('1.0.0');

// --- issue サブコマンドグループ ---
const issueCmd = program
    .command('issue')
    .description('課題に関する操作');

// issue get <issueIdOrKey>
issueCmd
    .command('get <issueIdOrKey>')
    .description('課題の詳細を取得する')
    .action(async (issueIdOrKey: string) => {
        const { issueService } = createClient();
        try {
            const issue = await issueService.getIssue(issueIdOrKey);
            console.log(JSON.stringify(issue, null, 2));
        } catch (error) {
            exitWithError(error);
        }
    });

// issue list <projectIdOrKey>
issueCmd
    .command('list <projectIdOrKey>')
    .description('課題の一覧を取得する')
    .option('--status <statusIds...>', '状態ID (1:未対応, 2:処理中, 3:処理済み, 4:完了)')
    .option('--assignee <assigneeIds...>', '担当者ID')
    .option('--parent-issue <parentIssueIds...>', '親課題ID (指定した課題の子課題に絞り込む)')
    .option('--milestone <milestoneIds...>', 'マイルストーンID')
    .option('--keyword <keyword>', 'キーワード検索')
    .option('--count <count>', '取得件数 (最大100)', '20')
    .option('--offset <offset>', '取得開始位置 (ページング用)')
    .option('--sort <sort>', 'ソートキー')
    .option('--order <order>', 'ソート順 (asc/desc)')
    .action(async (projectIdOrKey: string, options: {
        status?: string[];
        assignee?: string[];
        parentIssue?: string[];
        milestone?: string[];
        keyword?: string;
        count?: string;
        offset?: string;
        sort?: string;
        order?: string;
    }) => {
        const { apiClient, issueService } = createClient();
        try {
            const issues = await issueService.listIssues({
                projectIdOrKey,
                statusId: options.status?.map(Number),
                assigneeId: options.assignee?.map(Number),
                parentIssueId: options.parentIssue?.map(Number),
                milestoneId: options.milestone?.map(Number),
                keyword: options.keyword,
                count: options.count ? Number(options.count) : undefined,
                offset: options.offset ? Number(options.offset) : undefined,
                sort: options.sort as ListIssuesOptions['sort'],
                order: options.order as 'asc' | 'desc' | undefined,
            });

            // サマリ形式で出力
            const summary = (issues as Array<{
                id?: number;
                issueKey?: string;
                summary?: string;
                status?: { id?: number; name?: string };
                assignee?: { name?: string } | null;
                priority?: { name?: string };
                milestone?: Array<{ name?: string }>;
                parentIssueId?: number;
                dueDate?: string | null;
            }>).map((issue) => ({
                id: issue.id,
                key: issue.issueKey,
                summary: issue.summary,
                status: issue.status?.name,
                statusId: issue.status?.id,
                assignee: issue.assignee?.name ?? '未割当',
                priority: issue.priority?.name,
                milestone: (issue.milestone ?? []).map((m) => m.name),
                parentIssueId: issue.parentIssueId ?? null,
                dueDate: issue.dueDate ?? null,
                url: apiClient.getIssueUrl(issue.issueKey),
            }));

            console.log(JSON.stringify(summary, null, 2));
        } catch (error) {
            exitWithError(error);
        }
    });

// issue count <projectIdOrKey>
issueCmd
    .command('count <projectIdOrKey>')
    .description('条件に一致する課題の総件数を取得する')
    .option('--status <statusIds...>', '状態ID (1:未対応, 2:処理中, 3:処理済み, 4:完了)')
    .option('--assignee <assigneeIds...>', '担当者ID')
    .option('--parent-issue <parentIssueIds...>', '親課題ID (指定した課題の子課題に絞り込む)')
    .option('--milestone <milestoneIds...>', 'マイルストーンID')
    .option('--keyword <keyword>', 'キーワード検索')
    .action(async (projectIdOrKey: string, options: {
        status?: string[];
        assignee?: string[];
        parentIssue?: string[];
        milestone?: string[];
        keyword?: string;
    }) => {
        const { issueService } = createClient();
        try {
            const count = await issueService.countIssues({
                projectIdOrKey,
                statusId: options.status?.map(Number),
                assigneeId: options.assignee?.map(Number),
                parentIssueId: options.parentIssue?.map(Number),
                milestoneId: options.milestone?.map(Number),
                keyword: options.keyword,
            });
            console.log(JSON.stringify({ count }, null, 2));
        } catch (error) {
            exitWithError(error);
        }
    });

// issue comment <issueIdOrKey> <content>
issueCmd
    .command('comment <issueIdOrKey> <content>')
    .description('課題にコメントを追加する')
    .action(async (issueIdOrKey: string, content: string) => {
        const { issueService } = createClient();
        try {
            const comment = await issueService.addComment(issueIdOrKey, { content });
            console.log(`コメントを追加しました（ID: ${(comment as { id?: number }).id}）`);
        } catch (error) {
            exitWithError(error);
        }
    });

// issue assign-reporter <issueIdOrKey>
issueCmd
    .command('assign-reporter <issueIdOrKey>')
    .description('課題の担当者をレポーター（起票者）に変更する')
    .option('-m, --message <message>', '変更時のコメント')
    .action(async (issueIdOrKey: string, options: { message?: string }) => {
        const { issueService } = createClient();
        try {
            const updatedIssue = await issueService.assignToReporter(issueIdOrKey, options.message);
            const assignee = (updatedIssue as { assignee?: { name?: string } | null }).assignee;
            console.log(`担当者をレポーターに変更しました。`);
            console.log(`新しい担当者: ${assignee?.name ?? '不明'}`);
        } catch (error) {
            exitWithError(error);
        }
    });

program.parse();
