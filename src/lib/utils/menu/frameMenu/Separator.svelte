<script>
    import { getContext } from "svelte";
    import { MenuSeparator } from "..";
    import { isHamburger } from ".";

    // add separator to backend
    let template = getContext("template")
    template.push({
        type: "separator"
    })

</script>

{#await isHamburger then hamburger}
    {#if hamburger}
        <MenuSeparator />
    {/if}
{/await}