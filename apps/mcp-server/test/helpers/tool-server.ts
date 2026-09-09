import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** 登録されたツール 1 件分 */
interface RegisteredTool {
    description: string;
    inputSchema?: Record<string, unknown>;
    handler: (args: Record<string, unknown>, extra: unknown) => Promise<{
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
    }>;
}

/** ツール呼び出しの結果 */
export interface ToolCallResult {
    /** isError が立っているか */
    isError: boolean;
    /** 返却されたテキスト */
    text: string;
    /** テキストが JSON なら解析結果。そうでなければ undefined */
    json: any;
}

/**
 * `registerTool` を捕まえるだけの偽 McpServer
 *
 * 実際の MCP プロトコルを介さずにツールのハンドラを直接呼べるようにして、
 * 引数の解釈・返却形式・エラー整形を検証します。
 */
export class FakeMcpServer {
    private readonly tools = new Map<string, RegisteredTool>();

    /** register*Tool に渡すための McpServer 互換オブジェクト */
    get server(): McpServer {
        return {
            registerTool: (name: string, config: RegisteredTool, handler: RegisteredTool['handler']) => {
                this.tools.set(name, { ...config, handler });
            },
        } as unknown as McpServer;
    }

    /** 登録されているツール名の一覧 */
    get names(): string[] {
        return [...this.tools.keys()];
    }

    /**
     * 登録済みのツール定義を取得する
     *
     * @param name - ツール名
     * @returns ツール定義
     */
    definition(name: string): RegisteredTool {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`未登録のツール: ${name}`);
        return tool;
    }

    /**
     * ツールのハンドラを呼び出す
     *
     * @param name - ツール名
     * @param args - ツールの引数
     * @returns 呼び出し結果
     */
    async call(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
        const result = await this.definition(name).handler(args, {});
        const text = result.content.map((c) => c.text).join('\n');
        let json: unknown;
        try {
            json = JSON.parse(text);
        } catch {
            json = undefined;
        }
        return { isError: result.isError === true, text, json };
    }
}
