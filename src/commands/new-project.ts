import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { defaultProjectPath } from "../paths";
import { ProjectStore, type ProjectStoreEntry } from "../project-store";
import { copyDirectoryRecursive } from "../scaffold";
import type { OpenProjectFn } from "./open-chat";

function scaffoldSourcePath(context: vscode.ExtensionContext): string {
  return path.join(
    context.extensionUri.fsPath,
    "extension",
    "resources",
    "scaffolds",
    "codeatlas",
  );
}

async function checkTargetIsAvailable(targetPath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) return `Target exists and is not a directory: ${targetPath}`;
    const entries = await fs.readdir(targetPath);
    if (entries.length > 0) return `Target folder is not empty: ${targetPath}`;
    return null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    return `Cannot stat target: ${(e as Error).message}`;
  }
}

export async function runNewProjectCommand(
  context: vscode.ExtensionContext,
  store: ProjectStore,
  onStored: () => void,
  openProject: OpenProjectFn,
): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: "Agent Desktop: New Project",
    prompt: "Project name",
    placeHolder: "my-onboarding-project",
    validateInput: (v) => (v.trim() ? null : "Name cannot be empty"),
  });
  if (!name) return;

  const trimmedName = name.trim();
  const defaultPath = defaultProjectPath(os.homedir(), trimmedName);

  const targetPath = await vscode.window.showInputBox({
    title: "Agent Desktop: New Project — location",
    prompt: "Folder for the new project (must not exist or be empty)",
    value: defaultPath,
  });
  if (!targetPath) return;

  const availabilityError = await checkTargetIsAvailable(targetPath);
  if (availabilityError) {
    await vscode.window.showErrorMessage(`Agent Desktop: ${availabilityError}`);
    return;
  }

  try {
    await copyDirectoryRecursive(scaffoldSourcePath(context), targetPath);
  } catch (e) {
    await vscode.window.showErrorMessage(
      `Agent Desktop: scaffold copy failed — ${(e as Error).message}`,
    );
    return;
  }

  const entry: ProjectStoreEntry = {
    sessionId: randomUUID(),
    displayName: trimmedName,
    createdAt: new Date().toISOString(),
    lastResumeAt: null,
  };
  await store.set(targetPath, entry);
  onStored();

  await vscode.window.showInformationMessage(
    `Agent Desktop: project "${entry.displayName}" created at ${targetPath} ` +
      `(session ${entry.sessionId.slice(0, 8)}…)`,
  );

  openProject(targetPath, entry);
}
