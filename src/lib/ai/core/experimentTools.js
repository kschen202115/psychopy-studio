/**
 * Environment-agnostic "experiment operation" toolkit for AI-driven Builder.
 *
 * Each tool is a pure-ish function `(experiment, input) => result` operating on
 * an `Experiment` instance. The in-app assistant passes `current.experiment`
 * (the live reactive Builder state); the MCP server passes an experiment loaded
 * from a .psyexp file. Both share these functions and the schemas in
 * `toolSchemas.js`.
 *
 * Write tools record an undo point via `experiment.history.update()` BEFORE
 * mutating (matching how the Builder UI records history), and return a
 * structured `{ ok, ... }` result so the model can self-correct on bad input.
 */

import { Routine } from "$lib/experiment/routine.svelte";
import { Component } from "$lib/experiment/component.svelte";
import { LoopInitiator } from "$lib/experiment/flow.svelte";
import { profiles } from "$lib/experiment/profiles.svelte";
import { writeWebFS, isWebPath, normalizeWebPath, webfsPath } from "$lib/webfs/storage.js";

/** Result helpers */
const ok = (extra = {}) => ({ ok: true, ...extra });
const err = (error, extra = {}) => ({ ok: false, error, ...extra });

/* ------------------------------------------------------------------ *
 * Read tools
 * ------------------------------------------------------------------ */

/**
 * List every component type the model can place, with a short summary and the
 * categories it belongs to. This is the model's "catalogue" of building blocks.
 */
export function list_component_types() {
    const out = [];
    for (const [tag, profile] of Object.entries(profiles.components)) {
        // skip internal / hidden helpers
        if (profile?.hidden || tag === "UnknownComponent" || tag.endsWith("SettingsComponent")) {
            continue;
        }
        out.push({
            type: tag,
            summary: profile.tooltip || profile.__class__ || tag,
            categories: profile.categories || [],
        });
    }
    return ok({ components: out, count: out.length });
}

/**
 * Full parameter schema for a single component type: each param's type, label,
 * hint, allowed values and default. Use before setting unfamiliar params.
 */
export function get_component_schema(experiment, { type } = {}) {
    const profile = profiles.components[type];
    if (!profile) {
        return err(`Unknown component type "${type}". Call list_component_types first.`);
    }
    const params = {};
    for (const [name, p] of Object.entries(profile.params || {})) {
        params[name] = {
            valType: p.valType,
            label: p.label,
            hint: p.hint,
            category: p.categ,
            default: p.val,
            allowedVals: Array.isArray(p.allowedVals) && p.allowedVals.length ? p.allowedVals : undefined,
        };
    }
    return ok({ type, summary: profile.tooltip, params });
}

/**
 * Compact snapshot of the current experiment: settings, every routine with its
 * components and their parameter values, and the flow order (routines + loops).
 */
export function get_experiment_state(experiment) {
    const routines = {};
    for (const [name, rt] of Object.entries(experiment.routines)) {
        if (rt instanceof Routine) {
            routines[name] = {
                kind: "Routine",
                components: rt.components.map((c) => ({
                    name: c.name,
                    type: c.tag,
                    params: paramValues(c),
                })),
            };
        } else {
            // StandaloneRoutine (e.g. code-only routines)
            routines[name] = { kind: rt.tag, params: paramValues(rt) };
        }
    }

    const flow = experiment.flow.flat.map((el) => {
        if (el instanceof Routine || el?.tag === "StandaloneRoutine") {
            return { type: "routine", name: el.name };
        }
        if (el instanceof LoopInitiator) {
            return { type: "loop_start", name: el.name, loopType: el.tag };
        }
        // LoopTerminator
        return { type: "loop_end", name: el.name };
    });

    return ok({
        settings: paramValues(experiment.settings),
        routines,
        flow,
    });
}

/** Snapshot a HasParams element's params as a plain {name: val} map. */
function paramValues(el) {
    const out = {};
    for (const [name, p] of Object.entries(el.params || {})) {
        const v = p.val;
        out[name] = typeof v === "object" && v !== null ? JSON.parse(JSON.stringify(v)) : v;
    }
    return out;
}

/* ------------------------------------------------------------------ *
 * Write tools
 * ------------------------------------------------------------------ */

/** Add a new (empty) routine and place it in the flow. */
export function add_routine(experiment, { name = "routine", index = -1 } = {}) {
    experiment.history.update(`AI: add routine ${name}`);
    const finalName = experiment.resolveNameConflict(name);
    const rt = new Routine();
    rt.exp = experiment;
    rt.settings.params["name"].val = finalName;
    experiment.routines[finalName] = rt;
    experiment.flow.insertElement(rt, index);
    return ok({ name: finalName });
}

