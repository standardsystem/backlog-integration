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

- Node.js >= 18
- pnpm

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

提供ツール:

- `get_issue` - 課題の詳細を取得
- `list_issues` - 課題一覧を取得
- `add_comment` - コメントを追加
- `assign_to_reporter` - 担当者をレポーターに変更

### CLIツール

```bash
# 課題の取得
pnpm --filter @backlog-integration/cli start -- issue get PROJECT-123

# 課題一覧
pnpm --filter @backlog-integration/cli start -- issue list PROJECT --status 1 2

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
