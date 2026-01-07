// store progress for setting up Python
export var status = $state({
    ready: Promise.withResolvers(),
    dismiss: Promise.withResolvers(),
    message: "Checking for Python...",
    logs: "",
    dlg: {
        message: "",
        shown: false,
        busy: false
    },
})
