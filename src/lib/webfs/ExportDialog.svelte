<script>
    import { Dialog } from "$lib/utils/dialog";
    import { Button } from "$lib/utils/buttons";
    import { translate } from "$lib/translation";
    import { downloadExportZip, exportOfficialExperimentToWebFS } from "./export.js";

    let {
        shown = $bindable(),
        experiment,
    } = $props();

    let awaiting = $state(Promise.resolve());
    let result = $state(undefined);
    let error = $state(undefined);

    async function runExport() {
        error = undefined;
        result = undefined;
        result = await exportOfficialExperimentToWebFS(experiment);
        return result;
    }

    function startExport() {
        awaiting = runExport().catch((err) => {
            error = err;
            throw err;
        });
    }

    $effect(() => {
        if (shown) startExport();
    });
</script>

<Dialog
    title={translate("Export browser files")}
    bind:shown
    buttons={{ OK: () => {} }}
    shrink
>
    <div class="export-dialog">
        {#await awaiting}
            <p>{translate("Exporting with the official PsychoPy compiler...")}</p>
        {:then}
            {#if result}
                <p>
                    {translate("Official compiler outputs were written to isolated browser storage.")}
                </p>
                {#if result.missingResources?.length}
                    <p class="error">
                        {translate("Missing files this experiment needs (upload them next to the experiment, then export again):")}
                        {result.missingResources.join(", ")}
                    </p>
                {/if}
                <dl>
                    <dt>{translate("Entry point")}</dt>
                    <dd><a href={result.entryUrl} target="_blank">{result.entryUrl}</a></dd>
                    <dt>{translate("ZIP")}</dt>
                    <dd><a href={result.zip.url} target="_blank">{result.zip.url}</a></dd>
                </dl>
                <p class="hint">
                    {translate("ZIP contains")}:
                    {result.files.length} {translate("files")}
                    ({translate("experiment, scripts, PsychoJS library")}{result.resources?.length ? `, ${result.resources.length} ${translate("resource files")}: ${result.resources.join(", ")}` : ""})
                </p>
                <div class="actions">
                    <Button label={translate("Open entry point")} onclick={() => window.open(result.previewUrl || result.entryUrl, "_blank")} horizontal />
                    <Button label={translate("Download ZIP")} onclick={() => downloadExportZip(result)} horizontal primary />
                    <Button label={translate("Export again")} onclick={startExport} horizontal />
                </div>
            {/if}
        {:catch err}
            <p class="error">{error?.message || err?.message || translate("Export failed.")}</p>
            <p class="hint">
                {translate("Start the official PsychoPy web backend, then try again. The export layer stores only compiler outputs; it does not generate PsychoJS by hand.")}
            </p>
            <Button label={translate("Try again")} onclick={startExport} horizontal />
        {/await}
    </div>
</Dialog>

<style>
    .export-dialog {
        width: min(38rem, 75vw);
        padding: 1rem;
        display: grid;
        gap: 1rem;
    }
    p, dl, ol {
        margin: 0;
    }
    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: .35rem 1rem;
    }
    dd {
        margin: 0;
        overflow-wrap: anywhere;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: .5rem;
    }
    .error {
        color: var(--red);
    }
    .hint {
        color: var(--outline);
    }
</style>
