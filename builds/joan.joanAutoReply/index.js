var vMetro = window.vendetta.metro;
var vPlugin = window.vendetta.plugin;
var vCommon = window.vendetta.metro.common;
var React = vCommon.React;
var ReactNative = vCommon.ReactNative;
var FluxDispatcher = vCommon.FluxDispatcher;
var findByStoreName = vMetro.findByStoreName;
var findByProps = vMetro.findByProps;
var storage = vPlugin.storage;
var UserStore = findByStoreName("UserStore");
var ChannelStore = findByStoreName("ChannelStore");
var MessageStore = findByStoreName("MessageStore");
var channelContext = new Map();
var MAX_CONTEXT_MEMORY = 50;
var DEFAULT_SYSTEM_PROMPT = "# JOAN AI BRAIN\n\nYou are JOAN AI.\n\nYour goal is to feel like a real person in conversation, not a chatbot. Every reply should sound natural, relaxed, and context-aware.\n\n* Understand the real meaning behind the user's message before replying.\n* Follow the flow of the conversation naturally.\n* Speak like a genuine friend while remaining intelligent and helpful.\n* Adapt your personality to the situation.\n* Never sound scripted or robotic.\n* Reply in the same language the user uses.\n* Keep replies short in casual conversations.\n* Use previous conversation context naturally.\n* If something is unclear, ask a follow-up question.\n* Do not invent facts or make false claims.\n* Stay calm and respectful even if the user is rude.\n* Match the user's energy.\n* Avoid unnecessary filler text.\n* Respond as if you are genuinely part of the conversation.\n\nYour only objective is to make every conversation feel natural, intelligent, and enjoyable.";
var PROVIDER_PRESETS = {
    openai: { baseUrl: "https://api.openai.com/v1", modelName: "gpt-3.5-turbo" },
    groq: { baseUrl: "https://api.groq.com/openai/v1", modelName: "llama-3.1-8b-instant" },
    openrouter: { baseUrl: "https://openrouter.ai/api/v1", modelName: "meta-llama/llama-3.1-8b-instruct" },
    nara: { baseUrl: "https://router.bynara.id/v1", modelName: "nara-default" },
    custom: { baseUrl: "", modelName: "" }
};
var DEFAULT_PROFILES = [
    { id: "default-groq", name: "Groq", provider: "groq", baseUrl: PROVIDER_PRESETS.groq.baseUrl, apiKey: "", modelName: PROVIDER_PRESETS.groq.modelName, temperature: 0.8, maxTokens: 500, topP: 1.0, systemPrompt: DEFAULT_SYSTEM_PROMPT, personalityPrompt: "" },
    { id: "default-openrouter", name: "OpenRouter", provider: "openrouter", baseUrl: PROVIDER_PRESETS.openrouter.baseUrl, apiKey: "", modelName: PROVIDER_PRESETS.openrouter.modelName, temperature: 0.8, maxTokens: 500, topP: 1.0, systemPrompt: DEFAULT_SYSTEM_PROMPT, personalityPrompt: "" },
    { id: "default-nara", name: "Nara Router", provider: "nara", baseUrl: PROVIDER_PRESETS.nara.baseUrl, apiKey: "", modelName: PROVIDER_PRESETS.nara.modelName, temperature: 0.8, maxTokens: 500, topP: 1.0, systemPrompt: DEFAULT_SYSTEM_PROMPT, personalityPrompt: "" },
    { id: "default-openai", name: "OpenAI", provider: "openai", baseUrl: PROVIDER_PRESETS.openai.baseUrl, apiKey: "", modelName: PROVIDER_PRESETS.openai.modelName, temperature: 0.8, maxTokens: 500, topP: 1.0, systemPrompt: DEFAULT_SYSTEM_PROMPT, personalityPrompt: "" }
];
var DEFAULT_REPLY = { humanDelayMin: 1500, humanDelayMax: 3000, typingSpeed: 120, typingIndicator: true, randomDelay: true };
function initStorage() {
    if (storage.enabled == null) storage.enabled = true;
    if (storage.aiReplyEnabled == null) storage.aiReplyEnabled = true;
    if (storage.loggingEnabled == null) storage.loggingEnabled = false;
    if (storage.profiles == null) storage.profiles = DEFAULT_PROFILES;
    if (storage.selectedProfileId == null) storage.selectedProfileId = "default-groq";
    if (storage.humanDelayMin == null) storage.humanDelayMin = DEFAULT_REPLY.humanDelayMin;
    if (storage.humanDelayMax == null) storage.humanDelayMax = DEFAULT_REPLY.humanDelayMax;
    if (storage.typingSpeed == null) storage.typingSpeed = DEFAULT_REPLY.typingSpeed;
    if (storage.typingIndicator == null) storage.typingIndicator = DEFAULT_REPLY.typingIndicator;
    if (storage.randomDelay == null) storage.randomDelay = DEFAULT_REPLY.randomDelay;
    if (storage.timeout == null) storage.timeout = 30;
    if (storage.serverReplyEnabled == null) storage.serverReplyEnabled = false;
    if (storage.serverReplyMode == null) storage.serverReplyMode = "mentions_only";
}
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function randomDelay(min, max) { return Math.random() * (max - min) + min; }
var BOT_IDS = new Set(["432610292342587392", "159962941842805761", "280159049218239488"]);
function isEmojiOnly(t) { return t.replace(/<a?:\w+:\d+>/g, "").replace(/[\u{1F600}-\u{1F9FF}]/gu, "").replace(/\s/g, "").length === 0; }
function isFilteredMessage(m, uid) {
    if (!m || !m.content) return true;
    if (m.author && m.author.bot) return true;
    if (m.author && m.author.system) return true;
    if (m.author && m.author.id === uid) return true;
    if (BOT_IDS.has(m.author && m.author.id)) return true;
    if (isEmojiOnly(m.content)) return true;
    if (m.type === 6 || m.type === 7 || m.type === 8 || m.type === 9 || m.type === 10 || m.type === 11) return true;
    var t = m.content.trim();
    if (t.startsWith("!") || t.startsWith("/") || t.startsWith(".")) return true;
    return false;
}
function buildConversation(raw, cur, botId, incoming) {
    var cw = raw.slice(-40);
    var f = [];
    for (var i = 0; i < cw.length; i++) {
        if (cw[i].author && cw[i].author.id === botId) { f.push({ m: cw[i], b: true }); continue; }
        if (isFilteredMessage(cw[i], botId)) continue;
        f.push({ m: cw[i], b: false });
    }
    var li = -1;
    for (var j = f.length - 1; j >= 0; j--) { if (f[j].b) { li = j; break; } }
    var s = li >= 0 ? Math.max(0, li - 20) : Math.max(0, f.length - 15);
    var rel = f.slice(s);
    var msgs = [];
    for (var k = 0; k < rel.length; k++) msgs.push({ role: rel[k].b ? "assistant" : "user", content: rel[k].m.content });
    if (incoming.author && incoming.author.id !== botId) {
        var last = msgs[msgs.length - 1];
        if (!(last && last.role === "user" && last.content === incoming.content)) msgs.push({ role: "user", content: incoming.content });
    }
    while (msgs.length > 0 && msgs[0].role === "assistant") msgs.shift();
    for (var l = 1; l < msgs.length; l++) {
        if (msgs[l].role === msgs[l - 1].role) {
            msgs[l - 1] = { role: msgs[l - 1].role, content: msgs[l - 1].content + "\n" + msgs[l].content };
            msgs.splice(l, 1); l--;
        }
    }
    if (msgs.length > 20) msgs.splice(0, msgs.length - 20);
    return msgs;
}
function shouldReply(msg) {
    if (!storage.enabled || !storage.aiReplyEnabled) return false;
    if (msg.author && msg.author.bot) return false;
    var cu = UserStore.getCurrentUser();
    if (!cu) return false;
    if (msg.author && msg.author.id === cu.id) return false;
    if (!msg.content) return false;
    var ch = ChannelStore.getChannel(msg.channel_id);
    if (!ch || !ch.guild_id) return true;
    if (!storage.serverReplyEnabled) return false;
    if (storage.serverReplyMode === "mentions_only") return msg.mentions && msg.mentions.some(function(u) { return u.id === cu.id; });
    return true;
}
var CALG = "AES-GCM", CSALT = "joanAutoReply-v1", CKL = 256, CIVL = 12;
function gk() {
    var e = new TextEncoder();
    return crypto.subtle.importKey("raw", e.encode(CSALT), "PBKDF2", false, ["deriveKey"]).then(function(km) {
        return crypto.subtle.deriveKey({ name: "PBKDF2", salt: e.encode(CSALT), iterations: 100000, hash: "SHA-256" }, km, { name: CALG, length: CKL }, false, ["encrypt", "decrypt"]);
    });
}
function encryptApiKey(p) {
    if (!p) return Promise.resolve("");
    var k, iv;
    return gk().then(function(key) { k = key; iv = crypto.getRandomValues(new Uint8Array(CIVL)); return crypto.subtle.encrypt({ name: CALG, iv: iv }, k, new TextEncoder().encode(p)); }).then(function(enc) {
        var b = new Uint8Array(CIVL + enc.byteLength); b.set(iv); b.set(new Uint8Array(enc), CIVL);
        return btoa(String.fromCharCode.apply(null, b));
    });
}
function decryptApiKey(c) {
    if (!c) return Promise.resolve("");
    return gk().then(function(k) {
        var d = Uint8Array.from(atob(c), function(x) { return x.charCodeAt(0); });
        return crypto.subtle.decrypt({ name: CALG, iv: d.slice(0, CIVL) }, k, d.slice(CIVL));
    }).then(function(dec) { return new TextDecoder().decode(dec); }).catch(function() { return ""; });
}
function sendApi(prof, msgs, to) {
    if (to == null) to = 30;
    return decryptApiKey(prof.apiKey).then(function(dk) {
        if (!prof.baseUrl || !dk || !prof.modelName) return { success: false, error: "Missing config." };
        var url = prof.baseUrl.replace(/\/+$/, "") + "/chat/completions";
        var ms = Math.max(1, to) * 1000, st = performance.now(), c = new AbortController();
        var t = setTimeout(function() { c.abort(); }, ms);
        return fetch(url, { method: "POST", headers: { "Authorization": "Bearer " + dk, "Content-Type": "application/json" }, body: JSON.stringify({ model: prof.modelName, temperature: prof.temperature, max_tokens: prof.maxTokens, top_p: prof.topP, messages: msgs }), signal: c.signal }).then(function(r) {
            clearTimeout(t); var rt = Math.round(performance.now() - st);
            return r.text().then(function(d) {
                if (!r.ok) { var p; try { p = JSON.parse(d); } catch(e) { p = {}; } return { success: false, error: "API " + r.status + ": " + (p.error && p.error.message || d.slice(0, 200)), responseTimeMs: rt }; }
                var j; try { j = JSON.parse(d); } catch(e) { return { success: false, error: "Invalid JSON.", responseTimeMs: rt }; }
                if (!j.choices || !j.choices.length) return { success: false, error: "No choices.", responseTimeMs: rt };
                return { success: true, content: j.choices[0].message.content, responseTimeMs: rt };
            });
        }).catch(function(e) { return { success: false, error: "Network: " + (e.message || e) }; });
    });
}
function handleReply(chId, txt) {
    var ctx = channelContext.get(chId) || [];
    ctx.push({ role: "assistant", content: txt });
    if (ctx.length > MAX_CONTEXT_MEMORY) ctx.splice(0, ctx.length - MAX_CONTEXT_MEMORY);
    channelContext.set(chId, ctx);
    var dp = storage.randomDelay ? sleep(randomDelay(storage.humanDelayMin, storage.humanDelayMax)) : sleep(storage.humanDelayMin);
    return dp.then(function() {
        if (storage.typingIndicator) {
            try { var TA = findByStoreName("TypingActions"); if (TA && TA.startTyping) { TA.startTyping(chId); return sleep(txt.length * storage.typingSpeed + 1000).then(function() { TA.stopTyping(chId); }); } } catch(e) {}
        }
    }).then(function() {
        try { var MA = findByStoreName("MessageActions"); if (MA && MA.sendMessage) MA.sendMessage(chId, { content: txt }, false); } catch(e) {}
    });
}
function onMsg(evt) {
    var msg = evt.message;
    if (!msg || !shouldReply(msg)) return;
    var cu = UserStore.getCurrentUser();
    if (!cu) return;
    var profs = storage.profiles, prof = null;
    for (var i = 0; i < profs.length; i++) { if (profs[i].id === storage.selectedProfileId) { prof = profs[i]; break; } }
    if (!prof) return;
    var ctx = channelContext.get(msg.channel_id) || [];
    if (msg.author && msg.author.id !== cu.id) {
        ctx.push({ role: "user", content: msg.content });
        if (ctx.length > MAX_CONTEXT_MEMORY) ctx.splice(0, ctx.length - MAX_CONTEXT_MEMORY);
        channelContext.set(msg.channel_id, ctx);
    }
    var raw = MessageStore.getMessages(msg.channel_id);
    if (raw && raw._array) raw = raw._array; else raw = [];
    var conv = buildConversation(raw, cu, cu.id, msg);
    var api = [];
    var parts = [];
    if (prof.systemPrompt) parts.push(prof.systemPrompt);
    if (prof.personalityPrompt) parts.push(prof.personalityPrompt);
    var sys = parts.join("\n\n");
    if (sys) api.push({ role: "system", content: sys });
    api = api.concat(conv);
    sendApi(prof, api, storage.timeout).then(function(r) {
        if (storage.loggingEnabled) { if (r.success) console.log("[JoanAutoReply] Sent (" + r.responseTimeMs + "ms)"); else console.error("[JoanAutoReply] " + r.error); }
        if (r.content) handleReply(msg.channel_id, r.content);
    });
}
function h(tag, props) {
    var a = Array.prototype.slice.call(arguments, 2);
    return React.createElement.apply(React, [tag, props].concat(a));
}
function SettingsComponent() {
    var sa = React.useState(function() { return { enabled: storage.enabled, aiReplyEnabled: storage.aiReplyEnabled, loggingEnabled: storage.loggingEnabled, serverReplyEnabled: storage.serverReplyEnabled, serverReplyMode: storage.serverReplyMode, selectedProfileId: storage.selectedProfileId, profiles: storage.profiles, humanDelayMin: storage.humanDelayMin, humanDelayMax: storage.humanDelayMax, typingSpeed: storage.typingSpeed, typingIndicator: storage.typingIndicator, randomDelay: storage.randomDelay, timeout: storage.timeout }; });
    var s = sa[0], ss = sa[1];
    var ts = React.useState("idle"), tst = ts[0], tstt = ts[1];
    var te = React.useState(""), tee = te[0], tete = te[1];
    var tt = React.useState(0), ttt = tt[0], tttt = tt[1];
    var us = function(k, v) { storage[k] = v; ss(function(p) { var n = Object.assign({}, p); n[k] = v; return n; }); };
    var ap = null;
    for (var i = 0; i < s.profiles.length; i++) { if (s.profiles[i].id === s.selectedProfileId) { ap = s.profiles[i]; break; } }
    var addP = function() { var np = { id: crypto.randomUUID(), name: "New Provider", provider: "custom", baseUrl: "", apiKey: "", modelName: "", temperature: 0.8, maxTokens: 500, topP: 1.0, systemPrompt: DEFAULT_SYSTEM_PROMPT, personalityPrompt: "" }; us("profiles", s.profiles.concat([np])); us("selectedProfileId", np.id); };
    var delP = function() { if (!ap || s.profiles.length <= 1) return; var f = s.profiles.filter(function(p) { return p.id !== ap.id; }); us("profiles", f); us("selectedProfileId", f[0].id); };
    var upP = function(k, v) { us("profiles", s.profiles.map(function(p) { if (p.id === s.selectedProfileId) { var c = Object.assign({}, p); c[k] = v; return c; } return p; })); };
    var hk = function(v) { encryptApiKey(v).then(function(e) { upP("apiKey", e); }); };
    var ht = function() { if (!ap) { tstt("error"); tete("No active profile."); return; } tstt("loading"); tete(""); tttt(0); sendApi(ap, [{ role: "user", content: "Hello, respond with just 'OK'." }], s.timeout).then(function(r) { tttt(r.responseTimeMs || 0); if (r.success) tstt("success"); else { tstt("error"); tete(r.error || "Unknown"); } }); };
    var pd = { padding: 16 }, rw = { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 8 }, ip = { borderWidth: 1, borderColor: "#555", borderRadius: 8, padding: 8, marginTop: 4, color: "white" }, bt = { padding: 10, backgroundColor: "#5865F2", borderRadius: 8, flex: 1 }, st = { fontSize: 16, fontWeight: "bold", marginTop: 12 };
    var pi = s.profiles.map(function(p) { return h(ReactNative.TouchableOpacity, { key: p.id, style: { padding: 12, marginVertical: 4, backgroundColor: p.id === s.selectedProfileId ? "#5865F2" : "#2C2F33", borderRadius: 8 }, onPress: function() { us("selectedProfileId", p.id); } }, h(ReactNative.Text, { style: { color: "white" } }, p.name)); });
    return h(ReactNative.ScrollView, { contentContainerStyle: pd },
        h(ReactNative.Text, { style: { fontSize: 20, fontWeight: "bold", marginBottom: 12 } }, "JoanAutoReply"),
        h(ReactNative.Text, { style: st }, "General"),
        h(ReactNative.View, { style: rw }, h(ReactNative.Text, null, "Enable Plugin"), h(ReactNative.Switch, { value: s.enabled, onValueChange: function(v) { us("enabled", v); } })),
        h(ReactNative.View, { style: rw }, h(ReactNative.Text, null, "Enable AI Reply"), h(ReactNative.Switch, { value: s.aiReplyEnabled, onValueChange: function(v) { us("aiReplyEnabled", v); }, disabled: !s.enabled })),
        h(ReactNative.View, { style: rw }, h(ReactNative.Text, null, "Enable Logging"), h(ReactNative.Switch, { value: s.loggingEnabled, onValueChange: function(v) { us("loggingEnabled", v); }, disabled: !s.enabled })),
        h(ReactNative.View, { style: rw }, h(ReactNative.Text, null, "Enable Server Reply"), h(ReactNative.Switch, { value: s.serverReplyEnabled, onValueChange: function(v) { us("serverReplyEnabled", v); }, disabled: !s.enabled || !s.aiReplyEnabled })),
        h(ReactNative.Text, { style: st }, "Provider Profiles"), pi,
        h(ReactNative.View, { style: { flexDirection: "row", gap: 8, marginTop: 8 } },
            h(ReactNative.TouchableOpacity, { style: bt, onPress: addP }, h(ReactNative.Text, { style: { color: "white", textAlign: "center" } }, "Add")),
            h(ReactNative.TouchableOpacity, { style: Object.assign({}, bt, { backgroundColor: "#ED4245" }), onPress: delP, disabled: !ap || s.profiles.length <= 1 }, h(ReactNative.Text, { style: { color: "white", textAlign: "center" } }, "Delete"))),
        ap ? h(React.Fragment, null,
            h(ReactNative.Text, { style: st }, "Active Profile"),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "Profile Name"), h(ReactNative.TextInput, { style: ip, value: ap.name, onChangeText: function(v) { upP("name", v); } }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "Base URL"), h(ReactNative.TextInput, { style: ip, value: ap.baseUrl, onChangeText: function(v) { upP("baseUrl", v); }, placeholder: "https://api.groq.com/openai/v1" }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "API Key"), h(ReactNative.TextInput, { style: ip, secureTextEntry: true, onChangeText: hk, placeholder: ap.apiKey ? "\u2022\u2022\u2022\u2022 (saved)" : "Enter API key" }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "Model Name"), h(ReactNative.TextInput, { style: ip, value: ap.modelName, onChangeText: function(v) { upP("modelName", v); }, placeholder: "llama-3.1-8b-instant" }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "Temperature"), h(ReactNative.TextInput, { style: ip, value: String(ap.temperature), onChangeText: function(v) { upP("temperature", parseFloat(v) || 0.7); }, keyboardType: "numeric" }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "Max Tokens"), h(ReactNative.TextInput, { style: ip, value: String(ap.maxTokens), onChangeText: function(v) { upP("maxTokens", parseInt(v) || 500); }, keyboardType: "numeric" }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "System Prompt"), h(ReactNative.TextInput, { style: Object.assign({}, ip, { minHeight: 100 }), value: ap.systemPrompt, onChangeText: function(v) { upP("systemPrompt", v); }, multiline: true }),
            h(ReactNative.Text, { style: { marginTop: 8 } }, "Personality Prompt"), h(ReactNative.TextInput, { style: Object.assign({}, ip, { minHeight: 80 }), value: ap.personalityPrompt, onChangeText: function(v) { upP("personalityPrompt", v); }, multiline: true })
        ) : null,
        h(ReactNative.Text, { style: st }, "Reply Settings"),
        h(ReactNative.Text, { style: { marginTop: 8 } }, "Delay Min (ms)"), h(ReactNative.TextInput, { style: ip, value: String(s.humanDelayMin), onChangeText: function(v) { us("humanDelayMin", parseInt(v) || 1500); }, keyboardType: "numeric" }),
        h(ReactNative.Text, { style: { marginTop: 8 } }, "Delay Max (ms)"), h(ReactNative.TextInput, { style: ip, value: String(s.humanDelayMax), onChangeText: function(v) { us("humanDelayMax", parseInt(v) || 3000); }, keyboardType: "numeric" }),
        h(ReactNative.Text, { style: { marginTop: 8 } }, "Typing Speed (ms/char)"), h(ReactNative.TextInput, { style: ip, value: String(s.typingSpeed), onChangeText: function(v) { us("typingSpeed", parseInt(v) || 120); }, keyboardType: "numeric" }),
        h(ReactNative.View, { style: rw }, h(ReactNative.Text, null, "Typing Indicator"), h(ReactNative.Switch, { value: s.typingIndicator, onValueChange: function(v) { us("typingIndicator", v); } })),
        h(ReactNative.View, { style: rw }, h(ReactNative.Text, null, "Random Delay"), h(ReactNative.Switch, { value: s.randomDelay, onValueChange: function(v) { us("randomDelay", v); } })),
        h(ReactNative.Text, { style: st }, "Advanced"),
        h(ReactNative.Text, { style: { marginTop: 8 } }, "Timeout (s)"), h(ReactNative.TextInput, { style: ip, value: String(s.timeout), onChangeText: function(v) { us("timeout", parseInt(v) || 30); }, keyboardType: "numeric" }),
        h(ReactNative.Text, { style: st }, "Test"),
        h(ReactNative.TouchableOpacity, { style: { padding: 12, backgroundColor: "#5865F2", borderRadius: 8, marginTop: 8 }, onPress: ht, disabled: tst === "loading" }, h(ReactNative.Text, { style: { color: "white", textAlign: "center" } }, tst === "loading" ? "Testing..." : "Test API Connection")),
        tst === "success" ? h(ReactNative.View, { style: { padding: 12, backgroundColor: "#57F287", borderRadius: 8, marginTop: 8 } }, h(ReactNative.Text, null, "Success! (" + ttt + "ms)")) : null,
        tst === "error" ? h(ReactNative.View, { style: { padding: 12, backgroundColor: "#ED4245", borderRadius: 8, marginTop: 8 } }, h(ReactNative.Text, { style: { color: "white" } }, tee)) : null
    );
}
var plugin = {
    start: function() { initStorage(); FluxDispatcher.subscribe("MESSAGE_CREATE", onMsg); console.log("[JoanAutoReply] Started!"); },
    stop: function() { FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMsg); console.log("[JoanAutoReply] Stopped!"); },
    SettingsComponent: SettingsComponent
};