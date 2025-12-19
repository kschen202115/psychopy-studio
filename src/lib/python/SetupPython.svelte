<script>
    import { Button } from "$lib/utils/buttons";
    import { MessageArray, Message } from "$lib/utils/message";
    import { MessageDialog } from "$lib/utils/dialog";
    import { showWindow } from "$lib/utils/views.svelte";
    import { marked } from "marked";
    import { status } from "./globals.svelte.js";
    import { setupPython } from "./functions.svelte.js";

    setupPython()

    // open Runner on error
    python.output.stderr.listen(
        (evt, message) => showWindow("runner")
    )
    python.liaison.listen("error",
        (evt, message) => showWindow("runner")
    )
</script>


<MessageArray>
    {#await status.ready.promise}
        <Message
            message={status.message}
        />
    {:then didSetup}
        {#await status.dismiss.promise}
            <Message
                message={status.message}
                icon="/icons/sym-python.svg"
            />
        {/await}
    {:catch err}
        <div class=message>
            Failed setup: {err}
            <Button
                label="Try again?"
                icon="/icons/btn-refresh.svg"
                onclick={evt => setupPython()}
                horizontal
            />
        </div>
    {/await}
</MessageArray>

<MessageDialog
    bind:shown={status.dlg.shown}
>
    {@html marked(status.dlg.message || "")}
</MessageDialog>



