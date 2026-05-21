import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCodeWorkspace } from "../../src/workspace-manager";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-desktop-ws-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function readWorkspace(file: string) {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as { folders: { path: string }[]; settings: object };
}

describe("syncCodeWorkspace", () => {
  it("creates the file with correct folders", async () => {
    const file = path.join(tmpDir, "test.code-workspace");
    await syncCodeWorkspace(["/proj/a", "/proj/b"], file);
    const ws = await readWorkspace(file);
    expect(ws.folders).toEqual([{ path: "/proj/a" }, { path: "/proj/b" }]);
  });

  it("writes an empty folders array when no projects", async () => {
    const file = path.join(tmpDir, "test.code-workspace");
    await syncCodeWorkspace([], file);
    const ws = await readWorkspace(file);
    expect(ws.folders).toEqual([]);
  });

  it("overwrites an existing file", async () => {
    const file = path.join(tmpDir, "test.code-workspace");
    await syncCodeWorkspace(["/proj/old"], file);
    await syncCodeWorkspace(["/proj/new1", "/proj/new2"], file);
    const ws = await readWorkspace(file);
    expect(ws.folders).toEqual([{ path: "/proj/new1" }, { path: "/proj/new2" }]);
  });

  it("creates intermediate directories if needed", async () => {
    const file = path.join(tmpDir, "nested", "dir", "test.code-workspace");
    await syncCodeWorkspace(["/proj/a"], file);
    const ws = await readWorkspace(file);
    expect(ws.folders).toHaveLength(1);
  });

  it("output is valid JSON with a trailing newline", async () => {
    const file = path.join(tmpDir, "test.code-workspace");
    await syncCodeWorkspace(["/proj/a"], file);
    const raw = await fs.readFile(file, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
