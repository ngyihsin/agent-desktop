import { describe, expect, it } from "vitest";
import { getChatHtml } from "../../src/chat-html";

const TEST_SCRIPT_URI = "vscode-webview://test-extension-id/out/webview.js";

describe("getChatHtml", () => {
  const html = getChatHtml("test project", TEST_SCRIPT_URI);

  it("renders a doctype and html element", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("<html");
  });

  it("includes a transcript container and a prompt form", () => {
    expect(html).toContain('id="transcript"');
    expect(html).toContain('id="prompt-form"');
    expect(html).toContain('id="input"');
    expect(html).toContain('id="submit-btn"');
  });

  it("includes a Content-Security-Policy meta tag locked to the webview script URI", () => {
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain(TEST_SCRIPT_URI);
  });

  it("uses VS Code theme variables for colours", () => {
    expect(html).toContain("var(--vscode-foreground)");
    expect(html).toContain("var(--vscode-editor-background)");
    expect(html).toContain("var(--vscode-button-background)");
  });

  it("escapes HTML in the display name (XSS guard)", () => {
    const malicious = getChatHtml('"><script>alert(1)</script>', TEST_SCRIPT_URI);
    expect(malicious).not.toContain("<script>alert(1)</script>");
    expect(malicious).toContain("&lt;script&gt;");
  });

  it("loads the webview script via <script src>", () => {
    expect(html).toContain(`<script src="${TEST_SCRIPT_URI}"`);
  });

  it("includes markdown and hljs styles", () => {
    expect(html).toContain(".markdown");
    expect(html).toContain(".hljs");
  });

  it("includes status element for cost/context display", () => {
    expect(html).toContain('id="status"');
  });
});
