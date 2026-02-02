import proc from "child_process";
import logging from "../logging.js";
import { BrowserWindow } from "electron";

export const decoder = new TextDecoder();

/**
 * Send some output to the front end
 * 
 * @param {string} tag Channel to send over (use undefined to not emit an event)
 * @param {string|Buffer} message Message to send, can be either bytes or a string
 */
export function output(tag, message) {
    // if given a buffer, decode it
    if (message instanceof Buffer) {
        message = decoder.decode(message)
    }
    // log message
    logging.log(message, tag?.toUpperCase?.())
    // emit event
    if (tag) {
        BrowserWindow.getAllWindows().forEach(
            win => win.webContents.send(tag, message)
        )
    }
}


/**
 * Log some input to the front end (works the same as logging output, only formatted differently). 
 * 
 * NOTE: this doesn't call the command, just tells the front end what was called.
 * 
 * @param {string} tag Channel to send over (use undefined to not emit an event)
 * @param {string|Buffer} message Message to send, can be either bytes or a string
 */
export function input(tag, message, timeout=undefined) {
    // if given a buffer, decode it
    if (message instanceof Buffer) {
        message = decoder.decode(message)
    }
    // prepend >>
    message = `>> ${message}`
    // append timeout
    if (timeout) {
        message = `${message} (timeout = ${timeout}ms)`
    }
    // send as output with prepended >>
    output(tag, message)
}


/**
 * Execute a function synchronously with output sent to the front end
 * 
 * @param {string} tag Channel to send any output over
 * @param {string} command Command to run
 * @param {array<string>} args Arguments to pass to child process
 * @param {int} timeout Time (ms) after which to give up
 */
export function execSync(tag, command, args, timeout=undefined) {
    // join args 
    let cmd = [command, ...args].join(" ")
    // log input in front end
    input(tag, cmd, timeout)
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
    // pass output to front end
    output(tag, resp)

    return resp
}

/**
 * Execute a function with output sent to the front end
 * 
 * @param {string} tag Channel to send any output over
 * @param {string} command Command to run
 * @param {array<string>} args Arguments to pass to child process
 * @param {int} timeout Time (ms) after which to give up, leave undefined to not timeout
 */
export async function execTracked(tag, command, args, timeout=undefined) {
    // log input in front end
    input(tag, `${command} ${(args || []).join(" ")}`, timeout)
    // execute asynchronously
    let process = proc.spawn(command, args, {timeout: timeout})
    // pass output to front end
    process.stdout.on("data", evt => output(tag, evt))
    process.stderr.on("data", evt => output(tag, evt))
    // await completion/error
    let promise = Promise.withResolvers()
    process.on("close", (code, signal) => promise.resolve([code, signal]))
    process.on("error", err => promise.reject(err))

    return promise.promise
}