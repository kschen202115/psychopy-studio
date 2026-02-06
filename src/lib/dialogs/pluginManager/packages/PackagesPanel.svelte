<script>
    import PackageItem from "./PackageItem.svelte";
    import { electron, python } from "$lib/globals.svelte";
    var decoder = new TextDecoder();

    
    import { setContext, untrack } from "svelte";

    let {
        venv=$bindable()
    } = $props()

    let children = $state({
        selected: undefined,
        installed: {},
        all: []
    });
    setContext("siblings", children)

    $effect(() => {
        if (venv) {
            python.venv.getPackages(venv).then(packages => children.installed = packages)
        }
    })

    let searchterm = $state.raw("");

    function matches(term, name) {
        return (
            name.includes(term.toLowerCase()) ||
            term === ""
        )
    }

    function checkPyPi(term) {
        let promise = Promise.withResolvers()

        fetch(`https://pypi.org/pypi/${term}/json`)
        .then(
            resp => resp.ok ? resp.json().then(data => promise.resolve(data)) : promise.reject(resp.status)
        )

        return promise.promise
    }
</script>

<div class=packages-ctrl>
    <div class=packages-list>
        <input type=search bind:value={searchterm} />
        <!-- installed packages first -->
        {#each Object.keys(children.installed) as name}
            {#if matches(searchterm, name)}
                <PackageItem 
                    name={name}
                    bind:venv={venv} 
                    getProfile={name => python.venv.getPackageDetails(venv, name)} 
                />
            {/if}
        {/each}
        <!-- if search matches a pypi package, include that too -->
        {#if searchterm && !Object.keys(children.installed).includes(searchterm)}
            {#await checkPyPi(searchterm).then(resp => resp)}
                Searching PyPi...
            {:then profile}
                {#if profile}
                    <PackageItem 
                        name={searchterm} 
                        bind:venv={venv} 
                        getProfile={name => profile} 
                    />
                {/if}
            {:catch err}
                {""}
            {/await}
        {/if}
    </div>
    <div class=package-details>
        {@render children.selected?.()}
    </div>
</div>


<style>
    .packages-ctrl {
        display: grid;
        width: 65rem;
        grid-template-columns: 20rem 1fr;
        gap: 2rem;
        padding: 1rem;
    }

    .packages-list {
        display: flex;
        flex-direction: column;
        gap: .5rem;
        overflow-y: auto;
    }
</style>