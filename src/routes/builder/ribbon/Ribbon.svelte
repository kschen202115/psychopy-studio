<script>
    import {
        // file
        file_new,
        file_open,
        file_save,
        file_save_as,
        // edit
        undo,
        redo,
        // experiment
        sendToRunner,
        compilePython,
        compileJS,
        runPython,
        newWindow,
        runJS,
    } from '../callbacks.svelte.js'
    
    import Menu from "./Menu.svelte";
    import { Ribbon, RibbonSection, RibbonGap } from '$lib/utils/ribbon';
    import { getContext } from "svelte";
    import { electron, python, git } from "$lib/globals.svelte.js";
    import SavePrompt from "./SavePrompt.svelte";
    import { FindDialog } from "$lib/dialogs/find/index.js";
    import { DeviceManagerDialog } from "$lib/dialogs/deviceManager/index.js"
    import ParamsDialog from "$lib/paramCtrls/ParamsDialog.svelte";
    import { IconButton, SwitchButton } from '$lib/utils/buttons';
    import { users, UserCtrl, ProjectCtrl } from '$lib/pavlovia/pavlovia.svelte';
    import MonitorCenterDlg from '../../../lib/dialogs/monitorCenter/MonitorCenterDlg.svelte';

    let current = getContext("current");

    let show = $state({
        menu: false,
        settingsDlg: false,
        findDlg: false,
        deviceMgrDlg: false,
        monitorCenterDlg: false
    })

    let awaiting = $state({
        runpy: Promise.resolve(""),
        compilepy: Promise.resolve(""),
        runjs: Promise.resolve(""),
        compilejs: Promise.resolve("")
    })

    let lastAction = $derived.by(() => {
        if (current.experiment.history.past.length) {
            return ` "${current.experiment.history.past.at(-1).msg}"`
        }
    })
    let nextAction = $derived.by(() => {
        if (current.experiment.history.future.length) {
            return ` "${current.experiment.history.future[0].msg}"`
        }
    })

    let prompts = $state({
        NEW: false,
        OPEN: false,
        PYCOMPILE: false,
        PYRUN: false
    });
</script>

