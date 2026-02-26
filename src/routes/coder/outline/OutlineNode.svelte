<script>
    import { TreeNode, TreeBranch } from "$lib/utils/tree"
    import OutlineNode from "./OutlineNode.svelte";
    import { parser as pythonParser } from "@lezer/python";
    import { parser as jsParser } from "@lezer/python"
    import { current } from "../globals.svelte";
    import TreeRoot from "../../../lib/utils/tree/TreeRoot.svelte";

    let {
        content,
        index,
        type,
        name,
        top=false
    } = $props()

    let node = $derived.by(() => {
        // python parser for python files
        if (current.pages[current.tab].file.file.endsWith(".py")) {
            return pythonParser.parse(content)
        }
        // js parser for js files
        if (current.pages[current.tab].file.file.endsWith(".js")) {
            return jsParser.parse(content)
        }
    })

    let subnodes = $derived.by(() => {
        let subnodes = [];
        try {
            node?.iterate?.({
                enter: subnode => {
                    // for function and class defs...
                    if (["FunctionDefinition", "ClassDefinition"].includes(subnode.type.name)) {
                        // get name and content
                        let namenode = subnode.node.getChild("VariableName")
                        let bodynode = subnode.node.getChild("Body")
                        // append details
                        subnodes.push({
                            content: content.slice(bodynode.from, bodynode.to),
                            index: index + subnode.from,
                            type: subnode.type.name,
                            name: content.slice(namenode.from, namenode.to),
                        })
                        // stop iteration
                        return false
                    }
                }
            })
        } catch (err) {
            console.error(err)
        }
        return subnodes
    })

    function navigateTo() {
        // get current page
        let editor = current.pages[current.tab].editor;
        // work out line from character index
        let pos = editor.getModel().getPositionAt(index);
        // jump to line
        editor.revealPosition(pos)
        editor.setPosition(pos)
    }
    
</script>

{#if subnodes.length}
    <TreeBranch
        label={name}
        onselect={navigateTo}
        open={top}
    >
        {#each subnodes as subnode}
            <OutlineNode 
                content={subnode.content}
                index={subnode.index}
                type={subnode.type}
                name={subnode.name}
            />
        {/each}
    </TreeBranch>
{:else if !top}
    <TreeNode 
        label={name}
        onselect={navigateTo}
    />
{/if}