/** Remove a routine and any of its occurrences in the flow. */
export function remove_routine(experiment, { name } = {}) {
    const rt = experiment.routines[name];
    if (!rt) return err(`No routine named "${name}".`);
    experiment.history.update(`AI: remove routine ${name}`);
    // remove every flow entry referencing this routine (right-to-left)
    for (let i = experiment.flow.flat.length - 1; i >= 0; i--) {
        if (experiment.flow.flat[i] === rt) experiment.flow.removeElement(i);
    }
    delete experiment.routines[name];
    return ok({ name });
}

/** Add a component to a routine, optionally setting initial parameters. */
export function add_component(experiment, { routine, type, name, params = {} } = {}) {
    const rt = experiment.routines[routine];
    if (!rt) return err(`No routine named "${routine}".`);
    if (!(rt instanceof Routine)) return err(`"${routine}" is not a standard routine.`);
    if (!profiles.components[type]) {
        return err(`Unknown component type "${type}". Call list_component_types first.`);
    }
    experiment.history.update(`AI: add ${type} to ${routine}`);
    const comp = new Component(type);
    comp.exp = experiment;
    // name: default to a readable name derived from the type
    const baseName = name || defaultComponentName(type);
    comp.params["name"].val = experiment.resolveNameConflict(baseName);
    // apply any provided params (after name so name conflict resolution stands)
    const applied = applyParams(comp, params, /* skipName */ true);
    if (!applied.ok) return applied;
    rt.addComponent(comp);
    return ok({ routine, name: comp.params["name"].val, type, paramsSet: applied.set });
}

/** Update parameters of an existing component. */
export function set_component_params(experiment, { routine, component, params = {} } = {}) {
    const rt = experiment.routines[routine];
    if (!rt) return err(`No routine named "${routine}".`);
    const comp = (rt.components || []).find((c) => c.name === component);
    if (!comp) return err(`No component "${component}" in routine "${routine}".`);
    experiment.history.update(`AI: edit ${component}`);
    const applied = applyParams(comp, params, /* skipName */ false);
    if (!applied.ok) return applied;
    return ok({ routine, component: comp.params["name"].val, paramsSet: applied.set });
}

/** Remove a component from a routine. */
export function remove_component(experiment, { routine, component } = {}) {
    const rt = experiment.routines[routine];
    if (!rt) return err(`No routine named "${routine}".`);
    const idx = (rt.components || []).findIndex((c) => c.name === component);
    if (idx < 0) return err(`No component "${component}" in routine "${routine}".`);
    experiment.history.update(`AI: remove ${component}`);
    rt.components.splice(idx, 1);
    return ok({ routine, component });
}

/**
 * Wrap a span of the flow (startRoutine..endRoutine inclusive) in a loop.
 * loopType is one of the keys in `profiles.loops` (default "TrialHandler").
 */
export function add_loop(experiment, {
    name = "trials",
    loopType = "TrialHandler",
    startRoutine,
    endRoutine,
    nReps,
    conditionsFile,
} = {}) {
    if (!profiles.loops[loopType]) {
        return err(`Unknown loopType "${loopType}". Allowed: ${Object.keys(profiles.loops).join(", ")}.`);
    }
    const flat = experiment.flow.flat;
    const startIndex = flat.findIndex((el) => (el instanceof Routine) && el.name === startRoutine);
    if (startIndex < 0) return err(`Start routine "${startRoutine}" is not in the flow.`);
    const endIndex = endRoutine
        ? flat.findIndex((el) => (el instanceof Routine) && el.name === endRoutine)
        : startIndex;
    if (endIndex < 0) return err(`End routine "${endRoutine}" is not in the flow.`);
    if (endIndex < startIndex) return err(`End routine comes before start routine in the flow.`);

    experiment.history.update(`AI: add loop ${name}`);
    const loop = new LoopInitiator(loopType);
    loop.exp = experiment;
    loop.params["name"].val = experiment.resolveNameConflict(name);
    if (nReps !== undefined && loop.params["nReps"]) loop.params["nReps"].val = nReps;
    // the file path lives in the "conditionsFile" param (the "conditions" param is a hidden parsed list)
    if (conditionsFile !== undefined && loop.params["conditionsFile"]) loop.params["conditionsFile"].val = conditionsFile;
    loop.addTerminator();
    // insert terminator first (after end routine), then initiator (before start)
    experiment.flow.insertElement(loop.terminator, endIndex + 1);
    experiment.flow.insertElement(loop, startIndex);
    return ok({ name: loop.params["name"].val, loopType, startRoutine, endRoutine: endRoutine || startRoutine });
}

/** Move a routine to a new position in the flow. */
export function move_routine(experiment, { name, toIndex } = {}) {
    const rt = experiment.routines[name];
    if (!rt) return err(`No routine named "${name}".`);
    if (!experiment.flow.flat.includes(rt)) return err(`Routine "${name}" is not in the flow.`);
    experiment.history.update(`AI: move routine ${name}`);
    experiment.flow.relocateElement(rt, toIndex);
    return ok({ name, toIndex });
}

