<script>
    import { Dialog } from "$lib/utils/dialog";
    import { git } from "$lib/globals.svelte";
    import { getContext } from "svelte";

    let {
        shown=$bindable(),
        awaiting=$bindable()
    } = $props()

    let current = getContext("current");

    let message = $state("")
</script>

<Dialog 
    title="Commit changes"
    buttons={{
        OK: evt => git.commit(
            $state.snapshot(message), 
            current.experiment.file.parent, 
            $state.snapshot(current.user)
        ).then(
            resp => awaiting.resolve(resp)
        ),
        CANCEL: evt => awaiting.resolve(false)
    }}
    onopen={evt => {
        message = "";
        // refresh promise
        let newPromise = Promise.withResolvers();
        awaiting.resolve(newPromise.promise);
        awaiting = newPromise;
    }}
    bind:shown={shown}
    shrink
>
    <div class=content>
        Briefly describe the changes made since last sync.
        <input bind:value={message} />
    </div>
</Dialog>

<style>
    .content {
        display: flex;
        flex-direction: column;
        gap: .5rem;
        padding: 1rem;
        min-width: 35rem;
    }
    .ctrl {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: .5rem;
    }
</style>