/**
 * Shared message types for the chat webview ↔ extension-host protocol.
 * Kept in its own file so both `chat-webview.ts` (extension-host side, imports
 * vscode) and `webview-main.ts` (browser side, no vscode) can import the types
 * without pulling in the vscode module.
 */

/** Messages the extension host sends *to* the webview. */
export type ToWebview =
  | { kind: "turn_started"; turnId: string }
  | { kind: "text_delta"; turnId: string; text: string }
  | { kind: "turn_complete"; turnId: string; cost_usd: number; context_pct: number }
  | { kind: "compact_started" }
  | { kind: "compact_done"; new_context_pct: number }
  | { kind: "transcript_replay"; messages: TranscriptMessage[] }
  | { kind: "error"; message: string }
  | { kind: "quote_text"; text: string; fileName: string }
  | { kind: "status_update"; status: string | null }
  | { kind: "grant_access_prompt" }
  | { kind: "tool_uses"; tools: ToolUseInfo[] }
  | { kind: "commands_available"; commands: string[] }
  | { kind: "model_info"; model: string };

/** A single tool call within an assistant turn. */
export type ToolUseInfo = {
  name: string;
  input: Record<string, unknown>;
};

/** Messages the webview sends *to* the extension host. */
export type FromWebview =
  | { kind: "submit_prompt"; text: string }
  | { kind: "interrupt" }
  | { kind: "request_transcript" }
  | { kind: "grant_access" };

/** Persisted transcript entry — see DESIGN Data Model. */
export type TranscriptMessage =
  | { role: "user"; text: string; timestamp: string }
  | { role: "assistant"; text: string; turnId: string; cost_usd: number; timestamp: string };
