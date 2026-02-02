import { getVenv } from "./venv.js";
import logging from "../logging.js";
import { getSafeAddress } from "./utils.js";


export class PsychoJSServer {
    constructor(cwd) {
        // store cwd
        this.cwd = cwd
        // populated upon start
        this.venv = undefined
        this.address = undefined
        this.process = undefined
        // ready markers
        this.ready = Promise.withResolvers();
        this.pending = []
    }

    static async run(cwd) {
        // create new server
        let server = new PsychoJSServer(cwd)
        
        return await server.start()
    }

    async start() {
        // get app venv
        this.venv = await getVenv("app")
        // mark started
        this.started = true
        // get a safe address
        this.address = await getSafeAddress()
        // store in servers array
        servers[this.address] = this
        // log start
        logging.log(`Starting PsychoJS server at ${this.address}`)
        // spawn a python process
        this.process = this.venv.spawn(
            [
                "-m", "http.server", this.address.replaceAll("localhost:", ""), "--directory", this.cwd
            ]
        )
        this.process.on("spawn", this.ready.resolve)
        this.process.on("error", this.ready.reject)
        // timeout after 1s
        setTimeout(this.ready.reject, 10000)
        // wait until ready
        await this.ready.promise
        logging.log("PsychoJS server started")

        return this.address
    }

    stop() {
        return this.process.kill()
    }
}

const servers = {}


export function getPsychoJSServer(address) {
    return servers[address]
}