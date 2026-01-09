<script>
    import { marked } from "marked";
    import { Dialog } from "$lib/utils/dialog";
    import { openIn } from "$lib/utils/views.svelte";

    let {
        script,
        shown=$bindable()
    } = $props()
</script>


<Dialog
    title={script.file.name}
    bind:shown={shown}
    buttons={{
        OK: evt => {},
        EXTRA: {
            Edit: evt => openIn(script.file, "coder"),
            Refresh: evt => script.fromFile(script.file)
        }
    }}
    buttonsDisabled={{
        EXTRA: {
            Edit: !script.file?.parent,
            Refresh: !script.file?.parent
        }
    }}
>
    <div class=readme-preview>
        {@html marked(script.content || "")}
    </div>
</Dialog>

<style>
    .readme-preview {
        width: 65rem;
        min-height: 100%;
        box-sizing: border-box;
        padding: 1rem 2rem;
        background-color: var(--base);
    }
</style>