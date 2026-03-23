import { accessSync, constants } from "node:fs";
import * as os from "node:os";
import { isAbsolute, resolve as resolvePath } from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";
function normalizeUnicodeSpaces(str: string): string {
	return str.replace(UNICODE_SPACES, " ");
}

function tryMacOSScreenshotPath(filePath: string): string {
	return filePath.replace(/ (AM|PM)\./g, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string): string {
	// macOS stores filenames in NFD (decomposed) form, try converting user input to NFD
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string): string {
	// macOS uses U+2019 (right single quotation mark) in screenshot names like "Capture d'écran"
	// Users typically type U+0027 (straight apostrophe)
	return filePath.replace(/'/g, "\u2019");
}

function fileExists(filePath: string): boolean {
	try {
		accessSync(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function normalizeAtPrefix(filePath: string): string {
	return filePath.startsWith("@") ? filePath.slice(1) : filePath;
}

function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}

export type ScopePathsInput = string[] | (() => string[]);

export function resolveScopePaths(cwd: string, scopePaths?: ScopePathsInput): string[] {
	const paths = uniquePaths([cwd, ...(typeof scopePaths === "function" ? scopePaths() : (scopePaths ?? []))]);
	return paths.filter((path) => path.length > 0);
}

/**
 * Resolve one or more search roots for grep/find/ls.
 * - Missing/"." path fans out across all scopes.
 * - Any other path resolves to a single path (and can still be ambiguous).
 */
export function resolveSearchPaths(
	searchPath: string | undefined,
	cwd: string,
	scopePaths?: ScopePathsInput,
): string[] {
	if (!searchPath || searchPath === ".") {
		return resolveScopePaths(cwd, scopePaths);
	}
	return [resolveToCwd(searchPath, cwd, scopePaths)];
}

export function expandPath(filePath: string): string {
	const normalized = normalizeUnicodeSpaces(normalizeAtPrefix(filePath));
	if (normalized === "~") {
		return os.homedir();
	}
	if (normalized.startsWith("~/")) {
		return os.homedir() + normalized.slice(1);
	}
	return normalized;
}

function resolveReadCandidate(filePath: string): string | undefined {
	if (fileExists(filePath)) return filePath;

	// Try macOS AM/PM variant (narrow no-break space before AM/PM)
	const amPmVariant = tryMacOSScreenshotPath(filePath);
	if (amPmVariant !== filePath && fileExists(amPmVariant)) {
		return amPmVariant;
	}

	// Try NFD variant (macOS stores filenames in NFD form)
	const nfdVariant = tryNFDVariant(filePath);
	if (nfdVariant !== filePath && fileExists(nfdVariant)) {
		return nfdVariant;
	}

	// Try curly quote variant (macOS uses U+2019 in screenshot names)
	const curlyVariant = tryCurlyQuoteVariant(filePath);
	if (curlyVariant !== filePath && fileExists(curlyVariant)) {
		return curlyVariant;
	}

	// Try combined NFD + curly quote (for French macOS screenshots like "Capture d'écran")
	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== filePath && fileExists(nfdCurlyVariant)) {
		return nfdCurlyVariant;
	}

	return undefined;
}

function ambiguousPathError(filePath: string, matches: string[]): Error {
	return new Error(
		`Ambiguous relative path: ${filePath}\nMatches multiple scopes:\n${matches.map((path) => `- ${path}`).join("\n")}`,
	);
}

/**
 * Resolve a path relative to the given cwd.
 * Handles ~ expansion and absolute paths.
 */
export function resolveToCwd(filePath: string, cwd: string, scopePaths?: ScopePathsInput): string {
	const expanded = expandPath(filePath);
	if (isAbsolute(expanded)) {
		return expanded;
	}

	const scopeBases = resolveScopePaths(cwd, scopePaths);
	const matches = scopeBases.map((base) => resolvePath(base, expanded)).filter((candidate) => fileExists(candidate));

	if (matches.length > 1) {
		throw ambiguousPathError(filePath, matches);
	}

	return matches[0] ?? resolvePath(scopeBases[0], expanded);
}

export function resolveReadPath(filePath: string, cwd: string, scopePaths?: ScopePathsInput): string {
	const expanded = expandPath(filePath);
	if (isAbsolute(expanded)) {
		return resolveReadCandidate(expanded) ?? expanded;
	}

	const scopeBases = resolveScopePaths(cwd, scopePaths);
	const matches = scopeBases
		.map((base) => resolveReadCandidate(resolvePath(base, expanded)))
		.filter((candidate): candidate is string => candidate !== undefined);

	if (matches.length > 1) {
		throw ambiguousPathError(filePath, matches);
	}

	return matches[0] ?? resolvePath(scopeBases[0], expanded);
}