/** Set top-level experiment settings (the SettingsComponent params). */
export function set_experiment_settings(experiment, { params = {} } = {}) {
    experiment.history.update(`AI: edit experiment settings`);
    const applied = applyParams(experiment.settings, params, /* skipName */ false);
    if (!applied.ok) return applied;
    return ok({ paramsSet: applied.set });
}

/**
 * Create a CSV conditions file (in the browser filesystem) to drive a loop.
 * Each row is one trial; each key is a column referenced in components as
 * `$columnName`. Written into the experiment's folder so the compiler bundles
 * it. Optionally attach it to an existing loop by name.
 */
export async function create_conditions_file(experiment, { filename = "conditions.csv", rows, loopName } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return err(`"rows" must be a non-empty array of objects, one per trial (e.g. [{"word":"红","color":"red"}, ...]).`);
    }
    // ensure a .csv name
    let name = String(filename).trim() || "conditions.csv";
    if (!/\.(csv|xlsx?)$/i.test(name)) name += ".csv";

    const { csv, columns } = toCSV(rows);

    // write into the experiment folder if it lives in WebFS, else at the WebFS root
    const folder = isWebPath(experiment.file?.file) ? normalizeWebPath(experiment.file.parent || "") : "";
    const key = folder ? `${folder}/${name}` : name;
    try {
        await writeWebFS(key, csv);
    } catch (e) {
        return err(`Failed to write conditions file: ${e?.message || e}`);
    }

    // optionally point an existing loop at this file
    let attached;
    if (loopName) {
        const loop = experiment.flow.flat.find((el) => el instanceof LoopInitiator && el.name === loopName);
        if (!loop) return err(`Created the file but found no loop named "${loopName}" to attach it to.`, { path: name, columns });
        if (loop.params["conditionsFile"]) {
            experiment.history.update(`AI: set conditions for ${loopName}`);
            loop.params["conditionsFile"].val = name;
            attached = loopName;
        }
    }

    return ok({ path: name, webfsPath: webfsPath(key), rows: rows.length, columns, attachedToLoop: attached });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Apply a {paramName: value} map to a HasParams element, validating each. */
function applyParams(el, params, skipName) {
    const set = [];
    for (const [pname, value] of Object.entries(params || {})) {
        if (skipName && pname === "name") continue;
        const param = el.params[pname];
        if (!param) {
            return err(`Parameter "${pname}" does not exist on ${el.tag}. Call get_component_schema for valid params.`, { set });
        }
        if (Array.isArray(param.allowedVals) && param.allowedVals.length && !param.allowedVals.includes(value)) {
            return err(
                `Value ${JSON.stringify(value)} not allowed for "${pname}". Allowed: ${param.allowedVals.join(", ")}.`,
                { set }
            );
        }
        param.val = value;
        set.push(pname);
    }
    return ok({ set });
}

/** Turn "TextComponent" -> "text" for a friendlier default component name. */
function defaultComponentName(type) {
    return type.replace(/Component$/, "").replace(/^[A-Z]/, (c) => c.toLowerCase()) || "component";
}

/** Build CSV text from an array of row objects; columns are the union of keys. */
function toCSV(rows) {
    const columns = [];
    for (const row of rows) {
        for (const k of Object.keys(row || {})) if (!columns.includes(k)) columns.push(k);
    }
    const esc = (v) => {
        let s = v === null || v === undefined ? "" : String(v);
        if (/[",\n\r]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
        return s;
    };
    const lines = [columns.map(esc).join(",")];
    for (const row of rows) lines.push(columns.map((c) => esc(row?.[c])).join(","));
    return { csv: lines.join("\n") + "\n", columns };
}

/* ------------------------------------------------------------------ *
 * Dispatcher
 * ------------------------------------------------------------------ */

/** Tools that take no experiment-mutating access (read-only). */
const READ_TOOLS = {
    list_component_types: (_exp, input) => list_component_types(input),
    get_component_schema,
    get_experiment_state: (exp) => get_experiment_state(exp),
};

const WRITE_TOOLS = {
    add_routine,
    remove_routine,
    add_component,
    set_component_params,
    remove_component,
    add_loop,
    move_routine,
    set_experiment_settings,
    create_conditions_file,
};

export const TOOL_FNS = { ...READ_TOOLS, ...WRITE_TOOLS };

/**
 * Execute a named tool against an experiment. Never throws for tool-level
 * problems — returns `{ ok: false, error }` so the model can recover. Only
 * truly unexpected exceptions are caught and surfaced as errors too.
 */
export async function executeTool(experiment, name, input = {}) {
    const fn = TOOL_FNS[name];
    if (!fn) return err(`Unknown tool "${name}".`);
    try {
        return await fn(experiment, input || {});
    } catch (e) {
        return err(`Tool "${name}" failed: ${e?.message || String(e)}`);
    }
}
