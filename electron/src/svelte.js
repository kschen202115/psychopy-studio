import proc from "child_process";
import { app } from "electron";
import logging from "./logging.js";
import { isDev } from "./version.js";
import path from "node:path";

// details about the Svelte instance
export var details = {
  address: {
    host: "localhost",
    port: 8003,
  },
  process: undefined,
  ready: Promise.withResolvers()
};


/**
 * Setup API handlers to be called within Svelte
 */
function setupAPI() {
    // API routes
    app.get('/api/plugins', async (req, res) => {
        try {
            const response = await fetch('https://psychopy.org/plugins.json');
            const data = await response.json();
            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/report', express.json(), async (req, res) => {
        try {
        const snapshot = req.body;
        const response = await fetch("https://api.clickup.com/api/v2/list/128673336/task", {
            method: "POST",
            headers: {
            "Authorization": snapshot.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
            },
            body: JSON.stringify({
            name: snapshot.title,
            description: snapshot.description,
            priority: snapshot.priority,
            custom_fields: [
                { id: "1cc82c18-79c6-470b-aa63-b39a108afe90", value: ["39244b7f-eea7-47d2-8760-418d86dc525d"] },
                { id: "90ee49a2-01ce-49be-a3bb-c7b12160eb03", value: snapshot.email },
                { id: "e649173f-4f1a-4275-abff-1e699962eda1", value: snapshot.version.match(/(?<=\w+)\d+$/)?.[0] || "" }
            ]
            })
        });
        const data = await response.json();

        for (let [name, content] of [
            ["last_app_load.log", snapshot.logs.app],
            ["liaison.log", snapshot.logs.liaison],
            ["context.json", JSON.stringify(snapshot.context, undefined, 4)]
        ]) {
            await fetch(`https://api.clickup.com/api/v2/task/${data.id}/comment`, {
            method: "POST",
            headers: {
                "Authorization": snapshot.token,
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                notify_all: false,
                comment_text: `${name}\n---\n${content}\n`
            })
            });
        }

        res.json(data);
        } catch (error) {
        res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/surveys', async (req, res) => {
        try {
        const response = await fetch(`https://pavlovia.org/api/v2/surveys?oauthToken=${req.headers.access}`);
        const data = await response.json();
        res.json(data);
        } catch (error) {
        res.status(500).json({ error: error.message });
        }
    });

    // Handle SPA fallback without wildcard
    app.use((req, res) => {
        res.sendFile(path.join(import.meta.dirname, '../../dist/index.html'));
    });
}

/**
 * Start a server running the Svelte app; will run as dev or not according to packaging state
 */
export async function startSvelte() {
    /**
     * Start a vite dev server running the Svelte app
     */
    async function startSvelteDev() {
        logging.log(`Starting Vite dev server at ${details.address.host}:${details.address.port}`)
        // start process
        details.process = proc.exec(
            `vite dev --host=${details.address.host} --port=${details.address.port}`
        );
        // listen to stdout
        details.process.stdout.on("data", msg => {
            // look for ready message
            let readyMatch = msg.match(
                /➜  Local:   http:\/\/(?<host>[\w\d]+):(?<port>[\w\d]+)/
            )
            // if this is it...
            if (readyMatch) {
                // store final host and port
                details.address.host = readyMatch.groups.host
                details.address.port = readyMatch.groups.port
                // mark as ready
                details.ready.resolve()
                // log
                logging.log(
                    `Started Vite dev server at ${details.address.host}:${details.address.port}`
                )
            }
        })

        return details.ready.promise
    }


    /**
     * Start a server hosting the static, packaged Svelte app
     */
    async function startSvelteStatic() {
        logging.log(`Running: ${process.argv.join(" | ")}`)
        // create an "express" server
        let { default: express } = await import('express');
        let server = express();
        // point to the static files
        server.use(
            express.static(path.join(import.meta.dirname, '../../dist'))
        );
        // setup API
        setupAPI()
        // listen for messages
        server.listen(details.address.port, details.address.host, evt => {
            // on first message, mark as ready
            details.ready.resolve();
            // log
            logging.log(`Started static server at ${details.address.host}:${details.address.port}`)
        });
        // emulate command line process
        details.process = { 
            kill: () => server.close() 
        };

        return details.ready.promise
    }

    
    // start Svelte server
    if (isDev) {
        return await startSvelteDev()
    } else {
        return await startSvelteStatic()
    }
}
