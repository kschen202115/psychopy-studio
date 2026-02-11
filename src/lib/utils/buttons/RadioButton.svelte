<script>
    import { getContext, onMount } from "svelte";
    import Icon from "$lib/utils/icons/Icon.svelte";
    import Tooltip from "$lib/utils/tooltip/Tooltip.svelte";

    let {
        value=$bindable(),
        label,
        icon="",
        tooltip="",
        disabled=false
    } = $props();

    let siblings = getContext("siblings");
    siblings.all.push(value)

    let hovered = $state.raw(false);
</script>

<button
    class=radio-btn
    class:selected={siblings.selection === value}
    class:hovered={hovered}
    onmouseenter={() => hovered = true}
    onmouseleave={() => hovered = false}
    onfocusin={() => hovered = true}
    onfocusout={() => hovered = false}
    onclick={evt => siblings.selection = value}
    disabled={disabled}
>
    {#if tooltip}
        <Tooltip
            bind:shown={hovered}
            position="bottom-right"
        >
            {tooltip}
        </Tooltip>
    {/if}

    {#if icon}
        <Icon 
            src={icon}
            size=1rem
        />
    {/if}

    {label}
</button>

<style>
    button {
        position: relative;
        background-color: var(--mantle);
        border: 1px solid var(--overlay);
        border-radius: .5rem;
        transition: border-color .2s, box-shadow .2s, background-color .2s, color .2s;
        box-shadow: 
            inset -1px -1px 2px rgba(0, 0, 0, 0.025)
        ;
        display: flex;
        flex-direction: row;
        gap: .5rem;
        align-items: center;
        text-align: left;
        padding: .5em 1em;
        font-family: var(--body);
        max-width: 100%;
        max-height: 100%;
        opacity: 80%;
    }

    button.selected {
        border-color: var(--blue);
        background-color: var(--base);
        opacity: 100%;
    }

    button:disabled {
        opacity: 50%;
    }
    button:enabled:hover,
    button:enabled:focus {
        outline: none;
        border-color: var(--blue);
        box-shadow: 
            inset 1px 1px 10px rgba(0, 0, 0, 0.05)
        ;
    }   
</style>