<script>
    import {
        // file
        fileNew,
        fileOpen,
        fileSave,
        fileSaveAs,
        // edit
        undo,
        redo,
        find,
        // experiment
        sendToRunner,
        // run
        runPython,
        stopPython,
        // views
        showWindow
    } from '../callbacks.svelte.js'
    
    import { Ribbon, RibbonSection, RibbonGap } from '$lib/utils/ribbon';
    import Menu from "./Menu.svelte";
    import { getContext } from "svelte";
    import { IconButton, SwitchButton } from '$lib/utils/buttons';
    import { UserCtrl } from '$lib/pavlovia/pavlovia.svelte';
    import { electron, python } from "$lib/globals.svelte";

    let current = getContext("current");

    let show = $state({
    })

    let awaiting = $state({
        runpy: Promise.resolve(false)
    })
</script>

<Ribbon>
    <Menu 
        bind:shown={show.menu} 
    />
    
    <RibbonSection label=File icon="/icons/rbn-file.svg">
        <IconButton 
            icon="/icons/btn-new.svg" 
            label="New file" 
            onclick={fileNew}
            borderless
        /> 
        <IconButton 
            icon="/icons/btn-open.svg" 
            label="Open file" 
            onclick={fileOpen} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-save.svg" 
            label="Save file" 
            onclick={fileSave}
            borderless
            disabled={!current.pages[current.tab]?.canUndo && current.pages[current.tab]?.file?.file}
        />
        <IconButton 
            icon="/icons/btn-saveas.svg" 
            label="Save file as"
            onclick={fileSaveAs} 
            borderless
        />
    </RibbonSection>

    <RibbonSection label=Edit icon="/icons/rbn-edit.svg">
        <IconButton 
            icon="/icons/btn-undo.svg" 
            label="Undo"
            onclick={undo} 
            disabled={!current.pages[current.tab]?.canUndo} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-redo.svg" 
            label="Redo" 
            onclick={redo} 
            disabled={!current.pages[current.tab]?.canRedo} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-find.svg" 
            label="Find" 
            onclick={find}
            disabled={!current.pages[current.tab]?.editor}
            borderless
        />
    </RibbonSection>

    <RibbonSection label=Experiment icon="/icons/rbn-experiment.svg">
        <SwitchButton 
            labels={["Pilot", "Run"]} 
            tooltip="Experiment will run in {current.pages[current.tab]?.pilotMode ? "pilot" : "run"} mode"
            bind:value={
                () => current.pages[current.tab]?.pilotMode,
                (value) => current.pages[current.tab].pilotMode = value
            } 
            disabled={!current.pages[current.tab]}
        />  
        
        {#if python?.ready}
            <IconButton 
                icon="/icons/btn-send{current.pages[current.tab]?.pilotMode ? "pilot" : "run"}.svg" 
                label="Send experiment to runner" 
                onclick={sendToRunner}
                disabled={!current.pages[current.tab]?.file?.file}
                borderless
            /> 
        {/if}
    </RibbonSection>
    {#if python?.ready}
        <RibbonSection label=Run icon="/icons/btn-runpy.svg">
            <IconButton 
                icon="/icons/btn-{current.pages[current.tab]?.pilotMode ? "pilot" : "run"}py.svg" 
                label="{current.pages[current.tab]?.pilotMode ? "Pilot" : "Run"} experiment locally" 
                onclick={evt => runPython()}
                disabled={!current.pages[current.tab]?.file?.file || current.pages[current.tab]?.file?.ext !== ".py"}
                bind:awaiting={awaiting.runpy}
                cancel={evt => stopPython()}
                borderless
            /> 
        </RibbonSection>
    {/if}

    <RibbonSection label=Pavlovia icon="/icons/rbn-pavlovia.svg">
        <UserCtrl />
    </RibbonSection>

    <RibbonGap></RibbonGap>

    <RibbonSection label=Views icon="/icons/rbn-windows.svg">
        <IconButton 
            icon="/icons/btn-builder.svg" 
            label="Builder view" 
            onclick={(evt) => showWindow("builder")} 
            borderless
        />
        <IconButton 
            icon="/icons/btn-coder.svg" 
            label="Coder view" 
            onclick={(evt) => showWindow("coder")} 
            borderless
            disabled
        />
        {#if electron}
            <IconButton 
                icon="/icons/btn-runner.svg" 
                label="Runner view" 
                onclick={(evt) => showWindow("runner")} 
                borderless
            />
        {/if}
    </RibbonSection>
</Ribbon>