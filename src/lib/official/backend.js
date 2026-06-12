export const DEFAULT_OFFICIAL_BACKEND_URL = "ws://localhost:8002";

function browserDefaultUrl() {
    if (typeof window === "undefined") return DEFAULT_OFFICIAL_BACKEND_URL;
    const protocol = window.location?.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location?.hostname || "localhost";
    return `${protocol}//${hostname}:8002`;
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
    return typeof WebSocket !== "undefined";
}

export function sendOfficialBackendCommand(command, kwargs={}, options={}) {
    const {
        url = browserConfiguredUrl(),
        timeout = 120000,
    } = options;

    if (!isOfficialBackendClientAvailable()) {
        return Promise.reject(new Error("Official PsychoPy web backend client requires WebSocket support."));
    }

    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const id = commandId();
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
                const error = data?.error || {};
                const err = new Error(error.message || `Official PsychoPy web backend failed while running ${command}.`);
                err.backendError = error;
                reject(err);
            }
        };
        socket.onclose = () => clearTimeout(timer);
    });
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
