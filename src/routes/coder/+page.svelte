<script>
    import { setContext } from "svelte";
    import { current } from "./globals.svelte";
    import Theme from "$lib/utils/Theme.svelte";
    import CoderRibbon from "./ribbon/Ribbon.svelte";
    import Shortcuts from '$lib/utils/Shortcuts.svelte';
    import { shortcuts } from "./callbacks.svelte";
    import { CoderNotebook } from "./notebook";
    import Frame from "$lib/utils/Frame.svelte";
    import Panel from "$lib/utils/Panel.svelte";
    import ShellNotebook from "./shell/ShellNotebook.svelte";
    import FileExplorer from "./files/FileExplorer.svelte";
    import { electron, python } from "$lib/globals.svelte";
    import path from "path-browserify";
    import SetupPython from "../../lib/python/SetupPython.svelte";
    

    // reference current in context for ease of access
    setContext("current", current)

    // listen for messages from other windows
    if (electron) {
        // for opening files via another window
        electron.windows.listen("fileOpen", (evt, file) => current.openFile(file))
        // mark ready
        electron.windows.emit("ready", true)
    }

</script>

<title>PsychoPy Coder</title>
<Frame
    rows={3} 
    cols={4}
>
    {#snippet ribbon()}
        <CoderRibbon />
    {/snippet}
    {#if electron}
        <Panel
            title=Files
            hspan={1}
            vspan={2}
        >
            <FileExplorer />
        </Panel>
    {/if}
    <Panel
        title=Editor 
        hspan={electron ? 3 : 4} 
        vspan={python ? 2 : 3}
    >
        <CoderNotebook />
    </Panel>
    {#if python?.ready}
        <Panel
            title=Console
            hspan={5}
            vspan={1}
        >
            <ShellNotebook />
        </Panel>
    {/if}
    <!-- this will setup themeing -->
    <Theme />
    <!-- this will setup keyboard shortcuts -->
    <Shortcuts
        callbacks={shortcuts}
    />
    <!-- this will setup a Python instance -->
    <SetupPython />
</Frame>
