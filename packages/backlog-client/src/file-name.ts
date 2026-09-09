import { open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

/** 連番を試す上限（無限ループ防止） */
const MAX_NAME_ATTEMPTS = 10000;

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
 * 指定ディレクトリ内で衝突しないファイルを排他的に作成して開く
 *
 * 同名がある場合は `name (2).ext` `name (3).ext` … と連番を付けます。
 * 「存在確認 → 書き込み」の 2 段階だと、同じディレクトリへ並行してダウンロードしたときに
 * 片方が黙って上書きされうるため、`wx`（既存なら失敗する排他作成）で
 * 名前の確保とファイル作成を 1 操作にまとめています。
 *
 * @param outputDir - 保存先ディレクトリ（呼び出し前に作成しておくこと）
 * @param fileName - 希望するファイル名（`sanitizeFileName` で正規化済みであること）
 * @returns 作成したファイルのパスとハンドル（呼び出し側で必ず閉じること）
 * @throws 連番の上限まで空きが見つからなかった場合
 */
export async function openUniqueFile(
    outputDir: string,
    fileName: string,
): Promise<{ path: string; handle: FileHandle }> {
    const { stem, ext } = splitFileName(fileName);

    for (let index = 1; index <= MAX_NAME_ATTEMPTS; index += 1) {
        const candidateName = index === 1 ? fileName : `${stem} (${index})${ext}`;
        const candidatePath = join(outputDir, candidateName);

        try {
            const handle = await open(candidatePath, 'wx');
            return { path: candidatePath, handle };
        } catch (error) {
            // 既存ファイルとの衝突だけを次の連番へ進める理由とし、権限エラーなどはそのまま投げる
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
    }

    throw new Error(
        `${outputDir} に "${fileName}" を保存できませんでした（同名ファイルが ${MAX_NAME_ATTEMPTS} 件を超えています）。`,
    );
}
