export class PythonShell {

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
    // if given a version, get corresponding venv
    if (typeof venv === "string") {
        venv = getVenv(venv)
    }
    // store venv
    this.venv = venv
    // populated upon start
    this.process = undefined
    // setup completion promises
    this.started = Promise.withResolvers()
    this.started.promise.finally(
        evt => this.venv.shells.push(this)
    )
    this.finished = Promise.withResolvers()
    this.finished.promise.finally(
        evt => delete this.venv.shells[
            this.venv.shells.indexOf(this)
        ]
    )
  }

  start() {
    // create process
    this.process = proc.spawn(
      this.venv.executable, 
      ['-i'],
      { shell: true }
    );
    // import sys from start
    this.send("import sys")
  }

  stop() {
    this.process.kill()
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