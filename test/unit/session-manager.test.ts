import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToWebview } from "../../src/chat-webview";
import type { SpawnMode } from "../../src/claude-spawn";
import {
  type ChatSender,
  computeContextPct,
  type Logger,
  pickMode,
  SessionManager,
} from "../../src/session-manager";
import {
  type MementoLike,
  ProjectStore,
  type ProjectStoreEntry,
} from "../../src/project-store";

// ---------- Fakes ------------------------------------------------------------

class FakeMemento implements MementoLike {
  private map = new Map<string, unknown>();
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.map.has(key) ? (this.map.get(key) as T) : defaultValue;
  }
  update(key: string, value: unknown): PromiseLike<void> {
    if (value === undefined) this.map.delete(key);
    else this.map.set(key, value);
    return Promise.resolve();
  }
}

class CapturingChat implements ChatSender {
  messages: ToWebview[] = [];
  send(msg: ToWebview): void {
    this.messages.push(msg);
  }
  ofKind<K extends ToWebview["kind"]>(k: K): Array<Extract<ToWebview, { kind: K }>> {
    return this.messages.filter((m): m is Extract<ToWebview, { kind: K }> => m.kind === k);
  }
}

class CapturingLogger implements Logger {
  raw = "";
  lines: string[] = [];
  append(v: string): void {
    this.raw += v;
  }
  appendLine(v: string): void {
    this.lines.push(v);
  }
}

/**
 * Build a fake `ChildProcess` whose stdout streams the given JSONL content,
 * stdin is a discard sink, and the process emits "exit" once stdout ends.
 */
function makeFakeChild(jsonlContent: string): {
  child: ChildProcess;
  stdinWrites: string[];
} {
  const stdinWrites: string[] = [];
  const stdin = new Writable({
    write(chunk, _enc, cb) {
      stdinWrites.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      cb();
    },
  });
  const stdout = Readable.from([jsonlContent]);
  const stderr = new Readable({ read() { this.push(null); } });

  const emitter = new EventEmitter() as ChildProcess & EventEmitter & {
    exitCode: number | null;
  };
  emitter.stdin = stdin as any;
  emitter.stdout = stdout as any;
  emitter.stderr = stderr as any;
  emitter.exitCode = null;
  (emitter as any).kill = () => false;

  // Emit "exit" after consumers finish draining stdout.
  stdout.on("end", () => {
    (emitter as any).exitCode = 0;
    emitter.emit("exit", 0);
  });

  return { child: emitter as ChildProcess, stdinWrites };
}

function spawnerFor(jsonl: string, captured: {
  mode?: SpawnMode;
  sessionId?: string;
  cwd?: string;
  stdinWrites: string[];
}) {
  return (mode: SpawnMode, sessionId: string, cwd: string) => {
    captured.mode = mode;
    captured.sessionId = sessionId;
    captured.cwd = cwd;
    const { child, stdinWrites } = makeFakeChild(jsonl);
    captured.stdinWrites = stdinWrites;
    return child;
  };
}

// ---------- Helpers ----------------------------------------------------------

function entry(overrides: Partial<ProjectStoreEntry> = {}): ProjectStoreEntry {
  return {
    sessionId: "00000000-0000-0000-0000-000000000001",
    displayName: "test",
    createdAt: "2026-05-15T00:00:00.000Z",
    lastResumeAt: null,
    ...overrides,
  };
}

const FOLDER = "/tmp/fake-project";

// ---------- Pure helpers -----------------------------------------------------

describe("pickMode", () => {
  it("returns 'fresh' when lastResumeAt is null", () => {
    expect(pickMode(entry({ lastResumeAt: null }))).toBe("fresh");
  });

  it("returns 'resume' when lastResumeAt is set", () => {
    expect(pickMode(entry({ lastResumeAt: "2026-05-15T01:00:00.000Z" }))).toBe(
      "resume",
    );
  });
});

