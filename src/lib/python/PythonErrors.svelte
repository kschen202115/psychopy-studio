<script>
    import { MessageArray, Message } from "$lib/utils/message";
    import { MessageDialog } from "$lib/utils/dialog";
    import { CodeOutput } from "$lib/utils/code";
    import { python } from "$lib/globals.svelte.js";

    let errors = $state([])
    let showDlg = $state.raw(false)

    // listen to Python stderr
    python.output.stderr.listen(
        (evt, message) => errors.push({
            dismiss: new Promise(
                (resolve, reject) => setTimeout(resolve, 5000)
            ),
            content: message
        })
    )
    // listen for Liaison too
    python.liaison.listen("error", 
        (evt, message) => errors.push({
            dismiss: new Promise(
                (resolve, reject) => setTimeout(resolve, 5000)
            ),
            content: message
        })
    )
</script>


<MessageArray>
    {#each errors as error}
        {#await error.dismiss}
            <Message
                message="Python error, click to show error"
                icon="/icons/sym-error.svg"
                onclick={evt => showDlg = true}
            />
        {:then}
            {""}
        {/await}
    {/each}
</MessageArray>

<MessageDialog
    bind:shown={showDlg}
    buttons={{
        CANCEL: evt => {}
    }}
>
    <div class=output-container>
        <CodeOutput value={errors.map(err => err.content).join("\n")} />
    </div>
</MessageDialog>