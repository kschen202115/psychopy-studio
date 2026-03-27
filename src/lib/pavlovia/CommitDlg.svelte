<script>
    import { Dialog } from "$lib/utils/dialog";
    import { git } from "$lib/globals.svelte";
    import { getContext } from "svelte";
    import { translate } from "$lib/translation";

    let {
        shown=$bindable(),
        awaiting=$bindable()
    } = $props()

    let current = getContext("current");

    let message = $state("")
</script>

<Dialog 
    title={translate("Commit changes")}
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
        {translate("Briefly describe the changes made since last sync.")}
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
</style>