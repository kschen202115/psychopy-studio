<script>
    import { CompactButton } from "$lib/utils/buttons";
    import { CodeOutput } from "$lib/utils/code";
    import { getContext } from "svelte";
    import { python } from "$lib/globals.svelte";

    let current = getContext("current");
</script>


<CodeOutput bind:value={current.output.stdout}>
    {#snippet ctrls()}
        <CompactButton
            icon="/icons/btn-clear.svg"
            onclick={evt => current.output.stdout = ""}
            tooltip="Clear stdout"
        />
    {/snippet}
</CodeOutput>