<script>
    import TableCtrl from "./TableCtrl.svelte";
    import { python } from "$lib/globals.svelte";
    import { current } from "../../../routes/builder/globals.svelte";
    import { readWebFS } from "$lib/webfs/storage.js";
    import { importConditions, isOfficialBackendClientAvailable } from "$lib/official/backend.js";
    import Info from "$lib/utils/tooltip/Info.svelte";
    import Tooltip from "$lib/utils/tooltip/Tooltip.svelte";
    import { slide } from "svelte/transition";

    let {
        /** @prop @type {import("$lib/experiment").Param} Param object to which this ctrl pertains */
        param=$bindable(),
        /** @prop @type {boolean} Controls whether this control is disabled */
        disabled=false,
        /** @interface */
        ...attachments
    } = $props()

    function validateConditions(param, valid) {
        return
    }

    /**
     * Read a conditions file and return [conditions, fieldNames] via official
     * PsychoPy, so csv/xlsx parse identically on desktop and in the browser.
     *
     * Desktop (Electron) uses the PsychoPy liaison. The pure-browser build has no
     * liaison and the file lives in WebFS (not on the backend FS), so we read the
     * bytes from WebFS and hand them to the in-browser Pyodide backend, which runs
     * the same psychopy.data.importConditions.
     */
    async function loadConditionsInfo(val) {
        const fileName = current.experiment.relativePath(val);
        // desktop / electron path — unchanged
        if (python?.liaison) {
            return await python.liaison.send("app", {
                command: "run",
                args: ["psychopy.data.utils:importConditions"],
                kwargs: { fileName, returnFieldNames: true }
            });
        }
        // browser path — send the file content to the Pyodide backend
        if (!isOfficialBackendClientAvailable()) return null;
        let content;
        try {
            content = await readWebFS(fileName);
        } catch {
            return null;
        }
        if (content == null) return null;
        try {
            return await importConditions({
                fileName,
                resources: [toResource(fileName, content)],
            });
        } catch {
            return null;
        }
    }

    /** Wrap WebFS content as a backend resource: text inline, binary as base64. */
    function toResource(path, content) {
        if (typeof content === "string") return { path, content };
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { path, base64: btoa(binary) };
    }

</script>

<div class=wrapper>
    <TableCtrl
        param={param}
        disabled={disabled}
        {@attach element => param.registerValidator("conditions", validateConditions, 5)}
        {...attachments}
    />
    <div class=output>
        {#if param.val}
            {#await loadConditionsInfo(param.val)}
                Loading...
            {:then conditions}
                {#if conditions}
                    {conditions[0].length} conditions, with {conditions[1].length} parameters 
                    <Info>
                        <div 
                            class=more-info
                            transition:slide={{axis: "x", delay: 0.5}}
                        >
                            {conditions[1].join(", ")}
                        </div>
                    </Info>
                {/if}
            {:catch err}
                {""}
            {/await}
        {/if}
    </div>
</div>

<style>
    .wrapper {
        flex-grow: 1;
        display: grid;
        grid-template-columns: 1fr min-content min-content;
        grid-template-rows: min-content min-content;
        gap: .5rem;
    }

    .output {
        position: relative;
        display: flex;
        flex-direction: row;
        gap: .5rem;
        align-items: center;
        padding: 0 .5rem;
    }

    .more-info {
        position: absolute;
        left: 1rem;
        padding: .25rem .5rem;
        border-radius: .5rem;
        background-color: var(--outline);
        color: var(--text-on-outline);
        overflow: hidden;
        text-wrap: nowrap;
        max-width: 35rem;
    }
</style>