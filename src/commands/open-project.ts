import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ProjectStore } from "../project-store";
import type { OpenProjectFn } from "./open-chat";

export async function runOpenProjectCommand(
  store: ProjectStore,
  onStored: () => void,
  openProject: OpenProjectFn,
): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    title: "Agent Desktop: Open Project",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Open as Agent Desktop Project",
  });
  if (!uris || uris.length === 0) return;

  const folderPath = uris[0].fsPath;

  const warmUpPath = path.join(folderPath, "AGENT-warm-up.md");
  try {
    await fs.access(warmUpPath);
  } catch {
    await vscode.window.showErrorMessage(
      `Agent Desktop: no AGENT-warm-up.md found in ${folderPath} — ` +
        `is this an Agent Desktop project folder?`,
    );
    return;
  }

  let entry = store.get(folderPath);
  if (!entry) {
    entry = {
      sessionId: randomUUID(),
      displayName: path.basename(folderPath),
      createdAt: new Date().toISOString(),
      lastResumeAt: null,
    };
    await store.set(folderPath, entry);
    onStored();
  }

  openProject(folderPath, entry);
}
