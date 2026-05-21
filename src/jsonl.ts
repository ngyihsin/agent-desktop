import type { Readable } from "node:stream";

/**
 * One JSON object per line on stdout. The discriminator is `type` (plus
 * `subtype` for `system` and `result`). See DESIGN.md Data Model for the
 * full event union.
 */
export type JsonlEvent = Record<string, unknown> & {
  type: string;
  subtype?: string;
};

/**
 * Splits a Node `Readable` into a stream of parsed JSON events, one per
 * newline. Holds an internal buffer so chunk boundaries that fall inside a
 * JSON object don't drop data. Malformed lines are silently skipped — the
 * caller (SessionManager) logs the raw stream to an OutputChannel for
 * debugging, so loss is observable without crashing.
 */
export async function* streamJsonl(stdout: Readable): AsyncIterable<JsonlEvent> {
  let buf = "";
  for await (const chunk of stdout) {
    buf += typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8");
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          yield JSON.parse(line) as JsonlEvent;
        } catch {
          // skip malformed line — non-fatal
        }
      }
      nl = buf.indexOf("\n");
    }
  }
  const trailing = buf.trim();
  if (trailing) {
    try {
      yield JSON.parse(trailing) as JsonlEvent;
    } catch {
      // skip
    }
  }
}
