/**
 * Per-project persisted state — see DESIGN Decision 6.
 *
 * One entry per project folder. Survives VS Code restarts via `globalState`
 * (Memento). The folder absolute path is the key; the entry holds the
 * stable claude `--session-id` plus a few bookkeeping fields used by the
 * sidebar and the resume flow.
 */
export type ProjectStoreEntry = {
  sessionId: string;             // uuid v4 — passed to `claude --session-id` / `--resume`
  displayName: string;           // user-chosen project name
  createdAt: string;             // ISO 8601
  lastResumeAt: string | null;   // null until the first successful --resume
  modelHint?: string;            // optional per-project model override (e.g. "sonnet")
  allowedDirs?: string[];        // extra dirs passed via --add-dir (DESIGN Decision 2 evolution)
};

export type ProjectListItem = {
  folderPath: string;
  entry: ProjectStoreEntry;
};

/**
 * Structural shape that matches `vscode.Memento`. Defined here so this file
 * stays vscode-free and can be unit-tested with an in-memory fake.
 */
export interface MementoLike {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

const STORAGE_KEY = "agentDesktop.projects";

type StoredMap = Record<string, ProjectStoreEntry>;

/**
 * Stores all projects under a single Memento key as `{ [folderPath]: entry }`.
 * Single key keeps `list()` cheap and avoids touching `memento.keys()`
 * (which is not part of the `MementoLike` minimal interface).
 */
export class ProjectStore {
  constructor(private readonly memento: MementoLike) {}

  list(): ProjectListItem[] {
    const map = this.memento.get<StoredMap>(STORAGE_KEY, {});
    return Object.entries(map).map(([folderPath, entry]) => ({ folderPath, entry }));
  }

  get(folderPath: string): ProjectStoreEntry | undefined {
    const map = this.memento.get<StoredMap>(STORAGE_KEY, {});
    return map[folderPath];
  }

  async set(folderPath: string, entry: ProjectStoreEntry): Promise<void> {
    const map = this.memento.get<StoredMap>(STORAGE_KEY, {});
    map[folderPath] = entry;
    await this.memento.update(STORAGE_KEY, map);
  }

  async update(
    folderPath: string,
    patch: Partial<ProjectStoreEntry>,
  ): Promise<void> {
    const map = this.memento.get<StoredMap>(STORAGE_KEY, {});
    const current = map[folderPath];
    if (!current) {
      throw new Error(`ProjectStore.update: no entry for path ${folderPath}`);
    }
    map[folderPath] = { ...current, ...patch };
    await this.memento.update(STORAGE_KEY, map);
  }

  async remove(folderPath: string): Promise<void> {
    const map = this.memento.get<StoredMap>(STORAGE_KEY, {});
    if (!(folderPath in map)) return;
    delete map[folderPath];
    if (Object.keys(map).length === 0) {
      // Drop the storage key entirely when no projects remain.
      await this.memento.update(STORAGE_KEY, undefined);
    } else {
      await this.memento.update(STORAGE_KEY, map);
    }
  }
}
