import { beforeEach, describe, expect, it } from "vitest";
import {
  type MementoLike,
  ProjectStore,
  type ProjectStoreEntry,
} from "../../src/project-store";

class FakeMemento implements MementoLike {
  private map = new Map<string, unknown>();

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.map.has(key)) return this.map.get(key) as T;
    return defaultValue;
  }

  update(key: string, value: unknown): PromiseLike<void> {
    if (value === undefined) {
      this.map.delete(key);
    } else {
      this.map.set(key, value);
    }
    return Promise.resolve();
  }

  // test helper
  rawHasKey(key: string): boolean {
    return this.map.has(key);
  }
}

function makeEntry(overrides: Partial<ProjectStoreEntry> = {}): ProjectStoreEntry {
  return {
    sessionId: "11111111-2222-3333-4444-555555555555",
    displayName: "test project",
    createdAt: "2026-05-15T00:00:00.000Z",
    lastResumeAt: null,
    ...overrides,
  };
}

describe("ProjectStore", () => {
  let memento: FakeMemento;
  let store: ProjectStore;

  beforeEach(() => {
    memento = new FakeMemento();
    store = new ProjectStore(memento);
  });

  it("list() returns [] when empty", () => {
    expect(store.list()).toEqual([]);
  });

  it("get() returns undefined for unknown path", () => {
    expect(store.get("/missing")).toBeUndefined();
  });

  it("set() + get() round-trips an entry", async () => {
    const entry = makeEntry({ displayName: "alpha" });
    await store.set("/projects/alpha", entry);
    expect(store.get("/projects/alpha")).toEqual(entry);
  });

  it("list() reports every entry with its folderPath", async () => {
    await store.set("/p/a", makeEntry({ displayName: "a" }));
    await store.set("/p/b", makeEntry({ displayName: "b" }));
    const items = store.list().sort((x, y) => x.folderPath.localeCompare(y.folderPath));
    expect(items.map((i) => i.folderPath)).toEqual(["/p/a", "/p/b"]);
    expect(items[0]?.entry.displayName).toBe("a");
    expect(items[1]?.entry.displayName).toBe("b");
  });

  it("update() patches existing fields without clobbering others", async () => {
    await store.set("/p/a", makeEntry({ displayName: "a", lastResumeAt: null }));
    await store.update("/p/a", { lastResumeAt: "2026-05-16T12:00:00.000Z" });
    const after = store.get("/p/a");
    expect(after?.lastResumeAt).toBe("2026-05-16T12:00:00.000Z");
    expect(after?.displayName).toBe("a"); // untouched
    expect(after?.sessionId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("update() throws when the entry doesn't exist", async () => {
    await expect(store.update("/p/missing", { lastResumeAt: "x" })).rejects.toThrow(
      /no entry for path/,
    );
  });

  it("remove() drops the entry", async () => {
    await store.set("/p/a", makeEntry());
    await store.remove("/p/a");
    expect(store.get("/p/a")).toBeUndefined();
  });

  it("remove() on unknown path is a no-op (no throw)", async () => {
    await expect(store.remove("/p/missing")).resolves.toBeUndefined();
  });

  it("remove() of last entry clears the underlying storage key", async () => {
    await store.set("/p/a", makeEntry());
    expect(memento.rawHasKey("agentDesktop.projects")).toBe(true);
    await store.remove("/p/a");
    expect(memento.rawHasKey("agentDesktop.projects")).toBe(false);
  });

  it("persists optional modelHint when set", async () => {
    await store.set("/p/a", makeEntry({ modelHint: "sonnet" }));
    expect(store.get("/p/a")?.modelHint).toBe("sonnet");
  });
});
