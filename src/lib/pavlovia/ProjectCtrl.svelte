<script>
    import { DropdownButton } from "$lib/utils/buttons";
    import { getContext, onMount } from "svelte";
    import { projects } from "./pavlovia.svelte";
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
</script>

<DropdownButton
    label={current.project ? `${current.project.group}/${current.project.name}` : "No project"}
    icon={current.project ? current.project.avatar_url : undefined}
    onclick={(evt) => {
        if (current.project) {
            window.open(current.project.remote)
        }
    }}
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
        onclick={evt => window.open(current.project.remote, "_blank")}
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