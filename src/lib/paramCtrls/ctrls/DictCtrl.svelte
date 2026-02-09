<script>
    import { Param } from "$lib/experiment";
    import { CompactButton } from "$lib/utils/buttons";
    import { iterateName } from "./utils.js";
    import { sanitizeJSON } from "$lib/utils/transpiler"
    import SingleLineCtrl from "./SingleLineCtrl.svelte";

    let {
        param=$bindable(),
        /** @prop @type {boolean} Controls whether this control is disabled */
        disabled=false,
        /** @interface */
        ...attachments
    } = $props()

    function validateDict(param, valid) {
        // combine valid on all child items
        valid.value = entries.every(
            ([key, item]) => item.valid.value
        )
        // combine warnings from child items
        valid.warning = entries.map(
            ([key, item]) => item.valid.warning
        ).join("\n")
    }
    
    // make sure param val is always an object rather than a string
    $effect(() => {
        if (typeof param.val === "string") {
            // sanitize value
            let value = sanitizeJSON(param.val)
            // parse JSON
            try {
                param.val = JSON.parse(value)
            } catch {
                console.warn(`Failed to parse '${value}' as JSON`)
                param.val = {}
            }
        }
    })

    let entries = $derived.by(() => {
        let entries = []
        // make a param for each entry
        for (let [key, val] of Object.entries(param.val)) {
            entries[key] = new Param(`${key}:value`);
            entries[key].val = val;
            entries[key].valType = "code"
        }
        
        return Object.entries(entries)
    })
    

</script>

<div 
    class=dict-ctrl-layout
    {@attach element => param.registerValidator("dict", validateDict, 0)}
    {...attachments}
>
    {#each entries as [label, value]}
        <input
            bind:value={
                () => label,
                (value) => {
                    // iterate name to avoid duplication
                    while (value in param.val) {
                        value = iterateName(value)
                    }
                    // get keys and values in param val
                    let keys = Object.keys(param.val);
                    let values = Object.values(param.val)
                    // switch out name
                    keys[keys.indexOf(label)] = value;
                    // clear param val
                    param.val = {}
                    // apply new key:value pairs
                    for (let i in keys) {
                        param.val[keys[i]] = values[i]
                    };
                }
            }
            disabled={disabled}
        />
        <span
            class=dict-ctrl-label
        >
            :
        </span>
        <SingleLineCtrl
            param={value}
            codeIndicator={false}
            disabled={disabled}
        />
        <CompactButton
            icon="/icons/btn-delete.svg"
            onclick={(evt) => {
                delete param.val[label]
            }}
            disabled={disabled}
            tooltip="Remove item"
        />
    {/each}
    <div class=gap></div>
    <div class=gap></div>
    <div class=gap></div>
    <CompactButton
        icon="/icons/btn-add.svg"
        onclick={(evt) => {
            // enumerate field name to avoid duplication
            let key = "field";
            while (key in param.val) {
                key = iterateName(key)
            }
            // add field
            param.val[key] = "";
        }}
        tooltip="Add item"
        disabled={disabled}
    />
</div>

<style>
    .dict-ctrl-layout {
        flex-grow: 1;
        display: grid;
        grid-template-columns: [key] auto [colon] min-content [value] auto [delete] min-content;
        gap: .5rem;
    }
    .dict-ctrl-label {
        align-self: center;
        justify-self: end;
        font-family: var(--mono);
        color: var(--outline)
    }
</style>