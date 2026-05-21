/// <reference lib="dom" />

/**
 * Webview-side script bundled by esbuild into out/webview.js.
 *
 * Runs in a VS Code WebviewPanel (browser context). Handles:
 *   - Streaming text deltas → append to <pre> during turn
 *   - turn_complete → replace <pre> with marked-rendered markdown + hljs
 *   - transcript_replay → render full history on first paint / resume
 *   - quote_text → insert selected text as a markdown blockquote into the input
 */

import { marked } from "marked";
import hljs from "highlight.js";
import type { ToWebview, FromWebview } from "./webview-protocol";

// acquireVsCodeApi is injected by VS Code into every WebviewPanel at runtime.
declare function acquireVsCodeApi(): {
  postMessage(msg: FromWebview): void;
};

const vscode = acquireVsCodeApi();

// --- DOM refs ---
const transcriptEl = document.getElementById("transcript") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const form = document.getElementById("prompt-form") as HTMLFormElement;
const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;

// Tracks the div for the assistant turn currently streaming.
let activeAssistantEl: HTMLElement | null = null;
// Accumulates raw markdown text during streaming.
let activeAssistantText = "";

// --- Helpers ---

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}

function applyHighlighting(container: HTMLElement): void {
  container.querySelectorAll("pre code").forEach((el) => {
    hljs.highlightElement(el as HTMLElement);
  });
}

function scrollToBottom(): void {
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function setBusy(busy: boolean): void {
  submitBtn.disabled = busy;
  inputEl.disabled = busy;
  submitBtn.textContent = busy ? "Sending…" : "Send";
}

function buildUserDiv(text: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "turn user";
  const label = document.createElement("div");
  label.className = "role-label";
  label.textContent = "You";
  const content = document.createElement("pre");
  content.className = "user-text";
  content.textContent = text;
  div.appendChild(label);
  div.appendChild(content);
  return div;
}

function buildAssistantDiv(text: string, badge?: string): HTMLElement {
  const div = document.createElement("div");
  div.className = "turn assistant";
  const label = document.createElement("div");
  label.className = "role-label";
  label.textContent = "Claude";
  const content = document.createElement("div");
  content.className = "content markdown";
  content.innerHTML = renderMarkdown(text);
  applyHighlighting(content);
  div.appendChild(label);
  div.appendChild(content);
  if (badge) {
    const b = document.createElement("div");
    b.className = "turn-badge";
    b.textContent = badge;
    div.appendChild(b);
  }
  return div;
}

// --- Message handler ---

window.addEventListener("message", (e: MessageEvent) => {
  const msg = e.data as ToWebview;
  switch (msg.kind) {
    case "turn_started": {
      const div = document.createElement("div");
      div.className = "turn assistant streaming";
      div.dataset.turnId = msg.turnId;
      const label = document.createElement("div");
      label.className = "role-label";
      label.textContent = "Claude";
      const pre = document.createElement("pre");
      pre.className = "stream-text";
      div.appendChild(label);
      div.appendChild(pre);
      transcriptEl.appendChild(div);
      activeAssistantEl = div;
      activeAssistantText = "";
      scrollToBottom();
      break;
    }

    case "text_delta": {
      if (activeAssistantEl?.dataset.turnId === msg.turnId) {
        activeAssistantText += msg.text;
        const pre = activeAssistantEl.querySelector("pre.stream-text");
        if (pre) pre.textContent = activeAssistantText;
        scrollToBottom();
      }
      break;
    }

    case "turn_complete": {
      if (activeAssistantEl) {
        const badge = `$${msg.cost_usd.toFixed(4)} · ${Math.round(msg.context_pct * 100)}% ctx`;
        const content = document.createElement("div");
        content.className = "content markdown";
        content.innerHTML = renderMarkdown(activeAssistantText);
        applyHighlighting(content);

        const pre = activeAssistantEl.querySelector("pre.stream-text");
        if (pre) activeAssistantEl.replaceChild(content, pre);

        const b = document.createElement("div");
        b.className = "turn-badge";
        b.textContent = badge;
        activeAssistantEl.appendChild(b);
        activeAssistantEl.classList.remove("streaming");

        activeAssistantEl = null;
        activeAssistantText = "";
        scrollToBottom();
      }
      statusEl.textContent = "";
      setBusy(false);
      inputEl.focus();
      break;
    }

    case "compact_started": {
      statusEl.textContent = "Compacting context…";
      break;
    }

    case "compact_done": {
      statusEl.textContent = `Context compacted → ${Math.round(msg.new_context_pct * 100)}%`;
      setTimeout(() => {
        statusEl.textContent = "";
      }, 3_000);
      break;
    }

    case "transcript_replay": {
      transcriptEl.innerHTML = "";
      for (const m of msg.messages) {
        transcriptEl.appendChild(
          m.role === "user"
            ? buildUserDiv(m.text)
            : buildAssistantDiv(m.text),
        );
      }
      scrollToBottom();
      break;
    }

    case "error": {
      setBusy(false);
      const div = document.createElement("div");
      div.className = "turn error";
      div.textContent = `Error: ${msg.message}`;
      transcriptEl.appendChild(div);
      scrollToBottom();
      break;
    }

    case "quote_text": {
      // Prepend quoted block to the input, formatted as a markdown blockquote.
      const shortName = msg.fileName.split("/").pop() ?? msg.fileName;
      const quoted = msg.text
        .split("\n")
        .map((line: string) => `> ${line}`)
        .join("\n");
      const prefix = inputEl.value.trim() ? inputEl.value + "\n\n" : "";
      inputEl.value = `${prefix}${quoted}\n\n*(from \`${escapeHtml(shortName)}\`)*\n\n`;
      inputEl.focus();
      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      break;
    }
  }
});

// --- Submit ---

function submitPrompt(): void {
  const text = inputEl.value.trim();
  if (!text) return;
  transcriptEl.appendChild(buildUserDiv(text));
  scrollToBottom();
  inputEl.value = "";
  setBusy(true);
  vscode.postMessage({ kind: "submit_prompt", text });
}

form.addEventListener("submit", (e: SubmitEvent) => {
  e.preventDefault();
  submitPrompt();
});

submitBtn.addEventListener("click", submitPrompt);

inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    submitPrompt();
  }
});

// Ask for any persisted transcript on first paint.
vscode.postMessage({ kind: "request_transcript" });
