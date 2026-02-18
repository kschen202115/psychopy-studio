<script>
    let {
        /** @interface */
        ribbon=undefined,
        /** @interface */
        children
    } = $props()
</script>

<div id=frame>
    {#if ribbon}
        {@render ribbon()}
    {/if}
    <div id=content>
        {@render children()}
    </div>
</div>

<style>
#frame {
    display: grid;
    grid-template: min-content 1fr / 1fr;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
}
#content {
    position: relative;
    background-color: var(--crust)
}
</style>