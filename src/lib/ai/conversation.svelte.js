/**
 * Chat conversation manager for the AI Builder assistant.
 *
 * Holds both the UI-facing message list (reactive, for rendering) and the raw
 * provider message array (sent to the model). Wires the provider's tool-use
 * loop to the experiment-operation tools, executed against the live experiment.
 */

import { currentKey, currentModel, currentBaseURL, currentKind } from "./providers/config.svelte";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAIProvider } from "./providers/openai";
import { executeTool } from "./core/experimentTools";
import { buildSystemPrompt } from "./core/systemPrompt";

export class Conversation {
    /** UI-facing messages: { role: 'user'|'assistant', text, tools: [{name,input,result}] } */
    messages = $state([]);
    busy = $state(false);
    error = $state(undefined);
    /** Plan awaiting the user's approval: { summary, steps, assumptions } | undefined */
    pendingPlan = $state(undefined);

    /** @param {() => object} getExperiment  Returns the live Experiment to operate on. */
    constructor(getExperiment, { locale = "zh" } = {}) {
        this.getExperiment = getExperiment;
        this.locale = locale;
        this._history = []; // provider-neutral history: user / assistant(+toolCalls) / tool entries
        this._controller = undefined;
    }

    /** Dispatch a tool: surface a presented plan to the UI, else run the experiment tool. */
    async _runTool(name, input) {
        if (name === "present_plan") {
            this.pendingPlan = {
                summary: input.summary || "",
                steps: input.steps || [],
                assumptions: input.assumptions || [],
            };
            return {
                ok: true,
                awaiting_approval: true,
                message: "计划已呈现给用户，请结束本轮、等待用户批准后再构建。",
            };
        }
        return await executeTool(this.getExperiment(), name, input);
    }

    /** Build the provider for the active config, or throw a friendly error. */
    _provider() {
        const apiKey = currentKey();
        if (!apiKey) throw new Error("尚未配置 API key。请点击设置填入。");
        if (currentKind() === "anthropic") {
            return createAnthropicProvider({ apiKey, model: currentModel() });
        }
        return createOpenAIProvider({ apiKey, model: currentModel(), baseURL: currentBaseURL() });
    }

    /** Send a user message and run the model+tools turn to completion. */
    async send(text) {
        if (this.busy) return;
        this.error = undefined;
        const trimmed = String(text || "").trim();
        if (!trimmed) return;

        // dismiss any pending plan card — this message either approves or supersedes it
        this.pendingPlan = undefined;

        let provider;
        try {
            provider = this._provider();
        } catch (e) {
            this.error = e.message;
            return;
        }

        this.messages.push({ role: "user", text: trimmed, tools: [] });
        this._history.push({ role: "user", content: trimmed });

        const uiAssistant = $state({ role: "assistant", text: "", tools: [] });
        this.messages.push(uiAssistant);

        this.busy = true;
        this._controller = new AbortController();

        try {
            await provider.runTurn({
                system: buildSystemPrompt({ locale: this.locale }),
                history: this._history,
                signal: this._controller.signal,
                executeTool: (name, input) => this._runTool(name, input),
                onEvent: (ev) => {
                    if (ev.type === "text") {
                        uiAssistant.text += ev.text;
                    } else if (ev.type === "tool_use") {
                        if (ev.name === "present_plan") return; // shown as a plan card, not a chip
                        uiAssistant.tools.push({ name: ev.name, input: ev.input, result: undefined });
                    } else if (ev.type === "tool_result") {
                        if (ev.name === "present_plan") return;
                        // attach result to the most recent matching pending tool chip
                        const chip = [...uiAssistant.tools].reverse().find((t) => t.name === ev.name && t.result === undefined);
                        if (chip) chip.result = ev.result;
                    }
                },
            });
        } catch (e) {
            if (e?.name !== "AbortError") {
                this.error = e?.message || String(e);
                uiAssistant.text += `\n\n⚠️ ${this.error}`;
            }
        } finally {
            this.busy = false;
            this._controller = undefined;
        }
    }

    /** Approve the pending plan and let the assistant build it. */
    async approvePlan() {
        if (this.busy || !this.pendingPlan) return;
        await this.send("我已批准这个计划，请开始构建。");
    }

    /** Abort an in-flight turn. */
    stop() {
        this._controller?.abort();
    }

    /** Clear the conversation (does not touch the experiment). */
    reset() {
        this.messages = [];
        this._history = [];
        this.error = undefined;
        this.pendingPlan = undefined;
    }
}
