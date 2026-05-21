import type { ProjectStoreEntry } from "../project-store";

/**
 * Seed sent on the very first turn of any new project so Claude bootstraps
 * from the codeatlas `AGENT-warm-up.md` without the user having to type it.
 */
export const FRESH_PROJECT_SEED =
  "Read AGENT-warm-up.md and follow its bootstrap protocol. Tell me what context you need from me.";

/**
 * Callback type passed into command handlers so they can open/switch to a
 * project without importing vscode or knowing about SharedChatPanel.
 * Defined and closed over in `extension.ts`.
 */
export type OpenProjectFn = (folderPath: string, entry: ProjectStoreEntry) => void;
