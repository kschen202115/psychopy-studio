import { app } from 'electron';
import { getVenv } from "./venv.js";
import logging from "../logging.js";
import { output, decoder } from "./utils.js";
import { appVersion } from "../version.js";


export class Liaison {

    static anyReady = Promise.withResolvers()

    constructor(venv=appVersion, address="localhost:8002") {
        // if given a version, get corresponding venv
        if (typeof venv === "string") {
            venv = getVenv(venv)
        }
        // store venv
        this.venv = venv
        // store self in venv
        this.venv.liaison = this
        // store websocket address
        this.address = address
        // populated upon start
        this.constants = undefined
        this.process = undefined
        this.socket = undefined
        // ready markers
        this.started = false
        this.ready = Promise.withResolvers();
        this.pending = []
        // mark as at least one Liaison being ready
        Liaison.anyReady.resolve()
    }


    async start() {
        this.started = true
        // log start
        logging.log("Starting Liaison...")
        // get liaison constants
        this.constants = this.venv.execSync([
            "-m", "liaison.constants"
        ], 10000)
        // spawn a python process
        this.process = this.venv.spawn([
            "-m", "liaison.websocket", this.address
        ])
        // wait for started message
        await new Promise((resolve, reject) => {
            // look for starrted constant in message
            this.process.stdout.on("data", evt => {
                if (decoder.decode(evt) === `${this.constants.START_MARKER}@${this.address}`) {
                    resolve(evt)
                }
            })
            // timeout after 1s
            setTimeout(reject, 1000)
        })
        // log started
        logging.log("Liaison started")
        // create websocket connection
        this.socket = new WebSocket(`ws://${this.address}`);
        // resolve/reject on open/error
        this.socket.onopen = this.ready.resolve
        this.socket.onerror = this.ready.reject
        // timeout after 1s
        setTimeout(this.ready.reject, 1000)
        // wait for websocket open/error
        await this.ready.promise
        // listen for websocket closing
        this.socket.onclose = evt => logging.error(`Closed websocket on ws://${this.address}`, evt.reason)
        // listen for websocket messages
        this.socket.addEventListener("message", evt => {
            // convert data to JSON
            let msg = evt.data;
            if (msg instanceof Buffer) {
                msg = decoder.decode(msg)
            }
            if (typeof msg === "string") {
                try {
                    msg = JSON.parse(msg)
                } catch {}
            }
            // if message includes a tag, send to web contents so listeners can get at it
            if (typeof msg === "object" && "tag" in msg) {
                this.output(msg.tag, msg)
            }
        })
        // start a ping pong to keep the connection alive
        setInterval(
            () => this.send({
                command: "ping"
            }, 30000)
        ).catch(
            err => logging.error(`Liaison isn't responding (sent a ping and didn't receive a pong within 30s)`)
        )
        // setup alerts
        await python.liaison.send({
            command: "init",
            args: ["alerts", "psychopy.alerts.liaison:LiaisonAlertHandler"],
            kwargs: {
                liaison: "$liaison"
            }
        }, 30000).then(
            resp => python.liaison.send({
                command: "run",
                args: ["psychopy.alerts:addAlertHandler", "$alerts"]
            }, 30000).catch(
                err => logging.error(["Failed to add alert handler", err])
            )
        ).catch(
            err => logging.error(["Failed to setup alert handler", err])
        )
        // setup prefs
        python.liaison.send({
            command: "register",
            args: ["prefs", "psychopy.preferences:prefs"]
        }, 10000).catch(
            err => logging.error([`Failed to load prefs`, err])
        ).then(
            async resp => {
                // point to devices json
                await python.liaison.send({
                    command: "run",
                    args: ["prefs.setDevicesFile", path.join(
                        app.getPath("appData"), "psychopy4", "devices.json"
                    )]
                }, 10000).catch(
                    err => logging.error([`Failed to set devices file`, err])
                )
                // set prefs from JSON
                await python.liaison.send({
                    command: "run",
                    args: ["prefs.fromJSON", path.join(
                        app.getPath("appData"), "psychopy4", "preferences.json"
                    )]
                }, 10000).catch(
                    err => logging.error([`Failed to load preferences`, err])
                )
            }
        ).catch(
            err => logging.error(`Failed to setup preferences`, err)
        )
    }

    async stop() {
        // kill Python process
        if (this.process) {
            await this.process.kill()
            this.process = undefined
        }
        // kill websocket
        if (this.socket) {
            this.socket.close()
            this.socket = undefined
        }
        // ready markers
        this.ready = Promise.withResolvers();
        this.pending = []
    }

    async send(msg, timeout=1000) {
        // wait for liaison to exist before sending messages
        await this.ready.promise
        // wait for other messages to finish (without inheriting their failures)
        await Promise.allSettled(this.pending).catch(err => {})
        // generate random ID
        let msgid = crypto.randomUUID()
        // log message
        logging.log(msg,`SENT\t${msgid}`, "liaison", false)
        // send message with ident
        this.socket.send(
          JSON.stringify({
            command: msg,
            id: msgid
          })
        );
        // create promise and store it in Liaison's array of pending
        let promise = Promise.withResolvers()
        this.pending.push(promise)
        // setup timeout
        setTimeout(evt => promise.reject({
            error: [`Message timed out: ${JSON.stringify(msg, undefined, 4)}`],
            evt: evt
        }), timeout)
        // define listener to find reply then remove itself
        let lsnr = evt => {
            // parse reply
            let data = JSON.parse(evt.data)
            // check ID
            if (data.evt.id !== msgid) {
                return
            }
            // if ID matches, store and stop listening
            python.socket.removeEventListener("message", lsnr)
            // resolve or reject
            if ("response" in data) {
                // log reply
                logging.log(data.response, `RECEIVED\t${msgid}`, "liaison", false)
                // resolve
                resolve(data.response)
            } else {
                // log error
                logging.log(data.error, `ERROR\t${msgid}`, "liaison", false)
                // reject
                reject(data)
            }
        }
        // listen for reply
        python.socket.addEventListener("message", lsnr)
        
        return promise
    }

    output(tag, message) {
        output(`liaison:${tag}`, message)
    }
}


/**
 * Get a Liaison object from its PsychoPy version
 * 
 * @param {string} version Version string to look for 
 * @returns {Liaison}
 */
export function getLiaison(version) {
    // substitute "app" for app version
    if (version === "app") {
        version = appVersion
    }
    // get venv for this version
    let venv = getVenv(version)
    // get/make liaison for it
    if (venv.liaison) {
        return venv.liaison
    } else {
        return new Liaison(venv)
    }
}
