<script>
    import { getContext } from "svelte";
    import TreeNode from "./TreeNode.svelte";
    
    let current = getContext("current");

</script>
<div class=panel>
    {#if current.pages?.[current.tab]}
        <TreeNode 
            content={current.pages[current.tab].content}
            index={0}
            type=Script
            name={current.pages[current.tab].file.stem}
        />
    {:else}
        No open file
    {/if}
</div>

<style>
    .panel {
        padding: 1rem;
    }
</style>