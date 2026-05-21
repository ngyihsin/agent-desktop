import { describe, expect, it } from "vitest";
import { buildRecentProjectItems } from "../../src/commands/recent-items";
import type { ProjectListItem } from "../../src/project-store";

function item(
  folderPath: string,
  displayName: string,
  lastResumeAt: string | null = null,
  createdAt = "2026-05-15T00:00:00.000Z",
): ProjectListItem {
  return {
    folderPath,
    entry: {
      sessionId: "00000000-0000-0000-0000-000000000000",
      displayName,
      createdAt,
      lastResumeAt,
    },
  };
}

describe("buildRecentProjectItems", () => {
  it("returns [] when no projects are stored", () => {
    expect(buildRecentProjectItems([])).toEqual([]);
  });

  it("uses displayName as label and folderPath as description", () => {
    const items = buildRecentProjectItems([item("/p/alpha", "Alpha")]);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Alpha");
    expect(items[0]?.description).toBe("/p/alpha");
  });

  it("shows 'last resumed …' detail when the project has been resumed", () => {
    const items = buildRecentProjectItems([
      item("/p/a", "A", "2026-05-16T12:00:00.000Z"),
    ]);
    expect(items[0]?.detail).toBe("last resumed 2026-05-16T12:00:00.000Z");
  });

  it("shows 'created …' detail when the project hasn't been resumed yet", () => {
    const items = buildRecentProjectItems([
      item("/p/a", "A", null, "2026-05-15T08:00:00.000Z"),
    ]);
    expect(items[0]?.detail).toBe("created 2026-05-15T08:00:00.000Z");
  });

  it("preserves folderPath + entry on each item for the handler to act on", () => {
    const stored = item("/p/a", "A");
    const items = buildRecentProjectItems([stored]);
    expect(items[0]?.folderPath).toBe(stored.folderPath);
    expect(items[0]?.entry).toBe(stored.entry);
  });

  it("preserves the input ordering", () => {
    const items = buildRecentProjectItems([
      item("/p/a", "A"),
      item("/p/b", "B"),
      item("/p/c", "C"),
    ]);
    expect(items.map((i) => i.label)).toEqual(["A", "B", "C"]);
  });
});
