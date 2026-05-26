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
  h1 { font-size: 13px; font-weight: 600; margin: 0 0 12px 0; color: var(--vscode-descriptionForeground); }
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

  /* ── Syntax highlighting (VS Code dark+ compatible) ──────── */
  .hljs { display: block; overflow-x: auto; padding: 12px; background: var(--vscode-textCodeBlock-background, #1e1e1e); color: var(--vscode-editor-foreground, #d4d4d4); border-radius: 4px; }
  .hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-name,.hljs-tag { color: #569cd6; }
  .hljs-string,.hljs-title,.hljs-section,.hljs-attribute,.hljs-literal,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-addition { color: #ce9178; }
  .hljs-string { color: #ce9178; }
  .hljs-comment,.hljs-quote,.hljs-deletion,.hljs-meta { color: #6a9955; }
  .hljs-number,.hljs-regexp,.hljs-variable,.hljs-template-variable,.hljs-link,.hljs-selector-attr,.hljs-selector-pseudo { color: #b5cea8; }
  .hljs-doctag,.hljs-title.function_ { color: #dcdcaa; }
  .hljs-title.class_,.hljs-class .hljs-title { color: #4ec9b0; }
  .hljs-symbol,.hljs-bullet,.hljs-subst,.hljs-meta .hljs-keyword { color: #9cdcfe; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: bold; }
</style>
</head>
<body>
<h1>${safeName}</h1>
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
