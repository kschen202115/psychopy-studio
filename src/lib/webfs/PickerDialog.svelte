<script>
    import { Dialog } from "$lib/utils/dialog";
    import { Button } from "$lib/utils/buttons";
    import { translate } from "$lib/translation";
    import { picker } from "./picker.svelte.js";
    import {
        deleteWebFS, downloadWebFSFile, listWebFS, normalizeWebPath, webfsPath, writeWebFS
    } from "./storage.js";

    let files = $state([]);
    let selected = $state(undefined);
    let saveName = $state("");
    let showAll = $state(false);
    let status = $state("");
    let uploadInput = $state();
    let uploadFolderInput = $state();

    let matching = $derived(
        showAll || !picker.extensions.length
            ? files
            : files.filter(file => picker.extensions.some(ext => file.toLowerCase().endsWith(ext.toLowerCase())))
    );

    async function refresh() {
        files = await listWebFS("");
        if (!matching.includes(selected)) selected = undefined;
        status = "";
    }

    function choose(file) {
        selected = file;
        if (picker.mode === "save") {
            saveName = file;
        }
    }

    function confirm() {
        let key;
        if (picker.mode === "save") {
            key = normalizeWebPath(saveName);
            if (!key) {
                status = translate("Enter a file name to save to browser storage.");
                return;
            }
            // keep the suggested extension if none was given
            let defaultExt = (picker.defaultName?.match(/\.[^./]+$/) || picker.extensions)[0];
            if (!/\.[^./]+$/.test(key) && defaultExt) {
                key += defaultExt;
            }
        } else {
            key = selected;
            if (!key) {
                status = translate("Select a file to open.");
                return;
            }
        }
        picker.resolver?.resolve(webfsPath(key));
        picker.resolver = undefined;
        picker.shown = false;
    }

    function cancel() {
        picker.resolver?.resolve(undefined);
        picker.resolver = undefined;
    }

    async function upload(evt) {
        // upload next to the current experiment (or wherever the caller asked)
        let prefix = normalizeWebPath(picker.uploadPrefix || "uploads");
        for (let file of evt.target.files || []) {
            // folder uploads carry their relative path (e.g. "myexp/stim/a.png")
            let rel = file.webkitRelativePath || file.name;
            let key = normalizeWebPath(`${prefix}/${rel}`);
            await writeWebFS(key, file);
            selected = key;
            if (picker.mode === "save") saveName = key;
        }
        evt.target.value = "";
        await refresh();
    }

    async function removeSelected() {
        if (!selected) return;
        await deleteWebFS(selected);
        selected = undefined;
        await refresh();
    }

    async function downloadSelected() {
        if (!selected) return;
        await downloadWebFSFile(selected);
    }

    function onopen() {
        // suggest a name from the file being saved
        saveName = normalizeWebPath(picker.defaultName || "");
        selected = undefined;
        showAll = false;
        refresh();
    }
</script>

<Dialog
    title={picker.title || (picker.mode === "save" ? translate("Save to browser storage") : translate("Open from browser storage"))}
    bind:shown={picker.shown}
    buttons={{
        OK: confirm,
        CANCEL: () => {},
    }}
    onopen={onopen}
    onclose={cancel}
    shrink
>
    <div class="webfs-picker">
        <p class="hint">
            {translate("Files live in this browser's storage (IndexedDB), not on a server. Use Upload/Download to exchange files with your computer.")}
        </p>
        <div class="toolbar">
            <Button label={translate("Refresh")} onclick={refresh} horizontal />
            <Button label={translate("Upload")} onclick={() => uploadInput.click()} horizontal />
            <Button label={translate("Upload folder")} onclick={() => uploadFolderInput.click()} horizontal />
            <Button label={translate("Download")} onclick={downloadSelected} disabled={!selected} horizontal />
            <Button label={translate("Delete")} onclick={removeSelected} disabled={!selected} horizontal negative />
            {#if picker.extensions.length}
                <label class="show-all">
                    <input type="checkbox" bind:checked={showAll} />
                    {translate("Show all files")}
                </label>
            {/if}
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
        <ol class="files" aria-label={translate("Browser storage files")}>
            {#each matching as file}
                <li>
                    <button
                        class:selected={selected === file}
                        onclick={() => choose(file)}
                        ondblclick={confirm}
                    >
                        <span>{file}</span>
                    </button>
                </li>
            {:else}
                <li class="empty">{translate("No files in browser storage yet.")}</li>
            {/each}
        </ol>
        {#if picker.mode === "save"}
            <label class="save-name">
                {translate("File name")}
                <input type="text" bind:value={saveName} onkeydown={evt => evt.key === "Enter" && confirm()} />
            </label>
        {/if}
        {#if status}
            <p class="status">{status}</p>
        {/if}
    </div>
</Dialog>

<style>
    .webfs-picker {
        width: min(42rem, 80vw);
        padding: 1rem;
        display: grid;
        gap: .75rem;
    }
    .hint, .status {
        margin: 0;
        color: var(--outline);
    }
    .status {
        color: var(--red);
    }
    .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .5rem;
    }
    .show-all {
        display: flex;
        align-items: center;
        gap: .25rem;
        margin-left: auto;
    }
    .files {
        display: grid;
        gap: .25rem;
        min-height: 8rem;
        max-height: 40vh;
        overflow: auto;
        padding: 0;
        margin: 0;
        list-style: none;
        border: 1px solid var(--overlay);
        border-radius: .25rem;
        padding: .25rem;
    }
    .files button {
        width: 100%;
        text-align: left;
        padding: .4rem .6rem;
        border: 1px solid transparent;
        background: var(--base);
        color: var(--text);
        border-radius: .25rem;
    }
    .files button.selected,
    .files button:enabled:hover,
    .files button:enabled:focus {
        border-color: var(--blue);
    }
    .empty {
        padding: .5rem;
        color: var(--outline);
    }
    .save-name {
        display: grid;
        gap: .25rem;
    }
    .save-name input {
        padding: .4rem .6rem;
        border: 1px solid var(--overlay);
        border-radius: .25rem;
        background: var(--base);
        color: var(--text);
    }
</style>
