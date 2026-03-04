<script>
    import { electron } from "$lib/globals.svelte";
    import { onMount, setContext } from "svelte";
    import { Menu } from "..";
    import { isHamburger } from ".";
    import { RibbonSection } from '$lib/utils/ribbon';
    import { IconButton } from '$lib/utils/buttons';

    let {
        /** @public @type {import("svelte").store<boolean|undefined>} Whether this menu is shown */
        shown=$bindable(),
        position=$bindable({
            x: undefined,
            y: undefined
        }),
        children=undefined
    } = $props()

    let template = $state([])
    setContext("template", template);

    $effect(async () => {
        if (await isHamburger) {
            // hide electron menu if we have a hamburger
            await electron.windows.hideMenu()
        } else {
            // otherwise, set it up from the template defined by this menu object
            await electron.windows.setMenu(
                $state.snapshot(template)
            )
        }
    })

</script>

{#await isHamburger then hamburger}
    {#if hamburger}
        <RibbonSection>
            <IconButton 
                icon="/icons/btn-hamburger.svg"
                label="Menu"
                onclick={() => shown = true} 
                borderless
            />
            <Menu 
                bind:shown={shown}
                bind:position={position}
                children={children}
            >
                {@render children?.()}
            </Menu>
        </RibbonSection>
    {:else}
        {@render children?.()}
    {/if}
{/await}

