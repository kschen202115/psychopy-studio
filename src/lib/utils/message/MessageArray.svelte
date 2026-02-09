<script>
    let {
        children
    } = $props();
</script>

<div class=message-array>
    {@render children?.()}
</div>

<style>
    .message-array {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: .5rem;
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        z-index: 10;
    }
</style>