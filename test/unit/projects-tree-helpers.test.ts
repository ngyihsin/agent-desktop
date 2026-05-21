import { describe, expect, it } from "vitest";
import {
  type DirentLike,
  sortFsEntries,
} from "../../src/projects-tree-helpers";

function entry(name: string, isDir = false): DirentLike {
  return { name, isDirectory: () => isDir };
}

describe("sortFsEntries", () => {
  it("returns an empty array when input is empty", () => {
    expect(sortFsEntries([])).toEqual([]);
  });

  it("puts directories before files", () => {
    const sorted = sortFsEntries([
      entry("zfile.md"),
      entry("alpha-dir", true),
      entry("afile.md"),
      entry("beta-dir", true),
    ]);
    expect(sorted.map((e) => e.name)).toEqual([
      "alpha-dir",
      "beta-dir",
      "afile.md",
      "zfile.md",
    ]);
  });

  it("sorts alphabetically within directories and within files", () => {
    const sorted = sortFsEntries([
      entry("b.md"),
      entry("a.md"),
      entry("d", true),
      entry("c", true),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["c", "d", "a.md", "b.md"]);
  });

  it("keeps dotfiles in the listing (codeatlas's .upstream-commit must show)", () => {
    const sorted = sortFsEntries([
      entry("README.md"),
      entry(".upstream-commit"),
      entry("AGENT-warm-up.md"),
    ]);
    // All three appear, alphabetical (note: '.' < uppercase < lowercase via localeCompare).
    expect(sorted.map((e) => e.name)).toContain(".upstream-commit");
    expect(sorted).toHaveLength(3);
  });

  it("uses localeCompare for case-insensitive-ish ordering", () => {
    const sorted = sortFsEntries([
      entry("banana.md"),
      entry("Apple.md"),
    ]);
    // localeCompare puts "Apple" before "banana" (default locale)
    expect(sorted.map((e) => e.name)).toEqual(["Apple.md", "banana.md"]);
  });

  it("does not mutate the input array", () => {
    const input = [entry("b"), entry("a")];
    const before = input.map((e) => e.name);
    sortFsEntries(input);
    expect(input.map((e) => e.name)).toEqual(before);
  });
});
