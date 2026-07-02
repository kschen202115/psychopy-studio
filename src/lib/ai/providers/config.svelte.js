/**
 * AI provider configuration, persisted to localStorage (browser-only, BYO key).
 *
 * The API key lives only in the user's own browser. This keeps the app a pure
 * static deploy with no backend to hold secrets.
 */

const STORAGE_KEY = "psychopy-studio.ai.config";

/**
 * Known providers.
 * - `kind` selects the wire protocol ("anthropic" | "openai").
 * - `customBaseURL`/`customModel` enable free-form entry in the settings dialog,
 *   so one OpenAI-compatible provider covers OpenAI, DeepSeek, Kimi, Zhipu,
 *   OpenRouter, local Ollama, etc.
 */
export const PROVIDERS = {
    anthropic: {
        label: "Claude (Anthropic)",
        kind: "anthropic",
        defaultModel: "claude-opus-4-8",
        models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    },
    openai: {
        label: "OpenAI",
        kind: "openai",
        defaultModel: "gpt-4o",
        models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
        defaultBaseURL: "https://api.openai.com/v1",
        customModel: true,
    },
    compatible: {
        label: "OpenAI 兼容 (DeepSeek / Kimi / 智谱 / 本地…)",
        kind: "openai",
        defaultModel: "deepseek-chat",
        models: ["deepseek-chat", "deepseek-reasoner", "moonshot-v1-8k", "glm-4-plus"],
        defaultBaseURL: "https://api.deepseek.com/v1",
        customModel: true,
        customBaseURL: true,
    },
};

function load() {
    try {
        const raw = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {
        // ignore malformed storage
    }
    return {};
}

const initial = load();
const initialProvider = PROVIDERS[initial.provider] ? initial.provider : "anthropic";

export const aiConfig = $state({
    provider: initialProvider,
    // all stored per provider so switching keeps each provider's model / key / endpoint
    models: initial.models || {},
    keys: initial.keys || {},
    baseURLs: initial.baseURLs || {},
});

/** Persist current config to localStorage. */
export function saveConfig() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                provider: aiConfig.provider,
                models: aiConfig.models,
                keys: aiConfig.keys,
                baseURLs: aiConfig.baseURLs,
            })
        );
    } catch {
        // storage may be unavailable (private mode); fail silently
    }
}

/** Selected model for the active provider (custom, else its default). */
export function currentModel() {
    return aiConfig.models[aiConfig.provider] || PROVIDERS[aiConfig.provider].defaultModel;
}

/** Set the active provider's model and persist. */
export function setModel(model) {
    aiConfig.models[aiConfig.provider] = model;
    saveConfig();
}

/** API key for the active provider, or "". */
export function currentKey() {
    return aiConfig.keys[aiConfig.provider] || "";
}

/** Base URL for the active provider (custom, else its default). */
export function currentBaseURL() {
    const p = PROVIDERS[aiConfig.provider];
    return aiConfig.baseURLs[aiConfig.provider] || p.defaultBaseURL || "";
}

/** Wire protocol of the active provider ("anthropic" | "openai"). */
export function currentKind() {
    return PROVIDERS[aiConfig.provider].kind;
}

/** True when the active provider has a key configured. */
export function isConfigured() {
    return Boolean(currentKey());
}

/** Switch the active provider (its stored model/key/baseURL are kept per-provider). */
export function setProvider(provider) {
    aiConfig.provider = provider;
    saveConfig();
}
