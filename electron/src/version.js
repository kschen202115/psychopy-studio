import { app } from "electron";

export function parseVersion(version) {
    // split into year, minor and major
    let [year, major, minor] = version.split(".")
    // return as an object
    return {
        major: `${year}.${major}`,
        minor: minor,
        str: version
    }
}

export const appVersion = app.isPackaged ? app.getVersion() : "dev";

export const isDev = !app.isPackaged;
