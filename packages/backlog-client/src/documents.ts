import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, basename, extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Entity } from 'backlog-js';
import type { BacklogApiClient } from './client.js';
import type {
    ListDocumentsOptions,
    AddDocumentOptions,
    UploadDocumentMarkdownOptions,
    DownloadedFile,
} from './types.js';

/**
 * Backlog ドキュメント操作モジュール
 *
 * ドキュメントの取得・一覧・作成、添付ファイル/Markdown のダウンロード・アップロードを提供します。
 *
 * @example
 * ```typescript
 * import { BacklogApiClient, DocumentService } from '@backlog-integration/backlog-client';
 *
 * const apiClient = new BacklogApiClient({ spaceId: '...', apiKey: '...' });
 * const documents = new DocumentService(apiClient);
 *
 * const doc = await documents.getDocument('xxxxxxxxxxxxxxxxxxxxxxxxxx');
 * await documents.downloadAsMarkdown('xxxxxxxxxxxxxxxxxxxxxxxxxx', 'C:/tmp/doc.md');
 * await documents.uploadMarkdown('C:/tmp/new.md', { projectId: 12345 });
 * ```
 */
export class DocumentService {
    private readonly client: BacklogApiClient;

    constructor(client: BacklogApiClient) {
        this.client = client;
    }

    /**
     * ドキュメントの詳細を取得する
     *
     * @param documentId - ドキュメントID
     * @returns ドキュメントの詳細
     */
    async getDocument(documentId: string): Promise<Entity.Document.Document> {
        const backlog = this.client.getClient();
        return await backlog.getDocument(documentId);
    }

    /**
     * ドキュメント一覧を取得する
     *
     * @param options - 検索条件
     * @returns ドキュメントの配列
     */
    async listDocuments(options: ListDocumentsOptions = {}): Promise<Entity.Document.Document[]> {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {
            offset: options.offset ?? 0,
        };

        if (options.projectId !== undefined) params.projectId = options.projectId;
        if (options.keyword !== undefined) params.keyword = options.keyword;
        if (options.sort !== undefined) params.sort = options.sort;
        if (options.order !== undefined) params.order = options.order;
        if (options.count !== undefined) params.count = options.count;

        return await backlog.getDocuments(params as any);
    }

    /**
     * プロジェクトのドキュメントツリーを取得する
     *
     * @param projectIdOrKey - プロジェクトID もしくはキー
     * @returns ドキュメントツリー
     */
    async getDocumentTree(projectIdOrKey: string | number): Promise<Entity.Document.DocumentTree> {
        const backlog = this.client.getClient();
        return await backlog.getDocumentTree(projectIdOrKey);
    }

    /**
     * ドキュメントを新規作成する
     *
     * @param options - ドキュメント作成パラメータ
     * @returns 作成されたドキュメント
     */
    async addDocument(options: AddDocumentOptions): Promise<Entity.Document.Document> {
        const backlog = this.client.getClient();
        const params: Record<string, unknown> = {
            projectId: options.projectId,
        };

        if (options.title !== undefined) params.title = options.title;
        if (options.content !== undefined) params.content = options.content;
        if (options.emoji !== undefined) params.emoji = options.emoji;
        if (options.parentId !== undefined) params.parentId = options.parentId;
        if (options.addLast !== undefined) params.addLast = options.addLast;

        return await backlog.addDocument(params as any);
    }

    /**
     * ドキュメントの添付ファイルを削除する
     *
     * backlog-js には deleteDocumentAttachment が未実装のため、
     * 低レベルの delete メソッドを直接呼び出します。
     *
     * @param documentId - ドキュメントID
     * @param attachmentId - 添付ファイルID
     * @returns 削除された添付ファイル情報
     */
    async deleteAttachment(documentId: string, attachmentId: number) {
        const backlog = this.client.getClient();
        return await backlog.delete<unknown>(`documents/${documentId}/attachments/${attachmentId}`);
    }

    /**
     * ドキュメントの添付ファイルをダウンロードしてローカルに保存する
     *
     * @param documentId - ドキュメントID
     * @param attachmentId - 添付ファイルID
     * @param outputPath - 保存先の絶対パス
     */
    async downloadAttachment(
        documentId: string,
        attachmentId: number,
        outputPath: string,
    ): Promise<DownloadedFile> {
        // 出力先ディレクトリの作成を先に済ませる。
        // 逆順にすると mkdir が失敗したときにレスポンスのストリームが解放されない。
        await mkdir(dirname(outputPath), { recursive: true });

        const backlog = this.client.getClient();
        const fileData = await backlog.downloadDocumentAttachment(documentId, attachmentId);

        // Node.js 環境: body は Web ReadableStream（backlog-js 0.17 以降）なので Node.js ストリームに変換する
        const body = Readable.fromWeb(fileData.body as ReadableStream);

        const writeStream = createWriteStream(outputPath);
        await pipeline(body, writeStream);

        const { size } = await stat(outputPath);
        return { path: outputPath, bytes: size };
    }

    /**
     * ドキュメントの本文を Markdown ファイルとしてローカルに保存する
     *
     * Backlog のドキュメント本文の plain フィールド（プレーンテキスト/Markdown）を
     * .md ファイルとして書き出します。先頭にタイトルを `# title` として付与します。
     *
     * @param documentId - ドキュメントID
     * @param outputPath - 保存先の絶対パス（.md 推奨）
     * @returns 書き出したドキュメントの id, title, 保存先パス, バイト数
     */
    async downloadAsMarkdown(
        documentId: string,
        outputPath: string,
    ): Promise<DownloadedFile & { id: string; title: string }> {
        const doc = await this.getDocument(documentId) as {
            id: string;
            title: string;
            plain: string;
        };

        const heading = doc.title ? `# ${doc.title}\n\n` : '';
        const body = `${heading}${doc.plain ?? ''}`;

        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, body, 'utf8');

        return {
            id: doc.id,
            title: doc.title,
            path: outputPath,
            bytes: Buffer.byteLength(body, 'utf8'),
        };
    }

    /**
     * ローカルの Markdown ファイルを読み込んで新規ドキュメントを作成する
     *
     * 先頭行が `# Title` 形式の場合、それをタイトルとして抽出し本文から除去します。
     * options.title が明示指定されている場合は常にそちらを優先します。
     *
     * @param filePath - 読み込む Markdown ファイルの絶対パス
     * @param options - プロジェクトID 等のドキュメント作成パラメータ
     * @returns 作成されたドキュメント
     */
    async uploadMarkdown(filePath: string, options: UploadDocumentMarkdownOptions): Promise<Entity.Document.Document> {
        const raw = await readFile(filePath, 'utf8');

        // 先頭行が `# ...` ならタイトル候補として抽出
        let title = options.title;
        let content = raw;
        if (!title) {
            const match = raw.match(/^#\s+(.+?)\s*\r?\n/);
            if (match) {
                title = match[1].trim();
                content = raw.slice(match[0].length).replace(/^\r?\n+/, '');
            } else {
                title = basename(filePath, extname(filePath));
            }
        }

        return await this.addDocument({
            projectId: options.projectId,
            title,
            content,
            emoji: options.emoji,
            parentId: options.parentId,
            addLast: options.addLast,
        });
    }
}