describe("computeContextPct", () => {
  it("computes (input + cache_creation + cache_read) / dominant.contextWindow", () => {
    const pct = computeContextPct({
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 5952,
        cache_read_input_tokens: 12963,
      },
      total_cost_usd: 0,
      modelUsage: {
        "claude-sonnet-4-6": {
          inputTokens: 2,
          contextWindow: 400_000,
        },
      },
    });
    expect(pct).toBeCloseTo((2 + 5952 + 12963) / 400_000, 6);
  });

  it("matches usage.input_tokens to a model in modelUsage (Sonnet over background Haiku)", () => {
    // Mirrors spike1: Haiku does background work with high inputTokens; the
    // primary turn's usage.input_tokens lines up with Sonnet.
    const pct = computeContextPct({
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 5952,
        cache_read_input_tokens: 12963,
      },
      total_cost_usd: 0,
      modelUsage: {
        haiku: { inputTokens: 441, contextWindow: 200_000 },
        sonnet: { inputTokens: 2, contextWindow: 400_000 },
      },
    });
    expect(pct).toBeCloseTo((2 + 5952 + 12963) / 400_000, 6);
  });

  it("falls back to the largest contextWindow when no model matches exactly", () => {
    const pct = computeContextPct({
      usage: {
        input_tokens: 999,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      total_cost_usd: 0,
      modelUsage: {
        haiku: { inputTokens: 10, contextWindow: 200_000 },
        sonnet: { inputTokens: 90, contextWindow: 400_000 },
      },
    });
    // No model has inputTokens=999 → fallback picks sonnet (largest window).
    expect(pct).toBeCloseTo(999 / 400_000, 6);
  });

  it("returns 0 when modelUsage is missing or empty", () => {
    expect(computeContextPct({})).toBe(0);
    expect(
      computeContextPct({
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
      }),
    ).toBe(0);
  });

  it("caps at 1.0 even when input exceeds contextWindow", () => {
    expect(
      computeContextPct({
        usage: {
          input_tokens: 999_999_999,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: { x: { inputTokens: 1, contextWindow: 1000 } },
      }),
    ).toBe(1);
  });
});

// ---------- End-to-end against real spike fixture ----------------------------

