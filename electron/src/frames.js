import path from "node:path";
import fs from "fs";
import proc from "child_process";
import { BrowserWindow, Menu, shell } from "electron";
import logging from "./logging.js";
import { favicon } from "./resources.js";
import { details as svelte } from "./svelte.js";
import { prefs } from "./preferences.js";


export var windows = {
  splash: undefined
};


export async function newWindow(target = null, show = true, fullscreen = false) {
  // create window
  let win = new BrowserWindow({
    icon: favicon,
    width: 1600,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js')
    }
  });
  // prevent default key behaviour for CMD+R
  win.webContents.on("before-input-event", (evt, input) => {
    if (input.modifiers.includes("meta") && input.key.toLowerCase() === "r") {
      evt.preventDefault()
    }
  })
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
 * Create a menu from template received from the frontend
 * 
 * @param {array} template Same as for Menu.buildFromTemplate, but with a frontend callback ID 
 * rather than a function for `click` attributes
 */
export function setMenu(win, template) {
  function setupCallback(entry) {
    if (entry.click) {
      // click callbacks are supplied from the frontend as an ID
      let id = entry.click;
      // create a function which sends this ID back to the frontend to call a function
      entry.click = evt => {
        win.webContents.send(
          `menu:${id}`, true
        )
      }
    }
    // iterate through submenu items
    if (entry.submenu) {
      for (let subentry of entry.submenu) {
        // recur
        setupCallback(subentry)
      } 
    }
  }

  // setup callbacks for items
  for (let entry of template) {
    setupCallback(entry)
  }
  // create menu from template
  let menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}