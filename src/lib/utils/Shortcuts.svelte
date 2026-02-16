<script>
    import { prefs } from "$lib/preferences.svelte";
    
    let {
        callbacks
    } = $props();

    let held = $state([]);
</script>


<svelte:window 
    onkeydown={evt => {
        // do nothing if default was prevented
        if (evt.defaultPrevented) {
            return
        }
        // mark key as held
        if (!held.includes(evt.key.toUpperCase())) {
            held.push(evt.key.toUpperCase())
        }
        // does it match any shortcut?
        for (let [name, param] of Object.entries(prefs.shortcuts)) {
            if (param.val.every(val => held.includes(val.toUpperCase())) && held.every(val => param.val.includes(val.toUpperCase()))) {
                // clear held keys
                held.length = 0
                // if so, execute method
                callbacks[name]?.()
            }
        }
    }}
    onkeyup={evt => {
        // mark key as no longer held
        if (held.includes(evt.key.toUpperCase())) {
            held.splice(
                held.indexOf(evt.key.toUpperCase())
            )
        }
    }}
/>