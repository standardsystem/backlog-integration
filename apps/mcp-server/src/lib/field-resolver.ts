import type { ProjectService } from '@backlog-integration/backlog-client';

/** ID と名前を持つ Backlog のメタ情報 */
interface NamedEntity {
    id: number;
    name: string;
}

/**
 * 優先度の別名
 *
 * 日本語スペースは「高/中/低」、英語スペースは「High/Normal/Low」で返るため、
 * どちらの表記でも同じ優先度に解決できるようにします。
 */
const PRIORITY_ALIAS_GROUPS: string[][] = [
    ['high', '高', '至急'],
    ['normal', 'middle', 'medium', '中', '普通'],
    ['low', '低'],
];

/**
 * 名前の比較用に正規化する
 *
 * 全角・半角の違い（NFKC）、前後の空白、大文字小文字を無視して比較できるようにします。
 *
 * @param value - 比較したい文字列
 * @returns 正規化した文字列
 */
function normalize(value: string): string {
    return value.normalize('NFKC').trim().toLowerCase();
}

/**
 * 候補一覧を「名前(ID)」形式の文字列にする
 *
 * @param items - 候補
 * @returns エラーメッセージに埋め込む候補一覧
 */
function formatCandidates(items: NamedEntity[]): string {
    if (items.length === 0) return 'なし';
    return items.map((item) => `${item.name}(${item.id})`).join(', ');
}

/**
 * 入力（ID または名前）を ID に解決する
 *
 * 名前での一致を優先し、一致しない場合にかぎり数値文字列を ID とみなします
 * （「2024」のような数字だけの名前を持つマイルストーンを誤解決しないため）。
 *
 * @param kind - エラーメッセージに出す項目名（例: 「マイルストーン」）
 * @param items - 候補の一覧
 * @param input - 利用者が指定した ID または名前
 * @param expandAliases - 名前の別名を展開する関数（優先度のみ使用）
 * @returns 解決した ID
 * @throws 一意に解決できない場合は候補一覧つきのエラー
 */
function resolveOne(
    kind: string,
    items: NamedEntity[],
    input: string | number,
    expandAliases?: (normalized: string) => string[],
): number {
    if (typeof input === 'number') return input;

    const normalized = normalize(input);
    const wanted = expandAliases ? expandAliases(normalized) : [normalized];
    const matched = items.filter((item) => wanted.includes(normalize(item.name)));

    if (matched.length === 1) return matched[0].id;

    if (matched.length > 1) {
        throw new Error(
            `${kind}「${input}」が複数見つかりました。ID で指定してください。`
            + `候補: ${formatCandidates(matched)}`,
        );
    }

    // 名前で一致しなかった場合のみ、数値文字列を ID とみなす
    if (/^\d+$/.test(input.trim())) return Number(input.trim());

    throw new Error(
        `${kind}「${input}」を解決できませんでした。候補: ${formatCandidates(items)}`,
    );
}

/**
 * 優先度の別名を展開する
 *
 * @param normalized - 正規化済みの入力
 * @returns 同じ優先度を指す表記の一覧
 */
function expandPriorityAliases(normalized: string): string[] {
    const group = PRIORITY_ALIAS_GROUPS.find((aliases) => aliases.includes(normalized));
    return group ?? [normalized];
}

/**
 * 課題の項目（課題種別・優先度・マイルストーンなど）を名前から ID に解決する
 *
 * 解決に使うメタ情報はプロジェクト単位でプロセス内にキャッシュします。
 * マイルストーンの追加などの変更は MCP サーバーの再起動で反映されます。
 */
export class IssueFieldResolver {
    private readonly projects: ProjectService;
    /** `種別:プロジェクト` をキーにしたメタ情報のキャッシュ（同時呼び出しを共有するため Promise を保持する） */
    private readonly cache = new Map<string, Promise<NamedEntity[]>>();

    constructor(projects: ProjectService) {
        this.projects = projects;
    }

