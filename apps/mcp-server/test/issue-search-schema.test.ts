import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { issueSearchSchema, toListIssuesOptions } from '../src/lib/issue-search-schema.js';

describe('issueSearchSchema', () => {
    test('Backlog API の主要な絞込条件を公開している', () => {
        for (const key of [
            'projectIdOrKey', 'id', 'parentIssueId', 'issueTypeId', 'categoryId', 'versionId',
            'milestoneId', 'statusId', 'priorityId', 'resolutionId', 'assigneeId', 'createdUserId',
            'parentChild', 'attachment', 'sharedFile', 'hasDueDate',
            'createdSince', 'createdUntil', 'updatedSince', 'updatedUntil',
            'startDateSince', 'startDateUntil', 'dueDateSince', 'dueDateUntil', 'keyword',
        ]) {
            assert.ok(key in issueSearchSchema, `${key} が公開されていること`);
        }
    });

    test('projectIdOrKey は省略できる（スペース横断検索）', () => {
        assert.equal(z.object(issueSearchSchema).safeParse({}).success, true);
    });

    test('日付は YYYY-MM-DD 形式のみ受け付ける', () => {
        const schema = z.object(issueSearchSchema);
        assert.equal(schema.safeParse({ dueDateSince: '2026-09-30' }).success, true);
        assert.equal(schema.safeParse({ dueDateSince: '2026/09/30' }).success, false);
        assert.equal(schema.safeParse({ dueDateSince: '20260930' }).success, false);
    });

    test('parentChild は数値と名前の両方を受け付ける', () => {
        const schema = z.object(issueSearchSchema);
        assert.equal(schema.safeParse({ parentChild: 4 }).success, true);
        assert.equal(schema.safeParse({ parentChild: 'hasChildren' }).success, true);
        assert.equal(schema.safeParse({ parentChild: 11 }).success, false);
        assert.equal(schema.safeParse({ parentChild: 'nope' }).success, false);
    });
});

describe('toListIssuesOptions', () => {
    test('絞込条件をそのまま引き継ぐ', () => {
        const options = toListIssuesOptions({
            projectIdOrKey: 'PROJ',
            parentIssueId: [1, 2],
            statusId: [4],
            hasDueDate: false,
            keyword: 'あ',
            dueDateUntil: '2026-12-31',
        });

        assert.equal(options.projectIdOrKey, 'PROJ');
        assert.deepEqual(options.parentIssueId, [1, 2]);
        assert.deepEqual(options.statusId, [4]);
        assert.equal(options.hasDueDate, false, 'false を落とさないこと');
        assert.equal(options.keyword, 'あ');
        assert.equal(options.dueDateUntil, '2026-12-31');
    });

    test('parentChild の名前を Backlog API の数値に読み替える', () => {
        assert.equal(toListIssuesOptions({ parentChild: 'all' }).parentChild, 0);
        assert.equal(toListIssuesOptions({ parentChild: 'notChild' }).parentChild, 1);
        assert.equal(toListIssuesOptions({ parentChild: 'childOrGrandchild' }).parentChild, 2);
        assert.equal(toListIssuesOptions({ parentChild: 'hasChildren' }).parentChild, 4);
        assert.equal(toListIssuesOptions({ parentChild: 'leafOnly' }).parentChild, 10);
    });

    test('parentChild の数値はそのまま通す', () => {
        assert.equal(toListIssuesOptions({ parentChild: 7 }).parentChild, 7);
        assert.equal(toListIssuesOptions({ parentChild: 0 }).parentChild, 0, '0 を落とさないこと');
    });

    test('未指定の項目は undefined のまま', () => {
        const options = toListIssuesOptions({});
        assert.equal(options.parentChild, undefined);
        assert.equal(options.hasDueDate, undefined);
        assert.equal(options.projectIdOrKey, undefined);
    });
});
