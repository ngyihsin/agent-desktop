import * as vscode from "vscode";
import type { SharedChatPanel } from "../shared-chat-panel";
import type { ProjectStore } from "../project-store";
import type { SessionManager } from "../session-manager";

export async function runQuoteInChatCommand(
  store: ProjectStore,
  sessions: Map<string, SessionManager>,
  sharedPanel: SharedChatPanel,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    await vscode.window.showInformationMessage(
      "Agent Desktop: select some text first, then run Quote in Chat.",
    );
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const selectedText = editor.document.getText(editor.selection);

  const match = store
    .list()
    .find(
      ({ folderPath }) =>
        filePath.startsWith(folderPath + "/") || filePath === folderPath,
    );

  if (!match) {
    await vscode.window.showWarningMessage(
      "Agent Desktop: this file doesn't belong to a known project. Open the project first.",
    );
    return;
  }

  if (!sessions.has(match.folderPath)) {
    await vscode.window.showWarningMessage(
      `Agent Desktop: no open session for "${match.entry.displayName}". Open the project first.`,
    );
    return;
  }

  // Switch to that project if it isn't already active.
  if (sharedPanel.activeProjectPath !== match.folderPath) {
    sharedPanel.switchToProject(
      match.folderPath,
      match.entry.displayName,
      sessions.get(match.folderPath)!.getTranscript(),
    );
  }

  sharedPanel.send({ kind: "quote_text", text: selectedText, fileName: filePath });
}
