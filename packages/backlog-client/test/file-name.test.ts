import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sanitizeFileName, splitFileName, openUniqueFile } from '../src/file-name.js';

const tempDirs: string[] = [];

/**
 * テスト用の一時ディレクトリを作る（テスト終了時にまとめて削除する）
 *
 * @returns 一時ディレクトリの絶対パス
 */
async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'blclient-'));
    tempDirs.push(dir);
    return dir;
}

after(async () => {
    for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

describe('sanitizeFileName', () => {
    test('日本語や空白を含む名前はそのまま保つ', () => {
        assert.equal(sanitizeFileName('設計書 v1.xlsx'), '設計書 v1.xlsx');
    });

    test('Windows で使えない文字を _ に置き換える', () => {
        assert.equal(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j.txt'), 'a_b_c_d_e_f_g_h_i_j.txt');
    });

    test('制御文字を取り除く', () => {
        assert.equal(sanitizeFileName('abc.txt'), 'abc.txt');
    });

    test('末尾のドットを取り除く', () => {
        assert.equal(sanitizeFileName('report...'), 'report');
    });

    test('末尾が「ドット + 全角スペース」でもドットを残さない', () => {
        // 全角スペースを先に落とさないと "foo." が残り、Windows から開けないファイルになる
        assert.equal(sanitizeFileName('foo.　'), 'foo');
        assert.equal(sanitizeFileName('report. '), 'report');
        assert.equal(sanitizeFileName('report. '), 'report');
    });

    test('Windows の予約デバイス名を避ける', () => {
        assert.equal(sanitizeFileName('CON.txt'), '_CON.txt');
        assert.equal(sanitizeFileName('nul'), '_nul');
        assert.equal(sanitizeFileName('lpt1.log'), '_lpt1.log');
    });

    test('名前が空になる入力はフォールバックする', () => {
        assert.equal(sanitizeFileName('   '), 'attachment');
        assert.equal(sanitizeFileName('..'), 'attachment');
        assert.equal(sanitizeFileName(''), 'attachment');
    });

    test('スラッシュだけの名前は下線になる', () => {
        assert.equal(sanitizeFileName('///'), '___');
    });
});

describe('splitFileName', () => {
    test('通常の拡張子を分離する', () => {
        assert.deepEqual(splitFileName('report.txt'), { stem: 'report', ext: '.txt' });
    });

    test('二重拡張子は最後のドットで分ける', () => {
        assert.deepEqual(splitFileName('archive.tar.gz'), { stem: 'archive.tar', ext: '.gz' });
    });

    test('先頭のドットは拡張子とみなさない', () => {
        assert.deepEqual(splitFileName('.gitignore'), { stem: '.gitignore', ext: '' });
    });

    test('拡張子が無い場合', () => {
        assert.deepEqual(splitFileName('README'), { stem: 'README', ext: '' });
    });
});

describe('openUniqueFile', () => {
    test('衝突しなければ希望どおりの名前で作る', async () => {
        const dir = await makeTempDir();
        const { path, handle } = await openUniqueFile(dir, 'log.txt');
        await handle.close();
        assert.equal(path, join(dir, 'log.txt'));
    });

    test('同名が続くと連番を付ける', async () => {
        const dir = await makeTempDir();
        for (const expected of ['log.txt', 'log (2).txt', 'log (3).txt']) {
            const { path, handle } = await openUniqueFile(dir, 'log.txt');
            await handle.close();
            assert.equal(path, join(dir, expected));
        }
    });

    test('ディスク上の既存ファイルとも衝突しない', async () => {
        const dir = await makeTempDir();
        await writeFile(join(dir, 'data.bin'), 'x');
        const { path, handle } = await openUniqueFile(dir, 'data.bin');
        await handle.close();
        assert.equal(path, join(dir, 'data (2).bin'));
    });

    test('拡張子が無い名前にも連番を付ける', async () => {
        const dir = await makeTempDir();
        await (await openUniqueFile(dir, 'README')).handle.close();
        const { path, handle } = await openUniqueFile(dir, 'README');
        await handle.close();
        assert.equal(path, join(dir, 'README (2)'));
    });

    test('並行して呼んでも同じパスを二重に確保しない', async () => {
        const dir = await makeTempDir();
        const results = await Promise.all(
            Array.from({ length: 8 }, async () => {
                const { path, handle } = await openUniqueFile(dir, 'race.dat');
                await handle.close();
                return path.toLowerCase();
            }),
        );
        assert.equal(new Set(results).size, 8, '8 件すべてが別のパスになること');
        assert.equal((await readdir(dir)).length, 8);
    });

    test('255 文字を超える名前は切り詰める（open が ENOENT にならない）', async () => {
        const dir = await makeTempDir();
        const longStem = 'あ'.repeat(300);

        const first = await openUniqueFile(dir, `${longStem}.bin`);
        await first.handle.close();
        const firstName = first.path.slice(dir.length + 1);
        assert.ok(firstName.length <= 255, `ファイル名が 255 文字以内であること (${firstName.length})`);
        assert.ok(firstName.endsWith('.bin'), '拡張子が残ること');

        const second = await openUniqueFile(dir, `${longStem}.bin`);
        await second.handle.close();
        const secondName = second.path.slice(dir.length + 1);
        assert.ok(secondName.length <= 255, `連番付きでも 255 文字以内であること (${secondName.length})`);
        assert.match(secondName, / \(2\)\.bin$/);
        assert.notEqual(first.path, second.path);
    });

    test('サロゲートペアを途中で割らない', async () => {
        const dir = await makeTempDir();
        const { path, handle } = await openUniqueFile(dir, `${'😀'.repeat(200)}.txt`);
        await handle.close();
        const name = path.slice(dir.length + 1).replace(/\.txt$/, '');
        assert.ok(name.length <= 255);
        assert.doesNotMatch(name, /[\uD800-\uDBFF]$/, 'サロゲートペアの前半で終わっていないこと');
    });
});
