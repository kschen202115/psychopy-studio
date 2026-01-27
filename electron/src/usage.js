import { appVersion }  from "./version.js";
import { platform, arch } from "process";
import os from "os"

export class UsageReport {
    constructor() {
        // create base URL object
        this.url = new URL("https://usage.psychopy.org/submit.php")
        // set URL params
        this.url.searchParams.set("time", this.time)
        this.url.searchParams.set("sys", this.sys)
        this.url.searchParams.set("version", this.version)
        this.url.searchParams.set("misc", this.misc)
    }

    send() {
        fetch(
          this.url.toString()
        ).catch(
          // if it fails, take note, but don't error
          err => logging.log(`Failed to send usage statistics: ${err}`)
        )
    }
    get time() {
        // get current time
        let now = new Date(Date.now())
        // get parts
        let parts = {
            year: now.getFullYear(),
            month: (now.getMonth()+1).toString().padStart(2, "0"),
            day: (now.getDate()).toString().padStart(2, "0"),
            hour: (now.getHours()).toString().padStart(2, "0"),
            minutes: (now.getMinutes()).toString().padStart(2, "0")
        }

        return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}:${parts.minutes}`
    }

    get sys() {
        if (platform === "linux") {
            return `Linux_${os.version()}${os.release()}`
        }
        if (platform === "win32") {
            return `win32_v${os.release()}`
        }
        if (platform === "darwin") {
            return `OSX_${os.release()}_${arch}`
        }
    }
    get version() {
        if (appVersion === "dev") {
            return `Studio ${appVersion}`
        } else {
            return `Studio ${appVersion}.${appVersion}`
        }
    }
    
    get misc() {
        return ""
    }
}
