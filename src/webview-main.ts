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
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const autocompleteEl = document.getElementById("autocomplete") as HTMLDivElement;

// Tracks the div for the assistant turn currently streaming.
let activeAssistantEl: HTMLElement | null = null;
// Accumulates raw markdown text during streaming.
let activeAssistantText = "";

// --- Autocomplete state ---
let availableCommands: string[] = [];
let autocompleteIndex = -1;

function showAutocomplete(filter: string): void {
  const matches = availableCommands.filter((c) => c.startsWith(filter)).slice(0, 9);
  if (matches.length === 0) { hideAutocomplete(); return; }
  autocompleteEl.innerHTML = "";
  autocompleteIndex = -1;
  for (const cmd of matches) {
    const item = document.createElement("div");
    item.className = "autocomplete-item";
    const name = document.createElement("span");
    name.className = "cmd-name";
    name.textContent = `/${cmd}`;
    item.appendChild(name);
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      inputEl.value = `/${cmd} `;
      hideAutocomplete();
      inputEl.focus();
    });
    autocompleteEl.appendChild(item);
  }
  autocompleteEl.classList.remove("hidden");
}

function hideAutocomplete(): void {
  autocompleteEl.classList.add("hidden");
  autocompleteEl.innerHTML = "";
  autocompleteIndex = -1;
}

function moveAutocompleteSelection(delta: number): void {
  const items = autocompleteEl.querySelectorAll<HTMLElement>(".autocomplete-item");
  autocompleteIndex = Math.max(-1, Math.min(autocompleteIndex + delta, items.length - 1));
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === autocompleteIndex);
    if (i === autocompleteIndex) item.scrollIntoView({ block: "nearest" });
  });
}

function selectAutocompleteItem(): boolean {
  if (autocompleteEl.classList.contains("hidden") || autocompleteIndex < 0) return false;
  const items = autocompleteEl.querySelectorAll<HTMLElement>(".autocomplete-item");
  const selected = items[autocompleteIndex];
  if (!selected) return false;
  inputEl.value = (selected.textContent ?? "") + " ";
  hideAutocomplete();
  return true;
}

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
  stopBtn.classList.toggle("hidden", !busy);
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
    case "status_update": {
      const labels: Record<string, string> = {
        requesting: "Thinking…",
      };
      statusEl.textContent = msg.status ? (labels[msg.status] ?? msg.status) : "";
      break;
    }

    case "turn_started": {
      statusEl.textContent = "";
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

    case "tool_uses": {
      if (!activeAssistantEl) break;
      let toolsEl = activeAssistantEl.querySelector<HTMLElement>(".tool-calls");
      if (!toolsEl) {
        toolsEl = document.createElement("div");
        toolsEl.className = "tool-calls";
        const pre = activeAssistantEl.querySelector("pre.stream-text");
        if (pre) {
          activeAssistantEl.insertBefore(toolsEl, pre);
        } else {
          activeAssistantEl.appendChild(toolsEl);
        }
      }
      for (const tool of msg.tools) {
        const details = document.createElement("details");
        details.className = "tool-call";
        const summary = document.createElement("summary");
        const icon = document.createElement("span");
        icon.className = "tool-icon";
        icon.textContent = "⚙";
        const name = document.createElement("span");
        name.className = "tool-name";
        name.textContent = tool.name;
        summary.appendChild(icon);
        summary.appendChild(name);
        details.appendChild(summary);
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(tool.input, null, 2);
        details.appendChild(pre);
        toolsEl.appendChild(details);
      }
      scrollToBottom();
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

    case "grant_access_prompt": {
      // Remove any existing banner first (avoid duplicates).
      document.getElementById("grant-access-banner")?.remove();
      const banner = document.createElement("div");
      banner.id = "grant-access-banner";
      banner.className = "grant-access-banner";
      banner.innerHTML =
        `<span>⚠️ Claude needs access to a directory outside this project.</span>` +
        `<button class="grant-access-btn">Grant Directory Access</button>`;
      banner.querySelector("button")!.addEventListener("click", () => {
        banner.remove();
        vscode.postMessage({ kind: "grant_access" } satisfies FromWebview);
      });
      transcriptEl.appendChild(banner);
      scrollToBottom();
      break;
    }

    case "commands_available": {
      availableCommands = msg.commands;
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

stopBtn.addEventListener("click", () => {
  vscode.postMessage({ kind: "interrupt" } satisfies FromWebview);
  setBusy(false);
});

inputEl.addEventListener("input", () => {
  const val = inputEl.value;
  if (val.startsWith("/") && !val.includes(" ") && !val.includes("\n")) {
    showAutocomplete(val.slice(1));
  } else {
    hideAutocomplete();
  }
});

inputEl.addEventListener("blur", () => hideAutocomplete());

inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
  const isOpen = !autocompleteEl.classList.contains("hidden");
  if (isOpen) {
    if (e.key === "ArrowDown") { e.preventDefault(); moveAutocompleteSelection(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); moveAutocompleteSelection(-1); return; }
    if (e.key === "Escape") { e.preventDefault(); hideAutocomplete(); return; }
    if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
      if (selectAutocompleteItem()) { e.preventDefault(); return; }
    }
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    submitPrompt();
  }
});

// Ask for any persisted transcript on first paint.
vscode.postMessage({ kind: "request_transcript" });
