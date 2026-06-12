<script>
    import { Dialog } from "$lib/utils/dialog";
    import { Button } from "$lib/utils/buttons";
    import { translate } from "$lib/translation";
    import { clearWebFS, deleteWebFS, downloadWebFSFile, listWebFS, normalizeWebPath, readWebFS, webfsPath, writeWebFS } from "./storage.js";
    import { downloadWebFSZipFiles } from "./export.js";

    let {
        shown = $bindable(),
        prefix = "",
    } = $props();

    let files = $state([]);
    let selected = $state([]);
    let status = $state("");
    let uploadInput = $state();
    let uploadFolderInput = $state();

    async function refresh() {
        files = await listWebFS(prefix);
        selected = selected.filter(file => files.includes(file));
        status = files.length ? "" : translate("No files in browser storage yet.");
    }

    function toggle(file) {
        if (selected.includes(file)) {
            selected = selected.filter(f => f !== file);
        } else {
            selected = [...selected, file];
        }
    }

    function selectAll() {
        selected = selected.length === files.length ? [] : [...files];
    }

    async function upload(evt) {
        for (let file of evt.target.files || []) {
            // folder uploads carry their relative path (e.g. "myexp/stim/a.png")
            let rel = file.webkitRelativePath || file.name;
            await writeWebFS(normalizeWebPath(`${prefix ? prefix + "/" : ""}${rel}`), file);
        }
        evt.target.value = "";
        await refresh();
    }

    async function removeSelected() {
        for (let file of selected) {
            await deleteWebFS(file);
        }
        selected = [];
        await refresh();
    }

    async function clearAll() {
        if (!window.confirm(translate("Delete ALL files from browser storage? This cannot be undone."))) {
            return;
        }
        await clearWebFS(prefix);
        selected = [];
        await refresh();
    }

    async function downloadSelected() {
        if (selected.length !== 1) return;
        const file = selected[0];
        const content = await readWebFS(file);
        let type = "application/octet-stream";
        if (content instanceof Blob && content.type) type = content.type;
        await downloadWebFSFile(file, normalizeWebPath(file).split("/").pop(), type);
    }

    async function downloadZip() {
        status = "";
        try {
            // bundle the selection, or everything when nothing is selected
            await downloadWebFSZipFiles(selected.length ? selected : files);
        } catch (err) {
            status = err?.message || String(err);
        }
    }

    $effect(() => {
        if (shown) refresh();
    });
</script>

<Dialog
    title={translate("Browser files")}
    bind:shown
    buttons={{ OK: () => {} }}
    shrink
>
    <div class="webfs-manager">
        <p class="hint">
            {translate("Files here live in this browser's storage (IndexedDB) and are served from /webfs. Use Upload/Download to exchange files with your computer.")}
        </p>
        <div class="toolbar">
            <Button label={translate("Refresh")} onclick={refresh} horizontal />
            <Button label={translate("Open")} onclick={() => selected.length === 1 && window.open(webfsPath(selected[0]), "_blank")} disabled={selected.length !== 1} horizontal />
            <Button label={translate("Upload")} onclick={() => uploadInput.click()} horizontal />
            <Button label={translate("Upload folder")} onclick={() => uploadFolderInput.click()} horizontal />
            <Button label={translate("Download")} onclick={downloadSelected} disabled={selected.length !== 1} horizontal />
            <Button
                label={selected.length ? `${translate("Download ZIP")} (${selected.length})` : translate("Download ZIP (all)")}
                onclick={downloadZip}
                disabled={!files.length}
                horizontal
            />
            <Button label={translate("Delete")} onclick={removeSelected} disabled={!selected.length} horizontal negative />
            <Button label={translate("Clear all")} onclick={clearAll} disabled={!files.length} horizontal negative />
            <input
                type="file"
                multiple
                bind:this={uploadInput}
                onchange={upload}
                style="display: none;"
            />
            <input
                type="file"
                webkitdirectory
                multiple
                bind:this={uploadFolderInput}
                onchange={upload}
                style="display: none;"
            />
        </div>
        <label class="select-all">
            <input
                type="checkbox"
                checked={files.length > 0 && selected.length === files.length}
                indeterminate={selected.length > 0 && selected.length < files.length}
                onchange={selectAll}
            />
            {translate("Select all")} ({selected.length}/{files.length})
        </label>
        {#if status}
            <p class="status">{status}</p>
        {/if}
        <ol class="files" aria-label={translate("WebFS files")}>
            {#each files as file}
                <li>
                    <label class:selected={selected.includes(file)}>
                        <input
                            type="checkbox"
                            checked={selected.includes(file)}
                            onchange={() => toggle(file)}
                        />
                        <span class="name">
                            <span>{file}</span>
                            <small>{webfsPath(file)}</small>
                        </span>
                    </label>
                </li>
            {/each}
        </ol>
    </div>
</Dialog>

<style>
    .webfs-manager {
        width: min(48rem, 80vw);
        padding: 1rem;
        display: grid;
        gap: 1rem;
    }
    .hint, .status {
        margin: 0;
        color: var(--subtext, var(--text));
    }
    .status {
        color: var(--red);
    }
    .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: .5rem;
    }
    .select-all {
        display: flex;
        align-items: center;
        gap: .5rem;
        color: var(--text);
    }
    .files {
        display: grid;
        gap: .25rem;
        max-height: 50vh;
        overflow: auto;
        padding: 0;
        margin: 0;
        list-style: none;
    }
    .files label {
        width: 100%;
        display: flex;
        align-items: center;
        gap: .6rem;
        text-align: left;
        padding: .5rem .75rem;
        border: 1px solid var(--overlay);
        background: var(--base);
        color: var(--text);
        border-radius: .25rem;
        cursor: pointer;
    }
    .files label.selected,
    .files label:hover,
    .files label:focus-within {
        border-color: var(--blue);
    }
    .files .name {
        display: grid;
        gap: .2rem;
    }
    .files small {
        color: var(--outline);
    }
</style>
