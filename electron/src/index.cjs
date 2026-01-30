const path = require('node:path');
const fs = require("fs");
const proc = require("child_process");
const { app, dialog, BrowserWindow, ipcMain, shell } = require('electron');

// make sure psychopy4 folder exists before importing subpackages
if (!fs.existsSync(path.join(app.getPath("appData"), "psychopy4"))) {
  fs.mkdirSync(
    path.join(app.getPath("appData"), "psychopy4")
  )
}

const { uv } = require("./python/uv.js");
const { venvs, getVenv } = require("./python/venv.js");
const { Liaison, getLiaison } = require("./python/liaison.js");
const { PythonShell } = require("./python/shell.js");
const { PythonScript } = require("./python/script.js");
const git = require("./git.js");
const logging = require("./logging.js");
const { UsageReport } = require("./usage.js")
const { appVersion, isDev } = require('./version.js');

// figure out best file to use for a favicon
var favicon = path.join(__dirname, 'favicon')
if (process.platform === "win32") {
  favicon += ".ico"
} else if (process.platform === "darwin") {
  favicon += ".icns"
} else {
  favicon += "@1024x1024.png"
}

var svelte = {
  address: {
    host: "localhost",
    port: 8003,
  },
  process: undefined
};
var windows = {
  splash: undefined
};

// redirect app gubbins to a subfolder so it's distinct from user data
app.setPath("userData", path.join(app.getPath("appData"), "psychopy4", ".node"))

// load prefs from a JSON (if there is one)
let prefsFile = path.join(app.getPath("appData"), "psychopy4", "preferences.json");
let prefs
if (fs.existsSync(prefsFile)) {
  prefs = JSON.parse(
    fs.readFileSync(prefsFile)
  )
} else {
  prefs = {}
}

// setup a clipboard
clipboard = undefined

// send usage stats
let usageReport = new UsageReport()
if (isDev) {
  console.log(usageReport.url.toString())
} else {
  usageReport.send()
}

// setup listener for file open
function onFileOpen(evt, file) {
  if (!file) {
    // do nothing if no file
    return
  }
  if (file.endsWith(".psyexp")) {
    // open psyexp in Builder
    newWindow(`builder?fileOpen=${file}`, true, false)
  } else if (startFile.endsWith(".psyrun")) {
    // open psyrun in Runner
    newWindow(`runner?fileOpen=${file}`, true, false)
  } else {
    // log anything else and leave default
    logging.error(`Requested file is not a PsychoPy file (.psyexp or .psyrun): ${process.argv[1]}`)
  }
}
app.on("open-file", onFileOpen)

const createWindow = () => {
  // create splash
  windows.splash = new BrowserWindow({
    icon: favicon,
    title: "PsychoPy Studio",
    width: 720,
    height: 400,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true
  });
  windows.splash.loadFile(path.join(__dirname, 'splash.html'));
  windows.splash.center();
  if (prefs.params?.showSplash?.val !== "False") {
    // only show if requested via prefs
    windows.splash.show();
  }
  
  // keep track of ready statuses
  let ready = {
    svelte: Promise.withResolvers()
  }
  // if on windows, get frame to open with from argv
  if (process.platform === "win32") {
    onFileOpen(undefined, process.argv[isDev ? 2 : 1])
  }
  // start timers 
  let mintime = new Promise((resolve, reject) => setTimeout(resolve, prefs.params?.showSplash?.val !== "False" ? 1000 : 0));
  let maxtime = new Promise((resolve, reject) => setTimeout(resolve, 10000));
  // start the svelte side of things
  if (isDev) {
    // use Vite dev server for development
    logging.log(`Starting Vite dev server at ${svelte.address.host}:${svelte.address.port}`)
    svelte.process = proc.exec(`vite dev --host=${svelte.address.host} --port=${svelte.address.port}`);
    svelte.process.stdout.on("data", msg => {
      // look for ready message
      let readyMatch = msg.match(
        /➜  Local:   http:\/\/(?<host>[\w\d]+):(?<port>[\w\d]+)/
      )
      // if this is it...
      if (readyMatch) {
        // store final host and port
        svelte.address.host = readyMatch.groups.host
        svelte.address.port = readyMatch.groups.port
        // mark as ready
        ready.svelte.resolve()
        // log
        logging.log(
          `Started Vite dev server at ${svelte.address.host}:${svelte.address.port}`
        )
      }
    })
  } else {
    // log run args
    logging.log(`Running: ${process.argv.join(" | ")}`)
    // use express to serve static files in production
    const express = require('express');
    const app = express();

    app.use(express.static(path.join(__dirname, '../../dist')));

    // Handle SPA fallback without wildcard
    app.use((req, res) => {
      res.sendFile(path.join(__dirname, '../../dist/index.html'));
    });

    const server = app.listen(svelte.address.port, svelte.address.host, () => {
      logging.log(`Started static server at ${svelte.address.host}:${svelte.address.port}`)
      ready.svelte.resolve();
    });

    svelte.process = { kill: () => server.close() };
  }

  // show when Svelte has loaded and min time has been reached, or when max time has been reached
  Promise.any([
    Promise.all([
      mintime,
      ...Object.values(ready).map(val => val.promise)
    ]),
    maxtime
  ]).then(
    () => {
      // make sure at least one window is open
      if (!Object.keys(windows).filter(key => key !== "splash").length) {
        let targets
        try {
          targets = JSON.parse(prefs.params?.defaultView?.val)
        } catch {
          targets = ["builder"]
        }
        for (let target of targets) {
          newWindow(target, true, false).then(
            // show tips if requested
            id => windows[id].webContents.send(
              "showTips", prefs.params?.showStartupTips?.val === "True"
            )
          )
        }
      }
    }
  )
};


