import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyStartupFailure,
    backoffDelayMs,
    verifyBacklogConnection,
    type StartupProbeUser,
} from '../src/lib/startup-check.js';

const USER: StartupProbeUser = { id: 1, userId: 'bot', name: 'bot' };

/** backlog-js の BacklogError を模したエラー */
class FakeBacklogError extends Error {
    private readonly errorName = 'BacklogApiError';
    constructor(readonly status: number, message = 'x') {
        super(message);
    }
    override get name(): string {
        return this.errorName;
    }
}

/** ログを配列に貯めるロガーと、待機時間を記録する sleep */
function makeHarness() {
    const logs: string[] = [];
    const slept: number[] = [];
    return {
        logs,
        slept,
        log: (message: string) => { logs.push(message); },
        sleep: async (ms: number) => { slept.push(ms); },
    };
}

describe('classifyStartupFailure', () => {
    test('401 は auth（起動を中止する）', () => {
        assert.equal(classifyStartupFailure({ status: 401, category: '認証失敗', message: '', errors: [] }), 'auth');
    });

    test('429 と 5xx は transient（再試行する）', () => {
        assert.equal(classifyStartupFailure({ status: 429, category: '', message: '', errors: [] }), 'transient');
        assert.equal(classifyStartupFailure({ status: 500, category: '', message: '', errors: [] }), 'transient');
        assert.equal(classifyStartupFailure({ status: 503, category: '', message: '', errors: [] }), 'transient');
    });

    test('ステータスが無い（ネットワーク断・タイムアウト）は transient', () => {
        assert.equal(classifyStartupFailure({ category: '接続不可', message: '', errors: [] }), 'transient');
    });

    test('403 / 404 / 400 は permanent（再試行しない）', () => {
        for (const status of [400, 403, 404]) {
            assert.equal(classifyStartupFailure({ status, category: '', message: '', errors: [] }), 'permanent');
        }
    });
});

describe('backoffDelayMs', () => {
    const options = { baseDelayMs: 1000, maxDelayMs: 60000, random: () => 0 };

    test('試行ごとに指数的に伸びる', () => {
        assert.equal(backoffDelayMs(1, options), 500);
        assert.equal(backoffDelayMs(2, options), 1000);
        assert.equal(backoffDelayMs(3, options), 2000);
        assert.equal(backoffDelayMs(4, options), 4000);
    });

    test('ジッタで半分から満額の範囲に散らばる', () => {
        assert.equal(backoffDelayMs(3, { ...options, random: () => 0 }), 2000);
        assert.equal(backoffDelayMs(3, { ...options, random: () => 1 }), 4000);
        assert.equal(backoffDelayMs(3, { ...options, random: () => 0.5 }), 3000);
    });

    test('上限を超えない', () => {
        assert.ok(backoffDelayMs(20, { ...options, random: () => 1 }) <= options.maxDelayMs);
    });

    test('Retry-After があればそれを優先する', () => {
        assert.equal(backoffDelayMs(1, options, 30000), 30000);
    });

    test('Retry-After も上限で頭打ちにする', () => {
        assert.equal(backoffDelayMs(1, options, 999999), 60000);
    });
});

