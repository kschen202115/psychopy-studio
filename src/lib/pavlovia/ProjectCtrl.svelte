<script>
    import { DropdownButton } from "$lib/utils/buttons";
    import { getContext, onMount } from "svelte";
    import { projects, users } from "./pavlovia.svelte";
    import { MenuItem, MenuSeparator, SubMenu } from "$lib/utils/menu";
    import { electron, git } from "$lib/globals.svelte";
    import ManageProjectsDlg from "$lib/dialogs/projects/manage/ManageProjectsDlg.svelte";
    import NewProjectDlg from "./NewProjectDlg.svelte";

    let current = getContext("current")

    onMount(async () => {
        // no saved projects if not in electron
        if (!electron) {
            return
        }
        // get file path
        let file = await electron.paths.pavlovia.projects();
        let dir = await electron.paths.pavlovia.dir();
        // make sure pavlovia folder exists
        if (!(await electron.files.exists(dir))) {
            await electron.files.mkdir(dir);
        }
        // make sure projects.json exists
        if (!(await electron.files.exists(file))) {
            await electron.files.save(file, "{}");
        }
        // get file contents
        let content = await electron.files.load(file);
        // parse JSON
        let data = JSON.parse(content);
        // apply
        Object.assign(projects, data)
    })

    let show = $state({
        manageProjectsDlg: false,
        browseProjectsDlg: false
    })

    $effect(async () => {
        // if we have both an experiment file and a user...
        if (current.experiment?.file?.parent && current.user) {
            // get git remote
            let remote = await git.getRemote(
                $state.snapshot(current.experiment.file.parent), $state.snapshot(current.user)
            ).then(
                remote => remote ? new URL(remote) : remote
            )
            // only continue if there is a remote...
            if (remote) {
                // get name from remote URL
                let [_, group, name] = remote.pathname.match(/\/(.+?)\/(.+?)\.git/)
                // search GitLab
                let found = await fetch(
                    `https://gitlab.pavlovia.org/api/v4/users/${group}/projects?search=${name}&access_token=${current.user.token.access}`
                ).then(
                    resp => resp.json()
                )
                // if we found a project...
                if (found.length) {
                    // ...use its details
                    current.project = found[0]
                    // log and return
                    console.log(`Loaded project ${group}/${name}`, found[0])
                    return
                }
            }
            // if we haven't returned yet, there is no project
            current.project = undefined
        }
    })

    let label = $derived.by(() => {
        if (current.project) {
            if (current.project.owner?.username === current.user?.profile?.username) {
                // if owner is current user, just display name
                return current.project.path 
            } else {
                // otherwise, display group and name
                return `${current.project.namespace?.path}/${current.project.path}`
            }
        } else {
            // if no project, no label
            return "No project"
        }
    })
</script>

<DropdownButton
    label={label}
    onclick={(evt) => {
        if (current.project) {
            window.open(current.project.web_url)
        }
    }}
    disabled={!current.project}
>
    <MenuItem
        label="New project"
        icon="/icons/btn-add.svg"
        onclick={evt => show.newProjectDlg = true}
        disabled={!current.user}
    ></MenuItem>
    <MenuItem
        label="Edit project"
        icon="/icons/btn-edit.svg"
        onclick={evt => window.open(`${current.project.web_url}/edit`, "_blank")}
        disabled={!current.project}
    ></MenuItem>
    <MenuItem
        label="Manage local projects..."
        icon="/icons/btn-edit.svg"
        onclick={(evt) => show.manageProjectsDlg = true}
    ></MenuItem>
    <MenuSeparator/>
    <MenuItem
        label="Search projects..."
        icon="/icons/btn-find.svg"
        onclick={(evt) => show.browseProjectsDlg = true}
    ></MenuItem>
</DropdownButton>

<ManageProjectsDlg 
    bind:shown={show.manageProjectsDlg}
/>
<NewProjectDlg 
    bind:shown={show.newProjectDlg}
/>