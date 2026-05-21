import * as path from "node:path";

/**
 * Default location for new Agent Desktop projects.
 *
 * Returns `<homeDir>/agent-desktop-projects/<slug>` per IMPL-GUIDE Step 6.
 * Pure: no filesystem side effects. Caller creates the directory.
 */
export function defaultProjectPath(homeDir: string, name: string): string {
  return path.join(homeDir, "agent-desktop-projects", slugify(name));
}

/**
 * Convert a free-form project name into a filesystem-safe folder slug.
 *
 * - Lowercase
 * - Spaces/underscores → single hyphen
 * - Strip everything outside `[a-z0-9-]`
 * - Collapse repeated hyphens
 * - Trim leading/trailing hyphens
 * - Fallback to `"project"` if the result is empty (e.g. all-symbol input)
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}
