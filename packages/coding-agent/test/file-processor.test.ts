import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processFileArguments } from "../src/cli/file-processor.js";

describe("processFileArguments scope resolution", () => {
	let root: string;
	let scopeA: string;
	let scopeB: string;

	beforeEach(() => {
		root = join(tmpdir(), `file-processor-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		scopeA = join(root, "scope-a");
		scopeB = join(root, "scope-b");
		mkdirSync(scopeA, { recursive: true });
		mkdirSync(scopeB, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("resolves relative @file against additional scopes", async () => {
		writeFileSync(join(scopeB, "note.txt"), "from-scope-b");

		const result = await processFileArguments(["note.txt"], {
			cwd: scopeA,
			scopePaths: [scopeA, scopeB],
		});

		expect(result.text).toContain(`<file name="${join(scopeB, "note.txt")}">`);
		expect(result.text).toContain("from-scope-b");
	});

	it("fails on ambiguous relative @file paths across scopes", async () => {
		writeFileSync(join(scopeA, "same.txt"), "a");
		writeFileSync(join(scopeB, "same.txt"), "b");

		await expect(
			processFileArguments(["same.txt"], {
				cwd: scopeA,
				scopePaths: [scopeA, scopeB],
			}),
		).rejects.toThrow(/Ambiguous relative path/);
	});

	it("supports mixed @file arguments resolved across primary and additional scopes", async () => {
		writeFileSync(join(scopeA, "primary.txt"), "from-primary");
		writeFileSync(join(scopeB, "secondary.txt"), "from-secondary");

		const result = await processFileArguments(["primary.txt", "secondary.txt"], {
			cwd: scopeA,
			scopePaths: [scopeA, scopeB],
		});

		expect(result.text).toContain(`<file name="${join(scopeA, "primary.txt")}">`);
		expect(result.text).toContain("from-primary");
		expect(result.text).toContain(`<file name="${join(scopeB, "secondary.txt")}">`);
		expect(result.text).toContain("from-secondary");
	});

	it("resolves absolute @file paths without scope ambiguity", async () => {
		const absolute = join(scopeB, "absolute.txt");
		writeFileSync(absolute, "absolute-content");

		const result = await processFileArguments([absolute], {
			cwd: scopeA,
			scopePaths: [scopeA, scopeB],
		});

		expect(result.text).toContain(`<file name="${absolute}">`);
		expect(result.text).toContain("absolute-content");
	});
});
