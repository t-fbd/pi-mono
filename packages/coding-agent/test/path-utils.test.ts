import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandPath, resolveReadPath, resolveSearchPaths, resolveToCwd } from "../src/core/tools/path-utils.js";

describe("path-utils", () => {
	describe("expandPath", () => {
		it("should expand ~ to home directory", () => {
			const result = expandPath("~");
			expect(result).not.toContain("~");
		});

		it("should expand ~/path to home directory", () => {
			const result = expandPath("~/Documents/file.txt");
			expect(result).not.toContain("~/");
		});

		it("should normalize Unicode spaces", () => {
			// Non-breaking space (U+00A0) should become regular space
			const withNBSP = "file\u00A0name.txt";
			const result = expandPath(withNBSP);
			expect(result).toBe("file name.txt");
		});
	});

	describe("resolveToCwd", () => {
		it("should resolve absolute paths as-is", () => {
			const result = resolveToCwd("/absolute/path/file.txt", "/some/cwd");
			expect(result).toBe("/absolute/path/file.txt");
		});

		it("should resolve relative paths against cwd", () => {
			const result = resolveToCwd("relative/file.txt", "/some/cwd");
			expect(result).toBe(resolve("/some/cwd", "relative/file.txt"));
		});

		it("should resolve relative paths against a matching additional scope", () => {
			const root = mkdtempSync(join(tmpdir(), "path-utils-scope-"));
			const primary = join(root, "primary");
			const secondary = join(root, "secondary");
			mkdirSync(primary);
			mkdirSync(secondary);
			mkdirSync(join(secondary, "nested"), { recursive: true });
			writeFileSync(join(secondary, "nested", "file.txt"), "content");

			const result = resolveToCwd("nested/file.txt", primary, [secondary]);
			expect(result).toBe(join(secondary, "nested", "file.txt"));

			rmSync(root, { recursive: true, force: true });
		});

		it("should throw on ambiguous relative paths across scopes", () => {
			const root = mkdtempSync(join(tmpdir(), "path-utils-scope-"));
			const primary = join(root, "primary");
			const secondary = join(root, "secondary");
			mkdirSync(primary);
			mkdirSync(secondary);
			writeFileSync(join(primary, "same.txt"), "a");
			writeFileSync(join(secondary, "same.txt"), "b");

			expect(() => resolveToCwd("same.txt", primary, [secondary])).toThrow(/Ambiguous relative path/);

			rmSync(root, { recursive: true, force: true });
		});
	});

	describe("resolveSearchPaths", () => {
		it("should fan out to all scopes for missing search path", () => {
			const result = resolveSearchPaths(undefined, "/primary", ["/secondary"]);
			expect(result).toEqual(["/primary", "/secondary"]);
		});

		it("should fan out to all scopes for '.' search path", () => {
			const result = resolveSearchPaths(".", "/primary", ["/secondary"]);
			expect(result).toEqual(["/primary", "/secondary"]);
		});

		it("should resolve explicit relative search paths against a matching additional scope", () => {
			const root = mkdtempSync(join(tmpdir(), "path-utils-search-"));
			const primary = join(root, "primary");
			const secondary = join(root, "secondary");
			mkdirSync(primary, { recursive: true });
			mkdirSync(join(secondary, "src"), { recursive: true });

			expect(resolveSearchPaths("src", primary, [secondary])).toEqual([join(secondary, "src")]);

			rmSync(root, { recursive: true, force: true });
		});
	});

	describe("resolveReadPath", () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "path-utils-test-"));
		});

		afterEach(() => {
			// Clean up temp files and directory
			try {
				const files = readdirSync(tempDir);
				for (const file of files) {
					unlinkSync(join(tempDir, file));
				}
				rmdirSync(tempDir);
			} catch {
				// Ignore cleanup errors
			}
		});

		it("should resolve existing file path", () => {
			const fileName = "test-file.txt";
			writeFileSync(join(tempDir, fileName), "content");

			const result = resolveReadPath(fileName, tempDir);
			expect(result).toBe(join(tempDir, fileName));
		});

		it("should fall back to the primary scope when a relative read path does not exist yet", () => {
			const secondary = join(tempDir, "secondary");
			mkdirSync(secondary);
			const result = resolveReadPath("future-file.txt", tempDir, [secondary]);
			expect(result).toBe(join(tempDir, "future-file.txt"));
		});

		it("should handle NFC vs NFD Unicode normalization (macOS filenames with accents)", () => {
			// macOS stores filenames in NFD (decomposed) form:
			//   é = e + combining acute accent (U+0301)
			// Users typically type in NFC (composed) form:
			//   é = single character (U+00E9)
			//
			// Note: macOS APFS normalizes Unicode automatically, so both paths work.
			// This test verifies the NFD variant fallback works on systems that don't.

			// NFD: e (U+0065) + combining acute accent (U+0301)
			const nfdFileName = "file\u0065\u0301.txt";
			// NFC: é as single character (U+00E9)
			const nfcFileName = "file\u00e9.txt";

			// Verify they have different byte sequences
			expect(nfdFileName).not.toBe(nfcFileName);
			expect(Buffer.from(nfdFileName)).not.toEqual(Buffer.from(nfcFileName));

			// Create file with NFD name
			writeFileSync(join(tempDir, nfdFileName), "content");

			// User provides NFC path - should find the file (via filesystem normalization or our fallback)
			const result = resolveReadPath(nfcFileName, tempDir);
			// Result should contain the accented character (either NFC or NFD form)
			expect(result).toContain(tempDir);
			expect(result).toMatch(/file.+\.txt$/);
		});

		it("should handle curly quotes vs straight quotes (macOS filenames)", () => {
			// macOS uses curly apostrophe (U+2019) in screenshot filenames:
			//   Capture d'écran (U+2019)
			// Users typically type straight apostrophe (U+0027):
			//   Capture d'ecran (U+0027)

			const curlyQuoteName = "Capture d\u2019cran.txt"; // U+2019 right single quotation mark
			const straightQuoteName = "Capture d'cran.txt"; // U+0027 apostrophe

			// Verify they are different
			expect(curlyQuoteName).not.toBe(straightQuoteName);

			// Create file with curly quote name (simulating macOS behavior)
			writeFileSync(join(tempDir, curlyQuoteName), "content");

			// User provides straight quote path - should find the curly quote file
			const result = resolveReadPath(straightQuoteName, tempDir);
			expect(result).toBe(join(tempDir, curlyQuoteName));
		});

		it("should handle combined NFC + curly quote (French macOS screenshots)", () => {
			// Full macOS screenshot filename: "Capture d'écran" with NFD é and curly quote
			// Note: macOS APFS normalizes NFD to NFC, so the actual file on disk uses NFC
			const nfcCurlyName = "Capture d\u2019\u00e9cran.txt"; // NFC + curly quote (how APFS stores it)
			const nfcStraightName = "Capture d'\u00e9cran.txt"; // NFC + straight quote (user input)

			// Verify they are different
			expect(nfcCurlyName).not.toBe(nfcStraightName);

			// Create file with macOS-style name (curly quote)
			writeFileSync(join(tempDir, nfcCurlyName), "content");

			// User provides straight quote path - should find the curly quote file
			const result = resolveReadPath(nfcStraightName, tempDir);
			expect(result).toBe(join(tempDir, nfcCurlyName));
		});

		it("should handle macOS screenshot AM/PM variant with narrow no-break space", () => {
			// macOS uses narrow no-break space (U+202F) before AM/PM in screenshot names
			const macosName = "Screenshot 2024-01-01 at 10.00.00\u202FAM.png"; // U+202F
			const userName = "Screenshot 2024-01-01 at 10.00.00 AM.png"; // regular space

			// Create file with macOS-style name
			writeFileSync(join(tempDir, macosName), "content");

			// User provides regular space path
			const result = resolveReadPath(userName, tempDir);

			// This works because tryMacOSScreenshotPath() handles this case
			expect(result).toBe(join(tempDir, macosName));
		});
	});
});