describe("SessionManager.prompt", () => {
  let memento: FakeMemento;
  let store: ProjectStore;
  let chat: CapturingChat;
  let logger: CapturingLogger;

  beforeEach(async () => {
    memento = new FakeMemento();
    store = new ProjectStore(memento);
    chat = new CapturingChat();
    logger = new CapturingLogger();
    await store.set(FOLDER, entry());
  });

  it("calls spawner with mode='fresh' when lastResumeAt is null", async () => {
    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(
      FOLDER,
      store,
      chat,
      logger,
      spawnerFor("", cap),
    );
    await sm.prompt("hello");
    expect(cap.mode).toBe("fresh");
    expect(cap.sessionId).toBe("00000000-0000-0000-0000-000000000001");
    expect(cap.cwd).toBe(FOLDER);
  });

  it("calls spawner with mode='resume' after a prior turn (lastResumeAt set)", async () => {
    await store.update(FOLDER, { lastResumeAt: "2026-05-15T01:00:00.000Z" });
    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(
      FOLDER,
      store,
      chat,
      logger,
      spawnerFor("", cap),
    );
    await sm.prompt("follow up");
    expect(cap.mode).toBe("resume");
  });

  it("forwards content_block_delta text into text_delta messages", async () => {
    const jsonl = [
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hi " },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "there" },
        },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        total_cost_usd: 0,
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: { sonnet: { inputTokens: 1, contextWindow: 400_000 } },
      }),
    ].join("\n") + "\n";

    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(FOLDER, store, chat, logger, spawnerFor(jsonl, cap));
    await sm.prompt("hello");

    const deltas = chat.ofKind("text_delta").map((m) => m.text);
    expect(deltas).toEqual(["Hi ", "there"]);
    expect(chat.ofKind("turn_started")).toHaveLength(1);
    expect(chat.ofKind("turn_complete")).toHaveLength(1);
  });

  it("persists lastResumeAt after a successful turn", async () => {
    const jsonl =
      JSON.stringify({
        type: "result",
        subtype: "success",
        total_cost_usd: 0,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: { sonnet: { inputTokens: 1, contextWindow: 400_000 } },
      }) + "\n";
    const cap: any = { stdinWrites: [] };
    const before = store.get(FOLDER)?.lastResumeAt;
    expect(before).toBeNull();

    const sm = new SessionManager(FOLDER, store, chat, logger, spawnerFor(jsonl, cap));
    await sm.prompt("hi");

    const after = store.get(FOLDER)?.lastResumeAt;
    expect(after).not.toBeNull();
    expect(typeof after).toBe("string");
  });

  it("writes the user prompt to claude's stdin", async () => {
    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(FOLDER, store, chat, logger, spawnerFor("", cap));
    await sm.prompt("hello world");
    expect(cap.stdinWrites.join("")).toContain("hello world");
  });

  it("processes the real spike1 fixture and emits turn_complete with computed context_pct", async () => {
    const fixture = readFileSync(
      new URL("./fixtures/spike1.jsonl", import.meta.url),
      "utf8",
    );
    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(
      FOLDER,
      store,
      chat,
      logger,
      spawnerFor(fixture, cap),
    );
    await sm.prompt("Reply with just: OK");

    expect(chat.ofKind("text_delta").map((m) => m.text).join("")).toBe("OK");
    const tc = chat.ofKind("turn_complete");
    expect(tc).toHaveLength(1);
    expect(tc[0]?.cost_usd).toBeCloseTo(0.0267759, 6);
    // Spike1: 2 + 5952 + 12963 = 18917 over Sonnet's 400_000 ≈ 0.0473
    expect(tc[0]?.context_pct).toBeCloseTo(18917 / 400_000, 4);
  });

  it("forwards system.status events as status_update messages", async () => {
    const fixture = readFileSync(
      new URL("./fixtures/spike1.jsonl", import.meta.url),
      "utf8",
    );
    const sm = new SessionManager(
      FOLDER,
      store,
      chat,
      logger,
      spawnerFor(fixture, {}),
    );
    await sm.prompt("hi");

    const updates = chat.ofKind("status_update");
    // spike1 has: system.status "requesting" then system.status null
    expect(updates).toHaveLength(2);
    expect(updates[0]?.status).toBe("requesting");
    expect(updates[1]?.status).toBeNull();
  });

  it("appends turn entries to the transcript in order", async () => {
    const jsonl =
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hi" },
        },
      }) +
      "\n" +
      JSON.stringify({
        type: "result",
        subtype: "success",
        total_cost_usd: 0.001,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: { sonnet: { inputTokens: 1, contextWindow: 400_000 } },
      }) +
      "\n";
    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(FOLDER, store, chat, logger, spawnerFor(jsonl, cap));
    await sm.prompt("hi there");

    const transcript = sm.getTranscript();
    expect(transcript).toHaveLength(2);
    expect(transcript[0]?.role).toBe("user");
    if (transcript[0]?.role === "user") {
      expect(transcript[0].text).toBe("hi there");
    }
    expect(transcript[1]?.role).toBe("assistant");
    if (transcript[1]?.role === "assistant") {
      expect(transcript[1].text).toBe("Hi");
      expect(transcript[1].cost_usd).toBeCloseTo(0.001);
    }
  });

  it("emits an error message if there's no project entry for the folder", async () => {
    const cap: any = { stdinWrites: [] };
    const sm = new SessionManager(
      "/no/such/project",
      store,
      chat,
      logger,
      spawnerFor("", cap),
    );
    await sm.prompt("hello");
    expect(chat.ofKind("error")).toHaveLength(1);
    expect(chat.ofKind("turn_started")).toHaveLength(0);
  });
});
