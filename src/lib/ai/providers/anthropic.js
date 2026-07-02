/**
 * Anthropic (Claude) provider.
 *
 * Consumes the provider-neutral conversation history (see conversation.svelte.js
 * for the format), translates it to Anthropic Messages, runs a manual tool-use
 * loop streaming text into the UI, and appends new neutral entries back onto the
 * shared history so other providers can pick up the same conversation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { anthropicTools } from "../core/toolSchemas";

const MAX_STEPS = 24; // safety cap on tool-use round trips per user turn

/** Neutral history -> Anthropic message params (coalescing tool results). */
function toAnthropicMessages(history) {
    const out = [];
    let pendingToolResults = null;
    const flush = () => {
        if (pendingToolResults) {
            out.push({ role: "user", content: pendingToolResults });
            pendingToolResults = null;
        }
    };
    for (const e of history) {
        if (e.role === "tool") {
            // consecutive tool results are grouped into one user message
            (pendingToolResults ??= []).push({
                type: "tool_result",
                tool_use_id: e.toolCallId,
                content: JSON.stringify(e.result),
                is_error: e.result?.ok === false,
            });
            continue;
        }
        flush();
        if (e.role === "user") {
            out.push({ role: "user", content: e.content });
        } else if (e.role === "assistant") {
            const blocks = [];
            if (e.content) blocks.push({ type: "text", text: e.content });
            for (const tc of e.toolCalls || []) {
                blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
            }
            out.push({ role: "assistant", content: blocks });
        }
    }
    flush();
    return out;
}

export function createAnthropicProvider({ apiKey, model }) {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    async function runTurn({ system, history, executeTool, onEvent, signal }) {
        for (let step = 0; step < MAX_STEPS; step++) {
            if (signal?.aborted) break;

            const stream = client.messages.stream(
                {
                    model,
                    max_tokens: 16000,
                    thinking: { type: "adaptive" },
                    system,
                    tools: anthropicTools(),
                    messages: toAnthropicMessages(history),
                },
                { signal }
            );
            stream.on("text", (delta) => onEvent?.({ type: "text", text: delta }));
            const msg = await stream.finalMessage();

            const text = msg.content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join("");
            const toolCalls = msg.content
                .filter((b) => b.type === "tool_use")
                .map((b) => ({ id: b.id, name: b.name, input: b.input || {} }));

            history.push({ role: "assistant", content: text, toolCalls });

            if (msg.stop_reason !== "tool_use" || toolCalls.length === 0) break;

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
