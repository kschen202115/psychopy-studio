// if running from electron, these will be set by preload.js, otherwise will be undefined
export var electron = $state(window.electron) 
export var git = $state(window.git)
export var python = $state(window.python)

export var devices = $state({})
export var projects = $state({})
export var users = $state({})