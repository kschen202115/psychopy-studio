<script>
    import { prefs } from "$lib/preferences.svelte"
</script>

<svelte:head>
    <link rel="stylesheet" href="/themes/{prefs.params.theme.val}.css">
</svelte:head>