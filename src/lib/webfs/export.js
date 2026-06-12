import { normalizeWebPath, readWebFS, webfsPath, writeWebFS } from "./storage.js";
import { compilePsychoJS, roundtripPsyexp } from "$lib/official/backend.js";
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
    return typeof window !== "undefined" && typeof WebSocket !== "undefined";
}

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
    const compileResult = await compilePsychoJS({
        psyexpContent,
        psyexpPath,
        outfile: jsName,
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

    const written = [];
    for (const entry of entries) {
        const key = await writeWebFS(`${prefix}/${entry.name}`, entry.content);
        written.push({ ...entry, key, url: webfsPath(key) });
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
        compiler: {
            psyexpPath: compileResult.psyexpPath,
            outfile: compileResult.outfile,
        },
    };
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
