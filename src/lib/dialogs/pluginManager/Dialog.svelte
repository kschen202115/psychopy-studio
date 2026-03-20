<script>
    import { Notebook, NotebookPage } from "$lib/utils/notebook";
    import { Dialog } from "$lib/utils/dialog";
    import PluginsPanel from "./plugins/PluginsPanel.svelte";
    import PackagesPanel from "./packages/PackagesPanel.svelte";
    import { python } from "$lib/globals.svelte"
    import { translate } from "$lib/translation";

    let {
        shown=$bindable()
    } = $props();

    let pages = $state({
        current: undefined
    });

    let venv = $state.raw("app")
</script>


<Dialog
    id=plugin-mgr
    title={translate("Plugins & packages")}
    buttons={{
        OK: evt => {}
    }}
    bind:shown={shown}
>
    <div class=container>
        <div class=environment-ctrl>
            Python environment:
            <select bind:value={venv}>
                {#await python.venv.executable("app") then appExecutable}
                    {#await python.uv.getEnvironments()}
                        <option>
                            Scanning Python environments...
                        </option>
                    {:then environments}
                        {#each environments as env}
                            <option value={env.executable === appExecutable ? "app" : env.psychopyVersion}>
                                {env.psychopyVersion}
                                {#if env.executable === appExecutable}
                                    (default)
                                {/if}
                            </option>
                        {/each}
                    {:catch err}
                        <option>{err}</option>
                    {/await}
                {/await}
            </select>
        </div>

        <Notebook>

            <NotebookPage
                label="Plugins"
                bind:selected={
                    () => pages.current === "plugins",
                    value => pages.current = "plugins"
                }
            >
                <PluginsPanel bind:venv={venv} />
            </NotebookPage>
            <NotebookPage
                label="Packages"
                bind:selected={
                    () => pages.current === "packages",
                    value => pages.current = "packages"
                }
            >
                <PackagesPanel bind:venv={venv} />
            </NotebookPage>
        </Notebook>
    </div>
</Dialog>

<style>
    .container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        gap: 1rem;
        padding: 1rem;
        box-sizing: border-box;
        align-items: stretch;
    }
    .environment-ctrl {
        display: flex;
        flex-direction: column;
    }
</style>