    /**
     * メタ情報をキャッシュ付きで取得する
     *
     * @param kind - キャッシュ種別
     * @param scope - プロジェクトを表すキー（スペース共通のものは空文字）
     * @param load - キャッシュが無い場合の取得処理
     * @returns メタ情報の配列
     */
    private load(kind: string, scope: string, load: () => Promise<NamedEntity[]>): Promise<NamedEntity[]> {
        const cacheKey = `${kind}:${scope}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        // 失敗したキャッシュを残さないよう、reject 時はエントリを消す
        const promise = load().catch((error: unknown) => {
            this.cache.delete(cacheKey);
            throw error;
        });
        this.cache.set(cacheKey, promise);
        return promise;
    }

    /**
     * プロジェクト指定をキャッシュキーに正規化する
     *
     * @param projectIdOrKey - プロジェクトID または キー
     * @returns キャッシュキー
     */
    private scopeOf(projectIdOrKey: string | number): string {
        return String(projectIdOrKey).trim().toUpperCase();
    }

    /**
     * 課題種別を ID に解決する
     *
     * @param projectIdOrKey - プロジェクトID または キー
     * @param input - 課題種別の ID または名前（例: "タスク"）
     * @returns 課題種別ID
     */
    async resolveIssueType(projectIdOrKey: string | number, input: string | number): Promise<number> {
        if (typeof input === 'number') return input;
        const items = await this.load('issueType', this.scopeOf(projectIdOrKey), async () =>
            await this.projects.listIssueTypes(projectIdOrKey));
        return resolveOne('課題種別', items, input);
    }

    /**
     * 優先度を ID に解決する
     *
     * @param input - 優先度の ID または名前（"高" / "中" / "低" / high / normal / low）
     * @returns 優先度ID
     */
    async resolvePriority(input: string | number): Promise<number> {
        if (typeof input === 'number') return input;
        const items = await this.load('priority', '', async () => await this.projects.listPriorities());
        return resolveOne('優先度', items, input, expandPriorityAliases);
    }

    /**
     * 状態（ステータス）を ID に解決する
     *
     * カスタムステータスも対象になります。
     *
     * @param projectIdOrKey - プロジェクトID または キー
     * @param input - 状態の ID または名前
     * @returns 状態ID
     */
    async resolveStatus(projectIdOrKey: string | number, input: string | number): Promise<number> {
        if (typeof input === 'number') return input;
        const items = await this.load('status', this.scopeOf(projectIdOrKey), async () =>
            await this.projects.listStatuses(projectIdOrKey));
        return resolveOne('状態', items, input);
    }

    /**
     * マイルストーンを ID に解決する
     *
     * アーカイブ済みのマイルストーンも解決対象に含めます（過去分の参照を妨げないため）。
     *
     * @param projectIdOrKey - プロジェクトID または キー
     * @param inputs - マイルストーンの ID または名前の配列
     * @returns マイルストーンIDの配列
     */
    async resolveMilestones(
        projectIdOrKey: string | number,
        inputs: Array<string | number>,
    ): Promise<number[]> {
        // すべて数値なら候補一覧を引く必要が無い（空配列＝解除の意図もここで素通しする）
        if (inputs.every((input) => typeof input === 'number')) return inputs as number[];
        const items = await this.load('milestone', this.scopeOf(projectIdOrKey), async () =>
            await this.projects.listMilestones(projectIdOrKey, true));
        return inputs.map((input) => resolveOne('マイルストーン', items, input));
    }

    /**
     * カテゴリを ID に解決する
     *
     * @param projectIdOrKey - プロジェクトID または キー
     * @param inputs - カテゴリの ID または名前の配列
     * @returns カテゴリIDの配列
     */
    async resolveCategories(
        projectIdOrKey: string | number,
        inputs: Array<string | number>,
    ): Promise<number[]> {
        if (inputs.every((input) => typeof input === 'number')) return inputs as number[];
        const items = await this.load('category', this.scopeOf(projectIdOrKey), async () =>
            await this.projects.listCategories(projectIdOrKey));
        return inputs.map((input) => resolveOne('カテゴリ', items, input));
    }

    /**
     * 担当者を ID に解決する
     *
     * `@me` を指定すると接続中のアカウント自身になります。
     * ユーザ名のほか、ログイン用のユーザID（`userId`）でも解決できます。
     *
     * @param projectIdOrKey - プロジェクトID または キー
     * @param input - 担当者の ID / 名前 / userId / "@me"
     * @returns ユーザID
     */
    async resolveAssignee(projectIdOrKey: string | number, input: string | number): Promise<number> {
        if (typeof input === 'number') return input;
        if (normalize(input) === '@me') {
            const myself = await this.projects.getMyself();
            return myself.id;
        }

        const users = await this.load('user', this.scopeOf(projectIdOrKey), async () => {
            const projectUsers = await this.projects.listProjectUsers(projectIdOrKey);
            // 表示名だけでなくログイン用の userId でも引けるようにする
            return projectUsers.flatMap((user) => {
                const entries: NamedEntity[] = [{ id: user.id, name: user.name }];
                if (user.userId && normalize(user.userId) !== normalize(user.name)) {
                    entries.push({ id: user.id, name: user.userId });
                }
                return entries;
            });
        });

        // 同一ユーザが name / userId の二重登録で複数一致することがあるため、ID で重複を除く
        const normalized = normalize(input);
        const matchedIds = [...new Set(
            users.filter((user) => normalize(user.name) === normalized).map((user) => user.id),
        )];
        if (matchedIds.length === 1) return matchedIds[0];

        return resolveOne('担当者', users, input);
    }
}
