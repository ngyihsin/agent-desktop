import type { ProjectListItem, ProjectStoreEntry } from "../project-store";

/**
 * Shape of one entry in the "Recent Projects" QuickPick. Carries the
 * underlying `folderPath` and `entry` so the handler can act on selection
 * without an extra store lookup.
 *
 * Kept in a vscode-free module so it can be unit-tested without spinning
 * up the extension host.
 */
export interface RecentProjectItem {
  label: string;
  description: string;
  detail: string;
  folderPath: string;
  entry: ProjectStoreEntry;
}

/**
 * Build QuickPick items from a `ProjectStore.list()` result.
 *
 * - `label` is the user-chosen displayName.
 * - `description` is the absolute folder path.
 * - `detail` shows "last resumed …" if available, otherwise "created …".
 */
export function buildRecentProjectItems(
  items: readonly ProjectListItem[],
): RecentProjectItem[] {
  return items.map(({ folderPath, entry }) => ({
    label: entry.displayName,
    description: folderPath,
    detail: entry.lastResumeAt
      ? `last resumed ${entry.lastResumeAt}`
      : `created ${entry.createdAt}`,
    folderPath,
    entry,
  }));
}
