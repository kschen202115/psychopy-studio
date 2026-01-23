import { uv } from "./uv.js";
import { execSync, execTracked, output } from "./utils.js";
import { appVersion } from "../version.js";
import proc from "child_process";
import path from "path";


export class PythonVenv {
    constructor(pythonVersion="3.10", psychopyVersion=appVersion) {
        this.pythonVersion = pythonVersion
        this.psychopyVersion = psychopyVersion
        // populated when `setup` is called
        this.executable = undefined
        // stores refs to running liaison, scripts and shells
        this.liaison = undefined
        this.scripts = []
        this.shells = []
        // store in venvs object
        venvs[this.psychopyVersion] = this
        // try to get Python executable
        this.executable = uv.findPython(this.psychopyVersion)
    }

    /**
     * Setup this virtual environment; make sure it exists and install necessary packages.
     */
    async setup() {
        // make one if there isn't one
        if (!this.executable) {
            this.executable = await uv.makeExecutable(
                psychopyVersion,
                pythonVersion
            )
        }
        // get installed packages so we know what needs installing
        let installed = this.getPackages()
        // make sure all necessary packages are installed
        for (let pkg of [
            // liaison is needed to send/receive messages from the app
            "git+https://github.com/psychopy/liaison[websocket]",
            // esprima and javascripthon are needed for py -> js translation
            "esprima", 
            "git+https://gitlab.com/peircej/metapensiero.pj"
            // psychopy-lib is psychopy without any wx app code
            (
                this.psychopyVersion === "dev"
                // for dev environment, install from dev branch
                ? "git+https://github.com/psychopy/psychopy-lib@dev"
                // otherwise install from pypi
                // todo: switch to package name once on pypi
                : `git+https://github.com/psychopy/psychopy-lib@${this.psychopyVersion}`
            )
        ]) {
            if (!(pkg in installed)) {
                await this.installPackage(pkg)
            }
        }
    }

    /**
     * Install a package or multiple packages to this environment
     * 
     * @param {string|array<string>} name Name, path or URL of the package to install (or an array of these, for multiple packages)
     */
    async installPackage(name) {
        // log start
        uv.output(
            `Installing ${name}...`
        )
        // convert package to an array, if needed
        if (typeof name === "string") {
            name = [name]
        }
        // run uv command to install
        await uv.execTracked([
            "pip", "install", ...name, "--python", this.executable
        ])
        // log done
        uv.output(
            `Finished installing ${name}.`
        )
    }

    /**
     * Uninstall a package or multiple packages from this environment
     * 
     * @param {string|array<string>} name Name, path or URL of the package to uninstall (or an array of these, for multiple packages)
     */
    async uninstallPackage(name) {
        // log start
        uv.output(
            `Uninstalling ${name}...`
        )
        // convert package to an array, if needed
        if (typeof name === "string") {
            name = [name]
        }
        // uninstall
        await execTracked([
            "pip", "uninstall", ...name, "--python", this.executable
        ])
        // log done
        uv.output(
            `Finished uninstalling ${name}.`
        )
    }

    /**
     * List installed packages and their versions
     * 
     * @returns {object<string:string>} Object mapping package names to their version
     */
    getPackages() {
        // get package list from pip
        let resp = uv.execSync([
            "pip", "list", "--python", this.executable, "--format", "json"
        ])
        // parse it
        let parsed = JSON.parse(resp)
        // simplify structure
        let output = {}
        parsed.forEach(
            profile => output[profile.name] = profile.version
        )
    
        return output
    }

    /**
     * Get information about a given package
     * 
     * @param {string} name Package name
     * @returns 
     */
    async getPackageDetails(name) {
        let all = {}
        // use pip show to get details
        let resp = uv.execSync([
            "pip", "show", name, "--python", this.executable
        ])
        // parse as an object
        let local = Object.fromEntries(
            resp.matchAll(/^(.*?): (.*?)$/gm).map(val => [val[1], val[2]])
        );
        // coerce to PyPi esque format and apply
        all.info = {
            name: local.Name,
            version: local.Version,
            requires_dist: local.Requires
        }
        all.releases = {
            [local.Version]: []
        }
        // get package from pypi if possible
        let online
        try {
            // request
            online = await fetch(
                `https://pypi.org/pypi/${name}/json`, 
                { cache: "force-cache" }
            ).then(resp => resp.json());
        } catch {
            // fail silently
            online = {}
        }
        // apply
        Object.assign(all, online)
    
        return pypi
    }

    /**
     * Execute a Python command synchronously
     * 
     * @param {array<string>} args Arguments to execute
     * @param {int} timeout Time (ms) after which to give up
     */
    execSync(args, timeout=1000) {
        return execSync(`"${this.executable}"`, args, timeout)
    }

    /**
     * Spawn a Python process
     * 
     * @param {array<string>} args Arguments to pass on spawn
     */
    spawn(args) {
        // spawn process
        let process = proc.spawn(this.executable, args)
        // add listener for stdout
        process.stdout.on(
            "data", evt => output("stderr", evt)
        )
        // add listener for errors
        process.stderr.on(
            "data", evt => output("stderr", evt)
        )
        // add listener to know when process exits
        process.on("exit", evt => logging.log(
            `Python process stopped, reason: ${evt?.message}`
        ))

        return process
    }
}


/**
 * Get a PythonVenv object from its PsychoPy version
 * 
 * @param {string} version Version string to look for 
 * @returns {PythonVenv}
 */
export function getVenv(version) {
    // substitute "app" for app version
    if (version === "app") {
        version = appVersion
    }
    
    if (version in venvs) {
        // if made, return it
        return venvs[version]
    } else {
        // if environment exists but no object, make one
        for (let env of uv.getEnvironments()) {
            if (env.psychopyVersion === version) {
                return new PythonVenv(
                    env.pythonVersion, 
                    env.psychopyVersion
                )
            }
        }
        // if none exist, error
        throw Error(`Version ${version} of PsychoPy is not installed`)
    }
}


// store created venvs here
export const venvs = {}
