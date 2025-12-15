import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";


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
export async function sanitize(folder) {
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


export async function sync(folder, user, force=false) {
    // sanitize repo
    await sanitize(folder)
    // get remote URL
    let remote = new URL(
        await git.getConfig({
            fs,
            dir: folder,
            path: "remote.origin.url"
        })
    )
    // apply auth
    remote.username = "oauth2"
    remote.password = user.token.access
    // check whether remote exists
    let remoteExists
    try {
        await git.getRemoteInfo({
            http,
            url: remote.toString()
        })
        remoteExists = true
    } catch {
        remoteExists = false
    }
    // if remote exists, pull from it
    if (remoteExists) {
        await git.pull({
            fs,
            http,
            dir: folder,
            author: {
                name: user.profile.name,
                email: user.profile.email
            },
            onAuth: evt => { 
                return { username: "oauth2", password: user.token.access } 
            },
            fastForwardOnly: true
        })
    }
    // stage all changes
    for (let file of fs.globSync("*", { cwd: folder })) {
        // skip if gitignored
        if (await git.isIgnored({
            fs, 
            dir: folder, 
            filepath: file
        })) {
            continue
        }
        // stage
        await git.add({
            fs, 
            dir: folder, 
            filepath: file
        })
    }
    // make commit
    let sha = await git.commit({
        fs,
        dir: folder,
        message: "Test commit",
        author: {
            name: user.profile.name,
            email: user.profile.email
        }
    })
    // push changes
    await git.push({
        fs,
        http,
        dir: folder,
        onAuth: evt => { 
            return {username: "oauth2", password: user.token.access} 
        },
        force: force
    })

    return sha
}