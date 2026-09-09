import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseSpaceId, resolveBacklogConfig } from '../src/config.js';

describe('parseSpaceId', () => {
    test('スペースIDだけの指定', () => {
        assert.deepEqual(parseSpaceId('my-space'), { spaceId: 'my-space' });
    });

    test('前後の空白を取り除く', () => {
        assert.deepEqual(parseSpaceId('  my-space  '), { spaceId: 'my-space' });
    });

    test('ドメイン付きの指定からドメインを判別する', () => {
        assert.deepEqual(parseSpaceId('my-space.backlog.com'), { spaceId: 'my-space', domain: 'backlog.com' });
        assert.deepEqual(parseSpaceId('my-space.backlog.jp'), { spaceId: 'my-space', domain: 'backlog.jp' });
        assert.deepEqual(parseSpaceId('my-space.backlogtool.com'), { spaceId: 'my-space', domain: 'backlogtool.com' });
    });

    test('URL 形式からスペースIDを取り出す', () => {
        assert.deepEqual(parseSpaceId('https://my-space.backlog.jp/dashboard'), { spaceId: 'my-space', domain: 'backlog.jp' });
        assert.deepEqual(parseSpaceId('http://my-space.backlog.com'), { spaceId: 'my-space', domain: 'backlog.com' });
    });

    test('ポート番号や末尾のドットを無視する', () => {
        assert.deepEqual(parseSpaceId('https://my-space.backlog.com:443/'), { spaceId: 'my-space', domain: 'backlog.com' });
        assert.deepEqual(parseSpaceId('my-space.backlog.com.'), { spaceId: 'my-space', domain: 'backlog.com' });
    });

    test('大文字のドメインでも判別する', () => {
        assert.deepEqual(parseSpaceId('My-Space.BACKLOG.JP'), { spaceId: 'My-Space', domain: 'backlog.jp' });
    });

    test('未知のドメインは先頭ラベルだけを使う', () => {
        assert.deepEqual(parseSpaceId('my-space.example.com'), { spaceId: 'my-space' });
    });
});

describe('resolveBacklogConfig', () => {
    test('前後の空白を取り除く（貼り付け時の混入対策）', () => {
        assert.deepEqual(
            resolveBacklogConfig(' my-space ', ' abc123 \n'),
            { spaceId: 'my-space', apiKey: 'abc123', domain: undefined },
        );
    });

    test('ドメイン付きの指定を反映する', () => {
        assert.deepEqual(
            resolveBacklogConfig('my-space.backlog.jp', 'k'),
            { spaceId: 'my-space', apiKey: 'k', domain: 'backlog.jp' },
        );
    });

    test('未設定・空文字はエラーにする', () => {
        assert.throws(() => resolveBacklogConfig(undefined, 'k'), /BACKLOG_SPACE_ID/);
        assert.throws(() => resolveBacklogConfig('s', undefined), /BACKLOG_API_KEY/);
        assert.throws(() => resolveBacklogConfig('   ', 'k'), /BACKLOG_SPACE_ID/);
        assert.throws(() => resolveBacklogConfig('s', '   '), /BACKLOG_API_KEY/);
    });

    test('スペースIDを判別できない値はエラーにする', () => {
        assert.throws(() => resolveBacklogConfig('https://', 'k'), /判別できません/);
    });
});
