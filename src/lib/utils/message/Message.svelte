<script>
    import { Icon } from "$lib/utils/icons";
    import { fly } from "svelte/transition";
    let {
        message,
        icon=undefined,
        onclick=evt => {}
    } = $props()
</script>


<button 
    class=message
    onclick={onclick}
    transition:fly
>
    {#if icon}
        <Icon 
            src={icon}
            size=1.5em
        />
    {/if}
    {message}
</button>

<style>
    .message {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: .5rem;
        background-color: var(--outline);
        color: var(--base);
        border-radius: .5rem;
        padding: .5rem 1rem;
    }
</style>