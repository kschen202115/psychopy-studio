import { listWebFS, normalizeWebPath, readWebFS, webfsPath, writeWebFS } from "./storage.js";
import { compilePsychoJS, roundtripPsyexp } from "$lib/official/backend.js";
import { ensurePsychoJSLib } from "./psychojsLib.js";
import { collectExperimentResources } from "./resources.js";
import { createZip } from "./zip.js";

function serializeExperiment(experiment) {
    return experiment.toXMLString();
}

function safeStem(value="experiment") {
    const base = String(value || "experiment").replace(/\.[^.]*$/, "");
    return base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "experiment";
}

function projectPrefixFor(experiment) {
    const stem = safeStem(experiment?.file?.stem || experiment?.file?.name || "experiment");
    return `exports/${stem}`;
}

export function isBrowserOfficialExportAvailable() {
    return typeof window !== "undefined" && typeof fetch !== "undefined";
}

/**
 * Read the resources the experiment needs from the officially compiled JS:
 * flow.py writes them into psychoJS.start as `{'name': ..., 'path': ...}`.
 */
export function parseDeclaredResources(script) {
    const block = String(script || "").match(/resources:\s*\[([\s\S]*?)\]/);
    if (!block) return [];
    const items = [];
    for (const m of block[1].matchAll(/\{\s*['"]name['"]\s*:\s*['"]([^'"]+)['"]\s*,\s*['"]path['"]\s*:\s*['"]([^'"]+)['"]\s*\}/g)) {
        items.push({ name: m[1], path: m[2] });
    }
    return items;
}

/**
 * Resolve a resource path from the compiled JS (relative to the experiment)
 * to a WebFS key. Returns undefined for URLs.
 */
function resolveWebKey(baseFolder, rel) {
    rel = String(rel || "").replaceAll("\\", "/");
    if (/^https?:\/\//i.test(rel)) return undefined;
    let parts;
    if (rel.startsWith(WEBFS_PREFIX)) {
        parts = rel.slice(WEBFS_PREFIX.length).split("/");
    } else {
        parts = [...normalizeWebPath(baseFolder).split("/"), ...rel.split("/")];
    }
    const out = [];
    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") { out.pop(); continue; }
        out.push(part);
    }
    return out.join("/");
}
const WEBFS_PREFIX = "/webfs/";

export async function exportOfficialExperimentToWebFS(experiment, options={}) {
    if (!experiment) throw new Error("Cannot export without an experiment.");

    const stem = safeStem(options.stem || experiment.file?.stem || experiment.file?.name || "experiment");
    const prefix = normalizeWebPath(options.prefix || projectPrefixFor(experiment));
    const psyexpName = `${stem}.psyexp`;
    const jsName = `${stem}.js`;
    const legacyName = `${stem}-legacy-browsers.js`;
    const indexName = "index.html";
    const zipName = `${stem}.zip`;

    const psyexpPath = experiment.file?.file || psyexpName;
    const roundtripResult = await roundtripPsyexp({
        psyexpContent: serializeExperiment(experiment),
        psyexpPath,
    });
    if (!roundtripResult?.ok || !roundtripResult.psyexp) {
        throw new Error(roundtripResult?.blocker || "Official PsychoPy roundtrip did not return a .psyexp export.");
    }

    const psyexpContent = roundtripResult.psyexp;
    // send sidecar files (stimuli, conditions, ...) so the official compiler
    // can read and register them next to the .psyexp
    const resources = await collectExperimentResources(experiment.file);
    const compileResult = await compilePsychoJS({
        psyexpContent,
        psyexpPath,
        outfile: jsName,
        resources,
    });

    if (!compileResult?.ok) {
        throw new Error(compileResult?.blocker || "Official PsychoPy compiler did not return a successful export.");
    }
    if (!compileResult.script) {
        throw new Error("Official PsychoPy compiler did not return a JavaScript output.");
    }

    if (!compileResult.html) {
        throw new Error("Official PsychoPy compiler did not return index.html.");
    }

    const officialPsyexp = compileResult.psyexp || psyexpContent;
    const entries = [
        { name: psyexpName, content: officialPsyexp },
        { name: jsName, content: compileResult.script },
        { name: indexName, content: compileResult.html },
    ];
    if (compileResult.legacyScript) entries.push({ name: legacyName, content: compileResult.legacyScript });
    // copy the files the experiment needs at runtime into the export folder,
    // using the official compiler's own manifest (exp.getResourceFiles), so
    // the exported bundle resolves them relative to index.html. Anything the
    // manifest asks for that isn't in browser storage is reported as missing.
    const folder = normalizeWebPath(experiment.file?.parent || "");
    const includedResources = [];
    const missingResources = [];
    for (const required of compileResult.requiredResources || []) {
        const rel = normalizeWebPath(required.rel || required.name || "");
        if (!rel) continue;
        // resolve relative to the experiment's folder, with a fallback to the
        // file as uploaded (matched by name) anywhere in browser storage
        let key = folder ? `${folder}/${rel}` : rel;
        let content = await readWebFS(key);
        if (content === undefined) {
            const fallback = resources.find(res => res.path === rel || res.path.endsWith(`/${rel}`));
            if (fallback) {
                key = fallback.sourceKey;
                content = await readWebFS(key);
            }
        }
        if (content === undefined) {
            missingResources.push(rel);
            continue;
        }
        if (content instanceof Blob) {
            content = new Uint8Array(await content.arrayBuffer());
        }
        entries.push({ name: rel, content });
        includedResources.push(rel);
    }

    const written = [];
    for (const entry of entries) {
        const key = await writeWebFS(`${prefix}/${entry.name}`, entry.content);
        written.push({ ...entry, key, url: webfsPath(key) });
    }

    // the compiled outputs import ./lib/psychojs-<version>.*, so make sure the
    // official PsychoJS library is present alongside them
    const lib = await ensurePsychoJSLib(prefix, compileResult.html, compileResult.script);
    for (const key of lib.files) {
        const name = `lib/${key.split("/").pop()}`;
        const content = await readWebFS(key);
        const buffer = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;
        entries.push({ name, content: buffer });
        written.push({ name, key, url: webfsPath(key) });
    }

    const zipBlob = createZip(entries);
    const zipKey = await writeWebFS(`${prefix}/${zipName}`, zipBlob);
    const zip = { name: zipName, key: zipKey, url: webfsPath(zipKey), content: zipBlob };

    return {
        ok: true,
        mode: compileResult.mode,
        prefix,
        files: written,
        zip,
        entryUrl: webfsPath(`${prefix}/${indexName}`),
        // preview with the official local pilot token, as the desktop app does
        previewUrl: `${webfsPath(`${prefix}/${indexName}`)}?__pilotToken=local`,
        // runtime files per the official compiler's manifest
        resources: includedResources,
        missingResources,
        compiler: {
            psyexpPath: compileResult.psyexpPath,
            outfile: compileResult.outfile,
        },
    };
}

/**
 * Deepest directory shared by all keys, e.g. ["demo/a.js", "demo/lib/b.js"] -> "demo"
 */
function commonDirPrefix(keys) {
    if (!keys.length) return "";
    let prefix = keys[0].split("/").slice(0, -1);
    for (const key of keys.slice(1)) {
        const parts = key.split("/").slice(0, -1);
        let i = 0;
        while (i < prefix.length && i < parts.length && prefix[i] === parts[i]) i += 1;
        prefix = prefix.slice(0, i);
    }
    return prefix.join("/");
}

/**
 * Bundle the given WebFS files into a ZIP and download it. Entry names are
 * relative to the files' deepest common directory, so a zipped experiment
 * folder can be unzipped and statically hosted as-is.
 */
export async function downloadWebFSZipFiles(keys, zipName=undefined) {
    keys = [...new Set((keys || []).map(normalizeWebPath))].filter(Boolean);
    if (!keys.length) {
        throw new Error("No files to bundle into a ZIP.");
    }
    const root = commonDirPrefix(keys);
    const entries = [];
    for (const key of keys) {
        let content = await readWebFS(key);
        if (content === undefined) continue;
        if (content instanceof Blob) {
            content = new Uint8Array(await content.arrayBuffer());
        }
        const name = root && key.startsWith(`${root}/`)
            ? key.slice(root.length + 1)
            : key;
        entries.push({ name, content });
    }
    const blob = createZip(entries);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = zipName || `${root ? root.split("/").pop() : "webfs"}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { name: link.download, files: entries.length, bytes: blob.size };
}

/**
 * Bundle all WebFS files under a prefix into a ZIP and download it.
 */
export async function downloadWebFSZip(prefix="", zipName=undefined) {
    return await downloadWebFSZipFiles(await listWebFS(prefix), zipName);
}


export async function downloadExportZip(exportResult) {
    const zip = exportResult?.zip;
    if (!zip?.key) throw new Error("No ZIP export is available to download.");
    const content = await readWebFS(zip.key);
    const blob = content instanceof Blob ? content : new Blob([content], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = zip.name || normalizeWebPath(zip.key).split("/").pop() || "psychopy-export.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
