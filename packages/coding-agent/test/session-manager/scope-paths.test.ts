import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "../../src/core/session-manager.js";

describe("SessionManager scopePaths persistence", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `session-scope-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("persists scopePaths in the session header", () => {
		const session = SessionManager.create("/primary", tempDir);
		session.addScopePath("/secondary");

		const reopened = SessionManager.open(session.getSessionFile()!, tempDir);
		expect(reopened.getScopePaths()).toEqual(["/primary", "/secondary"]);
	});

	it("falls back to [cwd] for legacy sessions without scopePaths", () => {
		const sessionFile = join(tempDir, "legacy.jsonl");
		writeFileSync(
			sessionFile,
			`${JSON.stringify({ type: "session", version: 3, id: "legacy-session", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/legacy" })}\n`,
		);

		const reopened = SessionManager.open(sessionFile, tempDir);
		expect(reopened.getScopePaths()).toEqual(["/legacy"]);
	});

	it("does not duplicate initial entries when scopePaths change before first assistant message", () => {
		const session = SessionManager.create("/primary", tempDir);
		session.appendModelChange("test-provider", "test-model");
		session.appendThinkingLevelChange("off");
		session.addScopePath("/secondary");
		session.appendMessage({ role: "user", content: "hello", timestamp: 1 });
		session.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "hi" }],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "test",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 2,
		});

		const lines = readFileSync(session.getSessionFile()!, "utf8").trim().split("\n");
		expect(lines).toHaveLength(5);
		const entries = lines.map((line) => JSON.parse(line));
		expect(entries.filter((entry) => entry.type === "session")).toHaveLength(1);
		expect(entries.filter((entry) => entry.type === "model_change")).toHaveLength(1);
		expect(entries.filter((entry) => entry.type === "thinking_level_change")).toHaveLength(1);
		expect(entries.filter((entry) => entry.type === "message")).toHaveLength(2);
		expect(entries[0].scopePaths).toEqual(["/primary", "/secondary"]);
	});
});
