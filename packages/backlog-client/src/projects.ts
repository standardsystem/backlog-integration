import type { Entity } from 'backlog-js';
import type { BacklogApiClient } from './client.js';
import type { AddMilestoneOptions, AddIssueTypeOptions, AddStatusOptions } from './types.js';

/**
 * Backlog プロジェクトのメタ情報モジュール
 *
 * 課題の作成・更新で必要になる ID（担当者・マイルストーン・ステータス・課題種別・
 * カテゴリ・優先度）を名前から引くための参照操作と、プロジェクト設定
 * （マイルストーン・カテゴリ・課題種別・状態）の追加・削除を提供します。
 *
 * 追加・削除には Backlog の管理者権限またはプロジェクト管理者権限が必要です
 * （権限が無い場合は HTTP 403 になります）。削除は取り消せません。
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
 * const category = await projects.addCategory('PROJECT', '朝会');
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

    /**
     * マイルストーン（バージョン）を追加する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param options - 名前・説明・開始日・期限日
     * @returns 追加されたマイルストーン
     */
    async addMilestone(
        projectIdOrKey: string | number,
        options: AddMilestoneOptions,
    ): Promise<Entity.Project.Version> {
        const backlog = this.client.getClient();
        return await backlog.postVersions(projectIdOrKey, {
            name: options.name,
            ...(options.description !== undefined ? { description: options.description } : {}),
            ...(options.startDate !== undefined ? { startDate: options.startDate } : {}),
            ...(options.releaseDueDate !== undefined ? { releaseDueDate: options.releaseDueDate } : {}),
        });
    }

    /**
     * マイルストーン（バージョン）を削除する
     *
     * 取り消せません。課題に設定されていたマイルストーンは外れます。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param milestoneId - マイルストーンID
     * @returns 削除されたマイルストーン
     */
    async deleteMilestone(projectIdOrKey: string | number, milestoneId: number): Promise<Entity.Project.Version> {
        const backlog = this.client.getClient();
        return await backlog.deleteVersions(projectIdOrKey, milestoneId);
    }

    /**
     * カテゴリを追加する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param name - カテゴリ名
     * @returns 追加されたカテゴリ
     */
    async addCategory(projectIdOrKey: string | number, name: string): Promise<Entity.Project.Category> {
        const backlog = this.client.getClient();
        return await backlog.postCategories(projectIdOrKey, { name });
    }

    /**
     * カテゴリを削除する
     *
     * 取り消せません。課題に設定されていたカテゴリは外れます。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param categoryId - カテゴリID
     * @returns 削除されたカテゴリ
     */
    async deleteCategory(projectIdOrKey: string | number, categoryId: number): Promise<Entity.Project.Category> {
        const backlog = this.client.getClient();
        return await backlog.deleteCategories(projectIdOrKey, categoryId);
    }

    /**
     * 課題種別を追加する
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param options - 名前と色（`ISSUE_TYPE_COLORS` のいずれか）
     * @returns 追加された課題種別
     */
    async addIssueType(projectIdOrKey: string | number, options: AddIssueTypeOptions): Promise<Entity.Issue.IssueType> {
        const backlog = this.client.getClient();
        return await backlog.postIssueType(projectIdOrKey, { name: options.name, color: options.color });
    }

    /**
     * 課題種別を削除する
     *
     * 取り消せません。削除する種別を使っている課題は `substituteIssueTypeId` の種別に移ります。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param issueTypeId - 削除する課題種別ID
     * @param substituteIssueTypeId - 代わりに割り当てる課題種別ID
     * @returns 削除された課題種別
     */
    async deleteIssueType(
        projectIdOrKey: string | number,
        issueTypeId: number,
        substituteIssueTypeId: number,
    ): Promise<Entity.Issue.IssueType> {
        if (issueTypeId === substituteIssueTypeId) {
            throw new Error(
                `削除する課題種別（ID: ${issueTypeId}）と代わりの課題種別が同じです。別の課題種別を指定してください。`,
            );
        }
        const backlog = this.client.getClient();
        return await backlog.deleteIssueType(projectIdOrKey, issueTypeId, { substituteIssueTypeId });
    }

    /**
     * 状態（カスタムステータス）を追加する
     *
     * カスタムステータスはスタンダードプラン以上でのみ使えます。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param options - 名前と色（`PROJECT_STATUS_COLORS` のいずれか）
     * @returns 追加された状態
     */
    async addStatus(projectIdOrKey: string | number, options: AddStatusOptions): Promise<Entity.Project.ProjectStatus> {
        const backlog = this.client.getClient();
        return await backlog.postProjectStatus(projectIdOrKey, { name: options.name, color: options.color });
    }

    /**
     * 状態（カスタムステータス）を削除する
     *
     * 取り消せません。削除する状態の課題は `substituteStatusId` の状態に移ります。
     * 既定の 4 状態（未対応・処理中・処理済み・完了）は削除できません。
     *
     * @param projectIdOrKey - プロジェクトID または プロジェクトキー
     * @param statusId - 削除する状態ID
     * @param substituteStatusId - 代わりに割り当てる状態ID
     * @returns 削除された状態
     */
    async deleteStatus(
        projectIdOrKey: string | number,
        statusId: number,
        substituteStatusId: number,
    ): Promise<Entity.Project.ProjectStatus> {
        const backlog = this.client.getClient();
        return await backlog.deleteProjectStatus(projectIdOrKey, statusId, substituteStatusId);
    }
}
