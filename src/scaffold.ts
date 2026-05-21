import { cp } from "node:fs/promises";

/**
 * Recursively copy a directory's contents into a destination.
 *
 * Thin wrapper around Node's built-in `fs.cp` (stable since Node 16.7,
 * fully supported under our Node 20 target). Wrapping it leaves a single
 * seam for future post-processing (e.g. placeholder substitution in the
 * codeatlas scaffold files).
 *
 * Used by the New Project command to seed a project from
 * `extension/resources/scaffolds/codeatlas/` per DESIGN Decision 7.
 */
export async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await cp(src, dest, { recursive: true });
}
