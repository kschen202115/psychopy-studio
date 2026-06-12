/**
 * Promise-based WebFS file picker, used as the browser-mode replacement for
 * Electron's open/save dialogs. The dialog itself is mounted once in the root
 * layout (see PickerDialog.svelte); this module holds its state and API.
 */

export const picker = $state({
    shown: false,
    // "open" or "save"
    mode: "open",
    title: "",
    // extensions to highlight/filter, e.g. [".psyexp"]
    extensions: [],
    // suggested file name when saving
    defaultName: "",
    // folder uploaded files are written to (e.g. the current experiment's folder)
    uploadPrefix: "uploads",
    // populated by pickWebFSFile, resolved by the dialog
    resolver: undefined,
})

/**
 * Show the WebFS picker dialog and resolve with the chosen path
 * (e.g. "/webfs/projects/my-exp.psyexp"), or undefined if cancelled.
 *
 * @param {object} options
 * @param {string} options.mode "open" to pick an existing file, "save" to name a new one
 * @param {array<string>} options.extensions File extensions to filter by, e.g. [".psyexp"]
 * @param {string} options.defaultName Suggested name when saving
 * @param {string} options.title Dialog title override
 * @returns {Promise<string|undefined>}
 */
export function pickWebFSFile({
    mode = "open",
    extensions = [],
    defaultName = "untitled.psyexp",
    uploadPrefix = "uploads",
    title = undefined,
} = {}) {
    // resolve any picker which was already open
    picker.resolver?.resolve(undefined)
    // setup state
    picker.mode = mode
    picker.extensions = extensions
    picker.defaultName = defaultName
    picker.uploadPrefix = uploadPrefix
    picker.title = title
    picker.resolver = Promise.withResolvers()
    picker.shown = true

    return picker.resolver.promise
}
