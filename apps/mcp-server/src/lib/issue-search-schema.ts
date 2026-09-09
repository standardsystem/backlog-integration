import { z } from 'zod';
import type { ListIssuesOptions, IssueParentChild } from '@backlog-integration/backlog-client';

/**
 * 親子課題の絞込を名前で指定できるようにするための対応表
 *
 * Backlog API は 0〜10 の数値で指定しますが、数値のままでは意味が分からないため
 * 名前でも指定できるようにしています。
 */
const PARENT_CHILD_BY_NAME: Record<string, IssueParentChild> = {
    all: 0,
    notChild: 1,
    childOrGrandchild: 2,
    standalone: 3,
    hasChildren: 4,
    grandchildOnly: 5,
    childOnly: 6,
    topLevelOnly: 7,
    excludeGrandchild: 8,
    excludeTopLevel: 9,
    leafOnly: 10,
};

const PARENT_CHILD_NAMES = Object.keys(PARENT_CHILD_BY_NAME) as [string, ...string[]];

/** YYYY-MM-DD 形式の日付文字列 */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式で指定してください');

/**
 * `list_issues` / `count_issues` で共通の絞込条件スキーマ
 *
 * Backlog API「課題一覧の取得」のパラメータに対応します。
 * @see https://developer.nulab.com/docs/backlog/api/2/get-issue-list/
 */
export const issueSearchSchema = {
    projectIdOrKey: z.string().optional()
        .describe('プロジェクトIDまたはキー（例: PROJECT）。省略するとスペース全体を横断して検索します'),
    id: z.array(z.number()).optional()
        .describe('課題IDの配列（特定の課題だけを取得する場合）'),
    parentIssueId: z.array(z.number()).optional()
        .describe('親課題IDの配列（指定した課題の子課題に絞り込む）'),
    issueTypeId: z.array(z.number()).optional()
        .describe('課題タイプIDの配列（list_issue_types で取得）'),
    categoryId: z.array(z.number()).optional()
        .describe('カテゴリIDの配列（list_categories で取得）'),
    versionId: z.array(z.number()).optional()
        .describe('発生バージョンIDの配列（list_milestones で取得）'),
    milestoneId: z.array(z.number()).optional()
        .describe('マイルストーンIDの配列（list_milestones で取得）'),
    statusId: z.array(z.number()).optional()
        .describe('状態IDの配列（1:未対応, 2:処理中, 3:処理済み, 4:完了。カスタムステータスは list_statuses で取得）'),
    priorityId: z.array(z.number()).optional()
        .describe('優先度IDの配列（2:高, 3:中, 4:低）'),
    resolutionId: z.array(z.number()).optional()
        .describe('完了理由IDの配列（0:対応済み, 1:対応しない, 2:無効, 3:重複, 4:再現しない）'),
    assigneeId: z.array(z.number()).optional()
        .describe('担当者IDの配列（list_project_users で取得）'),
    createdUserId: z.array(z.number()).optional()
        .describe('登録者IDの配列（list_project_users で取得）'),
    parentChild: z.union([z.number().int().min(0).max(10), z.enum(PARENT_CHILD_NAMES)]).optional()
        .describe('親子課題の絞込。all(0) / notChild(1) / childOrGrandchild(2) / standalone(3) / hasChildren(4) / grandchildOnly(5) / childOnly(6) / topLevelOnly(7) / excludeGrandchild(8) / excludeTopLevel(9) / leafOnly(10)'),
    attachment: z.boolean().optional()
        .describe('true:添付ファイルあり / false:添付ファイルなし'),
    sharedFile: z.boolean().optional()
        .describe('true:共有ファイルあり / false:共有ファイルなし'),
    hasDueDate: z.boolean().optional()
        .describe('true:期限日あり / false:期限日なし（期限日未設定の課題を洗い出すときに使う）'),
    createdSince: dateString.optional().describe('登録日の下限（YYYY-MM-DD）'),
    createdUntil: dateString.optional().describe('登録日の上限（YYYY-MM-DD）'),
    updatedSince: dateString.optional().describe('更新日の下限（YYYY-MM-DD）'),
    updatedUntil: dateString.optional().describe('更新日の上限（YYYY-MM-DD）'),
    startDateSince: dateString.optional().describe('開始日の下限（YYYY-MM-DD）'),
    startDateUntil: dateString.optional().describe('開始日の上限（YYYY-MM-DD）'),
    dueDateSince: dateString.optional().describe('期限日の下限（YYYY-MM-DD）'),
    dueDateUntil: dateString.optional().describe('期限日の上限（YYYY-MM-DD）'),
    keyword: z.string().optional().describe('キーワード検索'),
};

/** `issueSearchSchema` から推論した入力型 */
export type IssueSearchInput = {
    [K in keyof typeof issueSearchSchema]?: z.infer<(typeof issueSearchSchema)[K]>;
};

/**
 * MCP ツールの入力を `ListIssuesOptions` に変換する
 *
 * `parentChild` は名前指定を数値に読み替えます。
 *
 * @param input - ツールが受け取った絞込条件
 * @returns backlog-client に渡す検索条件
 */
export function toListIssuesOptions(input: IssueSearchInput): ListIssuesOptions {
    const parentChild = input.parentChild === undefined
        ? undefined
        : typeof input.parentChild === 'number'
            ? (input.parentChild as IssueParentChild)
            : PARENT_CHILD_BY_NAME[input.parentChild];

    return {
        projectIdOrKey: input.projectIdOrKey,
        id: input.id,
        parentIssueId: input.parentIssueId,
        issueTypeId: input.issueTypeId,
        categoryId: input.categoryId,
        versionId: input.versionId,
        milestoneId: input.milestoneId,
        statusId: input.statusId,
        priorityId: input.priorityId,
        resolutionId: input.resolutionId,
        assigneeId: input.assigneeId,
        createdUserId: input.createdUserId,
        parentChild,
        attachment: input.attachment,
        sharedFile: input.sharedFile,
        hasDueDate: input.hasDueDate,
        createdSince: input.createdSince,
        createdUntil: input.createdUntil,
        updatedSince: input.updatedSince,
        updatedUntil: input.updatedUntil,
        startDateSince: input.startDateSince,
        startDateUntil: input.startDateUntil,
        dueDateSince: input.dueDateSince,
        dueDateUntil: input.dueDateUntil,
        keyword: input.keyword,
    };
}
