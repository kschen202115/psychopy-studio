export async function POST({ request }) {
    // get report information from request
    let snapshot = await request.json();
    // create task
    let data = await fetch("https://api.clickup.com/api/v2/list/128673336/task", {
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
                // set package to PsychoPy Studio
                {
                    id: "1cc82c18-79c6-470b-aa63-b39a108afe90",
                    value: ["39244b7f-eea7-47d2-8760-418d86dc525d"]
                },
                // attach email
                {
                    id: "90ee49a2-01ce-49be-a3bb-c7b12160eb03",
                    value: snapshot.email
                },
                // attach dogfood version
                {
                    id: "e649173f-4f1a-4275-abff-1e699962eda1",
                    value: snapshot.version.match(/(?<=\w+)\d+$/)?.[0] | ""
                }
            ]
        })
    }).then(
        resp => resp.json()
    )
    // attach logs as comments
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
        }).then(
            resp => resp.json()
        )
        
    }
    

    return new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}