import { describe, expect, it } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";

describe("InteractiveMode /scope autocomplete", () => {
	it("suggests scope subcommands", () => {
		const fakeThis: any = {
			scopeCommandActions: ["add", "rm", "reset"],
			sessionManager: { getScopePaths: () => ["/primary", "/secondary"] },
		};

		const result = (InteractiveMode as any).prototype.getScopeCommandCompletions.call(fakeThis, "");
		expect(result).toEqual([
			{ value: "add", label: "add" },
			{ value: "rm", label: "rm" },
			{ value: "reset", label: "reset" },
		]);
	});

	it("filters scope subcommands by prefix", () => {
		const fakeThis: any = {
			scopeCommandActions: ["add", "rm", "reset"],
			sessionManager: { getScopePaths: () => ["/primary", "/secondary"] },
		};

		const result = (InteractiveMode as any).prototype.getScopeCommandCompletions.call(fakeThis, "r");
		expect(result).toEqual([
			{ value: "rm", label: "rm" },
			{ value: "reset", label: "reset" },
		]);
	});

	it("suggests removable scope paths for rm", () => {
		const fakeThis: any = {
			scopeCommandActions: ["add", "rm", "reset"],
			sessionManager: { getScopePaths: () => ["/primary", "/secondary", "/tmp/other"] },
		};

		const result = (InteractiveMode as any).prototype.getScopeCommandCompletions.call(fakeThis, "rm /t");
		expect(result).toEqual([{ value: "/tmp/other", label: "/tmp/other" }]);
	});

	it("returns null for add path stage so general path completion can take over", () => {
		const fakeThis: any = {
			scopeCommandActions: ["add", "rm", "reset"],
			sessionManager: { getScopePaths: () => ["/primary", "/secondary"] },
		};

		const result = (InteractiveMode as any).prototype.getScopeCommandCompletions.call(fakeThis, "add /tmp");
		expect(result).toBeNull();
	});
});
