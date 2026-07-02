/**
 * Single source of truth for the AI experiment-building tool definitions.
 *
 * Each entry is `{ name, description, input_schema }` (JSON Schema). The
 * Anthropic provider passes these almost verbatim (the Messages API uses
 * `input_schema`); the MCP server maps `input_schema` -> `inputSchema` for
 * `tools/list`. Tool names match the keys in `experimentTools.js` TOOL_FNS.
 *
 * Descriptions state *when* to call each tool (not just what it does) — this
 * measurably improves tool selection on recent Claude models.
 */

export const TOOL_SCHEMAS = [
    {
        name: "list_component_types",
        description:
            "List every component type available to place in a routine, with a short summary and category. Call this first when you are unsure which component implements a stimulus or response (e.g. text, image, keyboard, mouse, sound, polygon).",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
        name: "get_component_schema",
        description:
            "Get the full parameter schema (types, labels, hints, allowed values, defaults) for one component type. Call this before setting parameters you are unsure about, to avoid invalid names or values.",
        input_schema: {
            type: "object",
            properties: { type: { type: "string", description: "Component type, e.g. \"TextComponent\"." } },
            required: ["type"],
            additionalProperties: false,
        },
    },
    {
        name: "get_experiment_state",
        description:
            "Read the current experiment: settings, all routines with their components and parameter values, and the flow order. Call this at the start of a task and after a series of edits to verify the result.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
        name: "present_plan",
        description:
            "Present your build plan to the user for approval. You MUST call this and get the user's approval BEFORE calling any tool that modifies the experiment. Only read tools may be used while planning. After calling this, end your turn and wait — the user approves or requests changes in the UI.",
        input_schema: {
            type: "object",
            properties: {
                summary: { type: "string", description: "One sentence describing the experiment to build." },
                steps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Ordered plan, one sentence each, e.g. \"trial 里加 TextComponent(word) 和 KeyboardComponent(resp)\", \"用 TrialHandler 把 trial 重复 30 次\".",
                },
                assumptions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional: default assumptions you made for anything the user left unspecified.",
                },
            },
            required: ["summary", "steps"],
            additionalProperties: false,
        },
    },
    {
        name: "add_routine",
        description:
            "Create a new empty routine and place it in the flow. A routine is a screen/phase of the experiment that holds components. Returns the final (de-duplicated) name.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Desired routine name; auto-numbered if it clashes." },
                index: {
                    type: "integer",
                    description: "Flow position to insert at; -1 (default) appends to the end.",
                },
            },
            required: ["name"],
            additionalProperties: false,
        },
    },
    {
        name: "remove_routine",
        description: "Delete a routine and remove it from the flow.",
        input_schema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false,
        },
    },
    {
        name: "add_component",
        description:
            "Add a component (stimulus or response) to a routine, optionally setting initial parameters. Use list_component_types to find the type and get_component_schema for valid params.",
        input_schema: {
            type: "object",
            properties: {
                routine: { type: "string", description: "Name of the target routine." },
                type: { type: "string", description: "Component type, e.g. \"TextComponent\", \"KeyboardComponent\"." },
                name: { type: "string", description: "Optional component name; defaults from the type, auto-numbered." },
                params: {
                    type: "object",
                    description: "Map of parameter name -> value to set (e.g. {\"text\": \"Hello\", \"color\": \"red\"}).",
                    additionalProperties: true,
                },
            },
            required: ["routine", "type"],
            additionalProperties: false,
        },
    },
    {
        name: "set_component_params",
        description: "Update one or more parameters of an existing component.",
        input_schema: {
            type: "object",
            properties: {
                routine: { type: "string" },
                component: { type: "string", description: "Name of the component to edit." },
                params: { type: "object", additionalProperties: true },
            },
            required: ["routine", "component", "params"],
            additionalProperties: false,
        },
    },
    {
        name: "remove_component",
        description: "Remove a component from a routine.",
        input_schema: {
            type: "object",
            properties: { routine: { type: "string" }, component: { type: "string" } },
            required: ["routine", "component"],
            additionalProperties: false,
        },
    },
    {
        name: "add_loop",
        description:
            "Wrap a span of the flow (from startRoutine to endRoutine inclusive) in a loop so those routines repeat. Use this for trial repetition and condition files. loopType defaults to \"TrialHandler\".",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Loop name, e.g. \"trials\"." },
                loopType: { type: "string", description: "Loop handler type; defaults to \"TrialHandler\"." },
                startRoutine: { type: "string", description: "First routine inside the loop." },
                endRoutine: { type: "string", description: "Last routine inside the loop; defaults to startRoutine." },
                nReps: { description: "Number of repetitions (number or a $-expression string)." },
                conditionsFile: { type: "string", description: "Optional conditions file path (e.g. \"conditions.xlsx\")." },
            },
            required: ["startRoutine"],
            additionalProperties: false,
        },
    },
    {
        name: "create_conditions_file",
        description:
            "Create a CSV conditions file that drives a loop (TrialHandler). Each row is one trial; each column becomes a variable you reference in component params as $columnName (e.g. text \"$word\", color \"$color\"). Use this instead of hard-coding many components: build ONE trial routine with $-referenced params, then create the conditions file and point the loop at it. Provide the filename to add_loop's conditionsFile, or pass loopName here to attach it to an existing loop.",
        input_schema: {
            type: "object",
            properties: {
                filename: { type: "string", description: "CSV file name, e.g. \"conditions.csv\" (default)." },
                rows: {
                    type: "array",
                    description: "One object per trial; keys are column names (variables). e.g. [{\"word\":\"红\",\"color\":\"red\"},{\"word\":\"绿\",\"color\":\"green\"}].",
                    items: { type: "object", additionalProperties: true },
                },
                loopName: {
                    type: "string",
                    description: "Optional: name of an existing loop to attach this file to (sets its conditions param).",
                },
            },
            required: ["rows"],
            additionalProperties: false,
        },
    },
    {
        name: "move_routine",
        description: "Move an existing routine to a different position in the flow.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string" },
                toIndex: { type: "integer", description: "Target flow index; -1 appends to the end." },
            },
            required: ["name", "toIndex"],
            additionalProperties: false,
        },
    },
    {
        name: "set_experiment_settings",
        description:
            "Set top-level experiment settings (the Experiment Settings dialog), e.g. expName, units, fullscreen. Call get_component_schema with type \"SettingsComponent\" is not needed; common params: expName, Window size, Full-screen window, Units.",
        input_schema: {
            type: "object",
            properties: { params: { type: "object", additionalProperties: true } },
            required: ["params"],
            additionalProperties: false,
        },
    },
];

/** Anthropic Messages API tool list (identical shape — uses input_schema). */
export function anthropicTools() {
    return TOOL_SCHEMAS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

/** OpenAI (and OpenAI-compatible) function-calling tool shape. */
export function openaiTools() {
    return TOOL_SCHEMAS.map(({ name, description, input_schema }) => ({
        type: "function",
        function: { name, description, parameters: input_schema },
    }));
}

export const TOOL_NAMES = TOOL_SCHEMAS.map((t) => t.name);
