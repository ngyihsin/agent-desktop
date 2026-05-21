import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import type { ProjectStore } from "../project-store";
import type { OpenProjectFn } from "./open-chat";
import { buildRecentProjectItems } from "./recent-items";

async function pathExists(folderPath: string): Promise<boolean> {
  try {
    const s = await fs.stat(folderPath);
    return s.isDirectory();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

export async function runOpenRecentCommand(
  _context: vscode.ExtensionContext,
  store: ProjectStore,
  openProject: OpenProjectFn,
): Promise<void> {
  const items = buildRecentProjectItems(store.list());

  if (items.length === 0) {
    await vscode.window.showInformationMessage(
      "Agent Desktop: no recent projects. Run 'Agent Desktop: New Project' to create one.",
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: "Agent Desktop: Recent Projects",
    placeHolder: "Pick a project to reopen",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;

  if (!(await pathExists(picked.folderPath))) {
    const choice = await vscode.window.showWarningMessage(
      `Agent Desktop: project folder no longer exists at ${picked.folderPath}.`,
      "Remove from list",
      "Cancel",
    );
    if (choice === "Remove from list") {
      await store.remove(picked.folderPath);
    }
    return;
  }

  openProject(picked.folderPath, picked.entry);
}
