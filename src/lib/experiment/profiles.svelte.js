import FallbackComponentProfiles from "$lib/experiment/fallbacks/components.json";
import FallbackLoopProfiles from "$lib/experiment/fallbacks/loops.json";
import FallbackDeviceProfiles from "$lib/experiment/fallbacks/devices.json";
import FallbackPreferencesProfile from "$lib/preferences.json";
import { python } from "$lib/globals.svelte";


export var profiles = $state({
    components: FallbackComponentProfiles,
    loops: FallbackLoopProfiles,
    devices: FallbackDeviceProfiles,
    preferences: FallbackPreferencesProfile
})

export var pending = $state({
    components: undefined,
    loops: undefined,
    devices: undefined,
    preferences: undefined
})

// get from Python if possible
if (python) {
    // get components
    pending.components = python.liaison.send({
        command: "run",
        args: [
            "psychopy.experiment:getElementProfiles"
        ]
    }, 100000).then(
        data => Object.assign(profiles.components, data)
    )
    // todo: get loops
    // get devices
    pending.devices = python.liaison.send({
        command: "run",
        args: [
            "psychopy.experiment:getDeviceProfiles"
        ]
    }, 10000).then(
        resp => Object.assign(profiles.devices, resp)
    )
    // todo: get prefs
}