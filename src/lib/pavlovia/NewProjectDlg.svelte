<script>
    import { Dialog } from "$lib/utils/dialog";
    import { git } from "$lib/globals.svelte";
    import { getContext, onMount } from "svelte";
    import { auth } from "./pavlovia.svelte";

    let {
        shown=$bindable()
    } = $props()

    let current = getContext("current");

    let details = $state({
        name: undefined,
        group: undefined,
        root: undefined
    })
</script>

<Dialog 
    title="New project"
    buttons={{
        OK: evt => git.newProject(
            $state.snapshot(details), 
            current.experiment.file.parent, 
            $state.snapshot(current.user)
        ).then(
            resp => current.project = resp
        ),
        CANCEL: evt => {}
    }}
    onopen={evt => {
        details.name = current.experiment.file.stem
        details.group = current.user?.profile.username
        details.root = auth.root
    }}
    bind:shown={shown}
    shrink
>
    <div class=content>
        <div class=ctrl>
            pavlovia.org / 
            <select bind:value={details.group} style:flex-grow=1>
                <option value={current.user.profile.username}>{current.user.profile.username}</option>
                {#await fetch(
                    `${auth.root}/api/v4/groups?access_token=${current.user.token.access}`
                ) then resp}
                    {#await resp.json() then groups}
                        {#each groups as group}
                            <option value={group.path}>{group.path}</option>
                        {/each}
                    {/await}
                {/await}
            </select>
            /
            <input bind:value={details.name} />
        </div>
    </div>
</Dialog>

<style>
    .content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
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