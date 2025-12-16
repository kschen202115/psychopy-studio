<script>
    import { MessageArray, Message } from "$lib/utils/message";
    import { python } from "$lib/globals.svelte.js";
    import { showWindow } from "$lib/utils/views.svelte";

    let errors = $state([])

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
                message="Python error, view in Runner"
                icon="/icons/sym-error.svg"
                onclick={evt => showWindow("runner")}
            />
        {:then}
            {""}
        {/await}
    {/each}
</MessageArray>