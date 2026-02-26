<script>
    import { getContext } from "svelte";
    import TreeNode from "./TreeNode.svelte";
    
    let current = getContext("current");

</script>
<div class=panel>
    {#if current.pages?.[current.tab]}
        <TreeNode 
            content={current.pages[current.tab].content}
            index={1}
            type=Script
            name={current.pages[current.tab].file.name}
            top
        />
    {:else}
        <div class=message>
            No open file
        </div>
    {/if}
</div>

<style>
    .panel {
        background-color: var(--base);
        min-height: 100%;
        box-sizing: border-box;
    }
    .message {
        padding: 1rem;
        box-sizing: border-box;
    }
</style>