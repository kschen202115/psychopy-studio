import { app } from 'electron';
import { getVenv } from "./venv.js";
import logging from "../logging.js";
import { output, decoder } from "./utils.js";
import { appVersion } from "../version.js";
import tcp from "tcp-port-used";
import path from "path";

/**
 * Get an unused localhost address which is safe to start Liaison at
 */
async function getSafeAddress() {
    // start with 8002
    let port = 8002
    // check initially
    let inUse = await tcp.check(port, "localhost")
    // if in use, iterate and try again
    while (inUse) {
        port += 1
        inUse = await tcp.check(port, "localhost")
    }

    return `localhost:${port}`
}


export class Liaison {
    constructor(venv=appVersion) {
        // store venv
        this.venv = venv
        // store self in venv
        this.venv.liaison = this
        // populated upon start
        this.address = undefined
        this.constants = undefined
        this.process = undefined
        this.socket = undefined
        // ready markers
        this.started = false
        this.ready = Promise.withResolvers();
        this.pending = []
    }


    async start() {
        // mark started
        this.started = true
        // get liaison constants
        this.constants = JSON.parse(
            this.venv.execSync([
                "-m", "liaison.constants"
            ], 10000)
        )
        // get a safe address
        this.address = await getSafeAddress()
        // log start
        logging.log(`Starting Liaison at ${this.address}`)
        // spawn a python process
        await new Promise((resolve, reject) => {
            this.process = this.venv.spawn(
                [
                    "-m", "liaison.websocket", this.address
                ],
                {
                    // when we receive the Liaison start message, resolve this promise
                    onstdout: evt => {
                        if (decoder.decode(evt) === `${this.constants.START_MARKER}@${this.address}`) {
                            resolve(evt)
                        }
                    }
                }
            )
            // timeout after 1s
            setTimeout(reject, 10000)
        })
        // create websocket connection
        this.socket = new WebSocket(`ws://${this.address}`);
        // resolve/reject on open/error
        this.socket.onopen = this.ready.resolve
        this.socket.onerror = this.ready.reject
        // timeout after 1s
        setTimeout(this.ready.reject, 1000)
        // wait for websocket open/error
        await this.ready.promise
        // log started
        logging.log("Liaison started")
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
            }, 30000).catch(
                err => logging.error(`Liaison isn't responding (sent a ping and didn't receive a pong within 30s)`)
            ), 30000
        )
        // setup alerts
        if (await this.send({
            command: "exists",
            args: ["psychopy.alerts.liaison:LiaisonAlertHandler"]
        }, 10000)) {
            await this.send({
                command: "init",
                args: ["alerts", "psychopy.alerts.liaison:LiaisonAlertHandler"],
                kwargs: {
                    liaison: "$liaison"
                }
            }, 30000).then(
                resp => this.send({
                    command: "run",
                    args: ["psychopy.alerts:addAlertHandler", "$alerts"]
                }, 30000).catch(
                    err => logging.error(["Failed to add alert handler", err])
                )
            )
        }
        
        // setup prefs
        try {
            this.send({
                command: "register",
                args: ["prefs", "psychopy.preferences:prefs"]
            }, 10000).catch(
                err => logging.error([`Failed to load prefs`, err])
            ).then(
                async resp => {
                    // point to devices json
                    await this.send({
                        command: "try",
                        args: ["prefs.setDevicesFile", path.join(
                            app.getPath("appData"), "psychopy4", "devices.json"
                        )]
                    }, 10000).catch(
                        err => logging.error([`Failed to set devices file`, err])
                    )
                    // set prefs from JSON
                    await this.send({
                        command: "try",
                        args: ["prefs.fromJSON", path.join(
                            app.getPath("appData"), "psychopy4", "preferences.json"
                        )]
                    }, 10000).catch(
                        err => logging.error([`Failed to load preferences`, err])
                    )
                }
            )
        } catch (err) {
            // todo: this fails on <2026.0, how can we get prefs otherwise?
            err => logging.error(`Failed to setup preferences`, err)
        }
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

    async send(msg, timeout=undefined) {
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
        this.pending.push(promise.promise)
        // setup timeout
        if (timeout) {
            setTimeout(evt => promise.reject({
                error: [`Message timed out: ${JSON.stringify(msg, undefined, 4)}`],
                evt: evt
            }), timeout)
        }
        // define listener to find reply then remove itself
        let lsnr = evt => {
            // parse reply
            let data = JSON.parse(evt.data)
            // check ID
            if (data.evt.id !== msgid) {
                return
            }
            // if ID matches, store and stop listening
            this.socket.removeEventListener("message", lsnr)
            // resolve or reject
            if ("response" in data) {
                // log reply
                logging.log(data.response, `RECEIVED\t${msgid}`, "liaison", false)
                // resolve
                promise.resolve(data.response)
            } else {
                // log error
                logging.log(data.error, `ERROR\t${msgid}`, "liaison", false)
                // reject
                promise.reject(data)
            }
        }
        // listen for reply
        this.socket.addEventListener("message", lsnr)
        
        return promise.promise
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
export async function getLiaison(version) {
    // substitute "app" for app version
    if (version === "app") {
        version = appVersion
    }
    // get venv for this version
    let venv = await getVenv(version)
    // get/make liaison for it
    if (venv.liaison) {
        return venv.liaison
    } else {
        let output = new Liaison(venv)
        return output
    }
}
