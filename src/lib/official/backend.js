export const DEFAULT_OFFICIAL_BACKEND_URL = "http://localhost:8002";

// In production the backend is an EdgeOne Pages function served same-origin
// (relative path → no CORS); under `vite dev` it's the standalone http.server
// on :8002. import.meta.env.DEV is statically true in dev and false in builds.
const PRODUCTION_BACKEND_PATH = "/api/backend";

function browserDefaultUrl() {
    if (typeof window === "undefined") return DEFAULT_OFFICIAL_BACKEND_URL;
    // import.meta.env.DEV is statically true under `vite dev` and false in
    // production builds, so the dev branch is dropped from the prod bundle.
    if (import.meta.env.DEV) {
        const protocol = window.location?.protocol === "https:" ? "https:" : "http:";
        const hostname = window.location?.hostname || "localhost";
        return `${protocol}//${hostname}:8002`;
    }
    return PRODUCTION_BACKEND_PATH;
}

function browserConfiguredUrl() {
    if (typeof window === "undefined") return DEFAULT_OFFICIAL_BACKEND_URL;
    return window.__PSYCHOPY_OFFICIAL_BACKEND_URL__
        || window.localStorage?.getItem?.("psychopy.officialBackendUrl")
        || browserDefaultUrl();
}

function commandId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `official-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOfficialBackendClientAvailable() {
    return typeof fetch !== "undefined";
}

export async function sendOfficialBackendCommand(command, kwargs={}, options={}) {
    const {
        url = browserConfiguredUrl(),
        timeout = 120000,
    } = options;

    if (!isOfficialBackendClientAvailable()) {
        throw new Error("Official PsychoPy web backend client requires fetch support.");
    }

    const id = commandId();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

    try {
        let response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    command: {
                        command: "run",
                        args: [command],
                        kwargs,
                    },
                }),
                signal: controller?.signal,
            });
        } catch (err) {
            if (err?.name === "AbortError") {
                throw new Error(`Official PsychoPy web backend timed out while running ${command}.`);
            }
            throw new Error(`Could not connect to official PsychoPy web backend at ${url}.`);
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Official PsychoPy web backend returned a non-JSON response while running ${command}.`);
        }

        if (data && "response" in data) {
            return data.response;
        }
        const error = data?.error || {};
        const err = new Error(error.message || `Official PsychoPy web backend failed while running ${command}.`);
        err.backendError = error;
        throw err;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export async function roundtripPsyexp({ psyexpContent, psyexpPath, resources }={}, options={}) {
    return await sendOfficialBackendCommand("roundtripPsyexp", {
        psyexpContent,
        psyexpPath,
        resources,
    }, options);
}

export async function compilePsychoJS({ psyexpContent, psyexpPath, outfile, resources }={}, options={}) {
    return await sendOfficialBackendCommand("compilePsychoJS", {
        psyexpContent,
        psyexpPath,
        outfile,
        resources,
    }, options);
}