<Ribbon>
    <RibbonSection>
        <IconButton 
            icon="/icons/btn-hamburger.svg"
            label="Menu"
            onclick={() => show.menu = true} 
            borderless
        />
        <Menu 
            bind:shown={show.menu} 
        />
    </RibbonSection>
    <RibbonSection label=File icon="/icons/rbn-file.svg">
        <IconButton 
            icon="/icons/btn-new.svg" 
            label="New file" 
            onclick={(evt) => prompts.NEW = true}
            borderless
        />
        <SavePrompt
            bind:shown={prompts.NEW}
            action={file_new}
        />  
        <IconButton 
            icon="/icons/btn-open.svg" 
            label="Open file" 
            onclick={(evt) => prompts.OPEN = true} 
            borderless
        />
        <SavePrompt
            bind:shown={prompts.OPEN}
            action={file_open}
        />
        <IconButton 
            icon="/icons/btn-save.svg" 
            label="Save file" 
            onclick={file_save}
            disabled={!current.experiment.history.past.length} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-saveas.svg" 
            label="Save file as"
            onclick={file_save_as} 
            borderless
        />
    </RibbonSection>

    <RibbonSection label=Edit icon="/icons/rbn-edit.svg">
        <IconButton 
            icon="/icons/btn-undo.svg" 
            label="Undo{lastAction}" 
            onclick={undo} 
            disabled={current.experiment.file === null || !current.experiment.history.past.length} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-redo.svg" 
            label="Redo {nextAction}" 
            onclick={redo} 
            disabled={current.experiment.file === null || !current.experiment.history.future.length} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-find.svg" 
            label="Find" 
            onclick={() => show.findDlg = true}
            borderless
        />
        <FindDialog
            bind:shown={show.findDlg}
        ></FindDialog>
    </RibbonSection>
    
    <RibbonSection label=Experiment icon="/icons/rbn-experiment.svg">
        <!-- <IconButton 
            id="ribbon-btn-monitors" 
            icon="/icons/btn-monitors.svg" 
            label="Monitor centre" 
        />         -->
        {#if python?.ready}
        <IconButton
                icon="/icons/btn-monitors.svg"
                label="Open the monitor center"
                onclick={(evt) => show.monitorCenterDlg = true}
                borderless
            ></IconButton>
            <MonitorCenterDlg
                bind:shown={show.monitorCenterDlg}
            />
            <IconButton
                icon="/icons/btn-devices.svg"
                label="Open the device manager"
                onclick={(evt) => show.deviceMgrDlg = true}
                borderless
            ></IconButton>
            <DeviceManagerDialog
                bind:shown={show.deviceMgrDlg}
            />
        {/if}

        <IconButton 
            icon="/icons/btn-settings.svg" 
            label="Experiment settings" 
            onclick={(evt) => show.settingsDlg = true}
            disabled={current.experiment === null}
            borderless
        />
        {#if current.experiment !== null }
        <ParamsDialog
            element={current.experiment.settings}
            bind:shown={show.settingsDlg}
        ></ParamsDialog>
        {/if}
        <SwitchButton 
            labels={["Pilot", "Run"]} 
            tooltip="Experiment will run in {current.experiment.pilotMode ? "pilot" : "run"} mode"
            bind:value={
                () => current.experiment.pilotMode,
                (value) => {
                    // update history
                    current.experiment.history.update(`toggle pilot mode`)
                    // set pilot mode
                    current.experiment.settings.params['runMode'].val = value;
                }
            } 
            disabled={current.experiment === null}
        />  
        
        {#if python?.ready}
            <IconButton 
                icon="/icons/btn-send{current.experiment.pilotMode ? "pilot" : "run"}.svg" 
                label="Send experiment to runner" 
                onclick={sendToRunner}
                disabled={!current.experiment.file}
                borderless
            /> 
        {/if}
    </RibbonSection>

    {#if python?.ready}
        <RibbonSection label=Desktop icon="/icons/rbn-desktop.svg">
            <IconButton 
                icon="/icons/btn-compilepy.svg" 
                label="Write experiment as a .py file" 
                onclick={evt => compilePython()}
                disabled={current.experiment === null}
                bind:awaiting={awaiting.compilepy}
                borderless
            /> 
            <IconButton 
                icon="/icons/btn-{current.experiment.pilotMode ? "pilot" : "run"}py.svg" 
                label="{current.experiment.pilotMode ? "Pilot" : "Run"} experiment locally" 
                onclick={evt => runPython()}
                disabled={current.experiment === null}
                bind:awaiting={awaiting.runpy}
                cancel={python.scripts.stop}
                borderless
            />
        </RibbonSection>

        <RibbonSection label=Browser icon="/icons/rbn-browser.svg">
            <IconButton 
                    icon="/icons/btn-compilejs.svg" 
                    label="Write experiment as a .js file" 
                    onclick={(evt) => compileJS()}
                    disabled={current.experiment === null}
                    bind:awaiting={awaiting.compilejs}
                    borderless
                />
                <IconButton 
                    icon="/icons/btn-{current.experiment.pilotMode ? "pilot" : "run"}js.svg" 
                    label="{current.experiment.pilotMode ? "Pilot" : "Run"} experiment in browser" 
                    onclick={(evt) => runJS()}
                    disabled={current.experiment === null}
                    bind:awaiting={awaiting.runjs}
                    borderless
                />
        </RibbonSection>
    {/if}

    <!-- <RibbonSection id=browser label=Browser icon="/icons/rbn-browser.svg">
        <IconButton 
            id="ribbon-btn-sync" 
            icon="/icons/btn-sync.svg" 
            label="Sync to Pavlovia" 
        />
    -->

    <RibbonSection label=Pavlovia icon="/icons/rbn-pavlovia.svg">
        <IconButton 
            icon="/icons/btn-sync.svg" 
            label="Sync experiment" 
            onclick={(evt) => git.sync(current.experiment.file.parent, $state.snapshot(current.user))}
            disabled={!current.user || !current.experiment.file}
            borderless
        />
        <UserCtrl />
        <ProjectCtrl />
    </RibbonSection>

    <RibbonGap></RibbonGap>

    <RibbonSection label=Views icon="/icons/rbn-windows.svg">
        <IconButton 
            icon="/icons/btn-builder.svg" 
            label="Builder view" 
            onclick={(evt) => newWindow("builder")} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-coder.svg" 
            label="Coder view" 
            onclick={(evt) => newWindow("coder")} 
            borderless
        />
        {#if electron}
            <IconButton 
                icon="/icons/btn-runner.svg" 
                label="Runner view" 
                onclick={(evt) => newWindow("runner")} 
                borderless
            />
        {/if}
    </RibbonSection>
</Ribbon>