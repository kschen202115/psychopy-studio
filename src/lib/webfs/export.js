import xmlFormat from "xml-formatter";
import { normalizeWebPath, readWebFS, webfsPath, writeWebFS } from "./storage.js";
import { createZip } from "./zip.js";

const DEFAULT_BACKEND_URL = "ws://localhost:8002";

function serializeExperiment(experiment) {
    const node = experiment.toXML();
    const content = new XMLSerializer().serializeToString(node);
    return xmlFormat(content);
}

function safeStem(value="experiment") {
    const base = String(value || "experiment").replace(/\.[^.]*$/, "");
    return base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "experiment";
}

function projectPrefixFor(experiment) {
    const stem = safeStem(experiment?.file?.stem || experiment?.file?.name || "experiment");
    return `exports/${stem}`;
}

function sendBackendCommand(command, kwargs={}, url=DEFAULT_BACKEND_URL, timeout=120000) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
            try { socket.close(); } catch {}
            reject(new Error(`Official PsychoPy web backend timed out while running ${command}.`));
        }, timeout);

        socket.onopen = () => {
            socket.send(JSON.stringify({
                id,
                command: {
                    command: "run",
                    args: [command],
                    kwargs,
                },
            }));
        };
        socket.onerror = () => {
            clearTimeout(timer);
            reject(new Error(`Could not connect to official PsychoPy web backend at ${url}.`));
        };
        socket.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (err) {
                clearTimeout(timer);
                reject(err);
                return;
            }
            if (data?.evt?.id !== id) return;
            clearTimeout(timer);
            socket.close();
            if ("response" in data) {
                resolve(data.response);
            } else {
                reject(new Error(data?.error?.message || `Official PsychoPy web backend failed while running ${command}.`));
            }
        };
    });
}

async function compileOfficialPsychoJS({ psyexpContent, psyexpPath, outfile }) {
    return await sendBackendCommand("compilePsychoJS", {
        psyexpContent,
        psyexpPath,
        outfile,
    });
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

    const psyexpContent = serializeExperiment(experiment);
    const compileResult = await compileOfficialPsychoJS({
        psyexpContent,
        psyexpPath: experiment.file?.file || psyexpName,
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
