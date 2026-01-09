<script>
    import { getContext } from "svelte";
    import { Menu, MenuItem, MenuSeparator, SubMenu } from '$lib/utils/menu';
    import PrefsDialog from '$lib/dialogs/preferences/PrefsDialog.svelte';
    import ParamsDialog from "$lib/paramCtrls/ParamsDialog.svelte";
    import { FindDialog } from "$lib/dialogs/find";
    import { BugReportDlg } from "$lib/dialogs/bugReport";
    import { prefs } from "$lib/preferences.svelte"; 
    import { electron, python } from "$lib/globals.svelte";
    import { DeviceManagerDialog } from "$lib/dialogs/deviceManager/index.js";
    import { PluginManagerDlg } from "$lib/dialogs/pluginManager";
    import { setupPython } from "$lib/python"

    import {
        // file
        file_new,
        file_open,
        file_save,
        file_save_as,
        revealFolder,
        close,
        quit,
        // edit
        undo,
        redo,
        // view
        newWindow,
        showWindow,
        showDevTools,
        // experiment
        showReadme,
        copyRoutine,
        pasteRoutine,
        // run
        togglePiloting,
        sendToRunner,
        compilePython,
        compileJS,
        runPython,
        runJS
    } from '../callbacks.svelte.js';

    let current = getContext("current");

    let {
        shown=$bindable()
    } = $props()

    let show = $state({
        prefsDlg: false,
        findDlg: false,
        settingsDlg: false,
        deviceMgrDlg: false,
        pluginMgr: false,
        bugReport: false
    })
</script>


<Menu 
    bind:shown={shown}
