import { describe, expect, it } from "vitest";
import { buildArgs, CLAUDE_SPAWN_CONFIG } from "../../src/claude-spawn";

const SID = "11111111-2222-3333-4444-555555555555";

describe("buildArgs", () => {
  it("fresh: appends --session-id with the provided uuid", () => {
    expect(buildArgs("fresh", SID)).toEqual([
      "-p",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--setting-sources", "user",
      "--session-id", SID,
    ]);
  });

  it("resume: substitutes uuid into --resume and omits --session-id", () => {
    const argv = buildArgs("resume", SID);
    expect(argv).toEqual([
      "-p",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--setting-sources", "user",
      "--resume", SID,
    ]);
    expect(argv).not.toContain("--session-id");
    expect(argv).not.toContain("{sessionId}"); // placeholder must be fully replaced
  });

  it("does not include --allowedTools (DESIGN Decision 2: keep built-in tools)", () => {
    expect(buildArgs("fresh", SID)).not.toContain("--allowedTools");
    expect(buildArgs("resume", SID)).not.toContain("--allowedTools");
  });

  it("includes -p first (non-interactive print mode is mandatory)", () => {
    expect(buildArgs("fresh", SID)[0]).toBe("-p");
    expect(buildArgs("resume", SID)[0]).toBe("-p");
  });

  it("includes the JSONL streaming triplet", () => {
    for (const mode of ["fresh", "resume"] as const) {
      const argv = buildArgs(mode, SID);
      expect(argv).toContain("--output-format");
      expect(argv[argv.indexOf("--output-format") + 1]).toBe("stream-json");
      expect(argv).toContain("--include-partial-messages");
      expect(argv).toContain("--verbose");
    }
  });

  it("is pure: repeated calls return equal arrays without mutating the config", () => {
    const a = buildArgs("resume", SID);
    const b = buildArgs("resume", SID);
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // distinct array instances
    expect(CLAUDE_SPAWN_CONFIG.resumeArgsTemplate).toContain("{sessionId}");
  });
});

describe("CLAUDE_SPAWN_CONFIG.spawnOptions", () => {
  it("uses stdio ['pipe','pipe','pipe'] (DESIGN Decision 3)", () => {
    expect(CLAUDE_SPAWN_CONFIG.spawnOptions("/tmp/p").stdio).toEqual([
      "pipe",
      "pipe",
      "pipe",
    ]);
  });

  it("sets cwd to the provided path", () => {
    expect(CLAUDE_SPAWN_CONFIG.spawnOptions("/some/project").cwd).toBe(
      "/some/project",
    );
  });

  it("sets windowsHide for cross-platform consistency", () => {
    expect(CLAUDE_SPAWN_CONFIG.spawnOptions("/x").windowsHide).toBe(true);
  });

  it("passes through process.env (env inheritance is intentional in v1)", () => {
    // DESIGN Decision 2 alternative ("clearEnv") is deferred; v1 inherits.
    expect(CLAUDE_SPAWN_CONFIG.spawnOptions("/x").env).toBe(process.env);
  });
});
