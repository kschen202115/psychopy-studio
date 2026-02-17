<script>
    import { RadioButton } from "$lib/utils/buttons";

    let value = $state.raw()
</script>

<RadioButton 
    bind:selection={value}
    value={{a: 1, b: 2}}
    label=12
/>

<RadioButton 
    bind:selection={value}
    value={{a: 2, b: 3}}
    label=23
/>