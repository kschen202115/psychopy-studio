<script>
    import SingleLineCtrl from "./SingleLineCtrl.svelte";
    import { Button, CompactButton } from "$lib/utils/buttons";
    import { mimeTypesFromParam } from "./utils";
    import { browseFileOpen } from "$lib/utils/files.js";
    import { isWebPath, normalizeWebPath } from "$lib/webfs/storage.js";
    import { getContext } from "svelte";

    let {
        /** @prop @type {import("$lib/experiment").Param} Param object to which this ctrl pertains */
        param=$bindable(),
        /** @prop @type {boolean} Controls whether this control is disabled */
        disabled=false,
        /** @bindable State tracking whether this param's value is valid */
        valid=$bindable(),
        /** @interface */
        ...attachments
    } = $props()

    let current = getContext("current");

    function validateFile(param, valid) {
        // check file extension
        if (this.allowedVals) {
            if (!param.allowedVals.some(
                val => String(this.val).endsWith(val)
            )) {
                valid.value = false
                valid.warning = `Did not match allowed filetypes: ${this.allowedVals}`
            }
        }
        // todo: Check if file exists
    }

    async function getFile(evt) {
        // do we have mime types from the param?
        let types = mimeTypesFromParam(param)
        // get file
        let file = await browseFileOpen(types, current.experiment?.file?.parent);
        // if one was selected, store a path relative to the experiment
        if (file) {
            param.val = relativeToExperiment(file.file)
        }
    }

    /**
     * Store a file path the way the compiler expects it: relative to the
     * experiment folder, never a `/webfs/…` absolute path. For browser (WebFS)
     * paths this strips the `/webfs/` scheme and the experiment-folder prefix
     * (so an untitled experiment gets `cond.csv`, not `/webfs/cond.csv`). Desktop
     * OS paths keep the original folder-relative behaviour.
     */
    function relativeToExperiment(full) {
        const parent = current.experiment?.file?.parent
        if (isWebPath(full)) {
            const key = normalizeWebPath(full)               // drops the /webfs/ scheme
            const parentKey = normalizeWebPath(parent || "")
            if (parentKey && key.startsWith(parentKey + "/")) {
                return key.slice(parentKey.length + 1)       // relative to the experiment folder
            }
            return key                                       // untitled / outside folder → bare key
        }
        // desktop / OS path
        if (parent) {
            return full.replace(parent, "").replace(/^[\\/]/, "")
        }
        return full
    }
</script>

<SingleLineCtrl 
    bind:param={param} 
    bind:valid={valid}
    disabled={disabled}
    {@attach element => param.registerValidator("file", validateFile, 5)}
    {...attachments}
/>
<CompactButton 
    icon="/icons/btn-open.svg"
    tooltip="Browse for file..."
    onclick={getFile}
    disabled={disabled}
/>
