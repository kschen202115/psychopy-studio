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

    let input = $state({
        past: [],
        present: "",
        future: []
    });
</script>

<div class=shell-ctrl>
    <div class=output>
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
    </div>
    <input 
        type=text
        bind:value={input.present}
        onkeyup={evt => {
            if (evt.key === "Enter") {
                // get command
                let cmd = $state.snapshot(input.present)
                // send message
                let resp = python.shell.send("app", id, cmd)
                // add to history
                input.past.push(cmd)
                // clear future and present
                input.future = []
                input.present = ""
                // show resp
                resp.then(
                    resp => output.content += resp.join("\n") + "\n"
                ).catch(
                    err => console.log(err)
                )
            }
            if (evt.key === "ArrowUp") {
                // if there's no history, do nothing
                if (!input.past.length) {
                    return
                }
                // the present becomes the future
                input.future.unshift(input.present)
                // the past becomes the present
                input.present = input.past.pop()
            }
            if (evt.key === "ArrowDown") {
                // if there's no future, do nothing
                if (!input.future.length) {
                    return
                }
                // the present becomes the past
                input.past.push(input.present)
                // the future becomes the present
                input.present = input.future.shift()
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
        display: flex;
        flex-direction: column;
        justify-content: stretch;
        gap: .5rem;
    }

    .output {
        flex-grow: 1;
        padding: .5rem;
    }
</style>