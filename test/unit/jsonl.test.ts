import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { streamJsonl, type JsonlEvent } from "../../src/jsonl";

async function collect(input: string | string[]): Promise<JsonlEvent[]> {
  const stream = Readable.from(Array.isArray(input) ? input : [input]);
  const out: JsonlEvent[] = [];
  for await (const ev of streamJsonl(stream)) out.push(ev);
  return out;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("streamJsonl", () => {
  it("parses spike1 fixture (fresh spawn): system.init … result.success", async () => {
    const events = await collect(fixture("spike1.jsonl"));
    expect(events).toHaveLength(12);
    expect(events[0]?.type).toBe("system");
    expect(events[0]?.subtype).toBe("init");
    expect(events.at(-1)?.type).toBe("result");
    expect(events.at(-1)?.subtype).toBe("success");
  });

  it("parses spike2a fixture (--resume): preserves session_id across spawns", async () => {
    const events = await collect(fixture("spike2a.jsonl"));
    expect(events).toHaveLength(12);
    const init = events.find((e) => e.type === "system" && e.subtype === "init");
    const result = events.at(-1);
    expect(init?.session_id).toBeTypeOf("string");
    expect(result?.session_id).toBe(init?.session_id);
  });

  it("parses spike2b fixture (/compact): emits system.compact_boundary with num_turns 0", async () => {
    const events = await collect(fixture("spike2b.jsonl"));
    expect(events).toHaveLength(9);
    const compactBoundary = events.find(
      (e) => e.type === "system" && e.subtype === "compact_boundary",
    );
    expect(compactBoundary).toBeDefined();
    const result = events.at(-1);
    expect(result?.type).toBe("result");
    expect(result?.num_turns).toBe(0);
  });

  it("handles chunk boundaries that split mid-line", async () => {
    const line = JSON.stringify({ type: "test", n: 42 });
    // Deliberately split the JSON in the middle of the object.
    const events = await collect([line.slice(0, 5), line.slice(5) + "\n"]);
    expect(events).toEqual([{ type: "test", n: 42 }]);
  });

  it("skips malformed lines without throwing", async () => {
    const input = `{"type":"good"}\nnot json\n{"type":"good2"}\n`;
    const events = await collect(input);
    expect(events).toEqual([{ type: "good" }, { type: "good2" }]);
  });

  it("yields nothing for empty input", async () => {
    expect(await collect("")).toEqual([]);
  });

  it("yields the trailing line when input has no terminating newline", async () => {
    const input = `{"type":"a"}\n{"type":"b"}`;
    const events = await collect(input);
    expect(events).toEqual([{ type: "a" }, { type: "b" }]);
  });
});
