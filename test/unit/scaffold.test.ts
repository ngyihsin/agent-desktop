import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyDirectoryRecursive } from "../../src/scaffold";

describe("copyDirectoryRecursive", () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), "agent-desktop-scaffold-"));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("copies flat files into a new destination directory", async () => {
    const src = path.join(scratch, "src");
    const dest = path.join(scratch, "dest");
    await mkdir(src);
    await writeFile(path.join(src, "a.md"), "hello");
    await writeFile(path.join(src, "b.txt"), "world");

    await copyDirectoryRecursive(src, dest);

    expect(await readFile(path.join(dest, "a.md"), "utf8")).toBe("hello");
    expect(await readFile(path.join(dest, "b.txt"), "utf8")).toBe("world");
  });

  it("copies nested directories", async () => {
    const src = path.join(scratch, "src");
    const dest = path.join(scratch, "dest");
    await mkdir(path.join(src, "sub", "deeper"), { recursive: true });
    await writeFile(path.join(src, "root.md"), "root");
    await writeFile(path.join(src, "sub", "child.md"), "child");
    await writeFile(path.join(src, "sub", "deeper", "leaf.md"), "leaf");

    await copyDirectoryRecursive(src, dest);

    expect(await readFile(path.join(dest, "root.md"), "utf8")).toBe("root");
    expect(await readFile(path.join(dest, "sub", "child.md"), "utf8")).toBe("child");
    expect(await readFile(path.join(dest, "sub", "deeper", "leaf.md"), "utf8")).toBe(
      "leaf",
    );
  });

  it("copies dotfiles (e.g. .upstream-commit)", async () => {
    const src = path.join(scratch, "src");
    const dest = path.join(scratch, "dest");
    await mkdir(src);
    await writeFile(path.join(src, ".upstream-commit"), "abc123");

    await copyDirectoryRecursive(src, dest);

    expect(await readFile(path.join(dest, ".upstream-commit"), "utf8")).toBe("abc123");
  });

  it("throws when source doesn't exist", async () => {
    await expect(
      copyDirectoryRecursive(path.join(scratch, "missing"), path.join(scratch, "dest")),
    ).rejects.toThrow();
  });
});
