import { ISSUE_TYPE_COLORS, PROJECT_STATUS_COLORS } from '@backlog-integration/backlog-client';
import type { IssueTypeColor, ProjectStatusColor } from '@backlog-integration/backlog-client';

/**
 * 課題種別の色の見た目（Backlog の課題種別設定画面のパレット順）
 *
 * 色名は目安です。エージェントが「赤系」「青系」のような指示から色コードを選べるようにするためのもので、
 * API はこの表の色コードだけを受け付けます。
 */
const ISSUE_TYPE_COLOR_NAMES: Record<IssueTypeColor, string> = {
    '#e30000': '赤',
    '#990000': '暗い赤',
    '#934981': '紫',
    '#814fbc': '青紫',
    '#2779ca': '青',
    '#007e9a': '青緑',
    '#7ea800': '緑',
    '#ff9200': 'オレンジ',
    '#ff3265': 'ピンク',
    '#666665': 'グレー',
};

/**
 * 状態の色の見た目（Backlog の状態設定画面のパレット順）
 */
const PROJECT_STATUS_COLOR_NAMES: Record<ProjectStatusColor, string> = {
    '#ea2c00': '赤',
    '#e87758': 'オレンジ',
    '#e07b9a': 'ピンク',
    '#868cb7': '薄紫',
    '#3b9dbd': '青',
    '#4caf93': '緑',
    '#b0be3c': '黄緑',
    '#eda62a': '黄',
    '#f42858': '濃いピンク',
    '#393939': '黒',
};

/**
 * 色の候補を「コード（色名）」の並びにする
 *
 * @param colors - 色コードの一覧
 * @param names - 色コードから色名への対応
 * @returns ツールの説明文に埋め込む文字列
 */
function describeColors(colors: readonly string[], names: Record<string, string>): string {
    return colors.map((color) => `${color}（${names[color] ?? '?'}）`).join(', ');
}

/** 課題種別に指定できる色の説明（ツールの説明文用） */
export const ISSUE_TYPE_COLOR_GUIDE = describeColors(ISSUE_TYPE_COLORS, ISSUE_TYPE_COLOR_NAMES);

/** 状態に指定できる色の説明（ツールの説明文用） */
export const PROJECT_STATUS_COLOR_GUIDE = describeColors(PROJECT_STATUS_COLORS, PROJECT_STATUS_COLOR_NAMES);

/** 課題種別の生レスポンスのうち、整形で参照する部分 */
interface RawIssueType {
    id?: number;
    name?: string;
    color?: string;
    displayOrder?: number;
}

/** カテゴリの生レスポンスのうち、整形で参照する部分 */
interface RawCategory {
    id?: number;
    name?: string;
    displayOrder?: number;
}

/**
 * 課題種別を整形する
 *
 * @param issueType - Backlog API の課題種別
 * @returns id / name / color / displayOrder を持つオブジェクト
 */
export function toIssueTypeSummary(issueType: unknown): Record<string, unknown> {
    const raw = issueType as RawIssueType;
    return {
        id: raw.id,
        name: raw.name,
        color: raw.color,
        displayOrder: raw.displayOrder,
    };
}

/**
 * カテゴリを整形する
 *
 * @param category - Backlog API のカテゴリ
 * @returns id / name / displayOrder を持つオブジェクト
 */
export function toCategorySummary(category: unknown): Record<string, unknown> {
    const raw = category as RawCategory;
    return {
        id: raw.id,
        name: raw.name,
        displayOrder: raw.displayOrder,
    };
}
