import path from "path-browserify";
import { electron } from "$lib/globals.svelte"
import { Mime } from 'mime/lite';
import standardTypes from 'mime/types/standard.js';
import otherTypes from 'mime/types/other.js';

/** Export a custom mime instance with some custom mappings */
export const mime = new Mime(standardTypes, otherTypes)
mime.define({
    "application/xml": ["psyexp"],
    "text/json": ["psyrun"],
    "application/psydat": ["psydat"],
    "text/python": ["py"],
    "text/config": ["cfg"],
})

export const WEBFS_ROOT = "/webfs"
const WEBFS_DB = "PsychoPyWebFS"
const WEBFS_STORE = "files"

export function normalizeWebPath(file="") {
    file = String(file || "").replaceAll("\\", "/").trim()
    if (file.startsWith(WEBFS_ROOT + "/")) file = file.slice(WEBFS_ROOT.length + 1)
    if (file.startsWith("/")) file = file.slice(1)
    return file.split("/").filter(part => part && part !== "." && part !== "..").join("/")
}

export function browserPath(file="") {
    const key = normalizeWebPath(file)
    return WEBFS_ROOT + (key ? `/${key}` : "")
}

function isWebPath(file) {
    const value = typeof file === "string" ? file : file?.file
    return String(value || "").startsWith(WEBFS_ROOT + "/")
}

async function openWebFS() {
    return await new Promise((resolve, reject) => {
        const request = indexedDB.open(WEBFS_DB, 1)
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(WEBFS_STORE)) {
                request.result.createObjectStore(WEBFS_STORE)
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export async function dbWrite(file, content) {
    const key = normalizeWebPath(file)
    const db = await openWebFS()
    const tx = db.transaction(WEBFS_STORE, "readwrite")
    tx.objectStore(WEBFS_STORE).put(content, key)
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
    })
    return key
}

export async function dbRead(file) {
    const key = normalizeWebPath(file)
    const db = await openWebFS()
    const tx = db.transaction(WEBFS_STORE, "readonly")
    const request = tx.objectStore(WEBFS_STORE).get(key)
    return await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export async function dbDelete(file) {
    const key = normalizeWebPath(file)
    const db = await openWebFS()
    const tx = db.transaction(WEBFS_STORE, "readwrite")
    tx.objectStore(WEBFS_STORE).delete(key)
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
    })
}

export async function dbList(prefix="") {
    prefix = normalizeWebPath(prefix)
    const db = await openWebFS()
    const tx = db.transaction(WEBFS_STORE, "readonly")
    const request = tx.objectStore(WEBFS_STORE).getAllKeys()
    const keys = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    return keys.filter(key => !prefix || key.startsWith(prefix))
}


/**
 * path-browserify is fine, but it's no pathlib.Path
 */
export function parsePath(file) {
    // replace \ (path hates this for some reason)
    file = file.replaceAll("\\", "/")
    // parse
    let parsed = path.parse(file)
    // transform to a more sensible format
    return {
        file: file,
        parent: parsed.dir,
        name: parsed.base,
        stem: parsed.name,
        ext: parsed.ext
    }
}


/**
 * Convert a filters list in the JS style (as in e.g. `window.showOpenFilePicker`) to the Electron 
 * style (as in e.g. `electron.files.openDialog`)
 */
export function electronFilters(filters) {
    let parsed = []
    // iterate through filters
    for (let item of filters) {
        // transform and append
        parsed.push({
            name: item.description, 
            extensions: Object.values(item.accept).flat().map(ext => ext.slice(1))
        })
    }
    // add flag for all files
    parsed.push(
        { name: "All Files", extensions: ["*"]}
    )

    return parsed
}


export async function browseFileOpen(
    filters=[],
    defaultPath=""
) {
    let output
    if (electron) {
        // sanitize filepath if on Windows (surprised that electron doesn't do this for us...)
        if (await electron.platform() === "win32") {
            defaultPath = defaultPath.replaceAll("/", "\\")
        }
        // get file path from electron dialog
        let file = await electron.files.openDialog({
            properties: ["openFile", "createDirectory"],
            defaultPath: defaultPath,
            filters: electronFilters(filters)
        })
        // abort if no file
        if (file === undefined) {
            return
        }
        // parse
        output = parsePath(file[0])
    } else {
        // get file handle from system dialog
        let handle = await window.showOpenFilePicker({
            types: filters
        }).catch(err => undefined);
        // abort if no file
        if (handle === undefined) {
            return
        }
        // get file blob from handle
        let file = await handle[0].getFile();
        // parse file
        output = parsePath(file.name)
        // add handle
        output.handle = file;
    }

    return output
}


export async function browseFileSave(
    filters=[],
    defaultFile="untitled.psyexp"
) {
    let output;
    if (electron) {
        // get file path from electron dialog
        let file = await electron.files.saveDialog({
            properties: ["createDirectory"],
            defaultPath: defaultFile,
            filters: electronFilters(filters)
        })
        // abort if no file
        if (file === undefined) {
            return
        }
        // parse path
        output = parsePath(file)
    } else {
        // open a file picker
        let handle = await window.showSaveFilePicker({
            types: filters,
            defaultPath: parsePath(defaultFile).parent,
            suggestedName: parsePath(defaultFile).name
        });
        // abort if no file
        if (handle === undefined) {
            return
        }
        // get file blob from handle
        let file = await handle[0].getFile()[0];
        // parse path
        output = parsePath(file);
        // append handle
        output.handle = handle[0];
    }

    return output
}


export async function readFile(file) {
    // parse to object if needed
    if (typeof file === "string") {
        file = parsePath(file)
    }
    // load content from file
    if (isWebPath(file)) {
        return await dbRead(file.file)
    } else if (electron) {
         return await electron.files.load(file.file)
    } else {
        return await file.handle.text()
    }
}


export async function writeFile(file, content) {
    // parse to object if needed
    if (typeof file === "string") {
        file = parsePath(file)
    }
    // write content to file
    if (isWebPath(file)) {
        await dbWrite(file.file, content)
    } else if (electron) {
        electron.files.save(
            file.file, 
            content
        )
    } else {
        // get file writable from handle
        let writable = await file.handle.createWritable();
        // write to file
        writable.seek(0);
        writable.write(content);
        writable.close();
    }
}