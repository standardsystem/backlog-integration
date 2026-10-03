import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { BacklogApiClient } from '../src/client.js';
import { ProjectService } from '../src/projects.js';
import { ISSUE_TYPE_COLORS, PROJECT_STATUS_COLORS } from '../src/types.js';

/**
 * backlog-js クライアントを差し替えた ProjectService を作る
 *
 * @param stub - backlog-js クライアントの代わりに使うオブジェクト
 * @returns サービス
 */
function makeService(stub: Record<string, unknown>) {
    const client = new BacklogApiClient({ spaceId: 's', apiKey: 'k' });
    (client as unknown as { getClient: () => unknown }).getClient = () => stub;
    return new ProjectService(client);
}

describe('ProjectService のプロジェクト設定の追加・削除', () => {
    test('addMilestone は指定した項目だけを postVersions に渡す', async () => {
        let received: unknown[] = [];
        const projects = makeService({
            postVersions: async (...args: unknown[]) => { received = args; return { id: 1, name: 'm' }; },
        });

        await projects.addMilestone('PROJ', { name: 'フェーズ1' });
        assert.deepEqual(received, ['PROJ', { name: 'フェーズ1' }], 'undefined の項目を送らないこと');

        await projects.addMilestone('PROJ', { name: 'フェーズ2', description: '説明', startDate: '2026-10-01', releaseDueDate: '2026-12-31' });
        assert.deepEqual(received, ['PROJ', { name: 'フェーズ2', description: '説明', startDate: '2026-10-01', releaseDueDate: '2026-12-31' }]);
    });

    test('addCategory は postCategories に name を渡す', async () => {
        let received: unknown[] = [];
        const projects = makeService({
            postCategories: async (...args: unknown[]) => { received = args; return { id: 2, name: '朝会' }; },
        });
        const category = await projects.addCategory(77, '朝会');
        assert.deepEqual(received, [77, { name: '朝会' }]);
        assert.equal(category.id, 2);
    });

    test('addIssueType は postIssueType に name と color を渡す', async () => {
        let received: unknown[] = [];
        const projects = makeService({
            postIssueType: async (...args: unknown[]) => { received = args; return { id: 3, name: 'タスク', color: '#7ea800' }; },
        });
        await projects.addIssueType('PROJ', { name: 'タスク', color: '#7ea800' });
        assert.deepEqual(received, ['PROJ', { name: 'タスク', color: '#7ea800' }]);
    });

    test('addStatus は postProjectStatus に name と color を渡す', async () => {
        let received: unknown[] = [];
        const projects = makeService({
            postProjectStatus: async (...args: unknown[]) => { received = args; return { id: 4, name: '待ち', color: '#eda62a' }; },
        });
        await projects.addStatus('PROJ', { name: '待ち', color: '#eda62a' });
        assert.deepEqual(received, ['PROJ', { name: '待ち', color: '#eda62a' }]);
    });

    test('deleteIssueType は substituteIssueTypeId を params で渡す', async () => {
        let received: unknown[] = [];
        const projects = makeService({
            deleteIssueType: async (...args: unknown[]) => { received = args; return { id: 22, name: 'バグ' }; },
        });
        const deleted = await projects.deleteIssueType('PROJ', 22, 21);
        assert.deepEqual(received, ['PROJ', 22, { substituteIssueTypeId: 21 }]);
        assert.equal(deleted.name, 'バグ');
    });

    test('deleteIssueType は削除対象と代わりが同じなら API を呼ばない', async () => {
        let called = false;
        const projects = makeService({
            deleteIssueType: async () => { called = true; return {}; },
        });
        await assert.rejects(() => projects.deleteIssueType('PROJ', 21, 21), /代わりの課題種別が同じです/);
        assert.equal(called, false);
    });

    test('deleteMilestone / deleteCategory / deleteStatus が対応する API を呼ぶ', async () => {
        const received: Record<string, unknown[]> = {};
        const projects = makeService({
            deleteVersions: async (...args: unknown[]) => { received.version = args; return { id: 1 }; },
            deleteCategories: async (...args: unknown[]) => { received.category = args; return { id: 2 }; },
            deleteProjectStatus: async (...args: unknown[]) => { received.status = args; return { id: 3 }; },
        });
        await projects.deleteMilestone('PROJ', 1);
        await projects.deleteCategory('PROJ', 2);
        await projects.deleteStatus('PROJ', 3, 1);
        assert.deepEqual(received, { version: ['PROJ', 1], category: ['PROJ', 2], status: ['PROJ', 3, 1] });
    });

    test('色の一覧は 10 色ずつで重複が無い', () => {
        assert.equal(new Set(ISSUE_TYPE_COLORS).size, 10);
        assert.equal(new Set(PROJECT_STATUS_COLORS).size, 10);
        for (const color of [...ISSUE_TYPE_COLORS, ...PROJECT_STATUS_COLORS]) {
            assert.match(color, /^#[0-9a-f]{6}$/, '小文字の 6 桁の色コードであること');
        }
    });
});
