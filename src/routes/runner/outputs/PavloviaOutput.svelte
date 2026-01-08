<script>
    import { CompactButton } from "$lib/utils/buttons";
    import { git } from "$lib/globals.svelte";
    import { CodeOutput } from "$lib/utils/code";
    import { getContext } from "svelte";

    let current = getContext("current")

    
</script>


<CodeOutput bind:value={current.output.pavlovia}>
    {#snippet ctrls()}
        <CompactButton
            icon="/icons/btn-clear.svg"
            onclick={evt => current.output.pavlovia = ""}
            tooltip="Clear pavlovia output"
        />
    {/snippet}
</CodeOutput>