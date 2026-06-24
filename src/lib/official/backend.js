/**
 * Official PsychoPy backend client.
 *
 * Transport is now an in-browser Pyodide Web Worker (no server process): the
 * worker runs the same official_core.handle_command used by the legacy
 * WebSocket dev server. The public API below is unchanged so callers
 * (export.js, experiment.svelte.js, profiles.svelte.js) need no edits.
 */

// kept for backwards-compatible imports; no longer used for transport.
export const DEFAULT_OFFICIAL_BACKEND_URL = "pyodide://in-browser";

function commandId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `official-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOfficialBackendClientAvailable() {
    return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
}

let worker = null;
const pending = new Map();         // id -> { resolve, reject, timer }
const statusListeners = new Set(); // optional init-progress subscribers

/** Subscribe to worker init progress ({phase, detail} | {ready:true}). */
export function onOfficialBackendStatus(listener) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
}

function getWorker() {
    if (worker) return worker;
    worker = new Worker(new URL("./pyodideWorker.js", import.meta.url), {
        type: "module",
    });
    worker.onmessage = (ev) => {
        const data = ev.data || {};
        if (data.type === "status") {
            statusListeners.forEach((l) => l({ phase: data.phase, detail: data.detail }));
            return;
        }
        if (data.type === "ready") {
            statusListeners.forEach((l) => l({ ready: true }));
            return;
        }
        const entry = pending.get(data.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(data.id);
        if (data.ok) {
            entry.resolve(data.response);
        } else {
            const error = data.error || {};
            const err = new Error(error.message || "Official PsychoPy backend command failed.");
            err.backendError = error;
            entry.reject(err);
        }
    };
    worker.onerror = (ev) => {
        // fail all in-flight commands; drop the worker so the next call retries
        const err = new Error(`Pyodide backend worker error: ${ev.message || ev}`);
        pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(err); });
        pending.clear();
        worker = null;
    };
    return worker;
}

export function sendOfficialBackendCommand(command, kwargs = {}, options = {}) {
    const { timeout = 120000 } = options;

    if (!isOfficialBackendClientAvailable()) {
        return Promise.reject(new Error(
            "Official PsychoPy backend requires Web Worker + WebAssembly support."));
    }

    return new Promise((resolve, reject) => {
        const w = getWorker();
        const id = commandId();
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`Official PsychoPy backend timed out while running ${command}.`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        w.postMessage({ id, command, args: [], kwargs });
    });
}

export async function roundtripPsyexp({ psyexpContent, psyexpPath, resources } = {}, options = {}) {
    return await sendOfficialBackendCommand("roundtripPsyexp", {
        psyexpContent,
        psyexpPath,
        resources,
    }, options);
}

export async function compilePsychoJS({ psyexpContent, psyexpPath, outfile, resources } = {}, options = {}) {
    return await sendOfficialBackendCommand("compilePsychoJS", {
        psyexpContent,
        psyexpPath,
        outfile,
        resources,
    }, options);
}
