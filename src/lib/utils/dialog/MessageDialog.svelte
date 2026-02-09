<script>
    import Dialog from "./Dialog.svelte";

    let {
        id,
        /** @prop @type {String} Text to display in the title bar of this dialog */
        title="",
        /** @prop @type {OK: function|undefined, APPLY: function|undefined, CANCEL: function|undefined, HELP: string|undefined} Standard dialog buttons to display, with additional callback functions (or navigation link, in the case of HELP) */
        buttons={
            OK: undefined,
            APPLY: undefined,
            YES: undefined,
            NO: undefined,
            CANCEL: undefined,
            HELP: undefined
        },
        /** @bindable State controlling whether each button is disabled */
        buttonsDisabled={},
        /** @returns @type {HTMLElement} Handle of this dialog's HTML Element */
        shown=$bindable(),
        /** @prop Children are assumed to be the message */
        children=undefined
    } = $props();
</script>

<Dialog
    id={id}
    title={title}
    buttons={buttons}
    buttonsDisabled={buttonsDisabled}
    bind:shown={shown}
    shrink={true}
>
    <div class="dlg-message">
        {@render children?.()}
    </div>
</Dialog>

<style>
    .dlg-message {
        padding: 1rem;
        max-width: 45rem;
        min-width: 30rem;
        min-height: 10rem;
    }
</style>