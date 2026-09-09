import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BacklogApiClient } from '@backlog-integration/backlog-client';

import { toIssueSummary, formatIssue, toIssueWriteResult, collectIssueWarnings } from '../src/lib/issue-format.js';

const api = new BacklogApiClient({ spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' });

const ISSUE = {
    id: 1001,
    projectId: 77,
    issueKey: 'PROJ-12',
    summary: '親課題',
    description: '本文',
    status: { id: 4, name: '完了' },
    assignee: { id: 5, name: '山田 太郎' },
    createdUser: { id: 9, name: '鈴木 花子' },
    priority: { id: 3, name: '中' },
    issueType: { id: 21, name: 'タスク' },
    milestone: [{ id: 31, name: 'v1.0' }],
    resolution: { id: 0, name: '対応済み' },
    parentIssueId: 1000,
    startDate: '2026-09-01',
    dueDate: '2026-09-30',
    created: '2026-09-01T00:00:00Z',
    updated: '2026-09-05T00:00:00Z',
    attachments: [{ id: 1 }],
};

describe('toIssueSummary', () => {
    test('判定に必要な項目を含む', () => {
        const summary = toIssueSummary(ISSUE, api);
        assert.equal(summary.id, 1001);
        assert.equal(summary.issueKey, 'PROJ-12');
        assert.deepEqual(summary.status, { id: 4, name: '完了' });
        assert.deepEqual(summary.assignee, { id: 5, name: '山田 太郎' });
        assert.deepEqual(summary.createdUser, { id: 9, name: '鈴木 花子' });
        assert.deepEqual(summary.milestone, [{ id: 31, name: 'v1.0' }]);
        assert.deepEqual(summary.resolution, { id: 0, name: '対応済み' });
        assert.equal(summary.parentIssueId, 1000);
        assert.equal(summary.dueDate, '2026-09-30');
        assert.equal(summary.url, 'https://my-space.backlog.jp/view/PROJ-12');
    });

    test('未設定の参照は null になる', () => {
        const summary = toIssueSummary({ ...ISSUE, assignee: null, resolution: undefined, milestone: null, dueDate: null }, api);
        assert.equal(summary.assignee, null);
        assert.equal(summary.resolution, null);
        assert.deepEqual(summary.milestone, []);
        assert.equal(summary.dueDate, null);
    });

    test('既定のサマリに description は含まない', () => {
        assert.equal('description' in toIssueSummary(ISSUE, api), false);
    });
});

describe('formatIssue', () => {
    test('fields 未指定なら既定のサマリ', () => {
        assert.deepEqual(formatIssue(ISSUE, api), toIssueSummary(ISSUE, api));
    });

    test('fields で項目を絞る', () => {
        const picked = formatIssue(ISSUE, api, ['issueKey', 'dueDate']) as Record<string, unknown>;
        assert.deepEqual(Object.keys(picked), ['issueKey', 'dueDate']);
    });

    test('既定サマリに無い項目は生レスポンスから拾う', () => {
        const picked = formatIssue(ISSUE, api, ['description', 'projectId']) as Record<string, unknown>;
        assert.equal(picked.description, '本文');
        assert.equal(picked.projectId, 77);
    });

    test('["*"] で生レスポンスを返し、url を足す', () => {
        const raw = formatIssue(ISSUE, api, ['*']) as Record<string, unknown>;
        assert.equal(raw.description, '本文');
        assert.deepEqual(raw.attachments, [{ id: 1 }]);
        assert.equal(raw.url, 'https://my-space.backlog.jp/view/PROJ-12');
    });

    test('空配列の fields は既定のサマリと同じ', () => {
        assert.deepEqual(formatIssue(ISSUE, api, []), toIssueSummary(ISSUE, api));
    });
});

describe('toIssueWriteResult', () => {
    test('後続処理に必要な項目と message を返す', () => {
        const result = toIssueWriteResult(ISSUE, api, '課題 PROJ-12 を更新しました。');
        assert.equal(result.id, 1001);
        assert.equal(result.issueKey, 'PROJ-12');
        assert.equal(result.url, 'https://my-space.backlog.jp/view/PROJ-12');
        assert.deepEqual(result.milestone, [{ id: 31, name: 'v1.0' }]);
        assert.match(String(result.message), /課題 PROJ-12 を更新しました。/);
        assert.match(String(result.message), /件名: 親課題/);
        assert.match(String(result.message), /マイルストーン: v1\.0/);
    });

    test('未設定の項目は message に「未設定」と出す', () => {
        const result = toIssueWriteResult({ ...ISSUE, dueDate: null, milestone: [], assignee: null }, api, '見出し');
        assert.match(String(result.message), /期限日: 未設定/);
        assert.match(String(result.message), /マイルストーン: 未設定/);
        assert.match(String(result.message), /担当者: 未割当/);
    });
});

describe('collectIssueWarnings', () => {
    test('期限日とマイルストーンが揃っていれば警告なし', () => {
        assert.deepEqual(collectIssueWarnings(ISSUE), []);
    });

    test('期限日が無ければ警告する', () => {
        assert.deepEqual(collectIssueWarnings({ ...ISSUE, dueDate: null }), ['dueDate 未設定']);
    });

    test('マイルストーンが無ければ警告する', () => {
        assert.deepEqual(collectIssueWarnings({ ...ISSUE, milestone: [] }), ['milestone 未設定']);
    });

    test('両方無ければ 2 件警告する', () => {
        assert.deepEqual(
            collectIssueWarnings({ ...ISSUE, dueDate: null, milestone: undefined }),
            ['dueDate 未設定', 'milestone 未設定'],
        );
    });
});
