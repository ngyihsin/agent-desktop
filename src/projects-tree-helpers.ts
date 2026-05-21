/**
 * Minimal shape we need from a filesystem entry. Matches `node:fs/Dirent`
 * but kept structural so tests don't need a real fs entry.
 */
export interface DirentLike {
  name: string;
  isDirectory(): boolean;
}

/**
 * Order directory entries the way the user expects in a file tree:
 * directories first, then files, alphabetical within each group.
 *
 * Hidden files (leading dot, e.g. `.upstream-commit`) are *not* filtered —
 * the codeatlas scaffold uses them deliberately. A future "hide dotfiles"
 * toggle (Phase 4 polish) can layer on top.
 */
export function sortFsEntries<T extends DirentLike>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const aDir = a.isDirectory();
    const bDir = b.isDirectory();
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.name.localeCompare(b.name);
  });
}
