<script>
    import { DropdownButton } from "$lib/utils/buttons";
    import { getContext, onMount } from "svelte";
    import { login, logout, users } from "./pavlovia.svelte";
    import { MenuItem, MenuSeparator, SubMenu } from "$lib/utils/menu";
    import { electron } from "$lib/globals.svelte";

    let current = getContext("current");

    onMount(async () => {
        // no saved users if not in electron
        if (!electron) {
            return;
        }
        // get file path
        let file = await electron.paths.pavlovia.users();
        let dir = await electron.paths.pavlovia.dir();
        // make sure pavlovia folder exists
        if (!(await electron.files.exists(dir))) {
            await electron.files.mkdir(dir);
        }
        // make sure users.json exists
        if (!(await electron.files.exists(file))) {
            await electron.files.save(file, "{}");
        }
        // get file contents
        let content = await electron.files.load(file);
        // parse JSON
        let data = JSON.parse(content);
        // apply
        Object.assign(users, data);
    });
</script>

<DropdownButton
    label={current.user ? current.user.profile.name : "No user"}
    onclick={(evt) => {
        if (current.user) {
            window.open(current.user.profile.web_url);
        }
    }}
>
    <MenuItem
        label="Edit user..."
        icon="/icons/btn-edit.svg"
        onclick={evt => window.open("https://gitlab.pavlovia.org/-/profile", "_blank")}
    />
    <SubMenu label="Switch user...">
        {#each Object.values(users) as user}
            <MenuItem
                label={user.profile.name}
                onclick={(evt) =>
                    login(user.profile.username).then(
                        (username) => (current.user = users[username]),
                    )}
            />
        {/each}
        <MenuSeparator />
        <MenuItem
            label="New user..."
            onclick={(evt) =>
                login().then((username) => (current.user = users[username]))}
        />
    </SubMenu>
    <MenuSeparator />
    {#if current.user}
        <MenuItem
            label="Logout"
            onclick={(evt) => {
                logout();
                current.user = undefined;
            }}
        />
    {:else}
        <MenuItem
            label="Login"
            onclick={(evt) => {
                if (Object.keys(users).length > 0) {
                    // Try existing user first
                    const lastUser = Object.keys(users)[0];
                    login(lastUser).then(
                        (username) => (current.user = users[username]),
                    );
                } else {
                    // Only do new user flow if no users exist
                    login().then(
                        (username) => (current.user = users[username]),
                    );
                }
            }}
        />
    {/if}
</DropdownButton>
