<script>
    import { RadioButton, RadioGroup, CompactButton, Button } from "$lib/utils/buttons"
    import { Experiment } from "$lib/experiment";
    import { Icon } from "$lib/utils/icons";
    import { getContext } from "svelte";
    import { fileOpen } from "../callbacks.svelte";
    
    let current = getContext("current");
</script>

<div class=panel>
    <div class=items>
        <RadioGroup
            bind:value={current.selection}
        >
            {#each Object.entries(current.runlist) as [i, item]}
                <div class=item>
                    <Icon 
                        src="/icons/btn-{item.pilotMode ? "pilot" : "run"}py.svg"
                    />
                    <RadioButton 
                        value={parseInt(i)}
                        label="{item.file.name.length > 40 ? "..." : ""}{item.file.name.slice(-40)}"
                        tooltip={item.file.file}
                        icon="/icons/btn-{item instanceof Experiment ? "builder" : "coder"}.svg"
                    />
                    <CompactButton 
                        icon="/icons/btn-delete.svg"
                        onclick={evt => delete current.runlist[parseInt(i)]}
                    />
                </div>
            {/each}
        </RadioGroup>
    </div>
    <div class=ctrls>
        <Button 
            label="Add file"
            icon="/icons/btn-add.svg"
            onclick={evt => fileOpen(false)}
            horizontal
        />
    </div>
</div>

<style>
.panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    box-sizing: border-box;
    height: 100%;
}
.items {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: .5rem;
    flex-grow: 1;
    overflow-y: auto;
}
.item {
    display: grid;
    grid-template-columns: 1.5rem 1fr min-content;
    gap: .5rem;
    text-wrap: nowrap;
    text-overflow: ellipsis;
    box-sizing: border-box;
    width: 100%;
}
.ctrls {
    display: flex;
    flex-direction: row;
    gap: .5rem;
    justify-content: end;
}
</style>