describe('verifyBacklogConnection', () => {
    test('成功したら接続先とユーザを出して終わる', async () => {
        const h = makeHarness();
        const { first, retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => USER,
            log: h.log,
            sleep: h.sleep,
        });

        assert.equal(first.kind, 'ok');
        assert.equal(retrying, null, '再試行しないこと');
        assert.match(h.logs[0], /s\.backlog\.com に接続しました/);
    });

    test('401 は auth を返し、再試行しない（呼び出し側が起動を中止する）', async () => {
        const h = makeHarness();
        let calls = 0;
        const { first, retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => { calls += 1; throw new FakeBacklogError(401, 'Unauthorized'); },
            log: h.log,
            sleep: h.sleep,
        });

        assert.equal(first.kind, 'failed');
        assert.equal(first.kind === 'failed' && first.failure, 'auth');
        assert.equal(retrying, null);
        assert.equal(calls, 1, '再試行しないこと');
        assert.match(h.logs.join('\n'), /認証に失敗/);
    });

    test('403 は起動を続け、再試行もしない', async () => {
        const h = makeHarness();
        let calls = 0;
        const { first, retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => { calls += 1; throw new FakeBacklogError(403, 'Forbidden'); },
            log: h.log,
            sleep: h.sleep,
        });

        assert.equal(first.kind === 'failed' && first.failure, 'permanent');
        assert.equal(retrying, null);
        assert.equal(calls, 1);
        assert.match(h.logs.join('\n'), /このまま起動します/);
    });

    test('一時的な失敗では起動を続け、背景で再試行して回復する', async () => {
        const h = makeHarness();
        let calls = 0;
        const { first, retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => {
                calls += 1;
                if (calls < 3) throw new FakeBacklogError(503, 'Unavailable');
                return USER;
            },
            log: h.log,
            sleep: h.sleep,
            backoff: { baseDelayMs: 1000, maxDelayMs: 60000, random: () => 0 },
        });

        assert.equal(first.kind === 'failed' && first.failure, 'transient');
        assert.ok(retrying, '背景で再試行すること');
        assert.match(h.logs.join('\n'), /起動は継続します/);

        const outcome = await retrying;
        assert.equal(outcome.kind, 'ok');
        assert.equal(calls, 3);
        assert.deepEqual(h.slept, [500, 1000], '指数バックオフで待つこと');
        assert.match(h.logs.join('\n'), /接続できました/);
    });

    test('ネットワーク断でも再試行する', async () => {
        const h = makeHarness();
        let calls = 0;
        const { first, retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => {
                calls += 1;
                if (calls < 2) {
                    const error = new TypeError('fetch failed');
                    (error as { cause?: unknown }).cause = new Error('ENOTFOUND');
                    throw error;
                }
                return USER;
            },
            log: h.log,
            sleep: h.sleep,
            backoff: { baseDelayMs: 100, maxDelayMs: 1000, random: () => 0 },
        });

        assert.equal(first.kind === 'failed' && first.failure, 'transient');
        assert.equal((await retrying!).kind, 'ok');
    });

    test('再試行の上限に達したら諦めるが、起動は続けたまま', async () => {
        const h = makeHarness();
        let calls = 0;
        const { retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => { calls += 1; throw new FakeBacklogError(500); },
            log: h.log,
            sleep: h.sleep,
            maxRetries: 3,
            backoff: { baseDelayMs: 1000, maxDelayMs: 60000, random: () => 0 },
        });

        const outcome = await retrying!;
        assert.equal(outcome.kind, 'failed');
        assert.equal(calls, 4, '初回 + 再試行 3 回');
        assert.deepEqual(h.slept, [500, 1000, 2000]);
        assert.match(h.logs.join('\n'), /3 回再試行しましたが/);
    });

    test('再試行中に認証失敗が判明したら打ち切って auth を返す', async () => {
        const h = makeHarness();
        let calls = 0;
        const { retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => {
                calls += 1;
                throw calls === 1 ? new FakeBacklogError(503) : new FakeBacklogError(401);
            },
            log: h.log,
            sleep: h.sleep,
            backoff: { baseDelayMs: 1, maxDelayMs: 10, random: () => 0 },
        });

        const outcome = await retrying!;
        assert.equal(outcome.kind === 'failed' && outcome.failure, 'auth');
        assert.equal(calls, 2, '認証失敗が分かった時点で打ち切ること');
    });

    test('Retry-After を尊重する', async () => {
        const h = makeHarness();
        let calls = 0;
        const error = new FakeBacklogError(429, 'Too Many Requests') as FakeBacklogError & { response: { headers: Headers } };
        error.response = { headers: new Headers({ 'retry-after': '5' }) };

        const { retrying } = await verifyBacklogConnection('s.backlog.com', {
            probe: async () => {
                calls += 1;
                if (calls === 1) throw error;
                return USER;
            },
            log: h.log,
            sleep: h.sleep,
        });

        await retrying;
        assert.deepEqual(h.slept, [5000], 'Retry-After の 5 秒を使うこと');
    });

    test('応答が返らない場合はタイムアウトして transient 扱いにする', async () => {
        const h = makeHarness();
        const { first } = await verifyBacklogConnection('s.backlog.com', {
            probe: () => new Promise<StartupProbeUser>(() => { /* 応答しない */ }),
            log: h.log,
            sleep: h.sleep,
            timeoutMs: 20,
            maxRetries: 0,
        });

        assert.equal(first.kind, 'failed');
        assert.equal(first.kind === 'failed' && first.failure, 'transient');
        assert.match(h.logs.join('\n'), /応答がありませんでした/);
    });
});
