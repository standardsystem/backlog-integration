import { access } from 'node:fs/promises';
import { join } from 'node:path';

/** Windows でファイル名に使えない文字 */
const INVALID_CHARS = /[\\/:*?"<>|]/g;

/** 制御文字（ファイル名に含めない） */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Windows の予約デバイス名（拡張子の有無を問わず使えない） */
const RESERVED_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * ファイル名を「拡張子より前」と「拡張子」に分割する
 *
 * 先頭のドットは拡張子とみなしません（`.gitignore` は拡張子なし扱い）。
 *
 * @param fileName - ファイル名
 * @returns 拡張子より前の部分と、ドットを含む拡張子
 */
export function splitFileName(fileName: string): { stem: string; ext: string } {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) return { stem: fileName, ext: '' };
    return { stem: fileName.slice(0, dotIndex), ext: fileName.slice(dotIndex) };
}

/**
 * Backlog から取得したファイル名をローカルに保存できる形に整える
 *
 * 日本語のファイル名はそのまま保持し、Windows で使えない文字だけを `_` に置き換えます。
 * 末尾のドット・空白、予約デバイス名も Windows では扱えないため補正します。
 *
 * @param fileName - Backlog 上のファイル名
 * @returns 保存に使えるファイル名（空になる場合は "attachment"）
 */
export function sanitizeFileName(fileName: string): string {
    let sanitized = (fileName ?? '')
        .replace(CONTROL_CHARS, '')
        .replace(INVALID_CHARS, '_')
        // 末尾のドットと空白は Windows が落としてしまうため、あらかじめ除去する
        .replace(/[. ]+$/, '')
        .trim();

    if (sanitized === '' || sanitized === '.' || sanitized === '..') return 'attachment';

    const { stem, ext } = splitFileName(sanitized);
    if (RESERVED_NAMES.has(stem.toUpperCase())) {
        sanitized = `_${stem}${ext}`;
    }

    return sanitized;
}

/**
 * 指定ディレクトリ内で衝突しないファイルパスを決める
 *
 * 同名がある場合は `name (2).ext` `name (3).ext` … と連番を付けます。
 * ディスク上の既存ファイルに加えて、同一処理内で既に確保したパス（`taken`）とも衝突しないようにします。
 * Windows のファイルシステムは大文字小文字を区別しないため、比較は小文字化して行います。
 *
 * @param outputDir - 保存先ディレクトリ
 * @param fileName - 希望するファイル名（正規化済みであること）
 * @param taken - 同一処理内で既に確保したパスの集合（小文字化して保持・更新される）
 * @returns 衝突しない絶対パス
 */
export async function buildUniqueFilePath(
    outputDir: string,
    fileName: string,
    taken: Set<string>,
): Promise<string> {
    const { stem, ext } = splitFileName(fileName);

    for (let index = 1; ; index += 1) {
        const candidateName = index === 1 ? fileName : `${stem} (${index})${ext}`;
        const candidatePath = join(outputDir, candidateName);
        const key = candidatePath.toLowerCase();

        if (!taken.has(key) && !(await pathExists(candidatePath))) {
            taken.add(key);
            return candidatePath;
        }
    }
}

/**
 * パスが存在するか調べる
 *
 * @param path - 調べるパス
 * @returns 存在すれば true
 */
async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
