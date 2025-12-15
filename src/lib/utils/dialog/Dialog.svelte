<script>
    import { Button } from "$lib/utils/buttons";
    import { untrack } from "svelte";

    let {
        id,
        /** @prop @type {string} Text to display in the title bar of this dialog */
        title="",
        /** @prop @type {OK: function|undefined, APPLY: function|undefined, CANCEL: function|undefined, HELP: string|undefined} Standard dialog buttons to display, with additional callback functions (or navigation link, in the case of HELP) */
        buttons={
            OK: undefined,
            APPLY: undefined,
            YES: undefined,
            NO: undefined,
            CANCEL: undefined,
            HELP: undefined,
            EXTRA: [],
        },
        /** @bindable State controlling whether each button is disabled */
        buttonsDisabled={},
        /** @bindable @type {Boolean} State dictating whether this dialog is shown */
        shown=$bindable(),
        /** @prop @type {Function} Function to execute when this dialog is opened */
        onopen=() => {},
        /** @prop @type {Function} Function to execute when this dialog is closed */
        onclose=() => {},
        /** @prop @type {Boolean} Determines whether the dialog box should shrink to fit its contents */
        shrink=false,
        /** @interface */
        children=undefined
    } = $props();

    let handle;

    $effect(() => {
        if (shown) {
            untrack(() => onopen())
            handle.showModal()
        } else {
            untrack(() => onclose())
            handle.close()
        }
    })

</script>

<dialog 
    id={id} 
    bind:this={handle}
>
    {#if shown}
        <div class="title">
            <label for={id}>{title}</label>
            <div class=gap></div>
            <div class=title-btns>
                <button 
                    id=close
                    onclick={(evt) => {
                        shown = false;
                        if (buttons.CANCEL) {
                            buttons.CANCEL(evt)
                        }
                    }}
                >
                    🞪
                </button>
            </div>
        </div>
        <div 
            class="content"
            style:height={shrink ? "fit-content" : "80vh"}
        >
            {@render children?.()}
        </div>
        <div class="buttons">
            <div class="btn-array extra">
                    {#if buttons.HELP}
                    <Button 
                        label=Help
                        onclick={() => {
                            window.open(buttons.HELP, '_blank').focus();
                        }} 
                        horizontal
                    ></Button>
                    {/if}
            </div>
            <div class=gap></div>
            <div class="btn-array standard">
                {#if buttons.YES}
                <Button 
                    label="Yes"
                    onclick={(evt) => {
                        buttons['YES'](evt);
                        shown = false;
                    }} 
                    affirmative
                    horizontal
                    disabled={buttonsDisabled && buttonsDisabled['YES']}
                ></Button>
                {/if}
                {#if buttons.NO}
                <Button 
                    label="No"
                    onclick={(evt) => {
                        buttons['NO'](evt);
                        shown = false;
                    }} 
                    horizontal
                    negative
                    disabled={buttonsDisabled && buttonsDisabled['NO']}
                ></Button>
                {/if}
                {#if buttons.OK}
                <Button 
                    label="Okay"
                    onclick={(evt) => {
                        buttons['OK'](evt);
                        shown = false;
                    }} 
                    primary
                    horizontal
                    disabled={buttonsDisabled && buttonsDisabled['OK']}
                ></Button>
                {/if}
                {#if buttons.APPLY}
                <Button 
                    label="Apply"
                    onclick={(evt) => {
                        buttons['APPLY'](evt); 
                    }} 
                    horizontal
                    disabled={buttonsDisabled && buttonsDisabled['APPLY']}
                ></Button>
                {/if}
                {#if buttons.EXTRA}
                    {#each Object.entries(buttons['EXTRA']) as [label, onclick]}
                        <Button
                            label={label}
                            onclick={onclick}
                            horizontal
                            disabled={buttonsDisabled && buttonsDisabled['EXTRA'] && buttonsDisabled['EXTRA'][label]}
                        />
                    {/each}
                {/if}
                {#if buttons.CANCEL}
                <Button 
                    label="Cancel"
                    onclick={(evt) => {
                        buttons['CANCEL'](evt); 
                        shown = false;
                    }} 
                    horizontal
                    disabled={buttonsDisabled && buttonsDisabled['CANCEL']}
                ></Button>
                {/if}
            </div>
        </div>
    {/if}
</dialog>

<style>
    :root {
        --panel-padding: .5rem;
    }
    dialog:modal {
        display: grid;
    }
    dialog {
        grid-template-rows: [title] min-content [content] 1fr;
        background-color: var(--mantle);
        border-radius: .25rem;
        outline: none;
        padding: 0;
        border: 1px solid var(--outline);
        width: fit-content;
        height: fit-content;
    }
    dialog .content {
        position: relative;
        overflow-y: auto;
        color: var(--text);
    }
    dialog .title {
        display: grid;
        grid-template-columns: [title] max-content [gap] auto [close] min-content;
        align-items: center;
        justify-items: start;
        padding: .3em 1rem;
        background-color: var(--overlay);
        color: var(--text-on-overlay);
        padding: 0;
    }
    dialog .title label {
        padding: .5rem;
    }
    .title-btns button {
        margin: 0;
        height: 100%;
        width: 100%;
        padding: .5rem 1rem;
        margin: 0;
        border-radius: 0;
        background-color: var(--overlay);
        color: var(--text);
    }
    .title-btns button:enabled:hover {
        background-color: var(--base);
        color: var(--text);
    }
    .title-btns button#close:enabled:hover {
        background-color: var(--red);
        color: var(--text-on-red);
    }

    .buttons {
        display: grid;
        grid-template-columns: [extra] min-content [gap] auto [standard] min-content;
        padding: 1rem;
        padding-bottom: 2rem;
    }
    .btn-array {
        display: flex;
        flex-direction: row;
        gap: 1rem;
    }
</style>