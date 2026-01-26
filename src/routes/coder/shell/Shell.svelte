<script>
    import { python } from "$lib/globals.svelte.js";
    import { CompactButton } from "$lib/utils/buttons";
    import { CodeOutput } from "$lib/utils/code";
    import { onMount } from "svelte";

    let {
        id
    } = $props()

    let output = $state({
        content: ""
    })

    let message = $state.raw("");
</script>

<div class=shell-ctrl>
    <CodeOutput
        bind:value={output.content}
    >
        {#snippet ctrls()}
            <CompactButton
                icon="/icons/btn-clear.svg"
                onclick={evt => output.content = ""}
                tooltip="Clear output"
            />
        {/snippet}
    </CodeOutput>
    <input 
        type=text
        bind:value={message}
        onkeypress={evt => {
            if (evt.key === "Enter") {
                // send message
                let resp = python.shell.send("app", id, $state.snapshot(message))
                // clear ctrl
                message = ""
                // show resp
                resp.then(
                    resp => output.content += resp.join("\n") + "\n"
                ).catch(
                    err => console.log(err)
                )
            }
        }}
    />
</div>

<style>
    input {
        font-family: var(--mono);
    }

    .shell-ctrl {
        height: 100%;
        display: grid;
        grid-template-rows: 1fr min-content;
    }
</style>