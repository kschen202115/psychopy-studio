<script>
    import { onMount } from "svelte";
    import { electron } from "$lib/globals.svelte";
    import PickerDialog from "$lib/webfs/PickerDialog.svelte";

    onMount(() => {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("/webfs-sw.js", { scope: "/" }).catch((err) => {
            console.warn("Failed to register PsychoPy WebFS service worker", err);
        });
    });
</script>

<slot />

{#if !electron}
    <!-- browser-mode replacement for Electron's open/save dialogs -->
    <PickerDialog />
{/if}
