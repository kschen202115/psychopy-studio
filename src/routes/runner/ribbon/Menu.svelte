<script>
    import { getContext } from "svelte";
    import { Menu, MenuItem, MenuSeparator, SubMenu } from '$lib/utils/menu';
    import PrefsDialog from '$lib/dialogs/preferences/PrefsDialog.svelte';
    import { BugReportDlg } from "$lib/dialogs/bugReport";
    import { prefs } from "$lib/preferences.svelte"; 
    import { electron, python } from "$lib/globals.svelte";
    import { showDevTools } from "$lib/utils/views.svelte"
    import { setupPython } from "$lib/python";
    import { Version } from "$lib/utils/versions";

    import {
        // file
        fileNew,
        fileOpen,
        fileSave,
        fileSaveAs,
        quit,
        // run
        togglePiloting,
        // view
        showWindow,
    } from '../callbacks.svelte.js'

    let current = getContext("current");

    let {
        shown=$bindable()
    } = $props()

    let show = $state({
        prefsDlg: false,
        findDlg: false,
        settingsDlg: false,
        bugReport: false,
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
            onclick={fileNew}
        />
        <MenuItem 
            icon="/icons/btn-open.svg" 
            label="Open file" 
            shortcut="open"
            onclick={fileOpen} 
        />
        <MenuItem 
            icon="/icons/btn-save.svg" 
            label="Save file"
            shortcut="save"
            onclick={fileSave}
        />
        <MenuItem 
            icon="/icons/btn-saveas.svg" 
            label="Save file as"
            shortcut="saveAs"
            onclick={fileSaveAs} 
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

        {#if electron}
            <MenuSeparator />

            <MenuItem
                label="Quit"
                onclick={quit}
                shortcut="quit"
            />
        {/if}
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

        <MenuSeparator />

        <MenuItem 
            label="Show developer tools"
            onclick={showDevTools}
            shortcut="showDevTools"
        />
    </SubMenu>

    {#if electron}
        <SubMenu label="Run" icon="/icons/btn-runpy.svg" disabled={current.selection === undefined}>
            <MenuItem 
                label="Toggle pilot mode"
                onclick={togglePiloting}
                shortcut="togglePilot"
                disabled={current.selection === undefined}
            />

            <MenuSeparator />

            <MenuItem 
                label="{current.runlist[current.selection]?.pilotMode ? "Pilot" : "Run"} in Python" 
                icon="/icons/btn-{current.runlist[current.selection]?.pilotMode ? "pilot" : "run"}py.svg" 
                onclick={evt => current.awaiting.runpy = current.runlist[current.selection]?.runPython()}
                shortcut="runPython"
                disabled={current.selection === undefined}
            />
            <MenuItem 
                label="{current.runlist[current.selection]?.pilotMode ? "Pilot" : "Run"} in browser" 
                icon="/icons/btn-{current.runlist[current.selection]?.pilotMode ? "pilot" : "run"}js.svg" 
                onclick={(evt) => current.awaiting.runjs = current.runlist[current.selection]?.runJS()}
                shortcut="runJS"
                disabled={current.selection === undefined}
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
                onclick={evt => setupPython("app", true)}
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
        {#await electron.version() then version}
            {#if version === "dev" || Version.parse(version).extra}
                <MenuSeparator />
                
                <MenuItem
                    label="Report bug"
                    onclick={evt => show.bugReport = true}
                />
            {/if}
        {/await}

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
{#if electron}
    <BugReportDlg 
        user={current.user}
        context={current.runlist}
        bind:shown={show.bugReport}
    />
{/if}
