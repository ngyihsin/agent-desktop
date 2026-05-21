import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ProjectStore, ProjectStoreEntry } from "./project-store";
import { sortFsEntries } from "./projects-tree-helpers";

/**
 * Element types in the Projects tree.
 *
 * - `project`: a top-level node, one per stored project.
 * - `fsNode`: a file or directory inside a project's folder. Subtrees are
 *   lazily loaded via `fs.readdir` on expand.
 */
export type TreeElement =
  | { kind: "project"; folderPath: string; entry: ProjectStoreEntry }
  | { kind: "fsNode"; absolutePath: string; isDirectory: boolean };

/**
 * Tree data provider for the Agent Desktop > Projects view.
 *
 * Top level = projects from `ProjectStore.list()`. Each project expands into
 * its workspace folder's file tree. Clicking a file fires the
 * `agentDesktop.openFileInPrimaryColumn` command (registered in
 * `extension.ts`) which opens the file in editor column 1, keeping the
 * chat in column 2 undisturbed.
 */
export class ProjectsTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: ProjectStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.kind === "project") {
      const item = new vscode.TreeItem(
        element.entry.displayName,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.description = element.folderPath;
      item.iconPath = new vscode.ThemeIcon("comment-discussion");
      item.contextValue = "agentDesktopProject";
      item.tooltip = element.folderPath;
      // No item.command — project selection is handled via
      // treeView.onDidChangeSelection in extension.ts, which fires reliably
      // for collapsible items (item.command does not).
      return item;
    }

    // fsNode
    const basename = path.basename(element.absolutePath);
    const item = new vscode.TreeItem(
      basename,
      element.isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    // resourceUri makes VS Code render the correct file-icon based on the
    // user's icon theme — no manual icon mapping needed.
    item.resourceUri = vscode.Uri.file(element.absolutePath);
    if (!element.isDirectory) {
      item.command = {
        command: "agentDesktop.openFileInPrimaryColumn",
        arguments: [item.resourceUri],
        title: "Open File",
      };
      item.contextValue = "agentDesktopFile";
    } else {
      item.contextValue = "agentDesktopDir";
    }
    return item;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) {
      // Top level: every stored project.
      return this.store.list().map(
        ({ folderPath, entry }): TreeElement => ({
          kind: "project",
          folderPath,
          entry,
        }),
      );
    }

    const baseDir =
      element.kind === "project" ? element.folderPath : element.absolutePath;

    try {
      const dirents = await fs.readdir(baseDir, { withFileTypes: true });
      const sorted = sortFsEntries(dirents);
      return sorted.map(
        (d): TreeElement => ({
          kind: "fsNode",
          absolutePath: path.join(baseDir, d.name),
          isDirectory: d.isDirectory(),
        }),
      );
    } catch {
      // Folder may have been deleted underneath us; show empty.
      return [];
    }
  }
}
