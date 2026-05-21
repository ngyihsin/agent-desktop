import * as vscode from "vscode";
import { getChatHtml } from "./chat-html";
import type { ChatSender } from "./session-manager";
import type { FromWebview, ToWebview, TranscriptMessage } from "./webview-protocol";

/**
 * A single `vscode.WebviewPanel` shared across all projects.
 *
 * Instead of one panel per project (which creates separate tabs), this panel
 * acts as a container: clicking a project in the sidebar calls
 * `switchToProject`, which updates the panel title and replays that project's
 * transcript. Sessions for all projects continue running in the background;
 * only the active project's streaming events are forwarded to the panel.
 *
 * Background turns (started while the project is not active) are not lost —
 * their completed messages land in the SessionManager transcript and are
 * replayed the next time the user switches to that project.
 */
export class SharedChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private _activeProjectPath: string | null = null;
  private _messageHandler?: (projectPath: string, msg: FromWebview) => void;

  get activeProjectPath(): string | null {
    return this._activeProjectPath;
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  /** The actual column the panel is in, or undefined if not yet created. */
  get viewColumn(): vscode.ViewColumn | undefined {
    return this.panel?.viewColumn;
  }

  /**
   * Ensure the chat panel is visible.
   *
   * On first open, sets a two-column editor layout (files left, chat right)
   * before creating the panel so the chat always lands in column 2 regardless
   * of whether any files are currently open.  Subsequent calls just reveal the
   * existing panel without touching the layout.
   */
  async show(extensionUri: vscode.Uri): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    // Establish the two-column split: column 1 for files, column 2 for chat.
    // Wrapped in try/catch — if the command is unavailable or the workbench
    // isn't ready, panel creation still proceeds.
    try {
      await vscode.commands.executeCommand("workbench.action.setEditorLayout", {
        orientation: 0,
        groups: [{ size: 0.6 }, { size: 0.4 }],
      });
    } catch {
      // Not fatal — the panel will open in whatever column VS Code chooses.
    }

    const webviewScriptUri = vscode.Uri.joinPath(extensionUri, "out", "webview.js");
    this.panel = vscode.window.createWebviewPanel(
      "agentDesktopChat",
      "Agent Desktop",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
      },
    );
    const scriptUri = this.panel.webview.asWebviewUri(webviewScriptUri).toString();
    this.panel.webview.html = getChatHtml("Agent Desktop", scriptUri, this.panel.webview.cspSource);

    this.panel.webview.onDidReceiveMessage((msg: FromWebview) => {
      if (this._activeProjectPath) {
        this._messageHandler?.(this._activeProjectPath, msg);
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this._activeProjectPath = null;
    });
  }

  /**
   * Switch the panel to display a different project.
   * Updates the title, sets the active project, and replays the transcript
   * so the user sees the correct history immediately.
   */
  switchToProject(
    folderPath: string,
    displayName: string,
    transcript: readonly TranscriptMessage[],
  ): void {
    this._activeProjectPath = folderPath;
    if (!this.panel) return;
    this.panel.title = `Agent Desktop: ${displayName}`;
    this.panel.reveal();
    void this.panel.webview.postMessage({
      kind: "transcript_replay",
      messages: [...transcript],
    } satisfies ToWebview);
  }

  /**
   * Returns a `ChatSender` scoped to `folderPath`.
   * Messages are only forwarded to the webview when that project is active;
   * background-session events are silently dropped (replayed on next switch).
   */
  senderFor(folderPath: string): ChatSender {
    return {
      send: (msg: ToWebview) => {
        if (this._activeProjectPath === folderPath) {
          this._post(msg);
        }
      },
    };
  }

  /** Send directly to the panel regardless of which project is active. */
  send(msg: ToWebview): void {
    this._post(msg);
  }

  /**
   * Clear the panel after the active project is removed.
   * Resets the title and shows an empty transcript.
   */
  reset(): void {
    this._activeProjectPath = null;
    if (!this.panel) return;
    this.panel.title = "Agent Desktop";
    void this.panel.webview.postMessage({
      kind: "transcript_replay",
      messages: [],
    } satisfies ToWebview);
  }

  /** Register the extension-host handler that routes webview messages to sessions. */
  onMessage(handler: (projectPath: string, msg: FromWebview) => void): void {
    this._messageHandler = handler;
  }

  private _post(msg: ToWebview): void {
    void this.panel?.webview.postMessage(msg);
  }
}
