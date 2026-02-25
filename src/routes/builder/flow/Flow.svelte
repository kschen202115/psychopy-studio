<script>
    import { FlowLoop } from "$lib/experiment/flow.svelte";
    import LoopNode from './Loop.svelte';
    import RoutineNode from './Routine.svelte';
    import EntryPoint from './EntryPoint.svelte';
    import { getContext } from "svelte";
    import { Icon } from "$lib/utils/icons";
    
    let current = getContext("current");

</script>

<div class=flow-canvas>
    <div class="flow">
        <div class=flowline-container>
            <div class=flowline></div>
            <div class=flowline-arrow>
                <Icon 
                    src="/icons/sym-arrow-right.svg"
                    size=".75rem"
                />
            </div>
        </div>
        {#if current.experiment}
            {#each current.experiment.flow.dynamic as emt}
                <div class=flow-animation>
                    {#if emt instanceof FlowLoop}
                        <LoopNode bind:element={emt} />
                    {:else}
                        <RoutineNode bind:element={emt} />
                    {/if}
                </div>
            {/each}
        {/if}
        <EntryPoint index=-1></EntryPoint>
    </div>
</div>

<style>
    .flow, .flow-animation {
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: start;
        gap: 1rem;
    }
    .flow {
        padding: 2rem;
        padding-top: 0;
    }
    .flowline-container {
        border-left: 2px solid var(--outline);
        position: absolute;
        top: -1rem;
        left: 0;
        right: 0;
        z-index: 0;
    }
    .flowline {
        border-top: 1px solid var(--outline);
        margin: 1rem 0;
    }
    .flowline-arrow {
        position: absolute;
        left: calc(100% - 1px);
        top: calc(1rem + 1px);
        transform: translateY(-50%);
    }
    .flow-canvas {
        padding: 1rem;
        padding-top: 3rem;
        display: flex;
        align-items: start;
        overflow: auto;
    }
</style>