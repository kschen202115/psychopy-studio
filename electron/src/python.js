import proc from "child_process";
import path from "path";
const decoder = new TextDecoder();
import logging from "./logging.js";
import { app, BrowserWindow } from "electron";
import { uv } from "./uv.js"
import { randomUUID } from "node:crypto";
import { appVersion } from "./version.js";


function getConstants() {
  // run module
  let constants = proc.spawn(python.details.executable, [
    "-m", "liaison.constants"
  ])
  // create promise to await response
  return new Promise((resolve, reject) => {
    // resolved to the returned value...
    constants.stdout.once(
      "data", evt => resolve(
        // ...parsed as a JSON
        JSON.parse(
          decoder.decode(evt)
        )
      )
    )
    // timeout after 1s
    setTimeout(evt => reject("Getting Liaison constants timed out"), 10000)
  })
}

export async function startPython() {
  // log start
  logging.log("Starting Python...")
  python.started = true
  // get constants
  python.liaison.constants = await getConstants().catch(err => console.error(err));
  // spawn a Python process
  python.process = proc.spawn(python.details.executable, [
    "-m", "liaison.websocket", python.liaison.address
  ])
  // add listener for errors
  python.process.stderr.on(
    "data", evt => python.output.stderr(evt)
  )
  // add listener to know when process exits
  python.process.on("exit", evt => {
      // log stopped
      logging.log(`Python process stopped, reason: ${evt?.message}`);
  })
  // actions to take on spawn
  python.process.on("spawn", evt => {
    // log started
    logging.log("Python process started");
    // add listener for Liaison waking up
    python.process.stdout.on("data", evt => {
      if (decoder.decode(evt) === `${python.liaison.constants.START_MARKER}@${python.liaison.address}`) {
        // log started
        logging.log("Liaison started")
        // open a websocket
        python.socket = new WebSocket(`ws://${python.liaison.address}`);
        // listen for websocket open/close
        python.socket.onopen = evt => {
          logging.log(`Opened websocket on ws://${python.liaison.address}`);
          // resolve ready promise
          python.liaison.ready.resolve(true);
        }
        python.socket.onclose = evt => logging.error(`Closed websocket on ws://${python.liaison.address}`, evt.reason)
        python.socket.onerror = evt => python.liaison.ready.reject()
        // listen for websocket messages
        python.socket.addEventListener("message", evt => {
          let msg = evt.data;
          // convert data to JSON
          if (msg instanceof Buffer) {
            msg = logging.decoder.decode(evt)
          }
          if (typeof msg === "string") {
            try {
              msg = JSON.parse(msg)
            } catch {}
          }
          // if message includes a tag, send to web contents so listeners can get at it
          if (typeof msg === "object" && "tag" in msg) {
            BrowserWindow.getAllWindows().forEach(
              win => win.webContents.send(`liaison:${msg.tag}`, msg)
            )
          }
        })
        
        // stop listening for wakeup
        python.process.stdout.on(
          "data", evt => python.output.stdout(evt)
        )
      }
    })
    // initial commands to run once Liaison is ready
    python.liaison.ready.promise.then(evt => {
      // start a ping pong to keep the connection alive
      setInterval(
        () => {
          python.liaison.send(
            {
              command: "ping"
            }, 
            30000
          ).catch(
            err => logging.error(`Liaison isn't responding (sent a ping and didn't receive a pong within 30s)`)
          )
        }, 
        30000
      )
      // setup alerts
      python.liaison.send({
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
          err => console.error("Failed to add alert handler", err)
        )
      ).catch(
        err => console.error("Failed to setup alert handler", err)
      )
      // setup prefs
      python.liaison.send({
        command: "register",
        args: ["prefs", "psychopy.preferences:prefs"]
      }, 10000).catch(
        err => console.error(`Failed to load prefs`, err)
      ).then(
        resp => {
          // point to devices json
          python.liaison.send({
            command: "run",
            args: ["prefs.setDevicesFile", path.join(
              app.getPath("appData"), "psychopy4", "devices.json"
            )]
          }, 10000).catch(
            err => console.error(`Failed to set devices file`, err)
          )
          // set prefs from JSON
          python.liaison.send({
            command: "run",
            args: ["prefs.fromJSON", path.join(
              app.getPath("appData"), "psychopy4", "preferences.json"
            )]
          }, 10000).catch(
            err => console.error(`Failed to load preferences`, err)
          )
        }
      )
    }).catch(
      err => logging.error(`Failed to setup preferences`, err)
    )
  })
}

async function stopPython() {
  // kill Python process
  if (python.process) {
    await python.process.kill()
    python.started = false
    python.process = undefined
  }
  // kill websocket
  if (python.socket) {
    await python.socket.close()
    python.socket = undefined
    // remake liaison promises
    python.liaison.ready = Promise.withResolvers(),
    python.liaison.pending = []
  }
}

