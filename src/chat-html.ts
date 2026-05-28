/**
 * Pure (vscode-free) renderer for the chat webview HTML.
 *
 * `webviewScriptUri` — the string form of `panel.webview.asWebviewUri(...)`,
 *   used in the `<script src>` tag.
 * `cspSource` — `panel.webview.cspSource` (the extension origin token that
 *   VS Code requires in the script-src directive so the browser actually loads
 *   the file; a specific file path alone is insufficient).
 *
 * In unit tests pass dummy strings for both — the HTML structure is what
 * matters there.
 */
export function getChatHtml(
  displayName: string,
  webviewScriptUri: string,
  cspSource = webviewScriptUri,
): string {
  const safeName = escapeHtml(displayName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${cspSource};">
<title>Agent Desktop: ${safeName}</title>
<style>
  /* ── Layout ──────────────────────────────────────────────── */
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
  h1 { font-size: 13px; font-weight: 600; margin: 0 0 12px 0; color: var(--vscode-descriptionForeground); display: flex; align-items: center; gap: 8px; }
  #model-badge { font-size: 10px; font-weight: 500; padding: 1px 6px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); opacity: 0.85; }
  #transcript { flex: 1; overflow-y: auto; border: 1px solid var(--vscode-panel-border); padding: 12px; margin-bottom: 8px; font-size: 13px; line-height: 1.5; }
  #status { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; min-height: 16px; }
  #prompt-form { display: flex; gap: 8px; align-items: flex-end; }
  #input-wrap { flex: 1; position: relative; }
  #input { width: 100%; box-sizing: border-box; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); font-family: inherit; font-size: 13px; resize: vertical; min-height: 60px; }
  #input:focus { outline: 1px solid var(--vscode-focusBorder); }
  button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; font-family: inherit; }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  #stop-btn { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-errorForeground, #f48771); border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100); }
  #stop-btn:hover { opacity: 0.85; }
  #stop-btn.hidden { display: none; }

  /* ── Turns ───────────────────────────────────────────────── */
  .turn { margin-bottom: 16px; }
  .role-label { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
  .turn.user .role-label { color: var(--vscode-textLink-foreground); }
  .turn.assistant .role-label { color: var(--vscode-symbolIcon-functionForeground, var(--vscode-textLink-activeForeground)); }
  .turn.error { color: var(--vscode-errorForeground); }
  .turn-badge { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 6px; }
  .user-text { font-family: inherit; font-size: 13px; margin: 0; white-space: pre-wrap; word-break: break-word; }

  /* ── Streaming placeholder ───────────────────────────────── */
  pre.stream-text { font-family: inherit; font-size: 13px; margin: 0; white-space: pre-wrap; word-break: break-word; }

  /* ── Markdown rendering ──────────────────────────────────── */
  .markdown { line-height: 1.6; word-break: break-word; }
  .markdown p { margin: 0 0 10px 0; }
  .markdown p:last-child { margin-bottom: 0; }
  .markdown h1,.markdown h2,.markdown h3,.markdown h4 { margin: 12px 0 6px 0; font-weight: 600; line-height: 1.3; }
  .markdown h1 { font-size: 1.3em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  .markdown h2 { font-size: 1.15em; }
  .markdown h3 { font-size: 1.05em; }
  .markdown ul,.markdown ol { margin: 0 0 10px 0; padding-left: 24px; }
  .markdown li { margin-bottom: 4px; }
  .markdown blockquote { margin: 0 0 10px 0; padding: 4px 12px; border-left: 3px solid var(--vscode-textBlockQuote-border, #888); background: var(--vscode-textBlockQuote-background); color: var(--vscode-descriptionForeground); }
  .markdown code { font-family: var(--vscode-editor-font-family); font-size: 0.9em; background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
  .markdown pre { margin: 0 0 12px 0; border-radius: 4px; overflow-x: auto; }
  .markdown pre code { padding: 0; background: transparent; }
  .markdown pre code.hljs { padding: 12px; background: var(--vscode-textCodeBlock-background); }
  .markdown a { color: var(--vscode-textLink-foreground); }
  .markdown a:hover { color: var(--vscode-textLink-activeForeground); }
  .markdown table { border-collapse: collapse; margin-bottom: 10px; width: 100%; }
  .markdown th,.markdown td { border: 1px solid var(--vscode-panel-border); padding: 4px 10px; }
  .markdown th { background: var(--vscode-editor-inactiveSelectionBackground); font-weight: 600; }
  .markdown hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 12px 0; }
  .markdown img { max-width: 100%; }
  .markdown strong { font-weight: 600; }
  .markdown em { font-style: italic; }

  /* ── Slash-command autocomplete ─────────────────────────── */
  .autocomplete { position: absolute; bottom: calc(100% + 4px); left: 0; right: 0; background: var(--vscode-dropdown-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 4px; max-height: 220px; overflow-y: auto; z-index: 100; box-shadow: 0 -2px 8px rgba(0,0,0,.2); }
  .autocomplete.hidden { display: none; }
  .autocomplete-item { padding: 5px 10px; cursor: pointer; font-size: 12px; font-family: var(--vscode-editor-font-family); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .autocomplete-item .cmd-name { color: var(--vscode-symbolIcon-functionForeground, var(--vscode-textLink-foreground)); font-weight: 600; }
  .autocomplete-item:hover, .autocomplete-item.selected { background: var(--vscode-list-hoverBackground, rgba(255,255,255,.07)); }

  /* ── Tool-use cards ─────────────────────────────────────── */
  .tool-calls { margin: 4px 0 8px 0; display: flex; flex-direction: column; gap: 3px; }
  .tool-call { font-size: 11px; }
  .tool-call summary { cursor: pointer; user-select: none; color: var(--vscode-descriptionForeground); list-style: none; display: flex; align-items: center; gap: 5px; padding: 2px 0; }
  .tool-call summary::-webkit-details-marker { display: none; }
  .tool-call summary .tool-icon { opacity: 0.7; }
  .tool-call summary .tool-name { font-weight: 600; color: var(--vscode-symbolIcon-functionForeground, var(--vscode-textLink-activeForeground)); }
  .tool-call[open] summary .tool-icon { opacity: 1; }
  .tool-call pre { margin: 3px 0 3px 18px; padding: 6px 8px; background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: 11px; overflow-x: auto; border-radius: 3px; white-space: pre-wrap; word-break: break-all; color: var(--vscode-editor-foreground); }

  /* ── Grant-access banner ─────────────────────────────────── */
  .grant-access-banner { display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin: 8px 0; background: var(--vscode-inputValidation-warningBackground, rgba(255,200,0,.12)); border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500); border-radius: 4px; font-size: 12px; }
  .grant-access-banner span { flex: 1; color: var(--vscode-foreground); }
  .grant-access-btn { padding: 4px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 2px; font-size: 12px; white-space: nowrap; }
  .grant-access-btn:hover { background: var(--vscode-button-hoverBackground); }

  /* ── MCP Panel ──────────────────────────────────────────── */
  #mcp-panel { margin-bottom: 8px; font-size: 12px; }
  #mcp-panel > summary { cursor: pointer; user-select: none; list-style: none; display: flex; align-items: center; gap: 6px; padding: 3px 0; color: var(--vscode-descriptionForeground); font-weight: 600; font-size: 11px; }
  #mcp-panel > summary::-webkit-details-marker { display: none; }
  #mcp-panel > summary::before { content: "▶"; font-size: 9px; display: inline-block; transition: transform 0.12s; }
  #mcp-panel[open] > summary::before { transform: rotate(90deg); }
  .mcp-badge { font-size: 10px; padding: 0 5px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 8px; font-weight: 500; }
  .mcp-list { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 6px 14px; }
  .mcp-empty { font-size: 11px; color: var(--vscode-descriptionForeground); font-style: italic; padding: 2px 0; }
  .mcp-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .mcp-item-name { font-family: var(--vscode-editor-font-family); font-weight: 600; color: var(--vscode-foreground); white-space: nowrap; }
  .mcp-item-config { flex: 1; font-size: 11px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .mcp-remove-btn { padding: 1px 6px; font-size: 11px; background: transparent; color: var(--vscode-errorForeground, #f48771); border: 1px solid currentColor; cursor: pointer; border-radius: 2px; flex-shrink: 0; }
  .mcp-remove-btn:hover { background: var(--vscode-inputValidation-errorBackground, rgba(190,17,0,.12)); }
  .mcp-add-row { display: flex; gap: 5px; margin-left: 14px; align-items: center; }
  .mcp-add-row input { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 3px 6px; font-size: 11px; font-family: var(--vscode-editor-font-family); border-radius: 2px; }
  .mcp-add-row input:focus { outline: 1px solid var(--vscode-focusBorder); }
  #mcp-name-input { width: 110px; flex-shrink: 0; }
  #mcp-json-input { flex: 1; min-width: 0; }
  .mcp-add-btn { padding: 3px 8px; font-size: 11px; flex-shrink: 0; }

  /* ── Syntax highlighting ─────────────────────────────────── */
  /* Base layout/background adapts via VS Code CSS variables */
  .hljs { display: block; overflow-x: auto; padding: 12px; background: var(--vscode-textCodeBlock-background); color: var(--vscode-editor-foreground); border-radius: 4px; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: bold; }
  /* Dark + High-Contrast Dark → VS Code Dark+ palette */
  .vscode-dark .hljs-keyword,.vscode-dark .hljs-selector-tag,.vscode-dark .hljs-built_in,.vscode-dark .hljs-name,.vscode-dark .hljs-tag,
  .vscode-high-contrast .hljs-keyword,.vscode-high-contrast .hljs-selector-tag,.vscode-high-contrast .hljs-built_in,.vscode-high-contrast .hljs-name,.vscode-high-contrast .hljs-tag { color: #569cd6; }
  .vscode-dark .hljs-string,.vscode-dark .hljs-title,.vscode-dark .hljs-section,.vscode-dark .hljs-attribute,.vscode-dark .hljs-literal,.vscode-dark .hljs-template-tag,.vscode-dark .hljs-template-variable,.vscode-dark .hljs-type,.vscode-dark .hljs-addition,
  .vscode-high-contrast .hljs-string,.vscode-high-contrast .hljs-title,.vscode-high-contrast .hljs-section,.vscode-high-contrast .hljs-attribute,.vscode-high-contrast .hljs-literal,.vscode-high-contrast .hljs-template-tag,.vscode-high-contrast .hljs-template-variable,.vscode-high-contrast .hljs-type,.vscode-high-contrast .hljs-addition { color: #ce9178; }
  .vscode-dark .hljs-comment,.vscode-dark .hljs-quote,.vscode-dark .hljs-deletion,.vscode-dark .hljs-meta,
  .vscode-high-contrast .hljs-comment,.vscode-high-contrast .hljs-quote,.vscode-high-contrast .hljs-deletion,.vscode-high-contrast .hljs-meta { color: #6a9955; }
  .vscode-dark .hljs-number,.vscode-dark .hljs-regexp,.vscode-dark .hljs-variable,.vscode-dark .hljs-template-variable,.vscode-dark .hljs-link,.vscode-dark .hljs-selector-attr,.vscode-dark .hljs-selector-pseudo,
  .vscode-high-contrast .hljs-number,.vscode-high-contrast .hljs-regexp,.vscode-high-contrast .hljs-variable,.vscode-high-contrast .hljs-template-variable,.vscode-high-contrast .hljs-link,.vscode-high-contrast .hljs-selector-attr,.vscode-high-contrast .hljs-selector-pseudo { color: #b5cea8; }
  .vscode-dark .hljs-doctag,.vscode-dark .hljs-title.function_,.vscode-high-contrast .hljs-doctag,.vscode-high-contrast .hljs-title.function_ { color: #dcdcaa; }
  .vscode-dark .hljs-title.class_,.vscode-dark .hljs-class .hljs-title,.vscode-high-contrast .hljs-title.class_,.vscode-high-contrast .hljs-class .hljs-title { color: #4ec9b0; }
  .vscode-dark .hljs-symbol,.vscode-dark .hljs-bullet,.vscode-dark .hljs-subst,.vscode-dark .hljs-meta .hljs-keyword,
  .vscode-high-contrast .hljs-symbol,.vscode-high-contrast .hljs-bullet,.vscode-high-contrast .hljs-subst,.vscode-high-contrast .hljs-meta .hljs-keyword { color: #9cdcfe; }
  /* Light → VS Code Light+ palette */
  .vscode-light .hljs-keyword,.vscode-light .hljs-selector-tag,.vscode-light .hljs-built_in,.vscode-light .hljs-name,.vscode-light .hljs-tag { color: #0000ff; }
  .vscode-light .hljs-string,.vscode-light .hljs-title,.vscode-light .hljs-section,.vscode-light .hljs-attribute,.vscode-light .hljs-literal,.vscode-light .hljs-template-tag,.vscode-light .hljs-template-variable,.vscode-light .hljs-type,.vscode-light .hljs-addition { color: #a31515; }
  .vscode-light .hljs-comment,.vscode-light .hljs-quote,.vscode-light .hljs-deletion,.vscode-light .hljs-meta { color: #008000; }
  .vscode-light .hljs-number,.vscode-light .hljs-regexp,.vscode-light .hljs-variable,.vscode-light .hljs-template-variable,.vscode-light .hljs-link,.vscode-light .hljs-selector-attr,.vscode-light .hljs-selector-pseudo { color: #098658; }
  .vscode-light .hljs-doctag,.vscode-light .hljs-title.function_ { color: #795e26; }
  .vscode-light .hljs-title.class_,.vscode-light .hljs-class .hljs-title { color: #267f99; }
  .vscode-light .hljs-symbol,.vscode-light .hljs-bullet,.vscode-light .hljs-subst,.vscode-light .hljs-meta .hljs-keyword { color: #001080; }
</style>
</head>
<body>
<h1>${safeName}<span id="model-badge"></span></h1>
<details id="mcp-panel">
  <summary>MCP Servers <span id="mcp-count" class="mcp-badge">0</span></summary>
  <div id="mcp-list" class="mcp-list"></div>
  <div class="mcp-add-row">
    <input id="mcp-name-input" type="text" placeholder="server-name" autocomplete="off" />
    <input id="mcp-json-input" type="text" placeholder='{"command":"npx","args":["@pkg/server"]}' autocomplete="off" />
    <button id="mcp-add-btn" class="mcp-add-btn" type="button">Add</button>
  </div>
</details>
<div id="transcript" aria-live="polite"></div>
<div id="status"></div>
<form id="prompt-form">
  <div id="input-wrap">
    <div id="autocomplete" class="autocomplete hidden"></div>
    <textarea id="input" rows="3" placeholder="Type a prompt… / for commands, Cmd/Ctrl+Enter to send" aria-label="Prompt"></textarea>
  </div>
  <button type="button" id="submit-btn">Send</button>
  <button type="button" id="stop-btn" class="hidden">Stop</button>
</form>
<script src="${webviewScriptUri}"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
