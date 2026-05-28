import * as vscode from "vscode";
import { checkClaudeAvailable } from "./activation-check";
import { spawnClaude } from "./claude-spawn";
import { FRESH_PROJECT_SEED } from "./commands/open-chat";
import { runNewProjectCommand } from "./commands/new-project";
import { runOpenProjectCommand } from "./commands/open-project";
import { runOpenRecentCommand } from "./commands/open-recent";
import { runQuoteInChatCommand } from "./commands/quote-in-chat";
import { ProjectStore, type ProjectStoreEntry } from "./project-store";
import { ProjectsTreeProvider, type TreeElement } from "./projects-tree-provider";
import { SessionManager, type Spawner } from "./session-manager";
import { SharedChatPanel } from "./shared-chat-panel";
import { syncCodeWorkspace } from "./workspace-manager";

const CLAUDE_INSTALL_URL = "https://www.npmjs.com/package/@anthropic-ai/claude-code";

type ExtensionState =
  | { kind: "checking" }
  | { kind: "ready"; version: string }
  | { kind: "missing"; reason: string };

let state: ExtensionState = { kind: "checking" };

export function activate(context: vscode.ExtensionContext): void {
  console.log("[agent-desktop] activated");

  const store = new ProjectStore(context.globalState);
  const sharedPanel = new SharedChatPanel();
  // Per-project runtime state (lost on extension host reload — transcripts
  // are replayed from SessionManager.getTranscript() on next open).
  const sessions = new Map<string, SessionManager>();
  const outputChannels = new Map<string, vscode.OutputChannel>();

  const known = store.list();
  if (known.length > 0) {
    console.log(
      `[agent-desktop] ${known.length} known project(s): ${known.map((k) => k.entry.displayName).join(", ")}`,
    );
  }

  void syncCodeWorkspace(known.map((k) => k.folderPath));
  updateProjectsContext(store);

  // Route webview messages to the correct session.
  sharedPanel.onMessage((projectPath, msg) => {
    const session = sessions.get(projectPath);
    if (msg.kind === "grant_access") {
      void handleGrantAccess(projectPath);
      return;
    }
    if (!session) return;
    if (msg.kind === "submit_prompt") {
      void session.prompt(msg.text);
    } else if (msg.kind === "interrupt") {
      session.interrupt();
    } else if (msg.kind === "request_transcript") {
      const entry = store.get(projectPath);
      sharedPanel.switchToProject(
        projectPath,
        entry?.displayName ?? projectPath,
        session.getTranscript(),
      );
    }
  });

  async function handleGrantAccess(projectPath: string): Promise<void> {
    const entry = store.get(projectPath);
    if (!entry) return;

    const uris = await vscode.window.showOpenDialog({
      title: `Grant Directory Access — ${entry.displayName}`,
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Grant Access",
    });
    if (!uris || uris.length === 0) return;

    const newDir = uris[0].fsPath;
    if ((entry.allowedDirs ?? []).includes(newDir)) {
      await vscode.window.showInformationMessage(
        `Agent Desktop: ${newDir} is already allowed for "${entry.displayName}".`,
      );
      return;
    }

    // Start a new session — Claude Code locks allowed paths at session creation,
    // so --add-dir only takes effect on the very first spawn of a session.
    const { randomUUID } = await import("node:crypto");
    await store.update(projectPath, {
      allowedDirs: [...(entry.allowedDirs ?? []), newDir],
      sessionId: randomUUID(),
      lastResumeAt: null,
    });

    sessions.delete(projectPath);
    const oc = outputChannels.get(projectPath);
    oc?.dispose();
    outputChannels.delete(projectPath);

    // Re-open with the new session so the seed prompt fires immediately.
    const freshEntry = store.get(projectPath);
    if (freshEntry) openProject(projectPath, freshEntry);
  }

  async function getAnthropicEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    const apiKey = await context.secrets.get("agentDesktop.apiKey");
    if (apiKey) env["ANTHROPIC_API_KEY"] = apiKey;
    const baseUrl = vscode.workspace
      .getConfiguration("agentDesktop")
      .get<string>("anthropic.baseUrl");
    if (baseUrl?.trim()) env["ANTHROPIC_BASE_URL"] = baseUrl.trim();
    return env;
  }

  // Open (or switch to) a project in the shared panel.
  async function openProject(folderPath: string, entry: ProjectStoreEntry): Promise<void> {
    const isNew = !sessions.has(folderPath);
    if (isNew) {
      const oc = vscode.window.createOutputChannel(
        `Agent Desktop: claude (${entry.displayName})`,
      );
      outputChannels.set(folderPath, oc);
      const sender = sharedPanel.senderFor(folderPath);
      const extraEnv = await getAnthropicEnv();
      const spawner: Spawner = (mode, sessionId, cwd, dirs) =>
        spawnClaude(mode, sessionId, cwd, dirs, extraEnv);
      sessions.set(folderPath, new SessionManager(folderPath, store, sender, oc, spawner));
    }

    try {
      await sharedPanel.show(context.extensionUri);
      sharedPanel.switchToProject(
        folderPath,
        entry.displayName,
        sessions.get(folderPath)!.getTranscript(),
      );
      if (isNew && !entry.lastResumeAt) {
        void sessions.get(folderPath)!.prompt(FRESH_PROJECT_SEED);
      }
    } catch (err: unknown) {
      void vscode.window.showErrorMessage(
        `Agent Desktop: failed to open chat — ${(err as Error).message ?? String(err)}`,
      );
    }
  }

  const treeProvider = new ProjectsTreeProvider(store);
  const treeView = vscode.window.createTreeView("agentDesktopProjects", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // onDidChangeSelection fires on every click (including collapsible nodes).
  // item.command on collapsible nodes does NOT fire reliably in VS Code.
  treeView.onDidChangeSelection((e) => {
    const selected = e.selection[0];
    if (selected?.kind !== "project") return;
    requireClaude(() => openProject(selected.folderPath, selected.entry));
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(
      "agentDesktop.openFileInPrimaryColumn",
      async (uri: vscode.Uri) => {
        try {
          // Always open in whichever column does NOT contain the chat panel.
          // If the chat is in column 1 (or not yet open), use column 2 so the
          // file creates a new split beside the chat rather than sharing its tab group.
          const chatCol = sharedPanel.viewColumn;
          const fileCol =
            chatCol === vscode.ViewColumn.One
              ? vscode.ViewColumn.Two
              : vscode.ViewColumn.One;

          const lowerPath = uri.fsPath.toLowerCase();
          if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) {
            // Focus the file column so markdown.showPreview opens there,
            // then call it directly — no source tab needed.
            const focusCmd =
              fileCol === vscode.ViewColumn.One
                ? "workbench.action.focusFirstEditorGroup"
                : "workbench.action.focusSecondEditorGroup";
            await vscode.commands.executeCommand(focusCmd);
            await vscode.commands.executeCommand("markdown.showPreview", uri);
          } else {
            await vscode.window.showTextDocument(uri, {
              viewColumn: fileCol,
              preview: true,
            });
          }
        } catch (err) {
          await vscode.window.showErrorMessage(
            `Agent Desktop: cannot open ${uri.fsPath} — ${(err as Error).message}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand("agentDesktop.refreshProjects", () =>
      treeProvider.refresh(),
    ),
  );

  function onProjectStored(): void {
    treeProvider.refresh();
    updateProjectsContext(store);
  }

  async function afterProjectListChange(): Promise<void> {
    treeProvider.refresh();
    updateProjectsContext(store);
    await syncCodeWorkspace(store.list().map((k) => k.folderPath));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("agentDesktop.newProject", () =>
      requireClaude(async () => {
        await runNewProjectCommand(context, store, onProjectStored, openProject);
        await afterProjectListChange();
      }),
    ),
    vscode.commands.registerCommand("agentDesktop.openRecentProject", () =>
      requireClaude(async () => {
        await runOpenRecentCommand(context, store, openProject);
        await afterProjectListChange();
      }),
    ),
    vscode.commands.registerCommand("agentDesktop.openProject", () =>
      requireClaude(async () => {
        await runOpenProjectCommand(store, onProjectStored, openProject);
        await afterProjectListChange();
      }),
    ),
    vscode.commands.registerCommand(
      "agentDesktop.openProjectChat",
      (folderPath: string) =>
        requireClaude(() => {
          const entry = store.get(folderPath);
          if (!entry) {
            void vscode.window.showWarningMessage(
              `Agent Desktop: no stored project at ${folderPath}.`,
            );
            return;
          }
          openProject(folderPath, entry);
        }),
    ),
    vscode.commands.registerCommand("agentDesktop.quoteInChat", () =>
      runQuoteInChatCommand(store, sessions, sharedPanel),
    ),
    vscode.commands.registerCommand(
      "agentDesktop.addDirectory",
      async (element: TreeElement) => {
        if (element?.kind !== "project") return;
        const { folderPath } = element;
        // Re-read entry fresh from store (tree element may be stale).
        const entry = store.get(folderPath);
        if (!entry) return;

        const uris = await vscode.window.showOpenDialog({
          title: `Add Directory Access — ${entry.displayName}`,
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Grant Access",
        });
        if (!uris || uris.length === 0) return;

        const newDir = uris[0].fsPath;
        const current = entry.allowedDirs ?? [];
        if (current.includes(newDir)) {
          await vscode.window.showInformationMessage(
            `Agent Desktop: ${newDir} is already allowed for "${entry.displayName}".`,
          );
          return;
        }

        // Claude Code locks allowed paths at session-creation time; --add-dir
        // has no effect on a resumed session. A new session must be started.
        const confirm = await vscode.window.showWarningMessage(
          `Adding directory access requires starting a new Claude session for "${entry.displayName}". The current conversation will be cleared. Continue?`,
          { modal: true },
          "Start New Session",
        );
        if (confirm !== "Start New Session") return;

        // Update store: new allowedDirs + new sessionId + clear lastResumeAt
        // so the next spawn is fresh and picks up --add-dir from the start.
        const { randomUUID } = await import("node:crypto");
        await store.update(folderPath, {
          allowedDirs: [...current, newDir],
          sessionId: randomUUID(),
          lastResumeAt: null,
        });

        // Tear down the in-memory session so it is recreated on next openProject.
        sessions.delete(folderPath);
        const oc = outputChannels.get(folderPath);
        oc?.dispose();
        outputChannels.delete(folderPath);

        // Reset the panel if this project is currently active.
        if (sharedPanel.activeProjectPath === folderPath) {
          sharedPanel.reset();
        }

        treeProvider.refresh();
        await vscode.window.showInformationMessage(
          `Agent Desktop: new session started with access to ${newDir}.`,
        );
      },
    ),
    vscode.commands.registerCommand(
      "agentDesktop.removeProject",
      async (element: TreeElement) => {
        if (element?.kind !== "project") return;
        const { folderPath, entry } = element;

        const choice = await vscode.window.showWarningMessage(
          `Remove "${entry.displayName}" from Agent Desktop? Files on disk are not deleted.`,
          { modal: true },
          "Remove",
        );
        if (choice !== "Remove") return;

        // Dispose runtime state for this project.
        sessions.delete(folderPath);
        const oc = outputChannels.get(folderPath);
        oc?.dispose();
        outputChannels.delete(folderPath);

        // Remove from persistent store.
        await store.remove(folderPath);

        // If this was the active project, reset the panel.
        if (sharedPanel.activeProjectPath === folderPath) {
          sharedPanel.reset();
        }

        await afterProjectListChange();
      },
    ),
    vscode.commands.registerCommand("agentDesktop.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "Agent Desktop: Set Anthropic API Key",
        prompt: "Paste your Anthropic API key (stored in VS Code SecretStorage, not settings.json)",
        placeHolder: "sk-ant-...",
        password: true,
        validateInput: (v) => (v.trim() ? null : "Key cannot be empty"),
      });
      if (!key) return;
      await context.secrets.store("agentDesktop.apiKey", key.trim());
      await vscode.window.showInformationMessage(
        "Agent Desktop: API key saved. New sessions will use it.",
      );
    }),
    vscode.commands.registerCommand("agentDesktop.clearApiKey", async () => {
      await context.secrets.delete("agentDesktop.apiKey");
      await vscode.window.showInformationMessage(
        "Agent Desktop: API key cleared. Sessions will fall back to Claude Code's own auth.",
      );
    }),
  );

  void runActivationCheck();
}

async function runActivationCheck(): Promise<void> {
  const result = await checkClaudeAvailable();
  if (result.available) {
    state = { kind: "ready", version: result.version };
    console.log(`[agent-desktop] claude available: ${result.version}`);
  } else {
    state = { kind: "missing", reason: result.reason };
    console.warn(`[agent-desktop] claude unavailable: ${result.reason}`);
    void notifyClaudeMissing(result.reason);
  }
}

async function requireClaude(thenRun: () => Promise<void> | void): Promise<void> {
  switch (state.kind) {
    case "checking":
      await vscode.window.showInformationMessage(
        "Agent Desktop: still checking `claude` install — try again in a moment.",
      );
      return;
    case "missing":
      await notifyClaudeMissing(state.reason);
      return;
    case "ready":
      await thenRun();
      return;
  }
}

async function notifyClaudeMissing(reason: string): Promise<void> {
  const firstLine = reason.split("\n", 1)[0]?.slice(0, 200) ?? "";
  const sel = await vscode.window.showWarningMessage(
    `Agent Desktop: \`claude\` CLI not found on PATH. ${firstLine}`,
    "Get Claude Code",
  );
  if (sel === "Get Claude Code") {
    await vscode.env.openExternal(vscode.Uri.parse(CLAUDE_INSTALL_URL));
  }
}

function updateProjectsContext(store: ProjectStore): void {
  void vscode.commands.executeCommand(
    "setContext",
    "agentDesktopHasProjects",
    store.list().length > 0,
  );
}

export function deactivate(): void {
  // no-op; Phase 3 will kill in-flight claude children here.
}
