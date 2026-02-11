<script>
    import { CompactButton, Button } from "$lib/utils/buttons";
    import { getContext } from "svelte";
    import { python } from "$lib/globals.svelte";

    let {
        plugin,
        venv=$bindable()
    } = $props()

    let siblings = getContext("siblings")

    $effect(() => {
        if (siblings.selected === undefined) {
            siblings.selected = page
        }
    })

    let installed = $derived(
        Object.keys(siblings.installed).includes(plugin.pipname)
    )

    function install(evt) {
        python.venv.installPackage(
            venv, plugin.pipname
        ).then(
            resp => python.venv.getPackages(
                venv
            ).then(
                packages => siblings.installed = packages
            )
        );
    }

    function uninstall(evt) {
        python.venv.uninstallPackage(
            venv, plugin.pipname
        ).then(
            resp => python.venv.getPackages(
                venv
            ).then(
                packages => siblings.installed = packages
            )
        );
    }
</script>

<!-- this is drawn or not drawn according to selection -->
{#snippet page()}
    <div class=plugin-page>
        <div class=title>
            <img class=plugin-avatar src={plugin.icon} alt={plugin.pipname} />
            <a href="{plugin.homepage}" class=plugin-name>{plugin.name}</a>
            <code class=plugin-pipname>{plugin.pipname}</code>
            <div class=plugin-install-btn>
                {#if !installed}
                    <Button
                        label="Install"
                        icon="/icons/btn-download.svg"
                        onclick={install}
                        bind:awaiting={siblings.installed}
                        horizontal
                        disabled={venv === undefined}
                    />
                {:else}
                    <Button
                        label="Uninstall"
                        icon="/icons/btn-delete.svg"
                        onclick={uninstall}
                        bind:awaiting={siblings.installed}
                        horizontal
                        disabled={venv === undefined}
                    />
                {/if}
            </div>
        </div>
        {#each (plugin.description || "").split("\n") as line}
            <p>{line}</p>
        {/each}
    </div>
{/snippet}



<button 
    class=plugin-item
    class:selected={siblings.selected === page}
    class:installed={installed}
    onclick={evt => siblings.selected = page}
>
    <img class=plugin-avatar src={plugin.icon} alt={plugin.pipname} />
    <div class=plugin-name>{plugin.name}</div>
    <code class=plugin-pipname>{plugin.pipname}</code>
    <div class=plugin-install-btn></div>
</button>

<style>
    .plugin-item, .plugin-page .title {
        display: grid;
        position: relative;
        grid-template-columns: [avatar] min-content [start] 1fr [end];
        grid-template-rows: [start] min-content min-content [button] 1fr [end];
        align-items: center;
        align-content: start;
        justify-items: start;
        justify-content: start;
        gap: 0 1rem;
        width: 100%;
    }

    .plugin-install-btn {
        margin-top: .5rem;
        grid-row-start: button;
        grid-column-start: start;
    }
    .plugin-item {
        border: 1px solid var(--overlay);
        border-radius: .5rem;
        padding: 1rem;
        box-sizing: border-box;
        background-color: var(--mantle);
    }
    .plugin-item.selected {
        border: 1px solid var(--blue);
    }
    .plugin-item.installed {
        background-color: var(--base)
    }

    .plugin-name {
        font-weight: bold;
        text-decoration: none;
        color: var(--text);
        font-size: 1.25rem;
        grid-column: start / button;
        text-align: left;
    }
    .plugin-item .plugin-name {
        font-size: 1.25rem;
    }
    .plugin-page .plugin-name {
        font-size: 2rem;
    }

    .plugin-pipname {
        grid-column: start / button;
    }

    .plugin-avatar {
        border-radius: .5rem;
        grid-row: start / end;
    }
    .plugin-item .plugin-avatar {
        width: 4rem;
    }
    .plugin-page .plugin-avatar {
        width: 8rem;
    }

    .plugin-page {
        display: flex;
        flex-direction: column;
        align-items: start;
        gap: .5rem;
        width: 45rem;
    }
</style>