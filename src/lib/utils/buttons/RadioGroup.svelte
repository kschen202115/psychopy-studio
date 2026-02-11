<script>
    import { setContext } from "svelte";

    let {
        value=$bindable(),
        children
    } = $props();

    let buttons = $state({
        selection: undefined,
        all: []
    })
    setContext("siblings", buttons)
    $effect(() => buttons.selection = value)

</script>

{@render children?.()}
