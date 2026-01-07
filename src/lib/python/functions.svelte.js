import { status } from "./globals.svelte.js"


export async function setupPython(forceReinstall=false) {
    // abort if on browser
    if (!python) {
        status.ready.resolve()
        return
    }
    // new promises
    status.ready = Promise.withResolvers();
    status.dismiss = Promise.withResolvers();
    // once status resolves, dismiss message after a brief pause
    status.ready.promise.finally(
        val => setTimeout(evt => status.dismiss.resolve(val), 2000)
    )
    // do we already have UV and Python?
    status.message = "Checking Python..."
    let hasUV = await python.uv.exists().catch(err => status.ready.reject(err?.error || err))
    let hasPython = await python.uv.findPython().catch(err => status.ready.reject(err?.error || err))
    // install UV
    if (!hasUV || forceReinstall) {
        // kill any existing process
        await python.stop()
        // open dialog to show progress
        status.message = "Downloading UV (a Python installer)..."
        status.dlg.message = (
            "### Downloading UV...\n (a Python installer)...\n" + 
            "This is a program we use to install Python. Once it's finished installing, you won't have to see this message again."
        )
        status.dlg.shown = true
        status.dlg.busy = true
        // do install
        await python.uv.installUV().catch(err => status.ready.reject(err?.error || err))
        status.dlg.busy = false
    }
    // install Python
    if (!hasPython || forceReinstall) {
        // kill any existing process
        await python.stop()
        // open dialog to show progress
        status.message = "Installing Python and PsychoPy library..."
        status.dlg.message = (
            "### Installing Python and PsychoPy library...\n" +
            "This may take some time and, unfortunately, cannot be done in the background. Once it's finished installing, you won't have to see this message again."
        )
        status.dlg.shown = true
        status.dlg.busy = true
        // do install
        await python.uv.installPython().catch(err => status.ready.reject(err?.error || err))
        status.dlg.busy = false
    }
    // is Python already running?
    status.message = "Connecting Python"
    if (await python.started()) {
        // mark as connected
        status.message = "Connected Python"
        status.ready.resolve(true)
    } else {
        // start python
        status.message = "Starting Python..."
        await python.start().catch(err => status.ready.reject(err?.error || err))
        // activatePlugins
        status.message = "Activating plugins..."
        await python.liaison.send({
            command: "run",
            args: ["psychopy.plugins:activatePlugins"]
        }, 20000).catch(err => status.ready.reject(err?.error || err))
        // mark success
        status.message = "Successfully started Python"
        status.ready.resolve(true)
    }

    return python
}