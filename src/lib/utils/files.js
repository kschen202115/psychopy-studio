import path from "path-browserify";
import { electron } from "$lib/globals.svelte"
import { isWebPath, readWebFS, writeWebFS } from "$lib/webfs/storage.js"
import { pickWebFSFile } from "$lib/webfs/picker.svelte.js"
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
        // in browser mode, files live in WebFS (browser storage); the picker
        // also lets the user upload files from their computer, dropping them
        // into the calling context's folder (e.g. the experiment's folder)
        let file = await pickWebFSFile({
            mode: "open",
            extensions: filterExtensions(filters),
            uploadPrefix: defaultPath || "uploads",
        })
        // abort if no file
        if (file === undefined) {
            return
        }
        // parse
        output = parsePath(file)
    }

    return output
}


/**
 * Flatten a filters list in the JS style to a list of extensions, e.g. [".psyexp"]
 */
function filterExtensions(filters) {
    return filters.map(item => Object.values(item.accept || {}).flat()).flat()
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
        // in browser mode, files live in WebFS (browser storage)
        let file = await pickWebFSFile({
            mode: "save",
            extensions: filterExtensions(filters),
            defaultName: defaultFile,
        })
        // abort if no file
        if (file === undefined) {
            return
        }
        // parse path
        output = parsePath(file)
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
        return await readWebFS(file.file)
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
        await writeWebFS(file.file, content)
    } else if (electron) {
        await electron.files.save(
            file.file, 
            content
        )
    } else {
        // get file writable from handle
        let writable = await file.handle.createWritable();
        // write to file
        await writable.seek(0);
        await writable.write(content);
        await writable.close();
    }
}