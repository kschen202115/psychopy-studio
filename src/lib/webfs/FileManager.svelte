<script>
    import { Dialog } from "$lib/utils/dialog";
    import { Button } from "$lib/utils/buttons";
    import { translate } from "$lib/translation";
    import { deleteWebFS, downloadWebFSFile, listWebFS, normalizeWebPath, readWebFS, webfsPath } from "./storage.js";

    let {
        shown = $bindable(),
        prefix = "exports",
    } = $props();

    let files = $state([]);
    let selected = $state(undefined);
    let status = $state("");

    async function refresh() {
        status = translate("Loading WebFS files...");
        files = await listWebFS(prefix);
        selected = files.includes(selected) ? selected : files[0];
        status = files.length ? "" : translate("No WebFS files found.");
    }

    async function removeSelected() {
        if (!selected) return;
        await deleteWebFS(selected);
        await refresh();
    }

    async function downloadSelected() {
        if (!selected) return;
        const content = await readWebFS(selected);
        let type = "application/octet-stream";
        if (content instanceof Blob && content.type) type = content.type;
        await downloadWebFSFile(selected, normalizeWebPath(selected).split("/").pop(), type);
    }

    $effect(() => {
        if (shown) refresh();
    });
</script>

<Dialog
    title={translate("Browser export files")}
    bind:shown
    buttons={{ OK: () => {} }}
    shrink
>
    <div class="webfs-manager">
        <p class="hint">
            {translate("Files here are isolated browser export artifacts served from /webfs. They do not change Builder parameters or PsychoPy semantics.")}
        </p>
        <div class="toolbar">
            <Button label={translate("Refresh")} onclick={refresh} horizontal />
            <Button label={translate("Open")} onclick={() => selected && window.open(webfsPath(selected), "_blank")} disabled={!selected} horizontal />
            <Button label={translate("Download")} onclick={downloadSelected} disabled={!selected} horizontal />
            <Button label={translate("Delete")} onclick={removeSelected} disabled={!selected} horizontal negative />
        </div>
        {#if status}
            <p class="status">{status}</p>
        {/if}
        <ol class="files" aria-label={translate("WebFS files")}> 
            {#each files as file}
                <li>
                    <button
                        class:selected={selected === file}
                        onclick={() => selected = file}
                    >
                        <span>{file}</span>
                        <small>{webfsPath(file)}</small>
                    </button>
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
    .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: .5rem;
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
    .files button {
        width: 100%;
        display: grid;
        gap: .2rem;
        text-align: left;
        padding: .5rem .75rem;
        border: 1px solid var(--overlay);
        background: var(--base);
        color: var(--text);
        border-radius: .25rem;
    }
    .files button.selected,
    .files button:enabled:hover,
    .files button:enabled:focus {
        border-color: var(--blue);
    }
    .files small {
        color: var(--outline);
    }
</style>
