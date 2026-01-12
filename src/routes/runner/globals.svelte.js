export let current = $state({
    user: undefined,
    selection: undefined,
    runlist: [],
    file: undefined,
    tab: "alerts",
    output: {
        alerts: [],
        stdout: "",
        pavlovia: ""
    },
    awaiting: {
        runpy: Promise.resolve(""),
        runjs: Promise.resolve(""),
    },
    tip: {
        shown: false
    }
})
