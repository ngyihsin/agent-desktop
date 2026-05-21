import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_WORKSPACE_FILE = path.join(
  os.homedir(),
  "agent-desktop-projects",
  "agent-desktop.code-workspace",
);

/**
 * Write (or overwrite) the multi-root `.code-workspace` file listing every
 * known project folder. VS Code picks up changes when the user opens the
 * file; existing open windows are unaffected.
 *
 * `workspaceFile` is injectable for testing (default = `DEFAULT_WORKSPACE_FILE`).
 */
export async function syncCodeWorkspace(
  folderPaths: string[],
  workspaceFile: string = DEFAULT_WORKSPACE_FILE,
): Promise<void> {
  await fs.mkdir(path.dirname(workspaceFile), { recursive: true });
  const content = {
    folders: folderPaths.map((p) => ({ path: p })),
    settings: {},
  };
  await fs.writeFile(workspaceFile, JSON.stringify(content, null, 2) + "\n", "utf8");
}
