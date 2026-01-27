import { randomUUID } from "node:crypto";
import { output } from "./utils.js";
import proc from "child_process";
import path from "path";


export class PythonScript {
    constructor(venv, file, args) {
        // store venv
        this.venv = venv
        // store file and args
        this.file = file
        this.args = args
        // populated upon start
        this.process = undefined
        // generate random id
        this.id = randomUUID()
        // setup completion promises
        this.started = Promise.withResolvers()
        this.started.promise.finally(
            evt => {
                output("stdout", `Running ${this.file}...`)
                this.venv.scripts[this.id] = this
            }
        )
        this.finished = Promise.withResolvers()
        this.finished.promise.then(
            evt => output("stdout", `Finished running ${this.file}`)
        ).catch(
            err => output("stderr", `Failed to run ${file}: ${err.message}`)
        ).finally(
            evt => delete this.venv.shells[this.id]
        )
    }

    start() {
        // execute asynchronously
        this.process = proc.spawn(
            `"${this.venv.executable}"`, 
            [`"${this.file}"`, ...this.args], 
            {shell: true, cwd: path.dirname(this.file)}
        )
        // log start
        this.started.resolve()
        // pass output to front end
        this.process.stdout.on("data", evt => output("stdout", evt))
        this.process.stderr.on("data", evt => output("stderr", evt))
        // await completion/error
        this.process.on("exit", (code, signal) => this.finished.resolve([code, signal]))
        this.process.on("error", err => this.finished.reject(err))
    }

    stop() {
        this.process.kill()
    }
}