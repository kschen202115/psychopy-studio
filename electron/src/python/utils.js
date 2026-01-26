import proc from "child_process";
import logging from "../logging.js";
import { BrowserWindow } from "electron";

export const decoder = new TextDecoder();

/**
 * Send some output to the front end
 * 
 * @param {string} tag Channel to send over
 * @param {string|Buffer} message Message to send, can be either bytes or a string
 */
export function output(tag, message) {
    // if given a buffer, decode it
    if (message instanceof Buffer) {
        message = decoder.decode(message)
    }
    // log message
    logging.log(message, tag.toUpperCase())
    // emit event
    BrowserWindow.getAllWindows().forEach(
        win => win.webContents.send(tag, message)
    )
}

/**
 * Execute a function synchronously
 * 
 * @param {string} command Command to run
 * @param {array<string>} args Arguments to pass to child process
 * @param {int} timeout Time (ms) after which to give up
 */
export function execSync(command, args, timeout=1000) {
    // join args 
    let cmd = [command, ...args].join(" ")
    // execute
    let resp = proc.execSync(cmd, {timeout: timeout})
    // decode resp if necessary
    if (resp instanceof Buffer) {
        resp = decoder.decode(resp)
    }
    // strip resp if necessary
    if (typeof resp === "string") {
        resp = resp.trim()
    }

    return resp
}

/**
 * Execute a function with output sent to the front end
 * 
 * @param {string} tag Channel to send any output over
 * @param {string} command Command to run
 * @param {array<string>} args Arguments to pass to child process
 * @param {int} timeout Time (ms) after which to give up
 */
export async function execTracked(tag, command, args, timeout=1000) {
    // execute asynchronously
    let process = proc.spawn(command, args, {timeout: timeout, shell: true})
    // pass output to front end
    process.stdout.on("data", evt => output(tag, evt))
    process.stderr.on("data", evt => output(tag, evt))
    // await completion/error
    let promise = Promise.withResolvers()
    process.on("close", (code, signal) => promise.resolve([code, signal]))
    process.on("error", err => promise.reject(err))

    return promise.promise
}