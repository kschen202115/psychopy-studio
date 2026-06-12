import { listWebFS, normalizeWebPath, readWebFS, writeWebFS } from "./storage.js";

// Official PsychoJS library host, as used by psychopy.tools.servertools:getPsychoJS
export const PSYCHOJS_LIB_HOST = "https://lib.pavlovia.org";
// Same extension list as official getPsychoJS, minus source maps (kept out of
// browser storage for size; the experiment runs without them)
export const PSYCHOJS_LIB_EXTENSIONS = ["css", "js", "iife.js", "js.LEGAL.txt"];

/**
 * Read the PsychoJS version out of officially compiled outputs (index.html or
 * the generated experiment JS), e.g. `./lib/psychojs-2026.2.0.js`.
 */
export function parsePsychoJSVersion(...sources) {
    for (const source of sources) {
        const match = String(source || "").match(/\.\/lib\/psychojs-([0-9A-Za-z.\-]+?)\.(?:iife\.)?js/);
        if (match) {
            return match[1];
        }
    }
    return undefined;
}

/**
 * Make sure the official PsychoJS library files exist in WebFS under
 * `<prefix>/lib/`, downloading them from the official host if missing.
 * Mirrors psychopy.tools.servertools:getPsychoJS, but writes to browser
 * storage instead of a server folder.
 *
 * @returns {Promise<{version: string, files: string[]}>} keys written/present
 */
export async function ensurePsychoJSLib(prefix, ...compiledSources) {
    const version = parsePsychoJSVersion(...compiledSources);
    if (!version) {
        throw new Error("Could not detect the PsychoJS version from the official compiler outputs.");
    }
    const libPrefix = normalizeWebPath(`${normalizeWebPath(prefix)}/lib`);
    const existing = new Set(await listWebFS(libPrefix));
    const files = [];
    for (const ext of PSYCHOJS_LIB_EXTENSIONS) {
        const name = `psychojs-${version}.${ext}`;
        const key = `${libPrefix}/${name}`;
        if (existing.has(key) && (await readWebFS(key)) !== undefined) {
            files.push(key);
            continue;
        }
        const resp = await fetch(`${PSYCHOJS_LIB_HOST}/${name}`);
        if (!resp.ok) {
            // LEGAL.txt is informational; the rest are required to run
            if (ext === "js.LEGAL.txt") continue;
            throw new Error(`Failed to download official PsychoJS library file ${name} (HTTP ${resp.status}).`);
        }
        await writeWebFS(key, await resp.blob());
        files.push(key);
    }
    return { version, files };
}
