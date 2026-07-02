<script>
    import { Conversation } from "./conversation.svelte";
    import { isConfigured } from "./providers/config.svelte";
    import SettingsDialog from "./SettingsDialog.svelte";
    import { getLocale } from "$lib/translation";

    let {
        /** @prop {() => object} Returns the live Experiment to build into. */
        getExperiment,
    } = $props();

    let open = $state(false);
    let settingsShown = $state(false);
    let input = $state("");

    const convo = new Conversation(getExperiment, { locale: safeLocale() });

    function safeLocale() {
        try {
            return getLocale?.() || "zh";
        } catch {
            return "zh";
        }
    }

    let scroller;
    $effect(() => {
        // re-scroll when message content changes
        void convo.messages.length;
        void convo.messages.at(-1)?.text;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });

    async function submit() {
        const text = input.trim();
        if (!text || convo.busy) return;
        if (!isConfigured()) {
            settingsShown = true;
            return;
        }
        input = "";
        await convo.send(text);
    }

    function onKey(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }
</script>

<button class="ai-fab" class:active={open} onclick={() => (open = !open)} aria-label="AI 助手" title="AI 助手">
    {open ? "✕" : "🤖"}
</button>

{#if open}
    <div class="ai-drawer">
        <header>
            <span class="title">AI 实验助手</span>
            <div class="spacer"></div>
            <button class="hbtn" title="设置" onclick={() => (settingsShown = true)}>⚙</button>
            <button class="hbtn" title="清空对话" onclick={() => convo.reset()}>🗑</button>
        </header>

        <div class="messages" bind:this={scroller}>
            {#if convo.messages.length === 0}
                <div class="empty">
                    用自然语言描述一个实验，我会直接在 Builder 里构建。<br />
                    例如：“做一个 Stroop 任务：红绿蓝三色文字，按 r/g/b 反应，重复 30 次”。
                </div>
            {/if}
            {#each convo.messages as msg}
                <div class="msg {msg.role}">
                    {#if msg.text}
                        <div class="bubble">{msg.text}</div>
                    {/if}
                    {#if msg.tools && msg.tools.length}
                        <div class="tools">
                            {#each msg.tools as t}
                                <div class="chip" class:err={t.result && t.result.ok === false}>
                                    <span class="tname">{t.name}</span>
                                    {#if t.result === undefined}
                                        <span class="dot">…</span>
                                    {:else if t.result.ok === false}
                                        <span class="dot">✗ {t.result.error}</span>
                                    {:else}
                                        <span class="dot">✓</span>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

        {#if convo.pendingPlan}
            <div class="plan">
                <div class="plan-head">📋 构建计划（待批准）</div>
                <div class="plan-body">
                    {#if convo.pendingPlan.summary}
                        <div class="plan-summary">{convo.pendingPlan.summary}</div>
                    {/if}
                    <ol class="plan-steps">
                        {#each convo.pendingPlan.steps as step}
                            <li>{step}</li>
                        {/each}
                    </ol>
                    {#if convo.pendingPlan.assumptions && convo.pendingPlan.assumptions.length}
                        <div class="plan-assume">
                            假设：
                            <ul>
                                {#each convo.pendingPlan.assumptions as a}
                                    <li>{a}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </div>
                <div class="plan-actions">
                    <button class="approve" disabled={convo.busy} onclick={() => convo.approvePlan()}>批准并构建</button>
                    <span class="hint">或在下方输入修改意见</span>
                </div>
            </div>
        {/if}

        {#if convo.error}
            <div class="banner">{convo.error}</div>
        {/if}

        <div class="composer">
            <textarea
                rows="2"
                placeholder="描述要构建的实验…（Enter 发送，Shift+Enter 换行）"
                bind:value={input}
                onkeydown={onKey}
                disabled={convo.busy}
            ></textarea>
            {#if convo.busy}
                <button class="send stop" onclick={() => convo.stop()}>停止</button>
            {:else}
                <button class="send" onclick={submit}>发送</button>
            {/if}
        </div>
    </div>
{/if}

<SettingsDialog bind:shown={settingsShown} />

<style>
    .ai-fab {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 50;
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        border: 1px solid var(--outline);
        background-color: var(--blue);
        color: var(--text-on-blue, white);
        font-size: 1.2rem;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .ai-fab.active {
        background-color: var(--overlay);
        color: var(--text);
    }
    .ai-drawer {
        position: fixed;
        right: 1rem;
        bottom: 4.5rem;
        z-index: 49;
        width: min(32rem, 92vw);
        height: min(44rem, 82vh);
        min-width: 22rem;
        min-height: 22rem;
        max-width: 94vw;
        max-height: 88vh;
        /* resize handle at the bottom-right corner; anchored bottom-right so it grows up-left, staying on-screen */
        resize: both;
        display: grid;
        grid-template-rows: min-content 1fr min-content;
        background-color: var(--mantle);
        border: 1px solid var(--outline);
        border-radius: 0.5rem;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        color: var(--text);
    }
    header {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem 0.75rem;
        background-color: var(--overlay);
        color: var(--text-on-overlay);
    }
    header .title {
        font-weight: 600;
        font-size: 0.9rem;
    }
    header .spacer {
        flex: 1;
    }
    .hbtn {
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 0.95rem;
        padding: 0.2rem 0.35rem;
        border-radius: 0.25rem;
    }
    .hbtn:hover {
        background-color: var(--base);
    }
    .messages {
        overflow-y: auto;
        min-height: 0; /* allow the grid row to shrink so the plan card + composer fit */
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .empty {
        color: var(--text);
        opacity: 0.6;
        font-size: 0.8rem;
        line-height: 1.5;
        margin: auto 0;
    }
    .msg {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    .msg.user {
        align-items: flex-end;
    }
    .bubble {
        white-space: pre-wrap;
        word-break: break-word;
        padding: 0.45rem 0.6rem;
        border-radius: 0.5rem;
        font-size: 0.82rem;
        line-height: 1.45;
        max-width: 90%;
    }
    .msg.user .bubble {
        background-color: var(--blue);
        color: var(--text-on-blue, white);
    }
    .msg.assistant .bubble {
        background-color: var(--base);
    }
    .tools {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    .chip {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.72rem;
        font-family: monospace;
        background-color: var(--base);
        border: 1px solid var(--outline);
        border-radius: 0.3rem;
        padding: 0.2rem 0.4rem;
    }
    .chip.err {
        border-color: var(--red);
    }
    .chip .tname {
        color: var(--blue);
    }
    .chip .dot {
        opacity: 0.8;
    }
    .plan {
        display: flex;
        flex-direction: column;
        max-height: 55%; /* cap height so the approve button stays visible; body scrolls */
        margin: 0 0.5rem 0.5rem;
        padding: 0.6rem 0.7rem;
        background-color: var(--base);
        border: 1px solid var(--blue);
        border-radius: 0.4rem;
        font-size: 0.8rem;
    }
    .plan-head {
        flex: none;
        font-weight: 600;
        color: var(--blue);
        margin-bottom: 0.3rem;
    }
    .plan-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
    }
    .plan-summary {
        margin-bottom: 0.3rem;
    }
    .plan-steps {
        margin: 0.2rem 0 0.3rem 1.1rem;
        padding: 0;
        line-height: 1.5;
    }
    .plan-assume {
        opacity: 0.8;
        font-size: 0.75rem;
        margin-top: 0.2rem;
    }
    .plan-assume ul {
        margin: 0.1rem 0 0 1rem;
        padding: 0;
    }
    .plan-actions {
        flex: none;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-top: 0.5rem;
        padding-top: 0.4rem;
        border-top: 1px solid var(--outline);
    }
    .plan-actions .approve {
        padding: 0.35rem 0.9rem;
        border: none;
        border-radius: 0.3rem;
        background-color: var(--blue);
        color: var(--text-on-blue, white);
        cursor: pointer;
        font-size: 0.8rem;
    }
    .plan-actions .approve:disabled {
        opacity: 0.5;
        cursor: default;
    }
    .plan-actions .hint {
        opacity: 0.6;
        font-size: 0.72rem;
    }
    .banner {
        background-color: var(--red);
        color: var(--text-on-red, white);
        font-size: 0.78rem;
        padding: 0.4rem 0.75rem;
    }
    .composer {
        display: grid;
        grid-template-columns: 1fr min-content;
        gap: 0.5rem;
        padding: 0.5rem;
        border-top: 1px solid var(--outline);
    }
    textarea {
        resize: none;
        background-color: var(--base);
        color: var(--text);
        border: 1px solid var(--outline);
        border-radius: 0.3rem;
        padding: 0.4rem 0.5rem;
        font-size: 0.82rem;
        font-family: inherit;
    }
    .send {
        align-self: stretch;
        padding: 0 0.9rem;
        border: none;
        border-radius: 0.3rem;
        background-color: var(--blue);
        color: var(--text-on-blue, white);
        cursor: pointer;
        font-size: 0.82rem;
    }
    .send.stop {
        background-color: var(--red);
        color: var(--text-on-red, white);
    }
</style>
