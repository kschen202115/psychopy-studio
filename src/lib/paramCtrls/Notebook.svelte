<script>
    import ParamCtrl from "./ParamCtrl.svelte";
    import StartStopCtrl from "./StartStopCtrl.svelte";
    import { Notebook, NotebookPage } from "$lib/utils/notebook"
    import { python } from "$lib/globals.svelte";
    import { getContext } from "svelte";

    let {
        element=$bindable(),
        /** @prop @type {array<string>} List of param names not to show */
        hideParams=[]
    } = $props();

    let pageIndex = $state()

    // horizontal layout for CodeComponent
    let horizontal = $derived(
        element.tag === "CodeComponent"
    )

    // define order of categories (any not in here are 0)
    let categOrder = {
        // put these categories at the beginning
        Basic: -5, 
        Layout: -4, 
        Appearance: -3, 
        Formatting: -2, 
        Texture: -1,
        // put these categories at the end
        Data: 1,
        Custom: 2, 
        Hardware: 3, 
        Testing: 4
    }

    let translatableParams = {
        "Before Experiment": "Before JS Experiment", 
        "Begin Experiment": "Begin JS Experiment", 
        "Begin Routine": "Begin JS Routine", 
        "Each Frame": "Each JS Frame", 
        "End Routine": "End JS Routine", 
        "End Experiment": "End JS Experiment"
    }

    // store translated param values
    $effect(() => {
        let output = {}
        // if there's a Code Type param and it's set to auto translate, JS params should be derived
        if (element.params?.["Code Type"]?.val === "Auto->JS") {
            for (let [key, jskey] of Object.entries(translatableParams)) {
                if (element.params[jskey]) {
                    if (python?.ready) {
                        // start off just saying "Translating..."
                        element.params[jskey].val = "// Translating..."
                        // do translation in Python
                        python.liaison.send("app", {
                            command: "try",
                            args: ["psychopy.experiment.py2js_transpiler:translatePythonToJavaScript", element.params[key].val.trim()]
                        }, 10000).then(resp => {
                            if (resp.success) {
                                element.params[jskey].val = resp.result
                            } else {
                                element.params[jskey].val = `// Error in Python code`
                            }
                        }).catch(
                            err => element.params[jskey].val = `// Error in Python code`
                        )
                    }
                }
            }
        }

        return output
    })
</script>

<div class=params-container>
    <!-- pre-notebook params -->
    <div 
        class=uncategorised-params-panel
    >
        {#if element.sortedParams.uncategorised}
            {#each Object.entries(element.sortedParams.uncategorised) as [name, param]}
                {#if ![...hideParams].includes(name)}
                    <ParamCtrl 
                        name={name} 
                        param={param}
                    ></ParamCtrl>
                {/if}
            {/each}
        {/if}
    </div>
    <!-- notebook -->
    {#if Object.keys(element.sortedParams).filter(value => value !== "uncategorised").length}
        <Notebook>
            {#each Object.entries(element.sortedParams).sort(
                (left, right) => (categOrder[left[0]] || 0) - (categOrder[right[0]] || 0)
            ) as [categ, params]}
                {#if !Object.keys(params).every(
                    (value) => hideParams.includes(value)
                ) && categ !== "uncategorised"}
                    <NotebookPage
                        label={categ}
                        data={element}
                        bind:selected={
                            () => {return pageIndex === categ},
                            (value) => {pageIndex = categ}
                        }
                    >
                        <div 
                            class=params-panel
                            style:flex-direction={horizontal ? "row" : "column"}
                            style:width={horizontal ? "65rem" : "45rem"}
                        >
                            <!-- start ctrl, if needed -->
                            {#if "startVal" in params}
                                <StartStopCtrl
                                    name=Start
                                    params={element.startParams}
                                ></StartStopCtrl>
                            {/if}
                            <!-- stop ctrl, if needed -->
                            {#if "stopVal" in params}
                                <StartStopCtrl
                                    name=Stop
                                    params={element.stopParams}
                                ></StartStopCtrl>
                            {/if}
                            <!-- other params -->
                            {#each Object.entries(params) as [name, param]}
                                {#if !["startVal", "startType", "startEstim", "stopVal", "stopType", "durationEstim", ...hideParams].includes(name)}
                                    <ParamCtrl 
                                        name={name} 
                                        bind:param={element.params[name]}
                                    ></ParamCtrl>
                                {/if}
                            {/each}
                        </div>
                    </NotebookPage>
                {/if}
            {/each}
        </Notebook>
    {/if}
</div>

<style>
    .params-panel {
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        gap: 1rem;
        box-sizing: border-box;
        padding: 1rem;
        padding-bottom: 3rem;
        height: 100%;
        min-height: 10rem;
    }
    .uncategorised-params-panel {
        display: grid;
        grid-auto-flow: row;
        align-content: start;
        gap: .5rem;
        width: 100%;
        z-index: 3;
    }
    .params-container {
        padding: 1rem;
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
</style>
