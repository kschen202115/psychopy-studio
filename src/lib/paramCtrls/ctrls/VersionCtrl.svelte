<script>
    import { Version } from "$lib/utils/versions.js";

    let {
        param=$bindable(),
        /** @prop @type {boolean} Controls whether this control is disabled */
        disabled=false,
        /** @interface */
        ...attachments
    } = $props()

    function validateVersion(param, valid) {
        valid.value = true
    }
    
    // construct options live from the param's allowedVals and allowedLabels attributes
    let options = $derived.by(async () => {
        // use allowedVals to get versions from GitHub
        let resp = await fetch(
            `https://api.github.com/repos/${param.allowedVals}/tags`, 
            {method: "GET"}
        );
        let versions = (await resp.json()).map(
            ver => new Version(ver.name)
        ).toSorted(
            (a, b) => a.newer(b) ? 1 : -1 
        )
        // sort by version
        options = {}
        for (let ver of versions) {
            // if minor version not included yet, add a field for it
            if (!(ver.format("minor") in options)) {
                options[ver.format("minor")] = []
            }
            // add to minor version's field
            options[ver.format("minor")].push(
                [ver.format(), ver.format()]
            )
        }
    })
</script>

<select 
    class=param-version-input
    disabled={disabled || param.allowedVals.length == 1} 
    bind:value={param.val}
    style:color={param.valid.value ? "inherit" : "var(--red)"}
    {@attach element => param.registerValidator("version", validateVersion, 0)}
    {...attachments}
>
    {#await options}
        <option value="">Fetching versions from GitHub...</option>
    {:then options}
        <option value="">latest</option>
        {#each Object.entries(options) as [minor, versions]}
            <optgroup label={minor}>
                <option 
                    value={`${minor}.*`} 
                    selected={param.val === `${minor}.*`}
                >latest</option>
                {#each versions as [version, label]}
                    <option 
                        value={version} 
                        selected={param.val === version}
                    >{label}</option>
                {/each}
            </optgroup>
            
        {/each}
    {/await}
</select>

<style>
    .param-version-input {
        flex-grow: 1;
    }
</style>