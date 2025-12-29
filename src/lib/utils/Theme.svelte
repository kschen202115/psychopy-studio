<script>
    import { prefs } from "$lib/preferences.svelte"
</script>

<svelte:head>
    <svelte:boundary>
        <link 
            rel="stylesheet" 
            href="/themes/{prefs.params.theme.val}.css"
            onerror={
                // fallback to psychopy.css
                evt => evt.target.href = "/themes/psychopy.css"
            }
        >
    </svelte:boundary>
</svelte:head>