<script>
    import { Notebook, NotebookPage } from "$lib/utils/notebook";
    import Frame from "$lib/utils/Frame.svelte";
    import Panel from "$lib/utils/Panel.svelte";
    import Theme from "$lib/utils/Theme.svelte";
    import AlertsOutput from "./outputs/AlertsOutput.svelte";
    import FilesPanel from "./files/Panel.svelte";

    import { current } from "./globals.svelte";
    import { setContext } from "svelte";
    import StdoutOutput from "./outputs/StdoutOutput.svelte";
    import PavloviaOutput from "./outputs/PavloviaOutput.svelte";
    import { electron } from "$lib/globals.svelte";
    import SetupPython from "../../lib/python/SetupPython.svelte";
    import { addFile } from "./callbacks.svelte";
    import Ribbon from "./ribbon/Ribbon.svelte";
    import Shortcuts from '$lib/utils/Shortcuts.svelte';
    import { shortcuts } from "./callbacks.svelte";

    setContext("current", current)

    // listen for messages from other windows
    if (electron) {
        // for opening files via another window
        electron.windows.listen("fileOpen", (evt, file) => addFile(file))
        // mark ready
        electron.windows.emit("ready", true)
    }

    let selection = $state.raw()

</script>


{#if current.selection !== undefined}
    <title>PsychoPy Runner: {current.runlist[current.selection].file.name}</title>
{:else}
    <title>PsychoPy Runner</title>
{/if}
<Frame
    rows={1} 
    cols={3}
>
    {#snippet ribbon()}
        <Ribbon />
    {/snippet}
    <Panel
        title=Files
        hspan={1}
        vspan={1}
    >
        <FilesPanel />
    </Panel>

    <Panel
        title=Output 
        hspan={2}
        vspan={1}
    >
        <Notebook>
            <NotebookPage
                label=Alerts
                bind:selected={
                    () => current.tab === "alerts",
                    (val) => {
                        if (val) {
                            current.tab = "alerts"
                        }
                    }
                }
            >
                <AlertsOutput />
            </NotebookPage>
            <NotebookPage
                label=Stdout
                bind:selected={
                    () => current.tab === "stdout",
                    (val) => {
                        if (val) {
                            current.tab = "stdout"
                        }
                    }
                }
            >
                <StdoutOutput />
            </NotebookPage>
            <NotebookPage
                label=Pavlovia
                bind:selected={
                    () => current.tab === "pavlovia",
                    (val) => {
                        if (val) {
                            current.tab = "pavlovia"
                        }
                    }
                }
            >
                <PavloviaOutput />
            </NotebookPage>
        </Notebook>
    </Panel>

    <!-- this will setup themeing -->
    <Theme />
    <!-- this will setup keyboard shortcuts -->
    <Shortcuts
        callbacks={shortcuts}
    />
    <!-- this will setup a Python instance -->
    <SetupPython />
</Frame>