async function newWindow(target = null, show = true, fullscreen = false) {
  // create window
  let win = new BrowserWindow({
    icon: favicon,
    width: 1600,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.removeMenu();
  // open new windows in browser unless opened by electron
  win.webContents.setWindowOpenHandler(
    ({ url }) => {
      shell.openExternal(url);

      return { action: 'deny' }
    }
  )

  // load target URL
  let url = `http://${svelte.address.host}:${svelte.address.port}/${target || ''}`;
  logging.log(`Loading ${url}...`)
  win.loadURL(url);
  // store handle against id
  windows[win.webContents.id] = win;
  // create promise waiting for ready event
  let ready = Promise.withResolvers()
  // show when ready (if requested)
  if (show) {
    // show once ready, if requested
    win.once("ready-to-show", evt => {
      logging.log(`Loaded ${url}`)
      win.show();
      // fulscreen if requested
      if (fullscreen) {
        win.maximize();
      }
      // give focus
      win.focus();
      // make sure the splash screen is closed
      if (!windows.splash.isDestroyed()) {
        windows.splash.close()
      }
      // show dev tools if debugging
      if (prefs?.params?.debugMode?.val === "True") {
        win.webContents.openDevTools();
      }
    })
    // return ID once ready message is received (has to be sent via electron.windows.emit)
    win.webContents.on("ipc-message", (evt, tag) => {
      if (tag === "ready") {
        ready.resolve(win.webContents.id)
      }
    })
  } else {
    // if not showing, return ID once ready to show
    win.once("ready-to-show", evt => ready.resolve(win.webContents.id))
  }
  // wait until ready
  return await ready.promise
}


/**
 * Opens a new BrowserWindow to login to Pavlovia, and waits for it to have a code in the URL
 * 
 * @param {string} url Authentication URL to use
 * @param {string} pattern Regex pattern we expect to be able to use to get the auth code
 */
async function authenticatePavlovia(url) {
  // create window
  let win = new BrowserWindow({
    icon: favicon,
    width: 980,
    height: 720,
    show: true
  });
  win.removeMenu();
  // Clear all storage data to force fresh login
  await win.webContents.session.clearStorageData({
    storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage', 'websql', 'indexdb']
  });
  // load auth url
  win.loadURL(url);
  // construct promise for the auth code
  let code = Promise.withResolvers()
  // on navigate, resolve if we have a code
  win.webContents.on("did-navigate", (evt, url) => {
    // search the URL for the auth code
    let params = new URLSearchParams(
      url.replace(/https:\/\/.*?(?=\?)/, "")
    )
    // if we got one...
    if (params.get("code")) {
      // resolve the promise
      code.resolve(
        params.get("code")
      )
      // close the window
      win.close()
    }
  })

  return code.promise
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
// make sure the Python process is killed on exit
process.on('SIGINT', app.quit);
process.on('SIGTERM', app.quit);
app.on("quit", (evt, code) => {
  // close svelte
  svelte.process.kill(0);
  // close python
  for (let venv of Object.entries(venvs)) {
    venv.liaison?.process?.kill(0)
    if (process.platform !== 'win32' && venv.liaison?.process) {
      // on Linux and Mac, killing the Python process doesn't kill PTB, it has to be killed by PID
      require("process").kill(venv.liaison.process.pid)
    }
  }
})


function getFileTree(folder, recursive = false) {
  let output = [];

  try {
    for (let item of fs.readdirSync(folder, { recursive: false })) {
      console.log(item)
      // construct absolute path
      let abspath = path.join(folder, item);
      // get stats
      let stats = fs.statSync(abspath);
      // construct details
      let details = {
        relpath: item,
        abspath: abspath,
      }
      if (stats.isDirectory()) {
        // if directory, recursively get children
        details.children = getFileTree(abspath)
      } else {
        // if file, get size
        details.size = stats.size / 1000000
      }
      // append
      output.push(details)
    }
  } catch (err) {
    console.error(err)

    return output
  }

  return output
}

/* handlers which can be invoked by electron */

const handlers = {
  electron: {
    windows: {
      new: ipcMain.handle("electron.windows.new", async (evt, target) => await newWindow(target)),
      get: ipcMain.handle("electron.windows.get", (evt, target) => Object.keys(windows).filter(
        id => !windows[id].isDestroyed()
      ).filter(
        id => String(windows[id].webContents.getURL()).includes(target)
      )),
      send: ipcMain.handle("electron.windows.send", (evt, id, tag, data) => windows[id].webContents.send(tag, data)),
      focus: ipcMain.handle("electron.windows.focus", (evt, id) => windows[id || evt.sender.id].focus()),
      devtools: ipcMain.handle("electron.windows.devtools", (evt, id) => windows[id || evt.sender.id].openDevTools()),
      close: ipcMain.handle("electron.windows.close", (evt, id) => windows[id || evt.sender.id].close()),
    },
    paths: {
      documents: ipcMain.handle("electron.paths.documents", (evt) => app.getPath("documents")),
      user: ipcMain.handle("electron.paths.user", (evt) => path.join(app.getPath("appData"), "psychopy4")),
      devices: ipcMain.handle("electron.paths.devices", (evt) => path.join(app.getPath("appData"), "psychopy4", "devices.json")),
      prefs: ipcMain.handle("electron.paths.prefs", (evt) => prefsFile),
      pavlovia: {
        dir: ipcMain.handle("electron.paths.pavlovia", (evt) => path.join(app.getPath("appData"), "psychopy4", "pavlovia")),
        users: ipcMain.handle("electron.paths.pavlovia.users", (evt) => path.join(app.getPath("appData"), "psychopy4", "pavlovia", "users.json")),
        projects: ipcMain.handle("electron.paths.pavlovia.projects", (evt) => path.join(app.getPath("appData"), "psychopy4", "pavlovia", "projects.json")),
      }
    },
    files: {
      load: ipcMain.handle("electron.files.load", (evt, file) => fs.readFileSync(file, { encoding: 'utf8' })),
      save: ipcMain.handle("electron.files.save", (evt, file, content) => fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o777 })),
      exists: ipcMain.handle("electron.files.exists", (evt, file) => fs.existsSync(file)),
      stat: ipcMain.handle("electron.files.stat", (evt, file) => {
        let stat = fs.statSync(file)
        return Object.assign({
          isDirectory: stat.isDirectory(),
          isFile: stat.isFile()
        }, stat)
      }),
      mkdir: ipcMain.handle("electron.files.mkdir", (evt, path, recursive = true) => fs.mkdirSync(path, { recursive: recursive })),
      openDialog: ipcMain.handle("electron.files.openDialog", (evt, options) => dialog.showOpenDialogSync(windows[evt.sender.id], options)),
      saveDialog: ipcMain.handle("electron.files.saveDialog", (evt, options) => dialog.showSaveDialogSync(windows[evt.sender.id], options)),
      scandir: ipcMain.handle("electron.files.scandir", (evt, root, recursive) => fs.readdirSync(root, { recursive: recursive }).sort(
        (a, b) => fs.statSync(path.join(root, b)).isDirectory() - fs.statSync(path.join(root, a)).isDirectory()
      )),
      showItemInFolder: ipcMain.handle("electron.files.showItemInFolder", (evt, folder) => shell.showItemInFolder(folder)),
      openPath: ipcMain.handle("electron.files.openPath", (evt, path) => shell.openPath(path)),
      openExternal: ipcMain.handle("electron.files.openExternal", (evt, url) => shell.openExternal(url))
    },
    clipboard: {
      get: ipcMain.handle("electron.clipboard.get", (evt) => clipboard),
      set: ipcMain.handle("electron.clipboard.set", (evt, value) => clipboard = value)
    },
    authenticatePavlovia: ipcMain.handle("electron.authenticatePavlovia", (evt, url) => authenticatePavlovia(url)),
    version: ipcMain.handle("electron.version", (evt) => appVersion),
    quit: ipcMain.handle("electron.quit", (evt) => app.quit())
  },
  python: {
    liaison: {
      start: ipcMain.handle("python.liaison.start", async (evt, venv) => (await getLiaison(venv)).start()),
      stop: ipcMain.handle("python.liaison.stop", async (evt, venv) => (await getLiaison(venv)).stop()),
      send: ipcMain.handle("python.liaison.send", async (evt, venv, message, timeout) => (await getLiaison(venv)).send(message, timeout)),
      started: ipcMain.handle("python.liaison.started", async (evt, venv) => (await getLiaison(venv)).started),
      ready: ipcMain.handle("python.liaison.ready", async (evt, venv) => await (await getLiaison(venv)).ready.promise)
    },
    venv: {
      setup: ipcMain.handle("python.venv.setup", async (evt, venv) => (await getVenv(venv)).setup()),
      executable: ipcMain.handle("python.venv.executable", async (evt, venv) => (await getVenv()).executable),
      installPackage: ipcMain.handle("python.venv.installPackage", async (evt, venv, name) => (await getVenv(venv)).installPackage(name)),
      uninstallPackage: ipcMain.handle("psychopy.venv.uninstallPackage", async (evt, venv, name) => (await getVenv(venv)).uninstallPackage(name)),
      getPackages: ipcMain.handle("psychopy.venv.getPackages", async (evt, venv) => (await getVenv(venv)).getPackages()),
      getPackageDetails: ipcMain.handle("psychopy.venv.getPackageDetails", async (evt, venv, name) => (await getVenv(venv)).getPackageDetails(name))
    },
    uv: {
      folder: ipcMain.handle("python.uv.folder", (evt) => uv.folder),
      executable: ipcMain.handle("python.uv.executable", (evt) => uv.executable),
      exists: ipcMain.handle("python.uv.exists", (evt) => uv.exists()),
      install: ipcMain.handle("python.uv.install", (evt) => uv.install()),
      makeExecutable: ipcMain.handle("python.uv.makeExecutable", (evt, psychopyVersion, pythonVersion) => uv.makeExecutable(psychopyVersion, pythonVersion)),
      findPython: ipcMain.handle("python.uv.findPython", (evt, version) => uv.findPython(version)),
      getEnvironments: ipcMain.handle("python.uv.getEnvironments", (evt) => uv.getEnvironments())
    },
    shell: {
      list: ipcMain.handle("python.shell.list", async (evt, venv) => Object.keys((await getVenv(venv)).shells)),
      send: ipcMain.handle("python.shell.send", async (evt, venv, id, msg) => (await getVenv(venv)).shells[id].send(msg)),
      open: ipcMain.handle("python.shell.open", async (evt, venv) => {
        let shell = new PythonShell(await getVenv(venv))
        shell.start()

        return shell.id
      }),
      close: ipcMain.handle("python.shell.close", async (evt, venv, id) => (await getVenv(venv)).shells[id].close())
    },
    scripts: {
      run: ipcMain.handle("python.scripts.run", async (evt, venv, file, ...args) => {
        let script = new PythonScript(await getVenv(venv), file, args);
        script.start()

        return script.id
      }),
      finished: ipcMain.handle("python.scripts.finished", async (evt, venv, id) => await (await getVenv(venv)).scripts[id].finished.promise),
      stop: ipcMain.handle("python.scripts.stop", async (evt, venv, id) => (await getVenv(venv)).scripts[id].stop())
    }
  },
  git: {
    output: ipcMain.handle("git.output", (evt, message) => git.output(message)),
    getRemote: ipcMain.handle("git.getRemote", (evt, folder, user) => git.getRemote(folder, user)),
    pull: ipcMain.handle("git.pull", (evt, folder, user, force=true) => git.pull(folder, user, force)),
    stage: ipcMain.handle("git.stage", (evt, folder) => git.stage(folder)),
    commit: ipcMain.handle("git.commit", (evt, message, folder, user) => git.commit(message, folder, user)),
    push: ipcMain.handle("git.push", (evt, folder, user, force=false) => git.push(folder, user, force)),
    newProject: ipcMain.handle("git.newProject", (evt, details, folder, user) => git.newProject(details, folder, user))
  }
};

// make sure user folder exists
if (!fs.existsSync(
  path.join(app.getPath("appData"), "psychopy4")
)) {
  fs.mkdirSync(
    path.join(app.getPath("appData"), "psychopy4"),
    { recursive: true }
  )
}
