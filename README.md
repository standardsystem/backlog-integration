# Backlog連携ハイブリッドプロジェクト

複数プロジェクトから共通利用できるBacklog API v2連携ツール群です。

## プロジェクト構成

| パッケージ | パス | 説明 |
| :--- | :--- | :--- |
| `@backlog-integration/backlog-client` | `packages/backlog-client` | コアAPIクライアント |
| `@backlog-integration/mcp-server` | `apps/mcp-server` | MCPサーバー（AI連携） |
| `@backlog-integration/cli` | `apps/cli` | CLIツール |

## セットアップ

### 前提条件

- Node.js 24（最低 22.13 以上）
- pnpm 11

ツールのバージョンは `mise.toml` で管理しています。[mise](https://mise.jdx.dev/) を使う場合は以下でインストールできます:

```bash
mise install
```

### インストール

```bash
cd backlog-integration
pnpm install
pnpm -r build
```

### 環境変数

`.env.example` を `.env` にコピーして設定:

```bash
cp .env.example .env
```

```bash
BACKLOG_SPACE_ID=your-space
BACKLOG_API_KEY=your-api-key
```

`BACKLOG_SPACE_ID` は `your-space` のほか、`your-space.backlog.jp` や
`https://your-space.backlog.com/dashboard` の形式でも指定できます
（サブドメインを取り出し、`backlog.jp` / `backlogtool.com` のスペースはホスト名の組み立ても切り替えます）。
値の前後の空白は自動で取り除きます。

MCP サーバーは起動時に `GET /users/myself` で疎通を確認し、失敗した場合は原因の分類
（認証失敗 / 対象が見つかりません / 接続不可 など）と対処を stderr に出して終了します。
ネットワーク不通でサーバーを落としたくない場合は `BACKLOG_SKIP_STARTUP_CHECK=1` を設定してください。

## 使い方

### MCPサーバー（AI連携）

`mcp_settings.json` に以下を追加:

```json
{
  "mcpServers": {
    "backlog": {
      "command": "node",
      "args": ["c:/projects/standardsystem/backlog-integration/apps/mcp-server/dist/index.js"],
      "env": {
        "BACKLOG_SPACE_ID": "your-space",
        "BACKLOG_API_KEY": "your-api-key"
      }
    }
  }
}
```

レスポンスの方針:

- 課題・コメントを返すツールは、接続中のスペースから組み立てた `url` を含めます
  （エージェントがスペース名を推測して誤ったURLを書くのを防ぐため）
- 更新系ツール（`create_issue` / `update_issue` / `add_comment` / `assign_to_reporter`）は
  JSON を返します。人向けの要約は `message` フィールドに残しています
- ファイルを保存するツールは `{ path, bytes }` を含めます
- `create_issue` / `update_issue` は課題種別・優先度・マイルストーン・カテゴリ・状態・担当者を
  ID でも名前でも受け付けます（`issueTypeId` などの ID 指定を併用した場合は ID が優先）。
  名前が一意に決まらない場合は候補一覧つきのエラーになります
- `create_issue` / `update_issue` は期限日・マイルストーンが未設定のとき `warnings` に載せます
  （処理は止めません）

既知の制約:

- `update_issue` の `milestoneId` / `categoryId` / `versionId` に空配列を渡しても、
  Backlog API のクエリ組み立ての都合で項目自体が送信されず、値は解除されません。
  黙って成功と報告しないよう、この場合は `warnings` に載せています

提供ツール:

課題:

- `get_issue` - 課題の詳細を取得
- `list_issues` - 課題一覧を取得（親課題・マイルストーン・期限日などで絞込、`offset` でページング）
- `count_issues` - 条件に一致する課題の総件数を取得（ページングの終端判定用）
- `create_issue` - 課題を作成（課題種別・優先度などは名前指定可）
- `update_issue` - 課題を更新（状態・担当者・期限など。名前指定可）
- `add_comment` - コメントを追加
- `get_comment` - コメントを取得
- `list_comments` - コメント一覧を取得
- `count_comments` - コメント総件数を取得
- `update_comment` - 自分のコメントを更新（全文置換）
- `delete_comment` - 自分のコメントを削除（取り消し不可）
- `assign_to_reporter` - 担当者をレポーターに変更
- `upload_attachment` - ローカルファイルを添付ファイルとしてアップロード
- `list_issue_attachments` - 課題の添付ファイル一覧を取得
- `download_attachment` - 課題の添付ファイルを1件ダウンロード
- `download_issue_attachments` - 課題の添付ファイルを一括ダウンロード
- `delete_issue_attachment` - 課題の添付ファイルを削除

> `mcp_backlog_upload_attachment` は `upload_attachment` に改名しました。
> 旧名も 1 リリースだけ残していますが非推奨です。MCP クライアントの許可リストを
> `upload_attachment` に切り替えてください。

プロジェクトのメタ情報（すべて読み取り専用）:

- `get_project` - プロジェクトの詳細（数値ID・本文の記法）を取得
- `list_project_users` - プロジェクト参加ユーザーの一覧を取得（担当者IDの引き当て）
- `list_milestones` - マイルストーン（バージョン）一覧を取得
- `list_statuses` - 状態一覧を取得（カスタムステータスを含む）
- `list_issue_types` - 課題種別一覧を取得
- `list_categories` - カテゴリ一覧を取得
- `list_priorities` - 優先度一覧を取得
- `get_myself` - 接続中アカウントの情報を取得

ドキュメント:

- `get_document` - ドキュメントの詳細を取得
- `list_documents` - ドキュメント一覧を取得
- `get_document_tree` - ドキュメントツリーを取得
- `add_document` - ドキュメントを作成
- `upload_document_markdown` - ローカルの Markdown ファイルからドキュメントを作成
- `download_document_markdown` - ドキュメント本文を Markdown ファイルとして保存
- `download_document_attachment` - ドキュメントの添付ファイルをダウンロード
- `delete_document_attachment` - ドキュメントの添付ファイルを削除

### CLIツール

```bash
# 課題の取得
pnpm --filter @backlog-integration/cli start -- issue get PROJECT-123

# 課題一覧
pnpm --filter @backlog-integration/cli start -- issue list PROJECT --status 1 2

# 子課題の一覧（親課題IDで絞込）
pnpm --filter @backlog-integration/cli start -- issue list PROJECT --parent-issue 12345678

# 課題の総件数
pnpm --filter @backlog-integration/cli start -- issue count PROJECT --status 1 2

# コメント追加
pnpm --filter @backlog-integration/cli start -- issue comment PROJECT-123 "対応しました"

# 担当者をレポーターに変更
pnpm --filter @backlog-integration/cli start -- issue assign-reporter PROJECT-123
```

### コアパッケージ（他プロジェクトから利用）

```typescript
import { BacklogApiClient, IssueService } from '@backlog-integration/backlog-client';

const client = new BacklogApiClient({
  spaceId: 'your-space',
  apiKey: process.env.BACKLOG_API_KEY!,
});
const issues = new IssueService(client);

// 課題取得
const issue = await issues.getIssue('PROJECT-123');

// コメント追加
await issues.addComment('PROJECT-123', { content: '対応完了です。' });

// 担当者をレポーターに変更
await issues.assignToReporter('PROJECT-123');
```
