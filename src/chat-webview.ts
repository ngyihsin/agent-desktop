import * as vscode from "vscode";
import { getChatHtml } from "./chat-html";
import type { ToWebview, FromWebview, TranscriptMessage } from "./webview-protocol";

// Re-export so callers only need to import from this file.
export type { ToWebview, FromWebview, TranscriptMessage };

/**
 * Wraps a `vscode.WebviewPanel` with the typed message protocol.
 *
 * The panel loads `out/webview.js` (bundled from `src/webview-main.ts`) which
 * handles all rendering, including markdown + syntax highlighting. The
 * extension host only sends typed `ToWebview` messages and receives typed
 * `FromWebview` messages.
 */
export class ChatWebviewPanel {
  static readonly viewType = "agentDesktopChat";

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private onMessageHandler?: (msg: FromWebview) => void;
  private onDisposeHandler?: () => void;

  constructor(displayName: string, extensionUri: vscode.Uri) {
    const webviewScriptUri = vscode.Uri.joinPath(extensionUri, "out", "webview.js");

    this.panel = vscode.window.createWebviewPanel(
      ChatWebviewPanel.viewType,
      `Agent Desktop: ${displayName}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
      },
    );

    const scriptUri = this.panel.webview.asWebviewUri(webviewScriptUri).toString();
    this.panel.webview.html = getChatHtml(displayName, scriptUri, this.panel.webview.cspSource);

    this.panel.webview.onDidReceiveMessage(
      (msg: FromWebview) => this.onMessageHandler?.(msg),
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  send(msg: ToWebview): void {
    void this.panel.webview.postMessage(msg);
  }

  onMessage(handler: (msg: FromWebview) => void): void {
    this.onMessageHandler = handler;
  }

  onDispose(handler: () => void): void {
    this.onDisposeHandler = handler;
  }

  reveal(): void {
    this.panel.reveal();
  }

  dispose(): void {
    this.onDisposeHandler?.();
    this.onDisposeHandler = undefined;
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }
}
