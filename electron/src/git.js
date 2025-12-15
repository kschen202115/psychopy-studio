import git from "isomorphic-git";
import logging from "./logging.js";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { BrowserWindow } from "electron";


export async function newProject(details, folder, user) {
    // initialise local repo
    await git.init({ 
        fs, 
        dir: folder 
    })
    // add remote
    await git.addRemote({
        fs,
        dir: folder,
        remote: "origin",
        url: `${details.root}/${details.group}/${details.name}.git`
    })
    // push (to create project)
    await sync(folder, user)

    return {
        name: details.name,
        group: details.group,
        local: folder,
        remote: await git.getConfig({
            fs,
            dir: folder,
            path: "remote.origin.url"
        })
    }
}

/**
 * Make sure a local git repo is compatible with isomorphic git
 * 
 * @param {string} folder Folder containing the repo
 */
async function sanitize(folder) {
    // get remote url
    let url = await git.getConfig({
        fs,
        dir: folder,
        path: "remote.origin.url"
    })
    // make sure it ends with .git
    if (!url.endsWith(".git")) {
        await git.setConfig({
            fs,
            dir: folder,
            path: "remote.origin.url",
            value: url + ".git"
        })
    }
}


export async function getRemote(folder, user=undefined) {
    // sanitize remote
    sanitize(folder)
    // get remote URL
    let remote = new URL(
        await git.getConfig({
            fs,
            dir: folder,
            path: "remote.origin.url"
        })
    )
    // apply auth
    if (user) {
        remote.username = "oauth2"
        remote.password = user.token.access
    }

    return remote.toString()
}


export async function getInfo(folder) {
    // get remote URL
    let remote = new URL(
        await git.getConfig({
            fs,
            dir: folder,
            path: "remote.origin.url"
        })
    )
    // get name from remote URL
    let [_, group, name] = remote.pathname.split("/");
    // search projects
    let found = fetch(`https://gitlab.pavlovia.org/api/v4/users/${group}/projects?${name}`)
    return {
        url: await git.getConfig({
            fs,
            dir: folder,
            path: "remote.origin.url"
        })
    }
}


export async function pull(folder, user, force=true) {
    // log
    output(`Getting changes from online...`)
    // fetch changes
    await git.fetch({
        fs,
        http,
        dir: folder,
        remote: "origin",
        author: {
            name: user.profile.name,
            email: user.profile.email
        },
        onAuth: evt => { 
            return { username: "oauth2", password: user.token.access } 
        },
        onMessage: output
    })
    // checkout latest
    await git.checkout({
        fs,
        dir: folder,
        force: force
    })
    output(`Finished getting changes.`)
}


export async function stage(folder) {
    // log
    output(`Scanning for local changes...`)
    // track changed files
    let changed = []
    // iterate through files
    for (let file of fs.globSync("**/*.*", { cwd: folder })) {
        // skip if gitignored or unchanged
        if (["ignored", "unmodified", "*unmodified"].includes(
            await git.status({
                fs,
                dir: folder,
                filepath: file
            })
        )) {
            continue
        }
        // stage
        await git.add({
            fs, 
            dir: folder, 
            filepath: file,
            onMessage: output
        })
        // note change
        changed.push(file)
    }
    // log changes
    if (changed.length) {
        output(`${changed.length} files changed:\n${changed.join("\n")}`)
    } else {
        output("No files changed.")
    }

    return changed
}


export async function commit(message, folder, user) {
    // make commit with message
    let sha = await git.commit({
        fs,
        dir: folder,
        message: message,
        author: {
            name: user.profile.name,
            email: user.profile.email
        }
    })
    // log
    output(`Committed changes: "${message}" (${sha})`)

    return sha
}


export async function push(folder, user, force=false) {
    // log
    output(`Sending changes to Pavlovia...`)
    // push
    await git.push({
        fs,
        http,
        dir: folder,
        remote: "origin",
        onAuth: evt => { 
            return {username: "oauth2", password: user.token.access} 
        },
        force: force,
        onMessage: output
    })
}


export async function sync(folder, user, force=false) {
    output(`Syncing folder ${folder} with Pavlovia (as ${user.profile.username})...`)
    // sanitize repo
    await sanitize(folder)
    // get / create remote
    try {
        let remote = await getRemote(folder, user)
    } catch {
        return
    }
    // pull from remote
    await pull(folder, user)
    // stage all changes
    let sha
    if (await stage(folder)) {
        // make commit
        sha = await commit("Test commit", folder, user)
        // push changes
        await push(folder, user, force)
    } else {
        output("Nothing to push.")
    }
    
    output(`Finished sync`)

    return sha
}


export function output(message) {
    // if given a buffer, decode it
    if (message instanceof Buffer) {
        message = decoder.decode(message)
    }
    // log message
    logging.log(message, "GIT")
    // emit event
    BrowserWindow.getAllWindows().forEach(
        win => win.webContents.send("git", message)
    )
}