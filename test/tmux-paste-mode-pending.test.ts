/**
 * tmux-paste-mode-pending.test.ts — regression for paste-mode blind spot.
 *
 * paneInputPending() used to check only the LAST visible line for a prompt
 * marker. Claude Code's paste-mode puts "[Pasted text #1 ..." and a status
 * bar BELOW the prompt, so the last line has no marker → returns false →
 * thinks Enter submitted → command sits in the input buffer.
 *
 * The fix: capture 10 lines, detect "[Pasted text #N" on ANY line, and
 * check ALL lines for prompt + non-whitespace (not just the last).
 */
import { describe, test, expect } from "bun:test";
import { Tmux } from "../src/core/transport/tmux-class";

class FakeTmux extends Tmux {
  calls: string[] = [];
  captureScript: string[] = [];
  private captureIdx = 0;

  constructor() {
    super(undefined, "");
  }

  async capture(_target: string, _lines = 80): Promise<string> {
    this.calls.push("capture");
    const v = this.captureScript[this.captureIdx] ?? this.captureScript.at(-1) ?? "";
    this.captureIdx++;
    return v;
  }
  async sendKeys(_target: string, ...keys: string[]): Promise<void> {
    this.calls.push(`sendKeys:${keys.join(",")}`);
  }
  async sendKeysLiteral(_target: string, text: string): Promise<void> {
    this.calls.push(`sendKeysLiteral:${text}`);
  }
  async loadBuffer(text: string): Promise<void> {
    this.calls.push(`loadBuffer:${text.length}`);
  }
  async pasteBuffer(_target: string): Promise<void> {
    this.calls.push("pasteBuffer");
  }
  async exitModeIfNeeded(_target: string): Promise<boolean> {
    return false;
  }
}

const enterCount = (calls: string[]) => calls.filter(c => c === "sendKeys:Enter").length;

describe("paneInputPending — paste-mode and multi-line detection", () => {
  test("detects [Pasted text #1 as pending input and retries Enter", async () => {
    const t = new FakeTmux();
    // First capture: paste-mode indicator present (pending).
    // Second capture: cleared (idle prompt).
    t.captureScript = [
      "❯ hello world\n[Pasted text #1 (6 lines) - press Enter to submit, or paste again to expand]\nctx:42%",
      "❯ ",
    ];
    await t.sendText("sess:win", "deploy");

    expect(enterCount(t.calls)).toBe(2);
  }, 15_000);

  test("detects prompt + non-whitespace on a non-last line as pending", async () => {
    const t = new FakeTmux();
    // Prompt with text on line 1, status bar on line 2 (last line) — old
    // code only checked the last line and would miss this.
    t.captureScript = [
      "❯ unsent command\nctx:55%",
      "❯ ",
    ];
    await t.sendText("sess:win", "check");

    expect(enterCount(t.calls)).toBe(2);
  }, 15_000);

  test("returns false (not pending) when all prompt lines are idle", async () => {
    const t = new FakeTmux();
    t.captureScript = [
      "some output\n❯ \nctx:30%",
    ];
    await t.sendText("sess:win", "idle test");

    // Only 1 Enter needed — pane was idle on first check.
    expect(enterCount(t.calls)).toBe(1);
  }, 10_000);
});
