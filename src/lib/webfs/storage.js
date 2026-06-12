export const WEBFS_ROOT = "/webfs";
export const WEBFS_DB = "PsychoPyWebFS";
export const WEBFS_STORE = "files";

function requireIndexedDB() {
    if (typeof indexedDB === "undefined") {
        throw new Error("PsychoPy WebFS requires IndexedDB, but IndexedDB is not available in this context.");
    }
    return indexedDB;
}

export function normalizeWebPath(file="") {
    file = String(file || "").replaceAll("\\", "/").trim();
    try {
        if (/^https?:\/\//i.test(file) && typeof URL !== "undefined") {
            file = new URL(file).pathname;
        }
    } catch {}
    if (file.startsWith(WEBFS_ROOT + "/")) file = file.slice(WEBFS_ROOT.length + 1);
    if (file.startsWith("/")) file = file.slice(1);
    return file.split("/").filter(part => part && part !== "." && part !== "..").join("/");
}

export function webfsPath(file="") {
    const key = normalizeWebPath(file);
    return WEBFS_ROOT + (key ? `/${key}` : "");
}

export function isWebPath(file) {
    const value = typeof file === "string" ? file : file?.file;
    return String(value || "").startsWith(WEBFS_ROOT + "/");
}

async function openWebFS() {
    const idb = requireIndexedDB();
    return await new Promise((resolve, reject) => {
        const request = idb.open(WEBFS_DB, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(WEBFS_STORE)) {
                request.result.createObjectStore(WEBFS_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function waitForTransaction(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("WebFS transaction was aborted."));
    });
}

export async function writeWebFS(file, content) {
    const key = normalizeWebPath(file);
    if (!key) throw new Error("Cannot write WebFS content without a file path.");
    const db = await openWebFS();
    try {
        const tx = db.transaction(WEBFS_STORE, "readwrite");
        tx.objectStore(WEBFS_STORE).put(content, key);
        await waitForTransaction(tx);
        return key;
    } finally {
        db.close?.();
    }
}

export async function readWebFS(file) {
    const key = normalizeWebPath(file);
    if (!key) throw new Error("Cannot read WebFS content without a file path.");
    const db = await openWebFS();
    try {
        const tx = db.transaction(WEBFS_STORE, "readonly");
        const request = tx.objectStore(WEBFS_STORE).get(key);
        return await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close?.();
    }
}

export async function deleteWebFS(file) {
    const key = normalizeWebPath(file);
    if (!key) throw new Error("Cannot delete WebFS content without a file path.");
    const db = await openWebFS();
    try {
        const tx = db.transaction(WEBFS_STORE, "readwrite");
        tx.objectStore(WEBFS_STORE).delete(key);
        await waitForTransaction(tx);
        return key;
    } finally {
        db.close?.();
    }
}

export async function listWebFS(prefix="") {
    const normalizedPrefix = normalizeWebPath(prefix);
    const db = await openWebFS();
    try {
        const tx = db.transaction(WEBFS_STORE, "readonly");
        const request = tx.objectStore(WEBFS_STORE).getAllKeys();
        const keys = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return keys
            .map(key => String(key))
            .filter(key => !normalizedPrefix || key === normalizedPrefix || key.startsWith(normalizedPrefix + "/"))
            .sort();
    } finally {
        db.close?.();
    }
}

export async function clearWebFS(prefix="") {
    const keys = await listWebFS(prefix);
    await Promise.all(keys.map(key => deleteWebFS(key)));
    return keys;
}

export function webfsContentBlob(content, type="application/octet-stream") {
    if (content instanceof Blob) return content;
    return new Blob([content], { type });
}

export async function downloadWebFSFile(file, downloadName=undefined, type="application/octet-stream") {
    const content = await readWebFS(file);
    if (content === undefined) {
        throw new Error(`WebFS file not found: ${normalizeWebPath(file)}`);
    }
    const blob = webfsContentBlob(content, type);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName || normalizeWebPath(file).split("/").pop() || "download";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Back-compat aliases for older imports while keeping the IndexedDB
// implementation isolated in this module.
export const browserPath = webfsPath;
export const dbWrite = writeWebFS;
export const dbRead = readWebFS;
export const dbDelete = deleteWebFS;
export const dbList = listWebFS;