async function send(msg, timeout=1000) {
  // wait for liaison to exist before sending messages
  await python.liaison.ready.promise
  // wait for other messages to finish (without inheriting their failures)
  await Promise.allSettled(python.liaison.pending).catch(err => {})
  // generate random ID
  let msgid = crypto.randomUUID()
  // log message
  logging.log(msg,`SENT\t${msgid}`, "liaison", false)
  // send message with ident
  python.socket.send(
    JSON.stringify({
      command: msg,
      id: msgid
    })
  );
  // create promise to await a reply
  let promise = new Promise((resolve, reject) => {
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
    // timeout after
    setTimeout(evt => reject({
      error: [`Message timed out: ${JSON.stringify(msg, undefined, 4)}`],
      evt: evt
    }), timeout)
  })
  // store promise in liaison pending
  python.liaison.pending.push(promise)
  
  return promise
}


var scripts = []


function runScript(file, executable, ...args) {
  // if not given, use default executable
  executable = executable || python.details.executable;
  // spawn a process
  let script = proc.execFile(executable, [
    file, ...args
  ], {cwd: path.dirname(file)})
  // store process
  scripts.push(script)
  // log stdout
  script.stdout.on(
    "data", evt => python.output.stdout(evt)
  )
  script.stderr.on(
    "data", evt => python.output.stderr(evt)
  )
  // return a promise linked to its state
  return new Promise((resolve, reject) => {
    script.on(
      "exit", evt => {
        // remove from active scripts array
        delete scripts[scripts.indexOf(script)]
        // log finished
        logging.log(`Finished running ${file}`);
        resolve(evt);
      }
    )
    script.on(
      "error", err => {
        // remove from active scripts array
        delete scripts[scripts.indexOf(script)]
        // log failed
        logging.log(`Failed to run ${file}: ${err.message}`);
        reject(evt.message);
      }
    )
  })
}


class PythonShell {

  tokens = {
    stdout: {
      start: "###START-STDOUT###",
      stop: "###END-STDOUT###"
    },
    stderr: {
      start: "###START-STDERR###",
      stop: "###END-STDERR###"
    },
  }

  constructor() {
    // create process
    this.process = proc.spawn(
      python.details.executable, 
      ['-i'],
      { shell: true }
    );
    this.send("import sys")
  }

  send(msg, timeout=2000) {
    let thusfar = {
      message: [],
      stdout: false,
      stderr: false
    };

    // listen for returned values
    let promise = new Promise((resolve, reject) => {
      for (let src of ["stdout", "stderr"]) {
        this.process[src].on("data", resp => {
          // decode
          let value = decoder.decode(resp)
          // sanitize
          let safevalue = value
            .replaceAll(this.tokens[src].stop, "")
            .replaceAll(">>> ", "")
            .trim()
          // store sanitized value
          if (safevalue) {
            thusfar.message.push(safevalue)
          }
          // stop listening if end of input
          if (value.includes(this.tokens[src].stop)) {
            thusfar[src] = true
            this.process[src].removeAllListeners()
          }
          // if done, resolve
          if (thusfar.stdout && thusfar.stderr) {
            resolve(thusfar.message)
          }
        })
      }

      setTimeout(evt => {
        resolve(thusfar.message)
      }, timeout)
    })
    // store message for return
    thusfar.message.push(
      `>> ${msg}`
    )
    // send message
    this.process.stdin.write(
      `${msg}\nprint("${this.tokens.stdout.stop}", file=sys.stdout)\nprint("${this.tokens.stderr.stop}", file=sys.stderr)\n`
    );
    
    return promise
  }
}


// array with information about/from Python
export const python = {
  details: {
    executable: uv.findPython(),
    dir: path.join(app.getPath("appData"), "psychopy4", ".python", appVersion.major)
  },
  uv: uv,
  start: startPython,
  stop: () => stopPython(),
  started: false,
  scripts: {
    run: runScript,
    stop: () => scripts.forEach(script => script.kill())
  },
  output: {
    stdout: (message) => {
      // if given a buffer, decode it
      if (message instanceof Buffer) {
        message = decoder.decode(message)
      }
      // log message
      logging.log(message, "STDOUT")
      // emit event
      BrowserWindow.getAllWindows().forEach(
        win => win.webContents.send("stdout", message)
      )
    },
    stderr: (message, src) => {
      // if given a buffer, decode it
      if (message instanceof Buffer) {
        message = decoder.decode(message)
      }
      // log message
      logging.log(message, "STDERR")
      // emit event
      BrowserWindow.getAllWindows().forEach(
        win => win.webContents.send("stderr", message)
      )
    },
    liaison: []
  },
  liaison: {
    address: "localhost:8002",
    constants: undefined,
    send: (msg, timeout=1000) => send(msg, timeout).catch(err => {
      throw new Error(err.error?.slice?.(-1), {cause: err.error?.join?.("\n")})
    }),
    ready: Promise.withResolvers(),
    pending: []
  },
  shell: {
    shells: {},
    send: (id, msg) => python.shell.shells[id].send(msg), 
    open: () => {
      let id = randomUUID();
      python.shell.shells[id] = new PythonShell();

      return id
    },
    close: id => {
      python.shell.shells[id].close();
      delete python.shell.shells[id];
    }
  },
  socket: undefined,
  process: undefined
}
