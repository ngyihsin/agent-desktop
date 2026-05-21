/**
 * Minimal interface the registry needs — kept structural so tests don't
 * depend on the full `ChatWebviewPanel` (which imports vscode).
 */
export interface RevealablePanel {
  reveal(): void;
}

/**
 * In-memory registry of open chat panels, keyed by project folder path.
 *
 * Prevents duplicate panels for the same project: callers check
 * `revealIfOpen()` before creating a new panel; `remove()` is called from
 * the panel's `onDispose` callback so stale entries are cleaned up
 * automatically.
 */
export class ChatPanelRegistry {
  private readonly panels = new Map<string, RevealablePanel>();

  /** Reveal the existing panel for `folderPath` if one is open. Returns true if found. */
  revealIfOpen(folderPath: string): boolean {
    const panel = this.panels.get(folderPath);
    if (!panel) return false;
    panel.reveal();
    return true;
  }

  register(folderPath: string, panel: RevealablePanel): void {
    this.panels.set(folderPath, panel);
  }

  remove(folderPath: string): void {
    this.panels.delete(folderPath);
  }

  /** Returns the panel for `folderPath`, or undefined if not open. */
  get(folderPath: string): RevealablePanel | undefined {
    return this.panels.get(folderPath);
  }

  get size(): number {
    return this.panels.size;
  }
}
