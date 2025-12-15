<script>
    import { CompactButton } from "$lib/utils/buttons";
    import { git } from "$lib/globals.svelte";
    import { CodeOutput } from "$lib/utils/code";
    import { getContext } from "svelte";

    let current = getContext("current")

    git.listen(
        (evt, message) => {
            current.output.pavlovia += message + "\n"
        }
    )
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