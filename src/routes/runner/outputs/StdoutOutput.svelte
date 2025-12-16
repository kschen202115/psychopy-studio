<script>
    import { CompactButton } from "$lib/utils/buttons";
    import { CodeOutput } from "$lib/utils/code";
    import { getContext } from "svelte";
    import { python } from "$lib/globals.svelte";

    let current = getContext("current");

    python.output.stdout.listen(
        (evt, message) => current.output.stdout += `${message}\n`
    )
    python.output.stderr.listen(
        (evt, message) => current.output.stdout += `${message}\n`
    )
    python.liaison.listen("error",
        (evt, message) => current.output.stdout += `${message.error}\n`
    )
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