import { isWebPath, listWebFS, normalizeWebPath, readWebFS } from "./storage.js";

/**
 * Encode WebFS content (string/Blob/bytes) as base64 for the official web
 * backend's `resources` payload.
 */
export async function webfsContentBase64(content) {
    let bytes;
    if (content instanceof Blob) {
        bytes = new Uint8Array(await content.arrayBuffer());
    } else if (content instanceof ArrayBuffer) {
        bytes = new Uint8Array(content);
    } else if (ArrayBuffer.isView(content)) {
        bytes = new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    } else {
        bytes = new TextEncoder().encode(String(content ?? ""));
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

/**
 * Collect the sidecar files (stimuli, conditions spreadsheets, ...) living in
 * the experiment's WebFS folder, so they can be sent with compile requests and
 * materialized next to the .psyexp on the backend. The official compiler reads
 * conditions files and checks resource paths relative to the experiment file.
 *
 * Compiled outputs and the PsychoJS library are excluded.
 *
 * @param {object} experimentFile parsed path of the .psyexp (file/parent/stem)
 * @returns {Promise<Array<{path: string, base64: string, sourceKey: string}>>}
 */
export async function collectExperimentResources(experimentFile) {
    if (!experimentFile?.file || !isWebPath(experimentFile.file)) {
        return [];
    }
    const folder = normalizeWebPath(experimentFile.parent || "");
    const psyexpKey = normalizeWebPath(experimentFile.file);
    const stem = experimentFile.stem;
    const generated = new Set([
        psyexpKey,
        `${folder}/index.html`,
        `${folder}/${stem}.js`,
        `${folder}/${stem}-legacy-browsers.js`,
    ]);

    const resources = [];
    for (const key of await listWebFS(folder)) {
        // skip the experiment itself and compiled outputs
        if (generated.has(key)) continue;
        // skip the PsychoJS library, export trees, packaged downloads and
        // other experiments — none of these are runtime resources
        const rel = folder && key.startsWith(`${folder}/`) ? key.slice(folder.length + 1) : key;
        if (rel.split("/").includes("lib")) continue;
        if (rel.startsWith("exports/")) continue;
        if (rel.endsWith(".zip") || rel.endsWith(".psyexp")) continue;

        const content = await readWebFS(key);
        if (content === undefined) continue;
        resources.push({
            path: rel,
            base64: await webfsContentBase64(content),
            sourceKey: key,
        });
    }
    return resources;
}
