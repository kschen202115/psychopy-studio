<script>
    import { git } from "$lib/globals.svelte";
    import { showWindow } from "$lib/utils/views.svelte";
    import { getContext } from "svelte";
    import { findProject } from "./pavlovia.svelte";
    import CommitDlg from "./CommitDlg.svelte";
    import NewProjectDlg from "./NewProjectDlg.svelte";

    let current = getContext("current");

    let {
        /** @interface */
        button
    } = $props()


    export async function sync(folder, user, force=false) {
        // if indicated in exp settings, compile JS
        if (current.experiment?.settings?.params?.['exportHTML'].val === "on Sync") {
            await current.experiment.writeScript("PsychoJS")
        }
        // get remote
        let remote = await git.getRemote(folder, user);
        // if there is no remote, create one
        if (remote === null) {
            // prompt to create one
            show.newProject = true;
            if (await awaiting.newProject.promise) {
                // if completed, get details
                remote = await git.getRemote(folder, user);
                // update current project
                current.project = await findProject(current.experiment, current.user)
            } else {
                // if cancelled, return
                git.output("Cancelled by user.")
                return
            }
        }
        // pull from remote
        await git.pull(folder, user, force)
        // stage all changes
        let sha
        if (await git.stage(folder)) {
            // propt to commit
            show.commit = true;
            sha = await awaiting.commit.promise;
            // open runner to capture output
            showWindow("runner")
            // if cancelled, return
            if (!sha) {
                git.output("Cancelled by user.")
                return
            }
            // push changes
            await git.push(folder, user, force)
        } else {
            // open runner to capture output
            showWindow("runner")
            // explain failure
            git.output("Nothing to push.")
        }
        
        git.output(`Finished sync`)

        return sha
    }

    let show = $state({
        newProject: false,
        commit: false
    })
    let awaiting = $state({
        newProject: Promise.withResolvers(),
        commit: Promise.withResolvers()
    })
</script>

{@render button(sync)}

<NewProjectDlg 
    bind:shown={show.newProject}
    bind:awaiting={awaiting.newProject}
/>
<CommitDlg 
    bind:shown={show.commit}
    bind:awaiting={awaiting.commit}
/>