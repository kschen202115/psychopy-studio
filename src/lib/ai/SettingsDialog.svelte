<script>
    import Dialog from "$lib/utils/dialog/Dialog.svelte";
    import { aiConfig, PROVIDERS, saveConfig, setProvider, setModel, currentModel } from "./providers/config.svelte";
    import { fetchOpenAIModels } from "./providers/openai";

    let { shown = $bindable() } = $props();

    const provider = $derived(PROVIDERS[aiConfig.provider]);

    // local buffers bound to the active provider's stored values
    let modelInput = $state(currentModel());
    let keyInput = $state(aiConfig.keys[aiConfig.provider] || "");
    let baseURLInput = $state(aiConfig.baseURLs[aiConfig.provider] || "");

    // fetched model list (for OpenAI-compatible endpoints that expose /models)
    let fetchedModels = $state([]);
    let fetching = $state(false);
    let fetchMsg = $state("");

    // suggestions shown in the model datalist: fetched list if available, else defaults
    const modelOptions = $derived(fetchedModels.length ? fetchedModels : provider.models);

    $effect(() => {
        // reflect the active provider's stored values when it changes
        modelInput = currentModel();
        keyInput = aiConfig.keys[aiConfig.provider] || "";
        baseURLInput = aiConfig.baseURLs[aiConfig.provider] || "";
        // clear any previously fetched list when switching providers
        fetchedModels = [];
        fetchMsg = "";
    });

    function effectiveBaseURL() {
        return provider.customBaseURL ? baseURLInput.trim() || provider.defaultBaseURL : provider.defaultBaseURL;
    }

    async function loadModels() {
        if (fetching) return;
        if (!keyInput.trim()) {
            fetchMsg = "请先填入 API Key";
            return;
        }
        fetching = true;
        fetchMsg = "获取中…";
        try {
            const ids = await fetchOpenAIModels({ apiKey: keyInput.trim(), baseURL: effectiveBaseURL() });
            fetchedModels = ids;
            fetchMsg = `获取到 ${ids.length} 个模型`;
        } catch (e) {
            fetchMsg = `获取失败：${e?.message || e}`;
        } finally {
            fetching = false;
        }
    }

    function commit() {
        setModel(modelInput.trim() || provider.defaultModel);
        aiConfig.keys[aiConfig.provider] = keyInput.trim();
        if (provider.customBaseURL) {
            aiConfig.baseURLs[aiConfig.provider] = baseURLInput.trim();
        }
        saveConfig();
    }
</script>

<Dialog
    id="ai-settings"
    title="AI 助手设置"
    shrink
    bind:shown
    buttons={{ OK: commit, CANCEL: () => {} }}
>
    <div class="form">
        <label>
            提供方
            <select value={aiConfig.provider} onchange={(e) => setProvider(e.currentTarget.value)}>
                {#each Object.entries(PROVIDERS) as [id, p]}
                    <option value={id}>{p.label}</option>
                {/each}
            </select>
        </label>

        <label>
            模型
            {#if provider.customModel}
                {#if fetchedModels.length}
                    <select bind:value={modelInput}>
                        {#each fetchedModels as m}
                            <option value={m}>{m}</option>
                        {/each}
                    </select>
                {:else}
                    <input
                        list="ai-model-suggestions"
                        bind:value={modelInput}
                        placeholder={provider.defaultModel}
                        autocomplete="off"
                    />
                    <datalist id="ai-model-suggestions">
                        {#each modelOptions as m}
                            <option value={m}></option>
                        {/each}
                    </datalist>
                {/if}
                {#if provider.kind === "openai"}
                    <div class="model-fetch">
                        <button type="button" class="fetch-btn" onclick={loadModels} disabled={fetching}>
                            {fetching ? "获取中…" : "获取模型列表"}
                        </button>
                        {#if fetchMsg}<span class="fetch-msg">{fetchMsg}</span>{/if}
                    </div>
                {/if}
            {:else}
                <select bind:value={modelInput}>
                    {#each provider.models as m}
                        <option value={m}>{m}</option>
                    {/each}
                </select>
            {/if}
        </label>

        {#if provider.customBaseURL}
            <label>
                接口地址 (Base URL)
                <input
                    bind:value={baseURLInput}
                    placeholder={provider.defaultBaseURL}
                    autocomplete="off"
                />
            </label>
        {/if}

        <label>
            API Key
            <input
                type="password"
                placeholder={provider.kind === "anthropic" ? "sk-ant-..." : "sk-..."}
                bind:value={keyInput}
                autocomplete="off"
            />
        </label>

        <p class="note">
            Key 仅保存在你本地浏览器（localStorage），不会上传到任何服务器。前端直连模型 API。
            {#if provider.customBaseURL}
                <br />“OpenAI 兼容”可填任意兼容端点（DeepSeek、Kimi、智谱、本地 Ollama 等）。
            {/if}
        </p>
    </div>
</Dialog>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem;
        min-width: 24rem;
        color: var(--text);
    }
    label {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 0.85rem;
    }
    select,
    input {
        padding: 0.4rem 0.5rem;
        background-color: var(--base);
        color: var(--text);
        border: 1px solid var(--outline);
        border-radius: 0.25rem;
        font-size: 0.85rem;
    }
    .model-fetch {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.35rem;
    }
    .fetch-btn {
        padding: 0.25rem 0.6rem;
        border: 1px solid var(--outline);
        border-radius: 0.25rem;
        background-color: var(--overlay);
        color: var(--text-on-overlay, var(--text));
        font-size: 0.75rem;
        cursor: pointer;
    }
    .fetch-btn:disabled {
        opacity: 0.6;
        cursor: default;
    }
    .fetch-msg {
        font-size: 0.72rem;
        opacity: 0.75;
    }
    .note {
        font-size: 0.75rem;
        color: var(--subtext, var(--text));
        opacity: 0.75;
        margin: 0;
        line-height: 1.5;
    }
</style>
