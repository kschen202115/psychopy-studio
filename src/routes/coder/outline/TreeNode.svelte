<script>
    import TreeNode from "./TreeNode.svelte";
    import { parser as pythonParser } from "@lezer/python";
    import { parser as jsParser } from "@lezer/python"
    import { current } from "../globals.svelte";

    let {
        content,
        index,
        type,
        name
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
                            index: subnode.from,
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

    
    
</script>

<div class=tree-node>
    <button
        onclick={evt => {
            let editor = current.pages[current.tab].editor;
            let pos = editor.getModel().getPositionAt(index);
            editor.revealPosition(pos)
            editor.setPosition(pos)
        }}
    >
        {name} ({type})
    </button>
    

    {#each subnodes as subnode}
        <TreeNode 
            content={subnode.content}
            index={subnode.index}
            type={subnode.type}
            name={subnode.name}
        />
    {/each}
</div>

<style>
    .tree-node {
        margin-left: .75rem;
        border-left: 1px solid transparent;
    }
    .tree-node:hover {
        border-color: var(--overlay);
    }
    .tree-node button:hover {
        background-color: var(--mantle);
    }
    .tree-node button {
        padding: .5rem;
        width: 100%;
        box-sizing: border-box;
        text-align: left;
        background-color: transparent;
    }
</style>