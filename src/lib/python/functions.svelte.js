import { status } from "./globals.svelte.js"
import { electron, python } from "$lib/globals.svelte";
import { Version, ppy2py } from "$lib/utils/versions.js";


/**
 * Tries to safely convert an error to a string which can be displayed in the small popup, while 
 * also printing the full thing to console
 * 
 * @param {error} err 
 */
function handleError(err) {
    // get error attribute if there is one
    if ("error" in err) {
        err = err.error
    }
    // log to console
    console.error(err)
    // send to popup
    status.ready.reject(err)
}


export async function installPython(version=undefined, forceReinstall=false) {
    // make sure we have a psychopy version
    if (!version || version === "app") {
        version = await electron.version()
    }
    // remove any dogfood details from version
    try {
        version = Version.parse(version).format("patch")
    } catch {}
    // get python version
    let pyVersion
    if (version === "dev") {
        // for dev or app, assume python 3.10
        pyVersion = "3.10"
    } else {
        // make sure we have a Version object
        version = Version.parse(version)
        // oldest version we can do is 2022.1 as it's the first to use Python >3.8
        if (version.olderThan("2022.1.0")) {
            console.warn(
                `Version ${version.format()} of PsychoPy is not supported in PsychoPy Studio as it `
                + `cannot run in Python >=3.8. Using the oldest compatible version (2022.1).`
            )
            version = new Version("2022.1.*")
        }
        // get python version matching psychopy version
        pyVersion = ppy2py(version)
        // convert back to string (serializable)
        version = version.format()
    }    
    // if installed and not forcing a reinstall, do nothing
    if (!forceReinstall) {
        if (
            await python.uv.findPython(
                version
            ).catch(handleError)
        ) {
            return
        }
    }
    // open dialog to show progress
    status.message = "Installing Python and PsychoPy library..."
    status.dlg.message = (
        `### Installing Python (${pyVersion}) and PsychoPy library (${version ? version : "latest version"})...\n` +
        `This may take some time and, unfortunately, cannot be done in the background. Once it's finished installing, you won't have to see this message again.`
    )
    status.dlg.shown = true
    status.dlg.busy = true
    // create venv
    await python.uv.makeExecutable(
        version, pyVersion
    ).catch(handleError)
    // install packages
    await python.venv.setup(version)
    // mark as done
    status.dlg.busy = false
}


export async function setupPython(version=undefined, forceReinstall=false) {
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
    // make sure we have a psychopy version
    if (!version || version === "app") {
        version = await electron.version()
    }
    // do we already have UV?
    status.message = "Checking Python..."
    let hasUV = await python.uv.exists().catch(handleError)
    // install UV
    if (!hasUV || forceReinstall) {
        // open dialog to show progress
        status.message = "Downloading UV (a Python installer)..."
        status.dlg.message = (
            "### Downloading UV (a Python installer)...\n" + 
            "This is a program we use to install Python. Once it's finished installing, you won't have to see this message again."
        )
        status.dlg.shown = true
        status.dlg.busy = true
        // do install
        await python.uv.install().catch(handleError)
        status.dlg.busy = false
    }
    // do we already have Python?
    let hasPython = await python.uv.findPython(version).catch(handleError)
    // install Python
    if (!hasPython || forceReinstall) {
        // kill any existing process
        // await python.liaison.stop("app")
        await installPython(version, forceReinstall)
    }
    // is Python already running?
    status.message = "Connecting Python"
    if (await python.liaison.started(version)) {
        // mark as connected
        status.message = "Connected Python"
        status.ready.resolve(true)
    } else {
        // start python
        status.message = "Starting Python..."
        await python.liaison.start(version).catch(handleError)
        // mark success
        status.message = "Successfully started Python"
        status.ready.resolve(true)
    }
    // mark python global as ready once Liaison has started
    python.liaison.ready(version).then(
        evt => {
            python.ready = true
        }
    )

    return python
}