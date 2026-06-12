import FallbackComponentProfiles from "$lib/experiment/fallbacks/components.json";
import FallbackLoopProfiles from "$lib/experiment/fallbacks/loops.json";
import FallbackDeviceProfiles from "$lib/experiment/fallbacks/devices.json";
import FallbackPreferencesProfile from "$lib/preferences.json";
import { python } from "$lib/globals.svelte";
import { getLocale } from "$lib/translation";
import { isOfficialBackendClientAvailable, sendOfficialBackendCommand } from "$lib/official/backend.js";


export var profiles = $state({
    components: FallbackComponentProfiles,
    loops: FallbackLoopProfiles,
    devices: FallbackDeviceProfiles,
    preferences: FallbackPreferencesProfile
})

export var profileSources = $state({
    components: "fallback",
    loops: "fallback",
    devices: "fallback",
    preferences: "fallback"
})

export var pending = $state({
    components: Promise.withResolvers(),
    loops: Promise.withResolvers(),
    devices: Promise.withResolvers(),
    preferences: Promise.withResolvers()
})

function applyProfiles(kind, data, source) {
    Object.assign(profiles[kind], data)
    profileSources[kind] = source
    return profiles[kind]
}

async function requestOfficialProfiles(command) {
    if (python?.liaison) {
        return await python.liaison.send("app", {
            command: "run",
            args: [command]
        }, 100000)
    }
    if (isOfficialBackendClientAvailable()) {
        return await sendOfficialBackendCommand(command, {}, { timeout: 100000 })
    }
    throw new Error("No official PsychoPy backend is available for profiles.")
}

export function refreshProfileKind(kind, command) {
    const source = python?.liaison ? "python-liaison" : "official-web-backend"
    const resolver = Promise.withResolvers()
    pending[kind] = resolver
    // Keep Builder usable with local fallback profiles while the official
    // backend request is in flight. On success, mutate only the profile cache
    // with official data; on failure, remain explicitly degraded.
    resolver.resolve(profiles[kind])
    return requestOfficialProfiles(command)
        .then(data => applyProfiles(kind, data, source))
        .catch(err => {
            profileSources[kind] = "fallback"
            console.warn(`Using degraded fallback ${kind} profiles because official profile loading failed.`, err)
            return profiles[kind]
        })
}

async function setOfficialLocale() {
    if (!python?.liaison) return
    return await python.liaison.send("app", {
        command: "try",
        args: [
            "psychopy.localization:setLocale",
            getLocale()
        ]
    })
}

async function loadOfficialProfiles() {
    try {
        await setOfficialLocale()
    } catch (err) {
        console.warn("Failed to set official PsychoPy locale before loading profiles.", err)
    }

    refreshProfileKind("components", "psychopy.experiment:getElementProfiles")
    refreshProfileKind("loops", "psychopy.experiment:getLoopProfiles")
    refreshProfileKind("devices", "psychopy.experiment:getDeviceProfiles")
    pending.preferences.resolve(profiles.preferences)
}

if (python) {
    // Desktop profile loading is tied to the Python setup flow. Seed the
    // Builder immediately from bundled fallback profiles so the UI remains
    // usable before the app liaison finishes starting.
    pending.components.resolve(profiles.components)
    pending.loops.resolve(profiles.loops)
    pending.devices.resolve(profiles.devices)
    pending.preferences.resolve(profiles.preferences)
    python.liaison.ready("app").then(loadOfficialProfiles).catch(err => {
        console.warn("Using degraded fallback profiles because Python liaison did not become ready.", err)
    })
} else {
    loadOfficialProfiles()
}
