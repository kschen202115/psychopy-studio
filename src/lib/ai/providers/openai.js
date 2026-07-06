/**
 * OpenAI-compatible provider (raw fetch, no SDK).
 *
 * One implementation covers OpenAI and any OpenAI-compatible Chat Completions
 * endpoint (DeepSeek, Moonshot/Kimi, Zhipu, OpenRouter, local Ollama, …) via a
 * configurable baseURL. Streams text and assembles streamed tool-call deltas,
 * then runs the same manual tool-use loop as the Anthropic provider against the
 * shared neutral history.
 */

import { openaiTools } from "../core/toolSchemas";

const MAX_STEPS = 24;

/** Fetch the available model ids from an OpenAI-compatible /models endpoint. */
export async function fetchOpenAIModels({ apiKey, baseURL }) {
    const url = `${(baseURL || "https://api.openai.com/v1").replace(/\/$/, "")}/models`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } });
    if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
    }
    const j = await r.json();
    const list = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    return list.map((m) => m.id).filter(Boolean).sort();
}

/** Neutral history -> OpenAI chat messages. */
function toOpenAIMessages(system, history) {
    const out = [{ role: "system", content: system }];
    for (const e of history) {
        if (e.role === "user") {
            out.push({ role: "user", content: e.content });
        } else if (e.role === "assistant") {
            const msg = { role: "assistant", content: e.content || "" };
            if (e.toolCalls?.length) {
                msg.tool_calls = e.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) },
                }));
                // DeepSeek (and other reasoning models) require the thinking-mode
                // `reasoning_content` to be replayed on an assistant turn that
                // carries tool_calls, otherwise the follow-up request is rejected.
                // Only attach it here — replaying it on a completed (tool-less)
                // turn is disallowed by the same APIs.
                if (e.reasoningContent) msg.reasoning_content = e.reasoningContent;
            }
            out.push(msg);
        } else if (e.role === "tool") {
            // `name` is redundant for OpenAI itself, but Gemini's OpenAI-compat
            // layer needs it to fill the native functionResponse.name field —
            // without it the request fails with REQUIRED_FIELD_MISSING.
            out.push({ role: "tool", tool_call_id: e.toolCallId, name: e.name, content: JSON.stringify(e.result) });
        }
    }
    return out;
}

export function createOpenAIProvider({ apiKey, model, baseURL }) {
    const endpoint = `${(baseURL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;

    /** One streamed model call -> { text, toolCalls:[{id,name,input}] }. */
    async function callModel({ system, history, signal, onEvent }) {
        const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: toOpenAIMessages(system, history),
                tools: openaiTools(),
                stream: true,
            }),
            signal,
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            throw new Error(`HTTP ${resp.status}: ${body.slice(0, 300)}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let text = "";
        let reasoning = "";
        const tcSlots = {}; // index -> { id, name, args }

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                let json;
                try {
                    json = JSON.parse(data);
                } catch {
                    continue;
                }
                const delta = json.choices?.[0]?.delta;
                if (!delta) continue;
                if (delta.reasoning_content) {
                    reasoning += delta.reasoning_content;
                    onEvent?.({ type: "reasoning", text: delta.reasoning_content });
                }
                if (delta.content) {
                    text += delta.content;
                    onEvent?.({ type: "text", text: delta.content });
                }
                for (const tcd of delta.tool_calls || []) {
                    const slot = (tcSlots[tcd.index] ??= { id: "", name: "", args: "" });
                    if (tcd.id) slot.id = tcd.id;
                    if (tcd.function?.name) slot.name = tcd.function.name;
                    if (tcd.function?.arguments) slot.args += tcd.function.arguments;
                }
            }
        }

        const toolCalls = Object.keys(tcSlots)
            .sort((a, b) => a - b)
            .map((i) => {
                const s = tcSlots[i];
                let input = {};
                try {
                    input = s.args ? JSON.parse(s.args) : {};
                } catch {
                    input = {};
                }
                return { id: s.id || `call_${i}`, name: s.name, input };
            });

        return { text, toolCalls, reasoning };
    }

    async function runTurn({ system, history, executeTool, onEvent, signal }) {
        for (let step = 0; step < MAX_STEPS; step++) {
            if (signal?.aborted) break;
            const { text, toolCalls, reasoning } = await callModel({ system, history, signal, onEvent });
            history.push({ role: "assistant", content: text, toolCalls, reasoningContent: reasoning });
            if (toolCalls.length === 0) break;
            for (const tc of toolCalls) {
                onEvent?.({ type: "tool_use", name: tc.name, input: tc.input });
                const result = await executeTool(tc.name, tc.input);
                onEvent?.({ type: "tool_result", name: tc.name, result });
                history.push({ role: "tool", toolCallId: tc.id, name: tc.name, result });
            }
        }
        return history;
    }

    return { runTurn };
}
