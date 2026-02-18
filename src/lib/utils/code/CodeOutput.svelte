<script>
    import CodeEditor from "./CodeEditor.svelte";

    let {
        value=$bindable(),
        /** @interface */
        ctrls=undefined
    } = $props()
</script>

<div class=code-output>
    <CodeEditor 
        value={value}
        language=shell
        lineNumbers={false}
        readonly
    />
    {#if ctrls}
        <div class=ctrls>
            {@render ctrls()}
            
        </div>
    {/if}
</div>

<style>
    .code-output {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        gap: .5rem;
        height: 100%;
        min-width: 55rem;
    }
    .ctrls {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: start;
        padding: .5rem;
        gap: .5rem;
        box-sizing: border-box;
        border-left: 1px solid var(--overlay);
        flex-grow: 0;
    }
</style>