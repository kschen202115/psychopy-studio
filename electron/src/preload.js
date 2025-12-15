const { ipcRenderer, contextBridge } = require('electron');


// details about Electron process
const electron = {
  windows: {
    new: (target) => ipcRenderer.invoke("electron.windows.new", target).then(resp => resp),
    get: (target) => ipcRenderer.invoke("electron.windows.get", target).then(resp => resp),
    send: (id, tag, data) => ipcRenderer.invoke("electron.windows.send", id, tag, data).then(resp => resp),
    emit: (tag, data) => ipcRenderer.send(tag, data),
    listen: (tag, lsnr) => ipcRenderer.on(tag, lsnr),
    focus: (id) => ipcRenderer.invoke("electron.windows.focus", id).then(resp => resp),
    devtools: (id) => ipcRenderer.invoke("electron.windows.devtools", id).then(resp => resp),
    close: (id) => ipcRenderer.invoke("electron.windows.close", id).then(resp => resp),
  },
  paths: {
    documents: () => ipcRenderer.invoke("electron.paths.documents").then(resp => resp),
    user: () => ipcRenderer.invoke("electron.paths.user").then(resp => resp),
    devices: () => ipcRenderer.invoke("electron.paths.devices").then(resp => resp),
    prefs: () => ipcRenderer.invoke("electron.paths.prefs").then(resp => resp),
    pavlovia: {
      dir: () => ipcRenderer.invoke("electron.paths.pavlovia").then(resp => resp),
      users: () => ipcRenderer.invoke("electron.paths.pavlovia.users").then(resp => resp),
      projects: () => ipcRenderer.invoke("electron.paths.pavlovia.projects").then(resp => resp),
    }
  },
  files: {
    load: (file) => ipcRenderer.invoke("electron.files.load", file).then(resp => resp),
    save: (file, content) => ipcRenderer.invoke("electron.files.save", file, content).then(resp => resp),
    exists: (file) => ipcRenderer.invoke("electron.files.exists", file).then(resp => resp),
    stat: (file) => ipcRenderer.invoke("electron.files.stat", file).then(resp => resp),
    mkdir: (path, recursive=true) => ipcRenderer.invoke("electron.files.mkdir", path, recursive).then(resp => resp),
    openDialog: (options) => ipcRenderer.invoke("electron.files.openDialog", options).then(resp => resp),
    saveDialog: (options) => ipcRenderer.invoke("electron.files.saveDialog", options).then(resp => resp),
    scandir: (root) => ipcRenderer.invoke("electron.files.scandir", root).then(resp => resp),
    showItemInFolder: (folder) => ipcRenderer.invoke("electron.files.showItemInFolder", folder),
    openPath: (path) => ipcRenderer.invoke("electron.files.openPath", path),
    openExternal: (url) => ipcRenderer.invoke("electron.files.openExternal", url)
  },
  clipboard: {
    get: () => ipcRenderer.invoke("electron.clipboard.get").then(resp => resp),
    set: (value) => ipcRenderer.invoke("electron.clipboard.set", value).then(resp => resp)
  },
  authenticatePavlovia: (url) => ipcRenderer.invoke("electron.authenticatePavlovia", url).then(resp => resp),
  version: () => ipcRenderer.invoke("electron.version").then(resp => resp),
  quit: () => ipcRenderer.invoke("electron.quit")
};
contextBridge.exposeInMainWorld('electron', electron)

// details about Python process
const python = {
  details: () => ipcRenderer.invoke("python.details").then(resp => resp),
  output: () => ipcRenderer.invoke("python.output").then(resp => resp),
  start: () => ipcRenderer.invoke("python.start").then(resp => resp),
  stop: () => ipcRenderer.invoke("python.stop").then(resp => resp),
  started: () => ipcRenderer.invoke("python.started").then(resp => resp),
  uv: {
    dir: () => ipcRenderer.invoke("python.uv.dir").then(resp => resp),
    executable: () => ipcRenderer.invoke("python.uv.executable").then(resp => resp),
    exists: () => ipcRenderer.invoke("python.uv.exists").then(resp => resp),
    installUV: () => ipcRenderer.invoke("python.uv.installUV").then(resp => resp),
    installPython: (version, folder) => ipcRenderer.invoke("python.uv.installPython", version, folder).then(resp => resp),
    findPython: (version, folder) => ipcRenderer.invoke("python.uv.findPython", version, folder).then(resp => resp),
    getEnvironments: (folder) => ipcRenderer.invoke("python.uv.getEnvironments", folder).then(resp => resp),
    installPackage: (name, executable) => ipcRenderer.invoke("python.uv.installPackage", name, executable).then(resp => resp),
    uninstallPackage: (name, executable) => ipcRenderer.invoke("python.uv.uninstallPackage", name, executable).then(resp => resp),
    getPackages: (executable) => ipcRenderer.invoke("python.uv.getPackages", executable).then(resp => resp),
    getPackageDetails: (name, executable) => ipcRenderer.invoke("python.uv.getPackageDetails", name, executable).then(resp => resp),
    output: {
      send: (message) => ipcRenderer.send("uv", message),
      listen: (lsnr) => ipcRenderer.on("uv", lsnr)
    }
  },
  output: {
    stdout: {
      send: (message) => ipcRenderer.send("stdout", message),
      listen: (lsnr) => ipcRenderer.on("stdout", lsnr)
    },
    stderr: {
      send: (message) => ipcRenderer.send("stderr", message),
      listen: (lsnr) => ipcRenderer.on("stderr", lsnr)
    }
  },
  shell: {
    list: () => ipcRenderer.invoke("python.shell.list").then(resp => resp),
    send: (id, msg) => ipcRenderer.invoke("python.shell.send", id, msg).then(resp => resp),
    open: () => ipcRenderer.invoke("python.shell.open").then(resp => resp),
    close: (id) => ipcRenderer.invoke("python.shell.close", id).then(resp => resp)
  },
  liaison: {
    constants: () => ipcRenderer.invoke("python.liaison.constants").then(resp => resp),
    listen: (tag, lsnr) => ipcRenderer.on(`liaison:${tag}`, lsnr),
    send: (message, timeout=1000) => ipcRenderer.invoke("python.liaison.send", message, timeout).then(resp => resp),
    ready: () => ipcRenderer.invoke("python.liaison.ready").then(resp => resp)
  },
  scripts: {
    run: (file, ...args) => ipcRenderer.invoke("python.scripts.run", file, ...args).then(resp => resp),
    stop: () => ipcRenderer.invoke("python.scripts.stop").then(resp => resp),
  }
}
contextBridge.exposeInMainWorld('python', python)

const git = {
  sync: (folder, user) => ipcRenderer.invoke("git.sync", folder, user).then(resp => resp),
  newProject: (details, folder, user) => ipcRenderer.invoke("git.newProject", details, folder, user).then(resp => resp)
}
contextBridge.exposeInMainWorld('git', git)