import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { describeBacklogError, formatBacklogError } from '../src/errors.js';

/** backlog-js の BacklogError を模したエラー（name / status / body を持つ） */
class FakeBacklogError extends Error {
    private readonly errorName: string;
    readonly status: number;
    readonly body?: { errors: Array<{ message: string; code?: number }> };
    readonly response?: { headers: Headers };

    constructor(
        errorName: string,
        status: number,
        message: string,
        errors?: Array<{ message: string; code?: number }>,
        headers?: Record<string, string>,
    ) {
        super(message);
        this.errorName = errorName;
        this.status = status;
        if (errors) this.body = { errors };
        if (headers) this.response = { headers: new Headers(headers) };
    }

    override get name(): string {
        return this.errorName;
    }
}

describe('describeBacklogError', () => {
    test('401 を認証失敗として分類する', () => {
        const detail = describeBacklogError(new FakeBacklogError('BacklogAuthError', 401, 'Unauthorized'));
        assert.equal(detail.status, 401);
        assert.equal(detail.category, '認証失敗');
        assert.match(detail.remedy ?? '', /BACKLOG_API_KEY/);
    });

    test('403 を権限不足として分類する', () => {
        assert.equal(describeBacklogError(new FakeBacklogError('BacklogApiError', 403, 'Forbidden')).category, '権限不足');
    });

    test('404 を対象なしとして分類する', () => {
        assert.equal(describeBacklogError(new FakeBacklogError('BacklogApiError', 404, 'Not Found')).category, '対象が見つかりません');
    });

    test('429 をレート制限として分類する', () => {
        assert.equal(describeBacklogError(new FakeBacklogError('BacklogApiError', 429, 'Too Many Requests')).category, 'レート制限');
    });

    test('5xx を Backlog 側のエラーとして分類する', () => {
        assert.equal(describeBacklogError(new FakeBacklogError('BacklogApiError', 503, 'Unavailable')).category, 'Backlog 側のエラー');
    });

    test('Backlog の errors[] を保持する', () => {
        const detail = describeBacklogError(
            new FakeBacklogError('BacklogApiError', 400, 'Bad Request', [{ message: 'No comment content.', code: 7 }]),
        );
        assert.deepEqual(detail.errors, [{ message: 'No comment content.', code: 7 }]);
    });

    test('Retry-After（秒数）を読み取る', () => {
        const detail = describeBacklogError(
            new FakeBacklogError('BacklogApiError', 429, 'Too Many Requests', undefined, { 'retry-after': '30' }),
        );
        assert.equal(detail.retryAfterMs, 30000);
    });

    test('Retry-After が無ければ undefined', () => {
        assert.equal(describeBacklogError(new FakeBacklogError('BacklogApiError', 429, 'x')).retryAfterMs, undefined);
    });

    test('ネットワーク不通を接続不可として分類する', () => {
        const error = new TypeError('fetch failed');
        (error as { cause?: unknown }).cause = new Error('getaddrinfo ENOTFOUND nope.backlog.com');
        const detail = describeBacklogError(error);
        assert.equal(detail.category, '接続不可');
        assert.equal(detail.status, undefined);
    });

    test('通常の Error はそのまま扱う', () => {
        const detail = describeBacklogError(new Error('boom'));
        assert.equal(detail.category, 'エラー');
        assert.equal(detail.message, 'boom');
        assert.deepEqual(detail.errors, []);
    });
});

describe('formatBacklogError', () => {
    test('HTTP ステータス・Backlog のメッセージ・対処を含む', () => {
        const text = formatBacklogError(
            new FakeBacklogError('BacklogAuthError', 401, 'Unauthorized', [{ message: 'Authentication failure.', code: 11 }]),
        );
        assert.match(text, /HTTP 401/);
        assert.match(text, /認証失敗/);
        assert.match(text, /Authentication failure\. \(code: 11\)/);
        assert.match(text, /対処:/);
    });

    test('ステータスが無い場合は分類だけを出す', () => {
        assert.equal(formatBacklogError(new Error('boom')), 'エラー: boom');
    });
});
