/**
 * wait-agent-ready.test.ts — readiness gate for Claude Code TUI.
 *
 * waitForAgentReady() polls pane content for `ctx:NN%` or `ctx:--` — the
 * definitive signal that Claude Code's TUI is fully rendered. Without this
 * gate, maw hey can arrive during the 10-30s boot window and Enter
 * keystrokes get lost.
 */
import { describe, test, expect, mock } from "bun:test";
import { join } from "path";

const srcRoot = join(import.meta.dir, "..");

mock.module(join(srcRoot, "src/core/transport/tmux-class"), () => {
  class MockTmux { async run() { return ""; } async tryRun() { return ""; } }
  return { Tmux: MockTmux, tmux: new MockTmux() };
});
mock.module(join(srcRoot, "src/sdk"), () => ({
  listSessions: async () => [],
  capture: async () => "",
  sendKeys: async () => {},
  getPaneCommand: async () => "claude",
  isAgentCommand: () => true,
  findPeerForTarget: async () => null,
  resolveTarget: () => null,
  curlFetch: async () => ({ ok: true }),
  runHook: async () => {},
}));
mock.module(join(srcRoot, "src/config"), () => ({
  loadConfig: () => ({ node: "test", oracle: "test", port: 3456, namedPeers: [] }),
  cfgLimit: () => 80,
}));
mock.module(join(srcRoot, "src/commands/shared/comm-log-feed"), () => ({
  logMessage: () => {},
  emitFeed: () => {},
}));
mock.module(join(srcRoot, "src/commands/shared/receiver-inbox"), () => ({
  defaultReceiverInboxWriter: () => async () => null,
}));
mock.module(join(srcRoot, "src/lib/oracle-manifest"), () => ({
  findOracle: () => null,
}));
mock.module(join(srcRoot, "src/commands/shared/should-auto-wake"), () => ({
  shouldAutoWake: () => ({ wake: false }),
}));
mock.module(join(srcRoot, "src/commands/shared/wake-cmd"), () => ({
  cmdWake: async () => {},
}));
mock.module(join(srcRoot, "src/commands/shared/scope-acl"), () => ({
  loadAllScopes: () => [],
  evaluateAclFromDisk: () => "allow",
}));
mock.module(join(srcRoot, "src/lib/trust-store"), () => ({
  cmdAdd: () => {},
}));

const { waitForAgentReady } = await import("../src/commands/shared/comm-send");

describe("waitForAgentReady", () => {
  test("returns true immediately when ctx:NN% is in captured content", async () => {
    const captureFn = async () => "some output\n❯ \nctx:42% | 3.2k tokens";
    const result = await waitForAgentReady("sess:win", 5000, { captureFn });
    expect(result).toBe(true);
  }, 10_000);

  test("returns true when ctx:-- is present (no context loaded yet)", async () => {
    const captureFn = async () => "Loading...\nctx:-- | 0 tokens";
    const result = await waitForAgentReady("sess:win", 5000, { captureFn });
    expect(result).toBe(true);
  }, 10_000);

  test("returns false after timeout when no status bar appears", async () => {
    const captureFn = async () => "direnv: loading .envrc\nsome boot output";
    const result = await waitForAgentReady("sess:win", 2000, { captureFn });
    expect(result).toBe(false);
  }, 10_000);

  test("handles capture errors gracefully and keeps polling", async () => {
    let calls = 0;
    const captureFn = async () => {
      calls++;
      if (calls <= 2) throw new Error("tmux not ready");
      return "❯ \nctx:88%";
    };
    const result = await waitForAgentReady("sess:win", 10000, { captureFn });
    expect(result).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
  }, 15_000);
});
