<script>
    let {
        param=$bindable(),
        /** @prop @type {boolean} Controls whether this control is disabled */
        disabled=false
    } = $props()
</script>

<input 
    class=param-bool-input 
    type="checkbox" 
    id={param.name}
    bind:checked={param.val} 
    disabled={disabled}
/>

<style>
input[type=checkbox] {
    flex-grow: 0;
    align-self: center;
}
</style>