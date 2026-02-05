<script>
    import { Dialog, MessageDialog } from "$lib/utils/dialog";
    import { browseFileSave, writeFile } from "$lib/utils/files.js"
    import { Button } from "$lib/utils/buttons";
    import { Experiment } from "$lib/experiment";
    import { electron } from "$lib/globals.svelte";
    import path from "path-browserify";

    let {
        user={},
        context={},
        shown=$bindable()
    } = $props();

    let report = $state({
        version: "",
        username: "",
        email: "",
        title: "",
        description: "",
        priority: "",
        message: "",
        logs: {
            app: "",
            liaison: ""
        },
    })

    let err = $state({
        shown: false,
        message: undefined
    })

    async function populate() {
        // clear message, title and priority
        report.title = ""
        report.message = ""
        report.priority = ""
        // get version from electron
        report.version = await electron.version()
        // populate user from Pavlovia login if possible
        report.username = user?.profile?.username
        report.email = user?.profile?.email || ""
        // set context
        if (context instanceof Experiment) {
            // JSONify experiment if from Builder
            report.context = context.toJSON()
        }
        if (Array.isArray(context)) {
            // JSONify each page if from Coder
            report.context = context.map(
                page => page.toJSON?.()
            )
        }
        // include logs
        if (electron) {
            let folder = await electron.paths.user()
            report.logs.app = await electron.files.load(path.join(folder, "last_app_load.log"))
            report.logs.liaison = await electron.files.load(path.join(folder, "liaison.log"))
        }
        report.logs.browser = ""
    }

    async function submit(evt) {
        console.log("Sending bug report:", $state.snapshot(report))
        // send to ClickUp via HTTP
        let resp = await fetch("/api/report", {
            method: "POST",
            body: JSON.stringify($state.snapshot(report))
        }).then(
            resp => resp.json()
        )
        console.log("Bug report sent", resp)
        // catch error
        if (resp.err) {
            err.shown = true
            err.message = resp.err
        }
    }
</script>

<Dialog
    title="Submit bug report"
    buttons={{
        OK: submit,
        CANCEL: evt => {}
    }}
    onopen={populate}
    bind:shown={shown}
    shrink
>
    <div class=content>
        <div class=ctrl>
            <span>ClickUp access token (<a href="https://app.clickup.com/4570406/settings/apps" target="_blank">click here to log in and get one</a>)</span>
            <input bind:value={report.token} />
        </div>
        <div class=ctrl>
            Provide a contact email
            <input bind:value={report.email} />
        </div>
        <div class=ctrl>
            Briefly summarise the bug
            <input bind:value={report.title} />
        </div>
        <div class=ctrl>
            Provide a more detailed description (optional)
            <textarea bind:value={report.description} ></textarea>
        </div>
        <div class=ctrl>
            How severe is the bug?
            <select bind:value={report.priority}>
                <option value={1}>Totally prevents me from progressing</option>
                <option value={2}>Requires a hacky workaround to progress</option>
                <option value={3}>Can progress but there's confusing errors/warnings</option>
                <option value={4}>Works but something is unintuitive / could be prettier</option>
            </select>
        </div>
    </div>
</Dialog>

<MessageDialog
    bind:shown={err.shown}
>
    <p>Failed to send report.</p>
    <pre>{err.ECODE}: {err.message}</pre>
    <p>Click below to download the report so you can send it manually:</p>
    <Button 
        label="Download"
        icon="/icons/btn-download.svg"
        onclick={evt => browseFileSave(
            [
                { description: "JSON file", accept: {"text/json": [".json"]} }
            ],
            "./bug_report.json"
        ).then(
            file => writeFile(file, JSON.stringify(report, undefined, 4))
        )}
        horizontal
    />
</MessageDialog>

<style>
    .content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem;
        width: 45rem;
    }

    .ctrl {
        display: flex;
        flex-direction: column;
        gap: .5rem;
    }

    textarea {
        height: 20rem;
        padding: .5rem;
    }
</style>