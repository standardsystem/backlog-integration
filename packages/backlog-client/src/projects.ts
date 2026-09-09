import type { Entity } from 'backlog-js';
import type { BacklogApiClient } from './client.js';

/**
 * Backlog プロジェクトのメタ情報参照モジュール
 *
 * 課題の作成・更新で必要になる ID（担当者・マイルストーン・ステータス・課題種別・
 * カテゴリ・優先度）を名前から引くための、読み取り専用の操作を提供します。
 *
 * @example
 * ```typescript
 * import { BacklogApiClient, ProjectService } from '@backlog-integration/backlog-client';
 *
 * const apiClient = new BacklogApiClient({ spaceId: '...', apiKey: '...' });
 * const projects = new ProjectService(apiClient);
 *
 * const users = await projects.listProjectUsers('PROJECT');
 * const milestones = await projects.listMilestones('PROJECT');
 * ```
 */
export class ProjectService {
    private readonly client: BacklogApiClient;

    constructor(client: BacklogApiClient) {
        this.client = client;
    }

    /**
     * プロジェクトの詳細を取得する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー（例: "PROJECT"）
     * @returns プロジェクトの詳細（`textFormattingRule` に本文の記法が入る）
     */
    async getProject(projectIdOrKey: string | number): Promise<Entity.Project.Project> {
        const backlog = this.client.getClient();
        return await backlog.getProject(projectIdOrKey);
    }

    /**
     * プロジェクトに参加しているユーザの一覧を取得する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @returns ユーザの配列
     */
    async listProjectUsers(projectIdOrKey: string | number): Promise<Entity.User.User[]> {
        const backlog = this.client.getClient();
        return await backlog.getProjectUsers(projectIdOrKey);
    }

    /**
     * プロジェクトのマイルストーン（バージョン）一覧を取得する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param includeArchived - true のときアーカイブ済みも含める（既定: false）
     * @returns マイルストーンの配列
     */
    async listMilestones(
        projectIdOrKey: string | number,
        includeArchived = false,
    ): Promise<Entity.Project.Version[]> {
        const backlog = this.client.getClient();
        const versions = await backlog.getVersions(projectIdOrKey);
        return includeArchived ? versions : versions.filter((version) => !version.archived);
    }

    /**
     * プロジェクトの状態（ステータス）一覧を取得する
     *
     * カスタムステータスもここに含まれます。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @returns ステータスの配列
     */
    async listStatuses(projectIdOrKey: string | number): Promise<Entity.Project.ProjectStatus[]> {
        const backlog = this.client.getClient();
        return await backlog.getProjectStatuses(projectIdOrKey);
    }

    /**
     * プロジェクトの課題種別一覧を取得する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @returns 課題種別の配列
     */
    async listIssueTypes(projectIdOrKey: string | number): Promise<Entity.Issue.IssueType[]> {
        const backlog = this.client.getClient();
        return await backlog.getIssueTypes(projectIdOrKey);
    }

    /**
     * プロジェクトのカテゴリ一覧を取得する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @returns カテゴリの配列
     */
    async listCategories(projectIdOrKey: string | number): Promise<Entity.Project.Category[]> {
        const backlog = this.client.getClient();
        return await backlog.getCategories(projectIdOrKey);
    }

    /**
     * スペースの優先度一覧を取得する
     *
     * @returns 優先度の配列（既定では 2:高 / 3:中 / 4:低）
     */
    async listPriorities(): Promise<Entity.Issue.Priority[]> {
        const backlog = this.client.getClient();
        return await backlog.getPriorities();
    }

    /**
     * スペースの完了理由一覧を取得する
     *
     * @returns 完了理由の配列
     */
    async listResolutions(): Promise<Entity.Issue.Resolution[]> {
        const backlog = this.client.getClient();
        return await backlog.getResolutions();
    }

    /**
     * 認証に使っているユーザ自身の情報を取得する
     *
     * @returns ユーザ情報（`id` / `userId` / `name` / `mailAddress` / `roleType`）
     */
    async getMyself(): Promise<Entity.User.User> {
        const backlog = this.client.getClient();
        return await backlog.getMyself();
    }
}
