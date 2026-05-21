import { describe, expect, it, vi } from "vitest";
import { ChatPanelRegistry } from "../../src/chat-panel-registry";

function makePanel() {
  return {
    reveal: vi.fn(),
  };
}

describe("ChatPanelRegistry", () => {
  it("revealIfOpen returns false for unknown path", () => {
    const reg = new ChatPanelRegistry();
    expect(reg.revealIfOpen("/some/path")).toBe(false);
  });

  it("revealIfOpen returns true and calls reveal() after register", () => {
    const reg = new ChatPanelRegistry();
    const panel = makePanel();
    reg.register("/proj/a", panel);
    const found = reg.revealIfOpen("/proj/a");
    expect(found).toBe(true);
    expect(panel.reveal).toHaveBeenCalledOnce();
  });

  it("size reflects registered panel count", () => {
    const reg = new ChatPanelRegistry();
    expect(reg.size).toBe(0);
    reg.register("/proj/a", makePanel());
    expect(reg.size).toBe(1);
    reg.register("/proj/b", makePanel());
    expect(reg.size).toBe(2);
  });

  it("remove makes the path unknown again", () => {
    const reg = new ChatPanelRegistry();
    reg.register("/proj/a", makePanel());
    reg.remove("/proj/a");
    expect(reg.revealIfOpen("/proj/a")).toBe(false);
    expect(reg.size).toBe(0);
  });

  it("remove on unknown path is a no-op", () => {
    const reg = new ChatPanelRegistry();
    expect(() => reg.remove("/does/not/exist")).not.toThrow();
  });

  it("registering a second panel for the same path replaces the first", () => {
    const reg = new ChatPanelRegistry();
    const panel1 = makePanel();
    const panel2 = makePanel();
    reg.register("/proj/a", panel1);
    reg.register("/proj/a", panel2);
    reg.revealIfOpen("/proj/a");
    expect(panel1.reveal).not.toHaveBeenCalled();
    expect(panel2.reveal).toHaveBeenCalledOnce();
  });

  it("multiple paths are tracked independently", () => {
    const reg = new ChatPanelRegistry();
    const pa = makePanel();
    const pb = makePanel();
    reg.register("/proj/a", pa);
    reg.register("/proj/b", pb);
    reg.revealIfOpen("/proj/a");
    expect(pa.reveal).toHaveBeenCalledOnce();
    expect(pb.reveal).not.toHaveBeenCalled();
  });
});