>
    <SubMenu label="File" icon="/icons/rbn-file.svg">
        <MenuItem 
            icon="/icons/btn-new.svg" 
            label="New file"
            shortcut="new"
            onclick={file_new}
        />
        <MenuItem 
            icon="/icons/btn-open.svg" 
            label="Open file" 
            shortcut="open"
            onclick={file_open} 
        />
        <MenuItem 
            icon="/icons/btn-save.svg" 
            label="Save file"
            shortcut="save"
            onclick={file_save} 
            disabled={!current.experiment.history.past.length} 
        />
        <MenuItem 
            icon="/icons/btn-saveas.svg" 
            label="Save file as"
            shortcut="saveAs"
            onclick={file_save_as} 
        />
        <MenuItem
            label="Reveal in file explorer"
            onclick={revealFolder}
            shortcut="revealFolder"
            disabled={current.experiment.file?.parent === undefined}
        />
        <MenuItem
            label="Close window"
            onclick={close}
            shortcut="close"
        />

        <MenuSeparator />

        <MenuItem
            icon="/icons/btn-settings.svg"
            label="Preferences"
            onclick={(evt) => {show.prefsDlg = true}}
        />
        <MenuItem
            label="Reset preferences"
            onclick={evt => prefs.reset()}
        />
    </SubMenu>

    <SubMenu label="Edit" icon="/icons/rbn-edit.svg">
        <MenuItem 
            label="Undo"
            icon="/icons/btn-undo.svg"
            disabled={current.experiment.file === null || !current.experiment.history.past.length}
            onclick={undo}
            shortcut="undo"
        />
        <MenuItem 
            label="Redo"
            icon="/icons/btn-redo.svg"
            onclick={redo}
            disabled={current.experiment.file === null || !current.experiment.history.future.length}
            shortcut="redo"
        />
        <MenuSeparator />
        <MenuItem 
            label="Find in experiment"
            icon="/icons/btn-find.svg"
            onclick={evt => show.findDlg = true}
            shortcut="find"
        />
    </SubMenu>

    <SubMenu label="View" icon="/icons/rbn-windows.svg">
        <MenuItem 
            label="Show Builder"
            onclick={evt => showWindow("builder")}
        />
        <MenuItem 
            label="Show Coder"
            onclick={evt => showWindow("coder")}
        />
        <MenuItem 
            label="Show Runner"
            onclick={evt => showWindow("runner")}
        />

        <MenuSeparator />

        <MenuItem 
            label="Show developer tools"
            onclick={showDevTools}
            shortcut="showDevTools"
        />
    </SubMenu>

    <SubMenu label="Experiment" icon="/icons/rbn-experiment.svg">
        <MenuItem 
            label="Experiment settings"
            icon="/icons/btn-settings.svg"
            onclick={evt => show.settingsDlg = true}
        />

        <MenuItem 
            label="Show readme"
            icon="/icons/btn-new.svg"
            onclick={evt => showReadme()}
        />

        <MenuSeparator />

        <MenuItem 
            label="Copy current Routine"
            icon="/icons/btn-copy.svg"
            onclick={evt => copyRoutine()}
        />

        <MenuItem 
            label="Paste Routine"
            icon="/icons/btn-paste.svg"
            onclick={evt => pasteRoutine()}
        />
    </SubMenu>

    {#if electron}
        <SubMenu label="Run" icon="/icons/btn-runpy.svg">
            <MenuItem 
                label="Toggle pilot mode"
                onclick={togglePiloting}
                shortcut="togglePilot"
            />
            <MenuItem 
                label="Send to Runner"
                icon="/icons/btn-send{current.experiment.pilotMode ? "pilot" : "run"}.svg" 
                onclick={sendToRunner}
                shortcut="sendToRunner"
                disabled={!current.experiment.file}
            />

            <MenuSeparator />

            <MenuItem 
                label="Compile Python"
                icon="/icons/btn-compilepy.svg" 
                onclick={evt => compilePython()}
                shortcut="compilePython"
                disabled={current.experiment === null}
            /> 
            <MenuItem 
                label="{current.experiment.pilotMode ? "Pilot" : "Run"} in Python" 
                icon="/icons/btn-{current.experiment.pilotMode ? "pilot" : "run"}py.svg" 
                onclick={evt => runPython()}
                shortcut="runPython"
                disabled={current.experiment === null}
            />

            <MenuSeparator />

            <MenuItem 
                label="Compile JS" 
                icon="/icons/btn-compilejs.svg" 
                onclick={(evt) => compileJS()}
                shortcut="compileJS"
                disabled={current.experiment === null}
            />
            <MenuItem 
                label="{current.experiment.pilotMode ? "Pilot" : "Run"} in browser" 
                icon="/icons/btn-{current.experiment.pilotMode ? "pilot" : "run"}js.svg" 
                onclick={(evt) => runJS()}
                shortcut="runJS"
                disabled={current.experiment === null}
            />
        </SubMenu>
    {/if}

    <SubMenu label="Tools" icon="/icons/btn-hamburger.svg">
        <MenuItem 
            label="Open device manager"
            icon="/icons/btn-devices.svg"
            onclick={evt => show.deviceMgrDlg = true}
        />
        {#if python?.ready}
            <MenuItem 
                label="Manage plugins and packages"
                icon="/icons/btn-plugin.svg"
                onclick={evt => show.pluginMgr = true}
                disabled={!python?.ready}
            />
        {/if}

        {#if electron}
            <MenuSeparator />

            <MenuItem 
                label="Open PsychoPy user folder"
                onclick={evt => electron.paths.user().then(
                    folder => electron.files.openPath(folder)
                )}
            />
        {/if}
        {#if python}
            <MenuItem 
                label="Reinstall Python"
                onclick={evt => setupPython(true)}
            />
        {/if}
    </SubMenu>

    <SubMenu label="Help">
        <MenuItem 
            label="PsychoPy Homepage"
            onclick={evt => open("https://www.psychopy.org/")}
        />
        <MenuItem 
            label="Documentation"
            onclick={evt => open("https://www.psychopy.org/documentation")}
        />
        <MenuItem 
            label="Help Forum"
            onclick={evt => open("https://discourse.psychopy.org/")}
        />
        <MenuSeparator />
        {#if electron}
            {#await electron.version() then version}
                <MenuItem
                    label="PsychoPy {version.major}.{version.minor}"
                    disabled
                />
            {/await}
        {/if}
    </SubMenu>

    {#if electron}
        <MenuSeparator />
        
        <MenuItem
            label="Report bug"
            onclick={evt => show.bugReport = true}
        />

        <MenuSeparator />

        <MenuItem
            label="Quit"
            onclick={quit}
            shortcut="quit"
        />
    {/if}
</Menu>


<!-- dialogs need to be outside so they're not hidden when the menu is -->
<PrefsDialog
    bind:shown={show.prefsDlg}
/>
<FindDialog
    bind:shown={show.findDlg}
/>
<ParamsDialog
    element={current.experiment.settings}
    bind:shown={show.settingsDlg}
/>
<DeviceManagerDialog
    bind:shown={show.deviceMgrDlg}
/>
{#if python}
    <PluginManagerDlg 
        bind:shown={show.pluginMgr}
    />
{/if}
{#if electron}
    <BugReportDlg 
        user={current.user}
        context={current.experiment}
        bind:shown={show.bugReport}
    />
{/if}