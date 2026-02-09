<script>
    import { ParamsNotebook } from "$lib/paramCtrls";
    import { Button } from '$lib/utils/buttons';
    import { onMount } from "svelte";

    let {
        component
    } = $props();

    onMount(() => component.restore.set())

    let valid = $derived(
        Object.values(component.params).every(
            param => param.valid.value
        )
    )
</script>

<div class=standalone-routine-canvas>
    <ParamsNotebook 
        bind:element={component}
    />
    <div class=standalone-routine-ctrls>
        <div class=ctrl-gap></div>
        <Button
            label=Apply
            primary
            horizontal
            disabled={!valid}
            onclick={(evt) => component.restore.set()} 
        ></Button>
        <Button
            label=Discard
            horizontal
            onclick={(evt) => component.restore.apply()} 
        ></Button>
    </div>
</div>

<style>
    .standalone-routine-canvas {
        display: grid;
        gap: 1rem;
        grid-template-rows: [canvas] 1fr [ctrls] min-content;
        justify-content: center;
        padding: 1rem;
        height: 100%;
        box-sizing: border-box;
    }
    .standalone-routine-ctrls {
        display: flex;
        flex-direction: row;
        grid-row-start: ctrls;
        gap: 1rem;
        align-items: end;
        padding-bottom: 2rem;
    }
    .ctrl-gap {
        flex-grow: 1;
    }
</style>