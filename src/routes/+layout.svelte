<script>
    import { onMount } from "svelte";

    onMount(() => {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("/webfs-sw.js", { scope: "/" }).catch((err) => {
            console.warn("Failed to register PsychoPy WebFS service worker", err);
        });
    });
</script>

<slot />
