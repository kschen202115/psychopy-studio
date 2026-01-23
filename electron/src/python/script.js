class PythonScript {
    constructor(venv, file, args) {
        // if given a version, get corresponding venv
        if (typeof venv === "string") {
            venv = getVenv(venv)
        }
        // store venv
        this.venv = venv
        // store file and args
        this.file = file
        this.args = args
        // populated upon start
        this.process = undefined
        // setup completion promises
        this.started = Promise.withResolvers()
        this.started.promise.then(
            evt => output("stdout", `Running ${this.file}...`)
        ).finally(
            evt => this.venv.scripts.push(this)
        )
        this.finished = Promise.withResolvers()
        this.finished.promise.then(
            evt => output("stdout", `Finished running ${this.file}`)
        ).catch(
            err => output("stderr", `Failed to run ${file}: ${err.message}`)
        ).finally(
            evt => delete this.venv.scripts[
                this.venv.scripts.indexOf(this)
            ]
        )
    }

    start() {
        // spawn a process
        this.process = proc.execFile(this.venv.executable, [
            this.file, ...this.args
        ], {cwd: path.dirname(this.file)})
        // log start
        this.process.on(
            "spawn", this.started.resolve
        )
        // log stdout
        this.process.stdout.on(
            "data", evt => output("stdout", evt)
        )
        this.process.stderr.on(
            "data", evt => output("stderr", evt)
        )
        // on finish...
        this.process.on("exit", this.finished.resolve)
        this.process.on("error", this.finished.reject)
    }

    stop() {
        this.process.kill()
    }
}