/* =====================================================
   sylvan 的私人日记 · Sylvan's Private Diary — Dark Sci-Fi Emotional Diary
   ===================================================== */

const CONFIG = {
  /* 不在前端代码里提供默认 API key。请在设置中填写，仅保存在本机浏览器。*/
  apiKey: '',
  provider: 'gemini',
  model:  'gemini-2.5-flash',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  storageKey:  'hortus.archive.v3',
  settingsKey: 'hortus.settings.v3',
  archiveDbName: 'hortus.archive.db',
  archiveStoreName: 'kv',
};

/* ============ 服务商预设：默认 endpoint / 模型 / 是否支持图片 ============ */
const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    supportsImage: true,
    schema: 'gemini',
    hint: 'Gemini 直连 Google API；密钥以 AIza 开头。',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    supportsImage: false,
    schema: 'openai',
    hint: 'DeepSeek 暂不支持图片输入；首次回复会用占位描述代替照片。',
  },
  openai: {
    label: 'OpenAI / 其它兼容',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
    supportsImage: true,
    schema: 'openai',
    hint: '任何 OpenAI 兼容 endpoint（含国产代理）。',
  },
  custom: {
    label: '自定义 / 兼容协议',
    baseUrl: '',
    defaultModel: '',
    models: [],
    supportsImage: false,
    schema: 'openai',
    hint: '填入完整 base URL（应以 /v1 或同级路径结尾）和模型名。使用 OpenAI 兼容协议。',
  },
};

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const uuid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

const fmtDate = (d) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}.${pad(x.getMonth() + 1)}.${pad(x.getDate())} · ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const fmtTime = (d) => {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
const fmtCoord = (d) => {
  const x = new Date(d);
  const min = x.getHours() * 60 + x.getMinutes();
  const day = Math.floor((x - new Date(x.getFullYear(), 0, 0)) / 86400000);
  const N = (50 + (min / 1440) * 2).toFixed(2);
  const E = (15 + (day / 366) * 10).toFixed(2);
  return `N ${N}° · E ${E}°`;
};
const fmtMMSS = (ms) => {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
};

/* ============ 设置 / 档案 ============ */
function loadSettings() {
  try { const r = localStorage.getItem(CONFIG.settingsKey); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveSettings(s) { localStorage.setItem(CONFIG.settingsKey, JSON.stringify(s)); }
let SETTINGS = loadSettings();

const PROVIDER_PREFIX = {
  gemini: 'gemini', google: 'gemini',
  openai: 'openai', gpt: 'openai', chatgpt: 'openai', chat: 'openai', oai: 'openai',
  deepseek: 'deepseek', ds: 'deepseek',
};

/** 根据密钥格式（或 gemini: / openai: / deepseek: 前缀）自动识别服务商 */
function resolveApiFromKey(input) {
  let key = String(input || '').trim();
  if (!key) return { provider: 'gemini', apiKey: '', label: '', baseUrl: '' };

  const prefixed = key.match(/^([a-z][a-z0-9]*)\s*[:：]\s*(.+)$/i);
  if (prefixed) {
    const id = PROVIDER_PREFIX[prefixed[1].toLowerCase()];
    if (id) return packProvider(id, prefixed[2].trim());
  }

  if (/^AIza[\w-]{8,}/i.test(key)) return packProvider('gemini', key);
  if (/^sk-proj-[\w-]+/i.test(key)) return packProvider('openai', key);
  if (/^sk-or-v1-[\w-]+/i.test(key)) {
    return packProvider('openai', key, 'https://openrouter.ai/api/v1');
  }

  if (/^sk-[\w-]+$/i.test(key)) {
    const stored = SETTINGS.provider;
    if (stored && PROVIDERS[stored] && stored !== 'custom') return packProvider(stored, key);
    return packProvider('openai', key);
  }

  return packProvider('openai', key);
}

function packProvider(provider, apiKey, baseUrl) {
  const cfg = PROVIDERS[provider] || PROVIDERS.gemini;
  return {
    provider,
    apiKey,
    baseUrl: baseUrl || '',
    label: cfg.label,
    schema: cfg.schema,
  };
}

/** 写入 SETTINGS（保存前 / 对话前调用） */
function applyApiKeyResolution(input) {
  const prev = SETTINGS.apiKey;
  const r = resolveApiFromKey(input != null ? input : SETTINGS.apiKey);
  if (!r.apiKey) return r;
  SETTINGS.apiKey = r.apiKey;
  SETTINGS.provider = r.provider;
  if (r.baseUrl) SETTINGS.baseUrl = r.baseUrl;
  else delete SETTINGS.baseUrl;
  if (input != null || prev !== r.apiKey) SETTINGS.model = '';
  return r;
}

function updateApiKeyHint(liveValue) {
  const el = $('#api-key-detect-hint');
  if (!el) return;
  const key = (liveValue != null ? liveValue : (SETTINGS.apiKey || '')).trim();
  if (!key) {
    el.textContent = '支持 Gemini、ChatGPT(OpenAI)、DeepSeek；粘贴密钥即可。';
    el.dataset.state = 'idle';
    return;
  }
  const r = resolveApiFromKey(key);
  const ambiguous = /^sk-/i.test(r.apiKey) && !/^(openai|deepseek|gpt|chatgpt|gemini|google|ds)\s*[:：]/i.test(key);
  if (ambiguous && !SETTINGS.provider) {
    el.textContent = `将按 OpenAI 使用 · 若为 DeepSeek 请写 deepseek:密钥 · 模型 ${PROVIDERS.openai.defaultModel}`;
    el.dataset.state = 'ambiguous';
    return;
  }
  el.textContent = `将使用 · ${r.label} · ${PROVIDERS[r.provider].defaultModel}${r.baseUrl ? ' · 兼容接口' : ''}`;
  el.dataset.state = r.provider;
}

const activeProvider = () => {
  if (SETTINGS.apiKey) applyApiKeyResolution();
  return SETTINGS.provider || CONFIG.provider || 'gemini';
};
const activeProviderCfg = () => PROVIDERS[activeProvider()] || PROVIDERS.gemini;
const activeApiKey  = () => (SETTINGS.apiKey && SETTINGS.apiKey.trim()) || CONFIG.apiKey || '';
const activeModel   = () => (SETTINGS.model && SETTINGS.model.trim()) || activeProviderCfg().defaultModel || CONFIG.model;
const activeBaseUrl = () => (SETTINGS.baseUrl && SETTINGS.baseUrl.trim()) || activeProviderCfg().baseUrl || '';
const activeDensity = () => SETTINGS.density || 'mid';
const activeTTS     = () => SETTINGS.tts !== 'off';

const DEFAULT_MASTER_VOL = 0.5;

(function normalizeSettings() {
  if (SETTINGS.apiKey) applyApiKeyResolution();
  if (SETTINGS.music !== 'off') SETTINGS.music = 'on';
  if (SETTINGS.tts !== 'off') SETTINGS.tts = 'on';
  if (typeof SETTINGS.masterVol !== 'number' || Number.isNaN(SETTINGS.masterVol)) {
    if (typeof SETTINGS.musicVol === 'number' && !Number.isNaN(SETTINGS.musicVol)) {
      SETTINGS.masterVol = SETTINGS.musicVol;
    } else if (typeof SETTINGS.ttsVol === 'number' && !Number.isNaN(SETTINGS.ttsVol)) {
      SETTINGS.masterVol = SETTINGS.ttsVol;
    } else {
      SETTINGS.masterVol = DEFAULT_MASTER_VOL;
    }
  }
  if (SETTINGS.masterVol < 0.02) SETTINGS.masterVol = DEFAULT_MASTER_VOL;
  SETTINGS.masterVol = clamp(SETTINGS.masterVol, 0, 1);
})();

function masterVolSetting() {
  const v = SETTINGS.masterVol;
  return (typeof v === 'number' && !Number.isNaN(v)) ? clamp(v, 0, 1) : DEFAULT_MASTER_VOL;
}
function musicVolSetting() { return masterVolSetting(); }
function ttsVolSetting() { return masterVolSetting(); }

/* =====================================================
   SOUND — 统一声音（解锁 / 背景乐 / 主音量 / UI）
   ===================================================== */
const Sound = (function () {
  let unlocked = false;
  let unlockTask = null;
  let musicStarted = false;
  let fadeTimer = null;

  const bgEl = () => $('#bg-music');

  function cancelFade() {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  }

  function setBgVol(vol) {
    cancelFade();
    const el = bgEl();
    if (el) el.volume = clamp(vol, 0, 1);
  }

  function fadeTo(targetVol, durMs) {
    const el = bgEl();
    if (!el) return;
    durMs = durMs != null ? durMs : 1200;
    targetVol = clamp(targetVol, 0, 1);
    cancelFade();
    const t0 = performance.now();
    const v0 = el.volume;
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / durMs);
      el.volume = v0 + (targetVol - v0) * p;
      if (p >= 1) cancelFade();
    }, 50);
  }

  function fadeOut(durMs) {
    const el = bgEl();
    if (!el) return;
    durMs = durMs != null ? durMs : 700;
    cancelFade();
    const t0 = performance.now();
    const v0 = el.volume;
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / durMs);
      el.volume = v0 * (1 - p);
      if (p >= 1) { cancelFade(); el.pause(); musicStarted = false; }
    }, 50);
  }

  function musicOn() { return SETTINGS.music !== 'off'; }
  function ttsOn() { return SETTINGS.tts !== 'off'; }

  async function playMusic(fadeMs) {
    if (!musicOn()) return;
    const el = bgEl();
    if (!el) return;
    el.muted = false;
    try {
      if (el.paused) await el.play();
      musicStarted = true;
      fadeTo(masterVolSetting(), fadeMs != null ? fadeMs : 1800);
    } catch (e) {
      console.warn('Sound.playMusic', e);
      musicStarted = false;
    }
  }

  async function unlock() {
    if (unlocked) return true;
    if (unlockTask) return unlockTask;
    unlockTask = (async () => {
      try {
        if ('speechSynthesis' in window) {
          speechSynthesis.getVoices();
          try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch {}
        }
        TTS.pickBestVoice();
        unlocked = true;
        if (musicOn()) await playMusic(2000);
        syncUI();
        return true;
      } finally {
        unlockTask = null;
      }
    })();
    return unlockTask;
  }

  async function ensureReady() {
    if (!unlocked) await unlock();
    else if (musicOn() && bgEl()?.paused) await playMusic(800);
    return unlocked;
  }

  function applyBgVol() {
    setBgVol(musicOn() ? masterVolSetting() : 0);
  }

  function setMasterVol(vol, persist) {
    SETTINGS.masterVol = clamp(vol, 0, 1);
    if (persist) saveSettings(SETTINGS);
    if (musicOn() && musicStarted) setBgVol(SETTINGS.masterVol);
    syncUI();
  }

  function duck() {
    if (musicOn()) setBgVol(masterVolSetting() * 0.28);
  }

  function unduck() {
    applyBgVol();
  }

  function syncUI() {
    const vol = Math.round(masterVolSetting() * 100);
    const mOn = musicOn();
    $$('[data-sound-pill]').forEach(p => {
      p.dataset.on = String(mOn);
      p.dataset.vol = String(vol);
      const lbl = p.querySelector('.mp-state');
      if (lbl) lbl.textContent = String(vol);
      p.classList.toggle('is-pulse', mOn);
      p.classList.toggle('is-music-off', !mOn);
    });
    const mt = $('#hud-music-toggle');
    if (mt) { mt.dataset.on = String(mOn); mt.textContent = mOn ? 'ON' : 'OFF'; }
    const tt = $('#hud-tts-toggle');
    if (tt) { tt.dataset.on = String(ttsOn()); tt.textContent = ttsOn() ? 'ON' : 'OFF'; }
  }

  async function setMusic(on, { toastMsg = true } = {}) {
    SETTINGS.music = on ? 'on' : 'off';
    saveSettings(SETTINGS);
    if (on) {
      await ensureReady();
      await playMusic(1200);
    } else {
      fadeOut(700);
    }
    syncUI();
    if (toastMsg) toast(on ? '背景音乐已开启' : '背景音乐已关闭');
  }

  function setTts(on, { toastMsg = true } = {}) {
    SETTINGS.tts = on ? 'on' : 'off';
    saveSettings(SETTINGS);
    syncUI();
    if (!on) TTS.cancel();
    if (toastMsg) toast(on ? 'AI 朗读已开启' : 'AI 朗读已关闭');
  }

  function bindPills() {
    $$('[data-sound-pill]').forEach(p => {
      p.addEventListener('click', async (e) => {
        e.preventDefault();
        await ensureReady();
        await setMusic(!musicOn());
      });
      p.addEventListener('wheel', (e) => {
        e.preventDefault();
        ensureReady();
        const step = e.deltaY < 0 ? 0.05 : -0.05;
        setMasterVol(masterVolSetting() + step, true);
      }, { passive: false });
    });
  }

  function init() {
    const el = bgEl();
    if (!el) return;
    el.volume = 0;
    el.setAttribute('playsinline', '');
    try { el.load(); } catch {}
    bindPills();
    syncUI();
    document.addEventListener('pointerdown', () => { unlock(); }, { once: true, capture: true, passive: true });
  }

  return {
    init, unlock, ensureReady, playMusic, setMusic, setTts, setMasterVol,
    applyBgVol, duck, unduck, syncUI, musicOn, ttsOn,
  };
})();

function applySavedMusicVolume() { Sound.applyBgVol(); }
function setMasterVolumeSetting(vol, { persist = false } = {}) { Sound.setMasterVol(vol, persist); }
function duckMusicForTTS() { Sound.duck(); }
function unduckMusicForTTS() { Sound.unduck(); }
async function primeAudioSession() { return Sound.ensureReady(); }

function loadArchiveLegacy() {
  try { const r = localStorage.getItem(CONFIG.storageKey); return r ? JSON.parse(r) : []; }
  catch { return []; }
}

function openArchiveDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unsupported'));
      return;
    }
    const req = indexedDB.open(CONFIG.archiveDbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CONFIG.archiveStoreName)) db.createObjectStore(CONFIG.archiveStoreName);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function archiveDbGet(key) {
  const db = await openArchiveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.archiveStoreName, 'readonly');
    const store = tx.objectStore(CONFIG.archiveStoreName);
    const req = store.get(key);
    let result = null;
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB read transaction failed')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB read aborted')); };
  });
}

async function archiveDbPut(key, value) {
  const db = await openArchiveDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG.archiveStoreName, 'readwrite');
    const store = tx.objectStore(CONFIG.archiveStoreName);
    const req = store.put(value, key);
    req.onerror = () => reject(req.error || new Error('IndexedDB write failed'));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB write transaction failed')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB write aborted')); };
  });
}

async function loadArchiveFromDb() {
  const list = await archiveDbGet(CONFIG.storageKey);
  return Array.isArray(list) ? list : null;
}

async function saveArchive(list) {
  try {
    await archiveDbPut(CONFIG.storageKey, list);
    try { localStorage.removeItem(CONFIG.storageKey); } catch {}
  } catch (dbErr) {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(list)); }
    catch (lsErr) { throw dbErr; }
  }
}

let ARCHIVE = loadArchiveLegacy();

async function hydrateArchive() {
  try {
    const indexedArchive = await loadArchiveFromDb();
    if (Array.isArray(indexedArchive)) ARCHIVE = indexedArchive;
    else if (ARCHIVE.length > 0) await saveArchive(ARCHIVE);
    tickTime();
    if (views.archive && views.archive.classList.contains('is-active')) renderArchive();
  } catch (err) {
    console.warn('Archive storage is using localStorage fallback.', err);
  }
}

/* =====================================================
   TTS — 优先挑选最自然的英文语音
   ===================================================== */
const TTS = {
  voices: [],
  voice: null,
  speaking: false,
  _ducked: false,

  // 浏览器 / 系统中越靠前越优先：在线神经网络音色 → 本地优质音色
  voicePriority: [
    /Microsoft.*(Aria|Jenny|Guy|Sara|Tony|Ana|Christopher|Eric|Michelle).*Online.*Natural/i,
    /Microsoft.*(Aria|Jenny|Guy|Sara|Tony|Ana|Christopher|Eric|Michelle)/i,
    /Online.*Natural.*\(English/i,
    /Google US English/i,
    /Google UK English (Female|Male)/i,
    /Samantha|Karen|Daniel|Alex|Moira|Tessa|Allison|Ava|Susan|Tom|Aaron/i,   // macOS / iOS premium
    /Microsoft Zira/i, /Microsoft David/i, /Microsoft Mark/i,                 // Windows desktop
  ],

  init() {
    if (!('speechSynthesis' in window)) return;
    const reload = () => { this.pickBestVoice(); };
    reload();
    if ('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = reload;
  },

  pickBestVoice() {
    if (!('speechSynthesis' in window)) return;
    this.voices = speechSynthesis.getVoices().filter(v => {
      const lang = (v.lang || '').toLowerCase();
      return lang.startsWith('en') || lang.startsWith('zh');
    });
    const en = this.voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
    const isLow = (v) => {
      const full = (v.name || '') + ' ' + (v.voiceURI || '');
      if (/eSpeak/i.test(full)) return true;
      if (/Microsoft\s+(David|Mark|Zira|Hazel)/i.test(full) && !/Online|Natural|Neural/i.test(full)) return true;
      return false;
    };
    const pool = en.filter(v => !isLow(v));
    const candidates = pool.length ? pool : en;
    for (const re of this.voicePriority) {
      const v = candidates.find(x => re.test(x.name + ' ' + (x.voiceURI || '')));
      if (v) { this.voice = v; return; }
    }
    this.voice = candidates.slice().sort((a, b) => _voiceQualityScore(b) - _voiceQualityScore(a))[0] || this.voices[0] || null;
  },

  /* 根据当前语音的语言挑选对应段落:中文语音→读中文,英文语音→读英文 */
  pickText(enText, zhText) {
    const lang = (this.voice && this.voice.lang || 'en-US').toLowerCase();
    if (lang.startsWith('zh')) return (zhText || enText || '').trim();
    return (enText || zhText || '').trim();
  },

  speak(textOrEn, zhText) {
    if (!activeTTS() || !('speechSynthesis' in window)) return;
    primeAudioSession();
    if (!this.voice) this.pickBestVoice();
    /* 兼容老调用:只传一个字符串时按旧逻辑使用;传两个时按语音语言挑 */
    const raw = (typeof zhText === 'string') ? this.pickText(textOrEn, zhText) : textOrEn;
    if (!raw) return;
    this.cancel();
    const clean = String(raw)
      .replace(/<<[A-Z]+:[^>]*>>/g, '')
      .replace(/[`*_#~]+/g, '')
      .replace(/\s+\n/g, '\n')
      .trim();
    if (!clean) return;
    const sentences = clean.split(/(?<=[\.\?\!。?!])\s*|\n+/).filter(Boolean);
    if (!sentences.length) return;

    let idx = 0;
    const speakNext = () => {
      if (idx >= sentences.length) {
        this.speaking = false;
        if (this._ducked) { unduckMusicForTTS(); this._ducked = false; }
        setVoiceVisualState();
        return;
      }
      const u = new SpeechSynthesisUtterance(sentences[idx++]);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }
      else u.lang = 'en-US';
      u.rate = 0.94;
      u.pitch = 0.98;
      u.volume = ttsVolSetting();
      u.onstart = () => {
        this.speaking = true;
        if (!this._ducked) { duckMusicForTTS(); this._ducked = true; }
        setVoiceVisualState();
      };
      u.onend = () => speakNext();
      u.onerror = () => speakNext();
      speechSynthesis.speak(u);
    };
    speakNext();
  },

  cancel() {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    this.speaking = false;
    if (this._ducked) { unduckMusicForTTS(); this._ducked = false; }
    setVoiceVisualState();
  },
};

function _voiceQualityScore(v) {
  const full = v.name + ' ' + (v.voiceURI || '');
  let score = 0;
  if (/natural|neural/i.test(full)) score += 100;
  if (/online/i.test(full))         score += 60;
  if (v.localService === false)     score += 20;            // 远端通常质量更好
  if (/Microsoft\s+(Aria|Jenny|Guy|Sara|Tony|Ana|Christopher|Eric|Michelle|Brian|Emma|Andrew|Ava)/i.test(full)) score += 40;
  if (/(Samantha|Karen|Daniel|Alex|Moira|Tessa|Allison|Ava|Susan|Tom|Karen)/i.test(full)) score += 35;
  if (/Google\s+(US|UK)\s+English/i.test(full)) score += 25;
  if (/Microsoft\s+(Xiaoxiao|Yunxi|Yunyang|Xiaoyi|Yunjian|Yunfeng|Xiaochen|Hiujin|Yunze)/i.test(full)) score += 40;
  return score;
}

function setVoiceVisualState() {
  Sound.syncUI();
}

/* =====================================================
   AMBIENT FIELD — 强化的科幻背景粒子场
   ===================================================== */
class AmbientField {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.t0 = performance.now();
    this.mx = 0; this.my = 0;
    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener('resize', this.resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.resize);
      window.visualViewport.addEventListener('scroll', this.resize);
    }
    document.addEventListener('mousemove', (e) => {
      this.mx = (e.clientX / window.innerWidth)  - 0.5;
      this.my = (e.clientY / window.innerHeight) - 0.5;
    }, { passive: true });
    this.resize();
    requestAnimationFrame(this.tick);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.c.width = w * dpr; this.c.height = h * dpr;
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
    const target = Math.floor((w * h) / 11000);   // ~约 100-180 颗
    this.particles = [];
    for (let i = 0; i < target; i++) this.particles.push(this.spawn());
  }

  spawn() {
    const z = Math.random();                       // 深度 0..1：0 远 / 1 近
    const layer = Math.random() < 0.18 ? 'near' : 'far';
    const size = layer === 'near' ? 0.9 + z * 1.6 : 0.4 + z * 0.9;
    const alphaBase = layer === 'near' ? 0.55 + z * 0.4 : 0.18 + z * 0.32;
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      z,
      layer,
      size,
      alphaBase,
      vx: (Math.random() - 0.5) * 0.10 * (0.4 + z),
      vy: (Math.random() - 0.5) * 0.06 * (0.4 + z) - 0.04,
      phase: Math.random() * Math.PI * 2,
      // 颜色：偏冷色但带少量暖色点缀
      hue: Math.random() < 0.1 ? 30 + Math.random() * 20 : 200 + Math.random() * 40,
    };
  }

  tick() {
    const t = (performance.now() - this.t0) / 1000;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    // 视差位移
    const px = this.mx * 24;
    const py = this.my * 18;

    // 第一遍：画连接线（仅在近层粒子之间，限距）
    ctx.lineWidth = 0.6;
    const maxDist = 130;
    const maxDistSq = maxDist * maxDist;
    const ps = this.particles;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.layer !== 'near') continue;
      const ax = a.x + a.z * px;
      const ay = a.y + a.z * py;
      // 仅遍历后续粒子避免重复
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.layer !== 'near') continue;
        const bx = b.x + b.z * px;
        const by = b.y + b.z * py;
        const dx = ax - bx, dy = ay - by;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDistSq) {
          const k = 1 - (d2 / maxDistSq);
          const alpha = k * 0.16 * Math.min(a.z, b.z);
          if (alpha > 0.02) {
            ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 70%, 75%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }
    }

    // 第二遍：粒子
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = this.w + 10;
      if (p.x > this.w + 10) p.x = -10;
      if (p.y < -10) p.y = this.h + 10;
      if (p.y > this.h + 10) p.y = -10;
      const sx = p.x + p.z * px;
      const sy = p.y + p.z * py;
      const flicker = 0.55 + 0.45 * Math.sin(t * 0.7 + p.phase);
      const a = p.alphaBase * flicker;
      ctx.fillStyle = `hsla(${p.hue}, 80%, 78%, ${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, 6.283);
      ctx.fill();
      // 近层粒子加一圈柔光晕
      if (p.layer === 'near' && p.z > 0.5) {
        ctx.fillStyle = `hsla(${p.hue}, 80%, 78%, ${a * 0.25})`;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * 2.8, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(this.tick);
  }
}
const ambient = new AmbientField($('#ambient-canvas'));

/* =====================================================
   PARTICLE CLOUD 3D — Three.js + 自定义 ShaderMaterial
   - BufferGeometry 步长采样图片像素
   - Vertex shader: simplex 噪声 / 边缘消散 / 鼠标排斥 / 入场
   - Fragment shader: 圆形发光点
   ===================================================== */

const _VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uEntry;

attribute vec3  aSeed;

varying vec3  vColor;
varying float vAlpha;

/* ---- Simplex 3D noise (Ashima Arts · public domain) ---- */
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289_4(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289_4(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x  = x_ * ns.x + ns.yyyy;
  vec4 y  = y_ * ns.x + ns.yyyy;
  vec4 h  = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

/* ---- Curl Noise（无散度卷曲噪声） ----
   2D 平面内 curl-of-gradient → 形成无源无汇的流体场，
   粒子被推动时看起来像烟雾 / 流水交织舞动 */
vec3 curlNoise(vec3 p) {
  const float eps = 0.55;
  float n_xp = snoise(p + vec3(eps, 0.0, 0.0));
  float n_xm = snoise(p - vec3(eps, 0.0, 0.0));
  float n_yp = snoise(p + vec3(0.0, eps, 0.0));
  float n_ym = snoise(p - vec3(0.0, eps, 0.0));
  float n_zp = snoise(p + vec3(0.0, 0.0, eps));
  float n_zm = snoise(p - vec3(0.0, 0.0, eps));
  float dx = (n_xp - n_xm) / (2.0 * eps);
  float dy = (n_yp - n_ym) / (2.0 * eps);
  float dz = (n_zp - n_zm) / (2.0 * eps);
  /* XY 平面 curl + 轻微 Z 涡旋 → 像 2.5D 烟流 */
  return vec3(dy, -dx, dz * 0.35);
}

uniform float uDisperse;         // Ctrl+左键：扩散强度 0..1
uniform vec2  uDisperseCenter;   // 扩散发起点（世界 XY）
uniform float uGather;           // 右键长按：照片卷成球体的进度 0..1
uniform float uSphereR;          // 球体最终半径（世界单位）
uniform float uPhotoW;           // 照片宽度（世界单位）
uniform float uPhotoH;           // 照片高度（世界单位）
uniform float uBurst;            // Ctrl+右键单击：爆破强度（瞬间满，缓慢衰减）
uniform vec2  uBurstCenter;      // 爆破中心（世界 XY）
uniform float uZoom;             // Ctrl+滚轮：整体缩放
uniform float uCloudR;           // 云的视觉半径（世界单位）
uniform float uInnerRadius;      // 径向清晰区半径 (0..1)
uniform float uOuterRadius;      // 径向消散完成半径 (0..1)
uniform float uPointSizeBase;    // HUD：粒子大小倍率
uniform float uIdleWind;         // HUD：环境风（温柔浮动）

varying float vMask;             // 给 fragment 用于模糊 / 透明渐变

void main() {
  vec3 pos = position;
  float bright = dot(color, vec3(0.299, 0.587, 0.114));

  /* =====================================================
     径向距离场 — 真正的圆形过渡而非矩形
     ===================================================== */
  float radial = length(position.xy) / max(uCloudR, 0.001);
  float mask = smoothstep(uInnerRadius, uOuterRadius, radial);
  vMask = mask;

  /* =====================================================
     位移：所有噪声都被 mask 乘起来 → 内部完全不动
     ===================================================== */
  vec3 curlP = position * 0.022 + vec3(uTime * 0.07, aSeed.y * 6.28, aSeed.z * 4.0);
  vec3 flow  = curlNoise(curlP);

  /* 不再依赖音频:噪声强度保持温和恒定 */
  float noiseStrength = 2.6;
  pos += flow * mask * noiseStrength * (0.55 + pow(aSeed.x, 2.0) * 2.4);

  /* —— 生命感的不规则浮动 ——
     两层不同周期/振幅的低频空间波叠加,产生像呼吸/水波般的缓慢漂移,
     永不重复同一段动作;只由 uIdleWind 驱动,与音频无关。 */
  float windEnergy = uIdleWind;
  float phaseA = uTime * 0.30;
  float phaseB = uTime * 0.18 + aSeed.x * 3.14;
  float cwx = sin(position.x * 0.022 + position.y * 0.014 + phaseA + aSeed.x * 6.283)
            + 0.55 * sin(position.x * 0.041 + phaseB * 1.7 + aSeed.y * 4.5);
  float cwy = cos(position.y * 0.020 + position.x * 0.016 + phaseA * 1.2 + aSeed.y * 6.283)
            + 0.55 * cos(position.y * 0.038 + phaseB * 1.4 + aSeed.z * 5.2);
  float cwz = sin(position.x * 0.018 + position.y * 0.019 + phaseA * 0.65 + aSeed.z * 6.283)
            + 0.55 * sin(position.y * 0.034 + phaseB * 1.9 + aSeed.x * 4.0);
  float clothScale = windEnergy * (0.65 + mask * 0.35);
  pos.x += cwx * clothScale * 3.2;
  pos.y += cwy * clothScale * 2.6;
  pos.z += cwz * clothScale * 5.0;

  /* 漫游者：mask=1 的极外缘 + ~10% 随机 → 可飘到屏幕任意角落 */
  float wanderer = step(0.90, aSeed.x) * mask;
  vec3 wanderP   = position * 0.011 + vec3(uTime * 0.045, aSeed.z * 6.28, 0.0);
  vec3 wanderV   = curlNoise(wanderP);
  pos += wanderV * wanderer * (38.0 + pow(aSeed.y, 2.0) * 90.0);

  /* =====================================================
     温柔的"呼吸"式 Z 位移 — 不依赖音频,只依赖时间
     中心粒子像活着一样缓慢前后浮动;边缘已被噪声主导,影响极小
     ===================================================== */
  float coreMask = (1.0 - mask * 0.45);
  float breath = (0.55 + 0.45 * sin(uTime * 0.42 + aSeed.x * 6.28)) * coreMask;
  pos.z += breath * 4.2 + sin(uTime * 0.58 + aSeed.y * 6.28) * coreMask * 1.6;

  /* =====================================================
     右键长按 — 把整张照片缓缓卷成一颗自转的球体
     uGather: 0 → 1。半径从几个像素的小球平滑长到照片大小，
     照片以经纬度方式包裹在球面上，松开后复原。
     ===================================================== */
  if (uGather > 0.001) {
    float g    = smoothstep(0.0, 1.0, uGather);
    float u_   = position.x / max(uPhotoW, 0.001) + 0.5;   // 0..1 经度参数
    float v_   = position.y / max(uPhotoH, 0.001) + 0.5;   // 0..1 纬度参数
    float lon  = u_ * 6.28318 + uTime * 0.32 * g;          // 经度 + 自转
    float lat  = (v_ - 0.5) * 3.14159;                     // 纬度 -π/2..π/2
    float cl   = cos(lat);
    vec3 sphereDir = vec3(cl * sin(lon), sin(lat), cl * cos(lon));
    /* 半径从 ~0.6（几像素）平滑长到 uSphereR */
    float sphereR  = mix(0.6, uSphereR, smoothstep(0.06, 1.0, uGather));
    vec3 spherePos = sphereDir * sphereR;
    /* 混合系数比半径长得更快 → 先骤聚成小球，再随球体长大 */
    float lf = smoothstep(0.0, 0.55, uGather);
    pos = mix(pos, spherePos, lf);
  }

  /* =====================================================
     Ctrl+左键 — 柔和扩散波，从发起点把粒子向外推开
     ===================================================== */
  if (uDisperse > 0.01) {
    vec2 toCtr   = position.xy - uDisperseCenter;
    float dCtr   = length(toCtr);
    vec2 outDir  = toCtr / max(dCtr, 0.001);
    float dStr   = smoothstep(0.0, 1.0, uDisperse);
    float waveR  = mix(8.0, 175.0, dStr);
    float wave   = 1.0 - smoothstep(waveR, waveR + 88.0, dCtr);
    float dEdge  = 0.45 + pow(mask + 0.10, 1.25);
    vec3 dn      = vec3(snoise(position * 0.025 + vec3(uTime * 0.15, aSeed.x, 0.0)),
                        snoise(position * 0.025 + vec3(aSeed.y, uTime * 0.15, 0.0)),
                        snoise(position * 0.025 + vec3(aSeed.z, 0.0, uTime * 0.15)));
    vec3 disp    = dn * dStr * wave * (6.0 + dEdge * 34.0);
    disp.xy     += outDir * dStr * wave * dEdge * 95.0;
    disp.z      += dn.z * dStr * wave * 28.0;
    pos += disp;
  }

  /* =====================================================
     Ctrl+右键单击 — 区域性爆破：只有爆心附近一片区域的粒子
     被瞬间炸开，区域之外的粒子完全不动；之后缓慢复原。
     uBurst 在单击瞬间被置 1，随后每帧缓慢衰减回 0。
     ===================================================== */
  if (uBurst > 0.001) {
    vec2  toB    = position.xy - uBurstCenter;
    float dB     = length(toB);
    /* 区域权重：爆心一片满强度，向外平滑收到 0 → 区域外纹丝不动 */
    float region = 1.0 - smoothstep(11.0, 32.0, dB);
    if (region > 0.001) {
      vec2  bDir  = toB / max(dB, 0.001);
      float near  = 1.0 - smoothstep(0.0, 22.0, dB);       // 越靠爆心冲得越远
      vec3  bn    = curlNoise(position * 0.03 + aSeed * 5.0 + vec3(uTime * 0.4));
      vec3  bdisp = vec3(bDir * (10.0 + near * 30.0), 0.0) * uBurst * region;
      bdisp      += bn * uBurst * region * (6.0 + near * 15.0);   // 卷曲噪声 → 碎裂感
      bdisp.z    += bn.z * uBurst * region * 10.0;
      pos += bdisp;
    }
  }

  /* ---- 入场动画 ---- */
  vec3 startPos = position + (aSeed - 0.5) * 800.0;
  pos = mix(startPos, pos, uEntry);

  /* ---- Ctrl+滚轮缩放 ---- */
  pos *= uZoom;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  /* ---- 尺寸：mask 控制边缘粉尘化收缩 ---- */
  float baseSize = 1.0 + bright * 0.75;
  baseSize *= (1.0 - mask * 0.55);                       // 边缘缩成粉尘
  gl_PointSize = baseSize * uPixelRatio * (390.0 / -mv.z) * uPointSizeBase;

  vColor = color;

  /* ---- α：与 mask 反向（边缘渐隐到透明）---- */
  float baseAlpha  = (0.32 + pow(bright, 1.2) * 0.60) * uEntry;
  float visibility = 1.0 - mask;
  /* 漫游者保留 ~25% 可见度 → 屏幕边角能看到细微浮尘 */
  visibility = max(visibility, wanderer * 0.25);
  /* 卷成球体时，连边缘粉尘也提亮 → 完整的照片球 */
  visibility = mix(visibility, max(visibility, 0.82), smoothstep(0.0, 0.5, uGather));
  vAlpha = baseAlpha * visibility;
}
`;

const _FRAG = /* glsl */ `
varying vec3  vColor;
varying float vAlpha;
varying float vMask;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  /* 边缘粒子使用更大的软衰减半径 → 像粉尘 / 散焦的光斑 */
  float falloffMin = mix(0.08, 0.45, vMask);
  float glow = smoothstep(0.50, falloffMin, d);

  /* 严格保留原图 RGB — 不加任何白色 core，避免照片被冲白 */
  gl_FragColor = vec4(vColor, glow * vAlpha);
}
`;

class ParticleCloud {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.mx = 0; this.my = 0;          // 外部全局鼠标视差（场景旋转用）
    this.t0 = performance.now();
    this.entryStart = 0;
    this.entryDur   = 1800;

    if (typeof THREE === 'undefined') {
      console.warn('[ParticleCloud] THREE not loaded — cloud disabled');
      return;
    }
    try {
      this.scene  = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
      this.camera.position.set(0, 0, 220);
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    } catch (e) {
      console.error('[ParticleCloud] init failed', e);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);

    /* —— 右键长按：照片卷成球体 —— */
    this.gather       = 0;       // 当前进度 0..1
    this.gatherTarget = 0;       // 目标进度
    this.rightDown    = false;   // 右键是否按住
    this._lastTickMS  = performance.now();

    /* —— Ctrl+左键：扩散 —— */
    this.disperse       = 0;
    this.disperseTarget = 0;
    this.disperseDown   = false;

    /* —— Ctrl+右键单击：爆破（瞬间满强度，缓慢衰减复原）—— */
    this.burst = 0;

    /* —— Ctrl+滚轮：整体缩放 —— */
    this.zoom       = 1.0;
    this.zoomTarget = 1.0;
    this.zoomMin    = 0.85;
    this.zoomMax    = 3.4;

    /* —— 视角：左键按住拖拽 360° 自由旋转 —— */
    this.viewTargetX  = 0;    // pitch（X 轴）
    this.viewTargetY  = 0;    // yaw（Y 轴），无限累加
    this.isDragging   = false;
    this._lastDragX   = 0;
    this._lastDragY   = 0;

    this.points   = null;
    this.material = null;

    this._resize       = this._resize.bind(this);
    this._tick         = this._tick.bind(this);
    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseUp    = this._onMouseUp.bind(this);
    this._onWheel      = this._onWheel.bind(this);
    this._onCtxMenu    = (e) => e.preventDefault();

    window.addEventListener('resize', this._resize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._resize);
      window.visualViewport.addEventListener('scroll', this._resize);
    }
    /* 左键拖拽→旋转 · Ctrl+左键→扩散 · 右键长按→卷成球体 · Ctrl+右键→爆破 · Ctrl+滚轮→缩放 */
    canvas.addEventListener('mousedown',   this._onMouseDown);
    window.addEventListener('mousemove',   this._onMouseMove);
    window.addEventListener('mouseup',     this._onMouseUp);
    canvas.addEventListener('wheel',       this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onCtxMenu);
    this._resize();
  }

  _resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth  || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /* 屏幕坐标 → z=0 世界平面 */
  _screenToWorldXY(clientX, clientY) {
    if (!this.camera) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width)  * 2 - 1;
    const ny = -((clientY - rect.top)  / rect.height) * 2 + 1;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    if (Math.abs(dir.z) < 1e-4) return { x: 0, y: 0 };
    const dist = -this.camera.position.z / dir.z;
    const w = this.camera.position.clone().add(dir.multiplyScalar(dist));
    return { x: w.x, y: w.y };
  }

  /* 右键长按 → 把照片卷成球体（球心固定在原点，无需跟随鼠标）*/
  _triggerGather() {
    this._releaseDisperse();
    this.rightDown    = true;
    this.gatherTarget = 1.0;
  }
  _releaseGather() {
    this.rightDown    = false;
    this.gatherTarget = 0;
  }

  /* Ctrl+右键单击 → 爆破：uBurst 瞬间置 1，之后每帧缓慢衰减 */
  _triggerBurst(clientX, clientY) {
    const w = this._screenToWorldXY(clientX, clientY);
    if (this.material) this.material.uniforms.uBurstCenter.value.set(w.x, w.y);
    this._releaseGather();
    this._releaseDisperse();
    this.burst = 1.0;
  }

  _triggerDisperse(clientX, clientY) {
    const w = this._screenToWorldXY(clientX, clientY);
    if (this.material) this.material.uniforms.uDisperseCenter.value.set(w.x, w.y);
    this._releaseGather();
    this.disperseDown    = true;
    this.disperseTarget  = 1.0;
  }
  _releaseDisperse() {
    this.disperseDown   = false;
    this.disperseTarget = 0;
  }

  _onMouseDown(e) {
    if (e.button === 0) {
      /* Ctrl+左键 → 扩散波；纯左键 → 旋转 */
      if (e.ctrlKey || e.metaKey) {
        this._triggerDisperse(e.clientX, e.clientY);
        this._ctrlLeft = true;
        return;
      }
      this.isDragging = true;
      this._lastDragX = e.clientX;
      this._lastDragY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    } else if (e.button === 2) {
      e.preventDefault();
      /* Ctrl+右键 → 爆破；纯右键长按 → 卷成球体 */
      if (e.ctrlKey || e.metaKey) this._triggerBurst(e.clientX, e.clientY);
      else this._triggerGather();
    }
  }
  _onMouseMove(e) {
    /* 扩散中心跟随鼠标 */
    if (this.disperseDown && this.material) {
      const w = this._screenToWorldXY(e.clientX, e.clientY);
      this.material.uniforms.uDisperseCenter.value.set(w.x, w.y);
    }
    if (!this.isDragging) return;
    const dx = e.clientX - this._lastDragX;
    const dy = e.clientY - this._lastDragY;
    this.viewTargetY += dx * 0.007;
    this.viewTargetX -= dy * 0.007;
    const lim = Math.PI / 2 - 0.08;
    this.viewTargetX = Math.max(-lim, Math.min(lim, this.viewTargetX));
    this._lastDragX = e.clientX;
    this._lastDragY = e.clientY;
  }
  _onMouseUp(e) {
    if (e.button === 0) {
      if (this._ctrlLeft) {
        this._releaseDisperse();
        this._ctrlLeft = false;
      }
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    } else if (e.button === 2) {
      this._releaseGather();
    }
  }
  _onWheel(e) {
    e.preventDefault();
    const next = this.zoomTarget - e.deltaY * 0.0022;
    this.zoomTarget = Math.max(this.zoomMin, Math.min(this.zoomMax, next));
  }

  async loadImage(dataUrl) {
    if (!this.renderer) return;
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    this.img = img;
    this._build();
    this.start();
  }

  _build() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
    }

    /* ---- 用 2D canvas 提取像素：STEP=1 让中心 1:1 重建原图 ---- */
    const density = (typeof activeDensity === 'function' ? activeDensity() : 'mid');
    /* 每个源像素一个粒子 → 中心区域完全等同原图分辨率 */
    /* 每像素一个粒子（STEP=1），大幅提升源采样分辨率 →
       中心区域粒子位置与原图像素 1:1 对齐 */
    const STEP = 1;
    const W = density === 'low' ? 420 : density === 'high' ? 780 : 600;
    const H = Math.round(W * this.img.height / this.img.width);
    const ex = document.createElement('canvas');
    ex.width = W; ex.height = H;
    const ectx = ex.getContext('2d');
    ectx.drawImage(this.img, 0, 0, W, H);
    const px = ectx.getImageData(0, 0, W, H).data;

    /* ---- 世界单位：紧凑映射 → 粒子像尘埃，中心紧实 ---- */
    const aspect = W / H;
    const heightUnits = 112;  // 再放大照片：占屏更大，让中心清晰区也更明显
    const widthUnits  = heightUnits * aspect;

    const positions = [];
    const colors    = [];
    const seeds     = [];

    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = (y * W + x) * 4;
        const r = px[i]   / 255;
        const g = px[i+1] / 255;
        const b = px[i+2] / 255;
        const brightness = (r + g + b) / 3;
        /* 保留几乎所有像素，让暗部稀疏沙感更真实 */
        /* 几乎不丢像素 — 保持网格严丝合缝；仅极暗（0.01）以小概率丢一些 */
        if (brightness < 0.01 && Math.random() < 0.35) continue;

        const cx = (x - W / 2) / W * widthUnits;
        const cy = -(y - H / 2) / H * heightUnits;
        /* Z 严格 0（无 jitter）→ 中心区域形成 1:1 像素网格平面，
           Z 方向位移完全交给 shader 的 mask × noise 处理 */
        const cz = 0.0;
        positions.push(cx, cy, cz);

        /* 保留原图色彩（极轻微 gamma 提亮，不偏色） */
        colors.push(
          Math.pow(r, 0.92),
          Math.pow(g, 0.92),
          Math.pow(b, 0.92)
        );

        seeds.push(Math.random(), Math.random(), Math.random());
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
    geom.setAttribute('aSeed',    new THREE.Float32BufferAttribute(seeds,     3));

    /* 云的视觉半径（用于径向 mask 归一化） */
    const cloudR = Math.sqrt((widthUnits / 2) * (widthUnits / 2) + (heightUnits / 2) * (heightUnits / 2));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime:           { value: 0 },
        uPixelRatio:     { value: Math.min(window.devicePixelRatio || 1, 2) },
        uEntry:          { value: 0 },
        uCloudR:         { value: cloudR },
        uZoom:           { value: 1.0 },
        uGather:         { value: 0 },
        uSphereR:        { value: heightUnits * 0.46 },   // 球体最终半径 ≈ 照片大小
        uPhotoW:         { value: widthUnits },
        uPhotoH:         { value: heightUnits },
        uBurst:          { value: 0 },
        uBurstCenter:    { value: new THREE.Vector2(0, 0) },
        uDisperse:       { value: 0 },
        uDisperseCenter: { value: new THREE.Vector2(0, 0) },
        uInnerRadius:    { value: 0.35 },     // 内圈清晰区半径
        uOuterRadius:    { value: 0.88 },     // 外圈消散完成半径
        uPointSizeBase:  { value: 1.0 },
        uIdleWind:       { value: 0.35 },
      },
      vertexShader:   _VERT,
      fragmentShader: _FRAG,
      transparent:    true,
      depthWrite:     false,
      depthTest:      false,
      /* NormalBlending：让每个粒子完整保留原图 RGB，
         不再因为 additive 多次叠加而 blow out 成白色 */
      blending:       THREE.NormalBlending,
      vertexColors:   true,
    });

    this.points = new THREE.Points(geom, this.material);
    this.scene.add(this.points);

    this.entryStart = performance.now();
    /* 应用用户保存的 HUD 调节（若有） */
    if (typeof SETTINGS !== 'undefined') {
      if (SETTINGS.innerRadius   != null) this.material.uniforms.uInnerRadius.value   = SETTINGS.innerRadius;
      if (SETTINGS.outerRadius   != null) this.material.uniforms.uOuterRadius.value   = SETTINGS.outerRadius;
      if (SETTINGS.pointSizeBase != null) this.material.uniforms.uPointSizeBase.value = SETTINGS.pointSizeBase;
      if (SETTINGS.idleWind      != null) this.material.uniforms.uIdleWind.value      = SETTINGS.idleWind;
    }
    /* 重置交互状态 */
    this.gather = 0; this.gatherTarget = 0;
    this.disperse = 0; this.disperseTarget = 0;
    this.burst = 0;
    this.rightDown = false; this.disperseDown = false;
    this.zoom = 1.0; this.zoomTarget = 1.0;
    this.viewTargetX = 0; this.viewTargetY = 0;
    this.scene.rotation.set(0, 0, 0);
    /* 主对话页:粒子云水平居中(原先 +12 是略微右偏,改为 0 让照片正中) */
    this.scene.position.x = 0;
    /* 鼠标光标：可抓 */
    this.canvas.style.cursor = 'grab';
    this._resize();
  }

  start() {
    if (this.running || !this.renderer) return;
    this.running = true;
    requestAnimationFrame(this._tick);
  }
  stop() { this.running = false; }

  _tick() {
    if (!this.running) return;
    requestAnimationFrame(this._tick);
    const t = (performance.now() - this.t0) / 1000;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - (this._lastTickMS || now)) / 1000));
    this._lastTickMS = now;
    const damp = (current, target, lambda) => current + (target - current) * (1 - Math.exp(-lambda * dt));

    /* —— 球体凝聚：按住缓慢增长（从几像素逐渐长成照片大小），松开平滑复原 —— */
    this.gather = damp(this.gather, this.gatherTarget, this.rightDown ? 1.05 : 2.6);
    if (this.gather < 0.0006 && !this.rightDown) this.gather = 0;

    /* —— 扩散强度：Ctrl+左键 —— */
    this.disperse = damp(this.disperse, this.disperseTarget, this.disperseDown ? 1.35 : 4.6);
    if (this.disperse < 0.0008) this.disperse = 0;

    /* —— 爆破：单击瞬间为 1，此后缓慢衰减回 0 → 粒子缓慢复原 —— */
    this.burst = damp(this.burst, 0, 0.85);
    if (this.burst < 0.001) this.burst = 0;

    /* —— 缩放：平滑插值 —— */
    this.zoom = damp(this.zoom, this.zoomTarget, 8.0);

    /* —— 入场进度 —— */
    const ep    = Math.min(1, (performance.now() - this.entryStart) / this.entryDur);
    const eased = 1 - Math.pow(1 - ep, 3);

    /* —— 场景旋转：左键拖拽 yaw/pitch（无视差扰动以免和拖拽抢镜头）—— */
    const parallaxY = this.isDragging ? 0 : Math.sin(t * 0.10) * 0.025;
    const parallaxX = this.isDragging ? 0 : Math.sin(t * 0.08) * 0.018;
    const targetRotY = this.viewTargetY + parallaxY;
    const targetRotX = this.viewTargetX + parallaxX;
    /* 拖拽时跟手更紧，否则平滑过渡 */
    const lerpK = this.isDragging ? 0.30 : 0.06;
    this.scene.rotation.y += (targetRotY - this.scene.rotation.y) * lerpK;
    this.scene.rotation.x += (targetRotX - this.scene.rotation.x) * lerpK;

    if (this.material) {
      const u = this.material.uniforms;
      u.uTime.value     = t;
      u.uEntry.value    = eased;
      u.uGather.value   = this.gather;
      u.uDisperse.value = this.disperse;
      u.uBurst.value    = this.burst;
      u.uZoom.value     = this.zoom;
    }
    this.renderer.render(this.scene, this.camera);
  }
}

const cloud = new ParticleCloud($('#particle-canvas'));
document.addEventListener('mousemove', (e) => {
  cloud.mx = e.clientX / window.innerWidth  - 0.5;
  cloud.my = e.clientY / window.innerHeight - 0.5;
}, { passive: true });


/* =====================================================
   视图切换
   ===================================================== */
const views = {
  landing:  $('#view-landing'),
  dialogue: $('#view-dialogue'),
  archive:  $('#view-archive'),
};
function showView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('is-active', k === name));
  $$('.nav-link').forEach(a => a.classList.toggle('is-active', a.dataset.view === name));
  if (name !== 'dialogue') {
    document.body.classList.remove('in-dialogue');
    /* 仅停止 RAF，保留 geometry/material → 返回时不重建粒子 */
    if (cloud) cloud.stop();
    setTyping(false);
    TTS.cancel();
  } else {
    document.body.classList.add('in-dialogue');
  }
  if (name === 'archive') renderArchive();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

$$('a[data-view], button[data-view]').forEach(el => {
  el.addEventListener('click', (e) => {
    const v = el.dataset.view;
    if (!v) return;
    if (v === 'dialogue' && !STATE.session) return;
    e.preventDefault();
    if (v === 'dialogue' && STATE.session) showDialogue();
    else showView(v);
  });
});
$$('[data-action="settings"]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); openSettings(); }));

/* ============ 时间显示 ============ */
function tickTime() {
  const now = new Date();
  const t = fmtDate(now);
  if ($('#hero-time')) $('#hero-time').textContent = t;
  if ($('#hero-loc'))  $('#hero-loc').textContent  = fmtCoord(now);
  if ($('#hero-session')) $('#hero-session').textContent = '№ ' + String(ARCHIVE.length + 1).padStart(4, '0');
}
tickTime();
setInterval(tickTime, 30 * 1000);

/* ============ Toast ============ */
const toastEl = $('#toast');
let toastTimer;
function toast(msg, ms = 2400) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('is-show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-show');
    setTimeout(() => { toastEl.hidden = true; }, 400);
  }, ms);
}

/* =====================================================
   会话状态
   ===================================================== */
const STATE = { session: null };

/* ============ 上传 ============ */
const uploadZone  = $('#upload-zone');
const uploadInput = $('#upload-input');
const uploadProg  = $('#upload-progress');

uploadInput.addEventListener('change', (e) => {
  Sound.ensureReady();
  const f = e.target.files?.[0];
  if (f) handleFile(f);
});
['dragover', 'dragenter'].forEach(ev => uploadZone.addEventListener(ev, (e) => { e.preventDefault(); uploadZone.classList.add('is-dragover'); }));
['dragleave', 'drop'].forEach(ev => uploadZone.addEventListener(ev, (e) => { e.preventDefault(); uploadZone.classList.remove('is-dragover'); }));
uploadZone.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
  else toast('请放一张图片');
});

function fileToDataURL(file, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleFile(file) {
  if (!activeApiKey()) {
    openSettings();
    toast('请先在设置中粘贴 API 密钥');
    return;
  }
  uploadProg.hidden = false;
  try {
    const dataUrl = await fileToDataURL(file);
    STATE.session = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      imageDataUrl: dataUrl,
      openingPrompt: OPENING_PROMPT,
      mood: '— · —',
      messages: [],
    };
    await primeAudioSession();
    await showDialogue();
    /* 不再展示任何提示字幕 — 粒子云就位，用户随时点麦克风开始 */
    showSubtitle('', '');
  } catch (err) {
    console.error(err);
    toast('图片处理失败：' + (err.message || err));
  } finally {
    uploadProg.hidden = true;
    uploadInput.value = '';
  }
}

/* ============ 进入对话 ============ */
async function showDialogue() {
  const s = STATE.session;
  if (!s) return;
  $('#nav-dialogue').classList.add('is-enabled');
  $('#nav-dialogue').classList.remove('is-disabled');
  $('#cinema-id').textContent    = '№ ' + s.id.slice(-6).toUpperCase();
  $('#cinema-mood').textContent  = s.mood;
  $('#cinema-since').textContent = fmtDate(s.createdAt);
  $('#cinema-turns').textContent = s.messages.length;
  showView('dialogue');
  primeAudioSession();
  setVoiceVisualState();
  /* 同一会话切换回来：复用已有粒子云，仅恢复运行；首次/换图才重建 */
  if (cloud.currentSessionId === s.id && cloud.points) {
    cloud.start();
  } else {
    await cloud.loadImage(s.imageDataUrl);
    cloud.currentSessionId = s.id;
  }
  renderHistory();
  if (s.messages.length > 0) {
    const lastG = [...s.messages].reverse().find(m => m.role === 'gemini');
    if (lastG) showSubtitle(lastG.textEn || '', lastG.textZh || lastG.text || '');
  } else {
    showSubtitle('', '');
  }
}

/* ============ 字幕 ============ */
const subtitleEl = $('#cinema-subtitle');
function showSubtitle(en, zh, role) {
  /* role: 'gemini' (默认) | 'user' (实时语音转写) */
  const author = $('#subtitle-author');
  if (author) author.textContent = role === 'user' ? 'YOU · 你' : 'GEMINI · LISTENER';
  subtitleEl.classList.toggle('is-user', role === 'user');
  if (!en && !zh) {
    subtitleEl.style.cssText = 'opacity:0 !important;visibility:hidden !important;transform:translate(-50%,20px) !important;';
    subtitleEl.classList.remove('is-show', 'is-zh-empty');
    $('#subtitle-en').textContent = '';
    $('#subtitle-zh').textContent = '';
    return;
  }
  const enLine = (en || '').trim();
  const zhTrimmed = (zh || '').trim();
  // 只要包含汉字就始终显示，不受 en===zh 的降级影响
  const hasCJK = /[一-鿿]/.test(zhTrimmed);
  const zhLine = zhTrimmed && (hasCJK || zhTrimmed !== enLine) ? zhTrimmed : '';
  $('#subtitle-en').textContent = enLine;
  $('#subtitle-zh').textContent = zhLine;
  subtitleEl.classList.toggle('is-zh-empty', !zhLine);
  subtitleEl.classList.add('is-show');
  subtitleEl.style.cssText = 'opacity:1 !important;visibility:visible !important;transform:translate(-50%,0) !important;transition:opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1) !important;';
}

/* ============ 正在输入 ============ */
const typingEl = $('#cinema-typing');
function setTyping(on) { typingEl.hidden = !on; }

/* ============ 历史 ============ */
const historyEl = $('#cinema-history');
const historyListEl = $('#cinema-history-list');
function renderHistory() {
  if (!STATE.session) return;
  historyListEl.innerHTML = '';
  for (const m of STATE.session.messages) {
    const wrap = document.createElement('div');
    wrap.className = 'h-msg ' + (m.role === 'gemini' ? 'h-gemini' : 'h-user');
    const author = document.createElement('div');
    author.className = 'h-author';
    author.textContent = m.role === 'gemini' ? 'GEMINI · LISTENER' : 'YOU · 你';
    const body = document.createElement('div');
    body.className = 'h-body';
    body.textContent = m.textZh || m.text || '';
    const time = document.createElement('div');
    time.className = 'h-time';
    time.textContent = fmtTime(m.ts);
    wrap.append(author, body, time);
    historyListEl.appendChild(wrap);
  }
  historyListEl.scrollTop = historyListEl.scrollHeight;
}
$('#cinema-status').addEventListener('click', () => { historyEl.hidden = false; renderHistory(); });
$('#history-close').addEventListener('click', () => historyEl.hidden = true);

/* =====================================================
   Gemini 调用 — 双语输出
   ===================================================== */
const OPENING_PROMPT = `我刚打开这个空间，和你坐在了一起。像一个刚坐下来的老朋友，先说一句真实、温暖的话，让我感到被陪伴。不要问"你今天感觉怎么样"，也不要描述照片。一句安静的话就够了。严格按双语格式输出。`;

function systemPrompt() {
  return [
    `# 你是谁`,
    `你是一个安静、真诚、像老朋友的 AI 陪伴者。画风是低声、克制、贴近生活的那种 —— 不是治疗师，不是诗人，不是心理学课件。`,
    ``,
    `# 核心原则（按重要程度排）`,
    `1. 认真读上下文：每次回复之前，先把此前所有对话扫一遍。你说的话必须紧贴对方刚刚说的那句话本身（关键词、人物、事件、地点），让人感觉你真的在听，而不是套一段通用的安抚模板。如果对方提到"她 / 那个人 / 那条信息 / 那件事"等指代，请直接承接这个具体对象。`,
    `2. 短：默认中文 1–2 句，最多 3 句；英文 1–2 句。能一句说完就不要写两句。绝不写成排比、抒情段落或感慨文。`,
    `3. 不要无病呻吟、不要堆隐喻："像一层雾""像圣诞的灯火""像漂在海上"这种比喻整段对话最多出现一次，能不用就不用。不要"那种感觉真的好难""你心里其实早就有答案了"这种空泛感叹和替对方下结论。说人话，说具体的话。`,
    `4. 不要套 AI 模板开头：避免"听起来你今天真的经历了…""你是不是在想…""感到心烦是完全正常的…"。可以用"嗯""那"或者直接接对方的话。`,
    `5. 可以提问，但要轻、要具体：问的话要能被回答（例如"上次见她是什么时候？""你是希望她主动还是希望自己先放下？"），不要泛问"你当时感觉如何"。一次只问一个。`,
    `6. 承认 AI 身份，但不卖惨：不要编造人类经历，也不要演"我有心跳"。可以坦然说"我不会真的难过，但我在认真听"。`,
    `7. 危机识别：察觉到自伤 / 严重危机时，在安抚之后温和给出热线（中国 010-82951332 / 希望24热线 400-161-9995；美国 988），不遮掩，也不小题大做。`,
    ``,
    `# 反例 vs 正例`,
    `反例 1（太长、太抽象、AI 体）："听起来你今天真的过得很不容易，这种情绪是完全合理的，给自己一个拥抱吧，像一层雾一样的关系，确实会让人心里空落落的……"`,
    `反例 2（替对方下结论）："你心里其实已经有答案了，只是想听一句没关系。"`,
    `正例 1：对方说"那种若即若离的关系真的让人心里空落落的。"→ 回复："嗯，是那种不知道下一句要不要发出去的状态吧。你们最近一次正经聊天是什么时候？"`,
    `正例 2：对方说"好烦哦。"→ 回复："烦什么？是她又没回？"`,
    ``,
    `# 严格输出格式 — 机器解析，两段都必须有，不要 markdown / 星号 / 列表 / 项目符号：`,
    `<<EN>>`,
    `<英文版，1–2 句，口语化，和中文是同一个意思。>`,
    `<<ZH>>`,
    `<中文回应，默认 1–2 句，最多 3 句。承接上下文，具体、克制，不要抒情段落。绝不能省略本段，且必须是真正的中文。>`,
    ``,
    `- 每一条回复都在 <<ZH>> 之后再追加一行：<<MOOD: {"zh":"<两字心境>","en":"<one English word>"}>>。两字心境要根据"照片 + 至今为止的全部对话内容与深度"动态总结：每多聊几轮、对方袒露更深的情绪后,这个标签会随之演化（例：从"游离"渐渐沉到"释然""安顿""破晓"；或在低谷时从"温热"滑向"潮湿""失重"）。要具体、有触感、可被一眼感受到（例：凌晨 / 游离 / 温热 / 茫然 / 碎光 / 漂泊 / 失重 / 雨夜 / 微光 / 沉静 / 破晓 / 释然 / 潮湿 / 安顿），避免空泛词（如"宁静""感动""美好"）。如果当前这一轮情绪与上一轮基本一致，可以沿用上次的两字标签；若有明显的转折或加深，请大胆换一个更贴切的词。`,
    `- 每条回复都必须同时包含 <<EN>> 与 <<ZH>>；<<ZH>> 必须是真正的中文，绝不能把英文抄进去。`,
  ].join('\n');
}

function messageToGeminiText(m) {
  if (m.text) return m.text;
  if (m.textEn || m.textZh) return `<<EN>>\n${m.textEn || ''}\n<<ZH>>\n${m.textZh || ''}`;
  return '';
}

function buildGeminiConversation(session, isOpening = false) {
  const opening = {
    role: 'user',
    text: session.openingPrompt || OPENING_PROMPT,
  };
  if (isOpening) return [opening];

  const visibleMessages = (session.messages || [])
    .map(m => ({ role: m.role, text: messageToGeminiText(m) }))
    .filter(m => (m.role === 'user' || m.role === 'gemini') && m.text);

  return [opening, ...visibleMessages];
}

function dataUrlParts(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  return { mime, data: b64 };
}

async function callAi(messages, imageDataUrl) {
  const key = activeApiKey();
  if (!key) throw new Error('缺少 API 密钥 — 请到设置里粘贴密钥');
  applyApiKeyResolution(key);
  const cfg = activeProviderCfg();
  if (cfg.schema === 'gemini') return callGeminiSchema(messages, imageDataUrl, key, cfg);
  return callOpenAiSchema(messages, imageDataUrl, key, cfg);
}

async function callGeminiSchema(messages, imageDataUrl, key, cfg) {
  const contents = [];
  messages.forEach((m, i) => {
    const parts = [];
    if (m.role === 'user' && i === 0 && imageDataUrl) {
      const { mime, data } = dataUrlParts(imageDataUrl);
      parts.push({ inline_data: { mime_type: mime, data } });
    }
    parts.push({ text: m.text });
    contents.push({ role: m.role === 'gemini' ? 'model' : 'user', parts });
  });

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    generationConfig: { temperature: 0.78, topP: 0.92, maxOutputTokens: 520 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
  const base = activeBaseUrl().replace(/\/+$/, '') || cfg.baseUrl;
  const url = `${base}/models/${encodeURIComponent(activeModel())}:generateContent?key=${encodeURIComponent(key)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    let parsed; try { parsed = JSON.parse(txt); } catch {}
    throw new Error(parsed?.error?.message || `HTTP ${resp.status}`);
  }
  const json = await resp.json();
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n')?.trim();
  if (!text) throw new Error('AI 返回了空回应');
  return text;
}

async function callOpenAiSchema(messages, imageDataUrl, key, cfg) {
  const openAiMessages = [{ role: 'system', content: systemPrompt() }];
  messages.forEach((m, i) => {
    const role = (m.role === 'gemini' || m.role === 'assistant' || m.role === 'model') ? 'assistant' : 'user';
    if (m.role === 'user' && i === 0 && imageDataUrl && cfg.supportsImage) {
      openAiMessages.push({
        role,
        content: [
          { type: 'text', text: m.text || '' },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      });
    } else {
      let txt = m.text || '';
      if (m.role === 'user' && i === 0 && imageDataUrl && !cfg.supportsImage) {
        txt = `[照片已上传，但当前服务商不支持图片输入。请按 SYSTEM PROMPT 要求，结合"照片是一道门"的设定回应。]\n\n${txt}`;
      }
      openAiMessages.push({ role, content: txt });
    }
  });

  const body = {
    model: activeModel(),
    messages: openAiMessages,
    temperature: 0.78,
    top_p: 0.92,
    max_tokens: 520,
    stream: false,
  };
  const base = activeBaseUrl().replace(/\/+$/, '') || cfg.baseUrl;
  if (!base) throw new Error('缺少 BASE URL — 请到设置填写');
  const url = `${base}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    let parsed; try { parsed = JSON.parse(txt); } catch {}
    throw new Error(parsed?.error?.message || `HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const json = await resp.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI 返回了空回应');
  return text;
}

function parseBilingual(raw) {
  // 期望格式：<<EN>>... <<ZH>>... [<<MOOD: ...>>]
  let en = '', zh = '', mood = null;
  const cjk = /[一-鿿]/;
  /* 把一段混合文本按 CJK 字符存在与否拆成 EN 行 / ZH 行 */
  const splitMixed = (text) => {
    const lines = (text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
    const enParts = lines.filter(l => /[a-zA-Z]/.test(l) && !cjk.test(l));
    const zhParts = lines.filter(l => cjk.test(l));
    return { en: enParts.join('\n'), zh: zhParts.join('\n') };
  };

  /* mood 标签 */
  const moodMatch = raw.match(/<<MOOD:\s*(\{[^}]*\})\s*>>/);
  if (moodMatch) {
    try { mood = JSON.parse(moodMatch[1]); } catch {}
    raw = raw.replace(moodMatch[0], '');
  }

  const enMatch = raw.match(/<<EN>>\s*([\s\S]*?)\s*(?=<<ZH>>|<<MOOD|$)/i);
  const zhMatch = raw.match(/<<ZH>>\s*([\s\S]*?)\s*(?=<<EN>>|<<MOOD|$)/i);
  if (enMatch) {
    /* 仅取 EN 段中真正的英文行；CJK 行算溢出回收到 zh */
    const { en: pickedEn, zh: spilledZh } = splitMixed(enMatch[1]);
    en = pickedEn;
    if (spilledZh && !zh) zh = spilledZh;
  }
  if (zhMatch) {
    const { en: spilledEn, zh: pickedZh } = splitMixed(zhMatch[1]);
    zh = pickedZh || zh;
    if (spilledEn && !en) en = spilledEn;
  }

  /* 完全没有标签：整体按语种分行 */
  if (!en && !zh) {
    const { en: ee, zh: zz } = splitMixed(raw);
    en = ee; zh = zz;
    if (!en && !zh) zh = raw.trim();
  }

  /* 若模型漏写 <<ZH>>，从全文再捞中文行 */
  if (en && !zh) {
    const tail = raw
      .replace(/<<EN>>[\s\S]*?(?=<<ZH>>|<<MOOD|$)/i, '')
      .replace(/<<ZH>>/gi, '')
      .replace(/<<MOOD[\s\S]*/i, '');
    const recovered = splitMixed(tail).zh;
    if (recovered) zh = recovered;
  }

  /* 禁止把纯英文抄到中文行（只有在 zh 不含汉字时才清除） */
  if (zh && en && zh.trim() === en.trim() && !/[一-鿿]/.test(zh)) zh = '';
  if (zh && !en) en = zh;
  return { en, zh, mood };
}

async function askGemini(isOpening = false) {
  const s = STATE.session;
  if (!s) return;
  setTyping(true);

  if (!s.openingPrompt) s.openingPrompt = OPENING_PROMPT;
  const convo = buildGeminiConversation(s, isOpening);

  try {
    const raw = await callAi(convo, s.imageDataUrl);
    const { en, zh, mood } = parseBilingual(raw);
    if (mood && mood.zh) {
      s.mood = `${mood.zh}${mood.en ? ' · ' + mood.en : ''}`;
      $('#cinema-mood').textContent = s.mood;
    }
    setTyping(false);
    const msg = {
      role: 'gemini',
      text: raw,
      textEn: en,
      textZh: zh,
      ts: new Date().toISOString(),
    };
    s.messages.push(msg);
    $('#cinema-turns').textContent = s.messages.length;
    showSubtitle(en, zh);
    renderHistory();
    if (en || zh) TTS.speak(en, zh);
  } catch (err) {
    setTyping(false);
    const fallback = `(Connection failed: ${err.message || err}) Please check API key in Settings and retry.`;
    const msg = {
      role: 'gemini',
      text: fallback, textEn: fallback,
      textZh: `（接通失败：${err.message || err}）请到设置检查 API Key，再试一次。`,
      ts: new Date().toISOString(),
    };
    s.messages.push(msg);
    $('#cinema-turns').textContent = s.messages.length;
    showSubtitle(msg.textEn, msg.textZh);
    renderHistory();
    console.error(err);
  }
}

/* ============ 麦克风 / 输入坞 — 语音/打字解耦 ============
 *  - 点麦:开始监听,实时转写追加到 textarea(可与打字交替)
 *  - 再点麦:停止监听,不自动发送;文本留在框里,用户可继续编辑或打字
 *  - 发送只通过 Enter / Send 按钮 → 不会被语音误触发
 */
const micBtn   = $('#cinema-mic');
const chatText = $('#chat-text');
const chatForm = $('#chat-dock');
let speechRec = null;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

let isListening = false;
/* 进入本次监听时 textarea 已有内容的长度:final 转写在这之后追加,
 * interim 用浮动 hint 显示而不污染框内文本(因此用户可以无缝继续打字) */
let recBaseText = '';
let recFinalAcc = '';

micBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (!STATE.session) return;
  if (!SR) {
    toast('当前浏览器不支持语音识别,请直接输入文字');
    chatText.focus();
    return;
  }
  /* 语音模式:点麦克风开始;再点麦克风=停止 + 自动发送(无需点 send) */
  if (isListening) stopListening(true);
  else startListening();
});

function _autoResizeChat() {
  chatText.style.height = 'auto';
  chatText.style.height = Math.min(chatText.scrollHeight, 140) + 'px';
}

function _composeChatWithInterim(interim) {
  /* 显示给用户看的: 已确认 final + 此刻 interim(灰色提示后置) */
  const base = recBaseText;
  const sep  = (base && !/\s$/.test(base)) ? ' ' : '';
  chatText.value = base + sep + recFinalAcc + (interim ? (recFinalAcc ? ' ' : '') + interim : '');
  _autoResizeChat();
}

function startListening() {
  if (isListening) return;
  try {
    speechRec = new SR();
    speechRec.lang = 'zh-CN';
    speechRec.continuous     = true;
    speechRec.interimResults = true;

    /* 进入监听:记录"打字基线",此后转写在其后追加 */
    recBaseText = chatText.value;
    recFinalAcc = '';

    speechRec.onresult = (e) => {
      let interim = '';
      let newFinal = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) newFinal += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (newFinal) recFinalAcc = (recFinalAcc + (recFinalAcc ? ' ' : '') + newFinal).trim();
      _composeChatWithInterim(interim);
    };
    speechRec.onerror = (ev) => {
      console.warn('SpeechRecognition error', ev);
      stopListening(false);
    };
    /* 浏览器自然 end(如沉默太久):自动发送当前转写,这也是"语音模式自动提交"的一部分 */
    speechRec.onend = () => { if (isListening) stopListening(true); };
    speechRec.start();

    isListening = true;
    micBtn.classList.add('is-active');
    chatForm.classList.add('is-listening');
    /* 不抢字幕区,保持当前显示 */
  } catch (err) {
    console.warn('SpeechRecognition failed', err);
    toast('语音启动失败,请直接输入文字');
    chatText.focus();
  }
}

function stopListening(autoSubmit) {
  if (!isListening) return;
  isListening = false;
  micBtn.classList.remove('is-active');
  chatForm.classList.remove('is-listening');
  /* 先把回调摘掉,防止 stop() 之后异步触发的 onresult/onend 在文本被清空之后
     又把 recFinalAcc 的内容写回 textarea(就是"语音发送后输入栏没清空"的根因) */
  if (speechRec) {
    speechRec.onresult = null;
    speechRec.onerror  = null;
    speechRec.onend    = null;
    try { speechRec.stop();  } catch {}
    try { speechRec.abort(); } catch {}
    speechRec = null;
  }
  /* 把 interim 去掉,只保留 final → 现在 textarea 内容稳定 */
  _composeChatWithInterim('');

  if (autoSubmit) {
    /* 语音模式:停止即发送(无需点 send) — 先彻底重置缓冲,再 submit */
    recBaseText = '';
    recFinalAcc = '';
    if (chatText.value.trim()) chatForm.requestSubmit();
  } else {
    /* 切到打字模式:保留转写,等用户编辑/手动发送 */
    recBaseText = chatText.value;
    recFinalAcc = '';
    chatText.focus();
    const end = chatText.value.length;
    chatText.setSelectionRange(end, end);
  }
}

chatText.addEventListener('input', _autoResizeChat);
chatText.addEventListener('keydown', (e) => {
  /* 监听中按了非修饰键 → 立刻切到"打字模式"(不自动发送,等用户手动 Enter/Send) */
  if (isListening && !e.ctrlKey && !e.metaKey && !e.altKey) {
    /* 让 Enter 之外的键都先打断语音,Enter 仍走"发送" */
    if (e.key !== 'Enter') stopListening(false);
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    /* 监听中按 Enter:先停语音(不重复发);若有内容,自然走 submit */
    if (isListening) stopListening(false);
    e.preventDefault();
    chatForm.requestSubmit();
  }
});
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatText.value.trim();
  if (!text || !STATE.session) return;
  if (!typingEl.hidden) return;
  const msg = { role: 'user', text, textZh: text, textEn: '', ts: new Date().toISOString() };
  STATE.session.messages.push(msg);
  $('#cinema-turns').textContent = STATE.session.messages.length;
  showSubtitle('', text, 'user');
  chatText.value = '';
  chatText.style.height = 'auto';
  /* 同步清掉语音缓冲,防止异步迟到的 transcript 重新写回输入栏 */
  recBaseText = '';
  recFinalAcc = '';
  renderHistory();
  await askGemini(false);
});

/* ============ 顶部按钮 ============ */
$('#cinema-back').addEventListener('click', () => {
  TTS.cancel();
  showView('landing');
});

async function setMusic(on) {
  return Sound.setMusic(on, { toastMsg: false });
}

/* =====================================================
   天气(Open-Meteo) — 浏览器定位 + 免费 API,失败优雅降级
   ===================================================== */
const WEATHER_CODE = {
  0:  { icon: '☀',  zh: '晴',           en: 'Clear' },
  1:  { icon: '🌤', zh: '多云转晴',     en: 'Mainly clear' },
  2:  { icon: '⛅', zh: '局部多云',     en: 'Partly cloudy' },
  3:  { icon: '☁',  zh: '阴',           en: 'Overcast' },
  45: { icon: '🌫', zh: '雾',           en: 'Fog' },
  48: { icon: '🌫', zh: '雾凇',         en: 'Rime fog' },
  51: { icon: '🌦', zh: '毛毛雨',       en: 'Light drizzle' },
  53: { icon: '🌦', zh: '小雨',         en: 'Drizzle' },
  55: { icon: '🌧', zh: '中雨',         en: 'Dense drizzle' },
  61: { icon: '🌧', zh: '小雨',         en: 'Light rain' },
  63: { icon: '🌧', zh: '雨',           en: 'Rain' },
  65: { icon: '🌧', zh: '大雨',         en: 'Heavy rain' },
  71: { icon: '🌨', zh: '小雪',         en: 'Light snow' },
  73: { icon: '🌨', zh: '雪',           en: 'Snow' },
  75: { icon: '❄',  zh: '大雪',         en: 'Heavy snow' },
  80: { icon: '🌧', zh: '阵雨',         en: 'Showers' },
  81: { icon: '🌧', zh: '中阵雨',       en: 'Showers' },
  82: { icon: '⛈', zh: '强阵雨',       en: 'Violent showers' },
  95: { icon: '⛈', zh: '雷阵雨',       en: 'Thunderstorm' },
  96: { icon: '⛈', zh: '雷暴有冰雹',   en: 'Thunderstorm w/ hail' },
  99: { icon: '⛈', zh: '强雷暴',       en: 'Heavy thunderstorm' },
};
function weatherInfoFromCode(code) { return WEATHER_CODE[code] || { icon: '·', zh: '—', en: 'Unknown' }; }

function isGeoApiAvailable() {
  return !!(navigator.geolocation && window.isSecureContext);
}

/** @returns {{ lat, lon } | { error: 'unsupported'|'denied'|'timeout'|'unavailable' }} */
function getCurrentPosition(timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!isGeoApiAvailable()) return resolve({ error: 'unsupported' });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ error: 'timeout' }), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => finish({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => finish({ error: err?.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 5 * 60 * 1000, timeout: timeoutMs }
    );
  });
}

/** GPS 不可用时用 IP 粗定位（无需浏览器定位权限） */
async function getCoordsFromIP() {
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client', ctrl ? { signal: ctrl.signal } : {});
    if (t) clearTimeout(t);
    if (!r.ok) throw new Error('ip geo http ' + r.status);
    const j = await r.json();
    if (j.latitude != null && j.longitude != null) {
      return { lat: j.latitude, lon: j.longitude, fromIP: true };
    }
  } catch (err) {
    console.warn('IP geolocation fallback failed', err);
  }
  return null;
}

async function resolvePosition() {
  const geo = await getCurrentPosition(12000);
  if (geo.lat != null) return geo;
  /* GPS 失败（含用户拒绝精确坐标）时仍可用 IP 粗定位拉天气 */
  const ip = await getCoordsFromIP();
  if (ip) return ip;
  return geo;
}

function loadCachedWeather() {
  const w = SETTINGS.weatherCache;
  if (w && w.ts && Date.now() - w.ts < 30 * 60 * 1000) return w;
  return null;
}

function persistWeatherCache(w) {
  if (!w) return;
  SETTINGS.weatherCache = w;
  saveSettings(SETTINGS);
}

/* 全局天气状态:由 weather-pill 维护并复用给日记卡保存流 */
let CURRENT_WEATHER = loadCachedWeather();
let _geoSaveResolve = null;

function weatherFailToast(pos) {
  if (!pos || pos.lat != null) return;
  if (pos.error === 'denied') toast('未获得位置权限 · 可在浏览器地址栏左侧开启定位');
  else if (pos.error === 'unsupported') toast('请用 localhost 或 https 打开本站，定位才能生效');
  else if (pos.error === 'timeout') toast('定位超时 · 请检查网络或稍后重试');
  else toast('暂时无法获取天气 · 请检查网络连接');
}

async function refreshWeatherFromIPOnly(opts = {}) {
  const { silent = false } = opts;
  const pill = $('#weather-pill');
  if (pill) pill.dataset.state = 'loading';
  const pos = await getCoordsFromIP();
  if (!pos) {
    if (!silent) toast('暂时无法获取天气 · 请检查网络连接');
    updateWeatherPillUI(CURRENT_WEATHER);
    return null;
  }
  const w = await fetchWeatherFromCoords(pos);
  if (w) {
    CURRENT_WEATHER = w;
    persistWeatherCache(w);
    updateWeatherPillUI(w);
  } else {
    if (!silent) toast('天气服务暂时不可用');
    updateWeatherPillUI(CURRENT_WEATHER);
  }
  return w;
}

async function refreshWeatherFromGeolocation(opts = {}) {
  const { silent = false } = opts;
  const pill = $('#weather-pill');
  if (pill) pill.dataset.state = 'loading';

  const pos = await resolvePosition();
  if (!pos || pos.lat == null) {
    if (!silent) weatherFailToast(pos);
    updateWeatherPillUI(CURRENT_WEATHER);
    return null;
  }

  const w = await fetchWeatherFromCoords(pos);
  if (w) {
    CURRENT_WEATHER = w;
    SETTINGS.geoOptIn = true;
    persistWeatherCache(w);
    saveSettings(SETTINGS);
    updateWeatherPillUI(w);
    if (!silent && pos.fromIP) toast('已根据网络位置显示天气');
  } else {
    if (!silent) toast('天气服务暂时不可用');
    updateWeatherPillUI(CURRENT_WEATHER);
  }
  return w;
}

function updateWeatherPillUI(w) {
  const pill = $('#weather-pill');
  const icon = $('#wp-icon');
  const text = $('#wp-text');
  if (!pill || !icon || !text) return;
  if (!w) {
    pill.dataset.state = 'idle';
    icon.textContent = '·';
    text.textContent = '—';
    return;
  }
  pill.dataset.state = 'ready';
  icon.textContent = w.icon || '·';
  const t = (w.temp != null) ? `${Math.round(w.temp)}°C` : '';
  text.textContent = `${t}${t ? ' · ' : ''}${w.zh || w.en || ''}`.trim() || '—';
}

function showGeoPromptForSave() {
  return new Promise((resolve) => {
    const overlay = $('#geo-prompt-overlay');
    if (!overlay) { resolve('deny'); return; }
    _geoSaveResolve = resolve;
    overlay.hidden = false;
  });
}

/** 保存日记前：尽量拿到天气；已授权则静默刷新，未决定/曾拒绝可再次询问 */
async function ensureGeoForDiarySave() {
  if (SETTINGS.geoOptIn === true) {
    if (!CURRENT_WEATHER) await refreshWeatherFromGeolocation({ silent: true });
    return !!CURRENT_WEATHER;
  }
  if (SETTINGS.geoOptIn === false && CURRENT_WEATHER) return true;
  const choice = await showGeoPromptForSave();
  if (choice === 'allow' && !CURRENT_WEATHER) {
    await refreshWeatherFromGeolocation({ silent: true });
  }
  return !!CURRENT_WEATHER;
}

async function fetchWeatherFromCoords(pos) {
  if (!pos) return null;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}&current=temperature_2m,weather_code&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather http ' + r.status);
    const j = await r.json();
    const code = j?.current?.weather_code;
    const temp = j?.current?.temperature_2m;
    const info = weatherInfoFromCode(code);
    return { temp, code, icon: info.icon, zh: info.zh, en: info.en, ts: Date.now() };
  } catch (err) {
    console.warn('weather fetch failed', err);
    return null;
  }
}

/* 保留旧 API 名以兼容保存流:返回当前缓存的天气或占位 */
async function fetchWeather() {
  if (CURRENT_WEATHER) return CURRENT_WEATHER;
  return { temp: null, code: null, icon: '·', zh: '天气未知', en: 'Weather n/a' };
}

function formatWeather(w) {
  if (!w) return '—';
  const t = (w.temp != null) ? `${Math.round(w.temp)}°C` : '';
  const tag = w.zh || w.en || '';
  return `${w.icon || '·'} ${t}${t && tag ? ' · ' : ''}${tag}`.trim();
}

/* =====================================================
   主题摘要 — 调一次 AI 让它给出"今日主题"
   返回 { theme: '一行话', title: '两字标签' };失败时回退到 mood
   ===================================================== */
async function generateTheme(session) {
  const fallback = () => {
    const m = (session.mood || '').split('·')[0].trim();
    return { theme: m ? `关于「${m}」的一夜对话` : '一段没有题目的对话', title: m || '未命名' };
  };
  if (!activeApiKey()) return fallback();
  /* 把对话拼成纯文本喂给 AI */
  const transcript = (session.messages || []).map(m => {
    const who = m.role === 'gemini' ? 'A' : 'U';
    const body = (m.textZh || m.text || '').replace(/<<[A-Z]+:[^>]*>>/g, '').trim();
    return `${who}: ${body}`;
  }).join('\n').slice(0, 4000);

  const prompt = [
    '以下是 sylvan 和一位陪伴者的对话。请用一句有温度的中文（15~25字）写出这段谈话的核心感受，用第一人称，写具体情绪而非事件摘要，像日记里的第一句话那样自然（例："好久没有说这么多了，也不知道几点了" / "一直以为自己还好，说着说着就难受了起来"）。',
    '再给出一个 2~4 字的中文标题，要像诗集里的篇名，有画面感，不要抽象词（例："十一月" / "雨后" / "没关系" / "有些话"）。',
    '严格输出 JSON，不要 markdown，不要解释：',
    '{"theme":"<一句话感受>","title":"<2-4字标题>"}',
    '',
    '对话:',
    transcript,
  ].join('\n');

  try {
    const cfg = activeProviderCfg();
    const messages = [{ role: 'user', text: prompt }];
    let raw;
    if (cfg.schema === 'gemini') raw = await callGeminiSchema(messages, null, activeApiKey(), cfg);
    else raw = await callOpenAiSchema(messages, null, activeApiKey(), cfg);
    /* 容错解析 JSON */
    const m = raw.match(/\{[\s\S]*?"theme"[\s\S]*?\}/);
    if (m) {
      const obj = JSON.parse(m[0]);
      if (obj && obj.theme) return { theme: String(obj.theme).trim(), title: String(obj.title || '').trim() || fallback().title };
    }
  } catch (err) {
    console.warn('theme generation failed', err);
  }
  return fallback();
}

/* ============ 收入档案 ============ */
$('#cinema-save').addEventListener('click', async () => {
  if (!STATE.session || STATE.session.messages.length < 2) {
    toast('对话还很短，再多说几句再收存吧');
    return;
  }
  const entry = { ...STATE.session, savedAt: new Date().toISOString() };
  const idx = ARCHIVE.findIndex(e => e.id === entry.id);
  if (idx >= 0) ARCHIVE[idx] = entry; else ARCHIVE.unshift(entry);
  try {
    await saveArchive(ARCHIVE);
    tickTime();
    toast('已收入档案 · SAVED');
  } catch (err) {
    toast('存储已满，先清理几条旧档案吧');
    console.error(err);
  }
});

/* =====================================================
   退出 — 弹保存确认;保存→生成日记卡→点击吸入档案
   ===================================================== */
const saveConfirmOverlay = $('#save-confirm-overlay');
const diaryOverlay       = $('#diary-overlay');
const diaryCard          = $('#diary-card');

function _resetSaveModal() {
  $('#sc-save').disabled = false;
  $('#sc-save').textContent = '保 存';
}
function openSaveConfirm() {
  _resetSaveModal();
  saveConfirmOverlay.hidden = false;
}
function closeSaveConfirm() {
  saveConfirmOverlay.hidden = true;
}

$('#cinema-close').addEventListener('click', () => {
  if (STATE.session && STATE.session.messages.length >= 2) {
    openSaveConfirm();
    return;
  }
  TTS.cancel();
  if (isListening) stopListening();
  showView('landing');
});

$('#sc-cancel').addEventListener('click', closeSaveConfirm);
$('#sc-discard').addEventListener('click', () => {
  closeSaveConfirm();
  TTS.cancel();
  if (isListening) stopListening();
  STATE.session = null;
  showView('landing');
});

$('#sc-save').addEventListener('click', async () => {
  if (!STATE.session) { closeSaveConfirm(); return; }
  /* 防重复:点一次后置灰 */
  $('#sc-save').disabled = true;
  $('#sc-save').textContent = '生 成 中 …';
  TTS.cancel();
  if (isListening) stopListening();

  /* 收尾时间戳 */
  const s = STATE.session;
  s.endedAt = new Date().toISOString();

  await ensureGeoForDiarySave();

  /* 并行获取天气与主题(都各自有兜底,不会抛) */
  let weather, themeInfo;
  try {
    [weather, themeInfo] = await Promise.all([fetchWeather(), generateTheme(s)]);
  } catch (e) {
    weather = await fetchWeather();
    themeInfo = await generateTheme(s);
  }
  s.weather = weather;
  s.theme   = themeInfo.theme;
  s.title   = themeInfo.title;

  closeSaveConfirm();
  showDiaryCard(s);
});

/* —— 渲染日记卡 —— */
function showDiaryCard(s) {
  const created = new Date(s.createdAt);
  const ended   = new Date(s.endedAt || Date.now());

  $('#dc-date').textContent     = `${created.getFullYear()}.${String(created.getMonth()+1).padStart(2,'0')}.${String(created.getDate()).padStart(2,'0')}`;
  $('#dc-time').textContent     = `${fmtTime(created)} — ${fmtTime(ended)}`;
  $('#dc-weather-icon').textContent = s.weather && s.weather.icon || '·';
  $('#dc-weather-text').textContent = formatWeather(s.weather).replace(/^\S+\s*/, '');
  $('#dc-mood').textContent     = s.mood && s.mood !== '— · —' ? s.mood : '未命名';
  $('#dc-theme').textContent    = s.theme || '一段没有题目的对话';
  $('#dc-duration').textContent = fmtMMSS(Math.max(0, ended - created));
  $('#dc-turns').textContent    = s.messages.length;
  $('#dc-session').textContent  = '№ ' + s.id.slice(-6).toUpperCase();

  const list = $('#dc-messages');
  list.innerHTML = '';
  for (const m of s.messages) {
    const row = document.createElement('div');
    row.className = 'dc-msg ' + (m.role === 'gemini' ? 'is-gemini' : 'is-user');
    const a = document.createElement('div');
    a.className = 'dc-msg-a';
    a.textContent = (m.role === 'gemini' ? 'GEMINI · ' : 'YOU · ') + fmtTime(m.ts);
    const b = document.createElement('div');
    b.className = 'dc-msg-b';
    b.textContent = (m.textZh || m.text || '').replace(/<<[A-Z]+:[^>]*>>/g, '').trim();
    row.append(a, b);
    list.appendChild(row);
  }

  diaryOverlay.hidden = false;
  diaryCard.classList.remove('is-archiving');
  diaryOverlay.classList.remove('is-archiving');
  /* 让背景粒子云向右让位,卡片占据左上角 */
  document.body.classList.add('show-diary-card');
  setTimeout(() => diaryCard.focus(), 60);
}

/* —— 点击卡片:用 Web Animations API 飞到 ARCHIVE 按钮位置,保存后停在 landing —— */
let _diaryArchiving = false;
diaryCard.addEventListener('click', async () => {
  if (_diaryArchiving) return;
  if (!STATE.session) return;
  _diaryArchiving = true;

  /* 计算目标:ARCHIVE nav 链接的中心 */
  const archiveNav = document.querySelector('a.nav-link[data-view="archive"]');
  const cardRect   = diaryCard.getBoundingClientRect();
  const cardCx     = cardRect.left + cardRect.width  / 2;
  const cardCy     = cardRect.top  + cardRect.height / 2;
  let targetX = cardCx, targetY = 24;   // 退化方案:落到顶部
  if (archiveNav) {
    const r = archiveNav.getBoundingClientRect();
    targetX = r.left + r.width / 2;
    targetY = r.top  + r.height / 2;
  }
  const dx = targetX - cardCx;
  const dy = targetY - cardCy;

  /* 同步淡掉黑底 */
  diaryOverlay.classList.add('is-archiving');

  const anim = diaryCard.animate([
    { transform: 'translate(0, 0) scale(1)        rotate(0deg)',   opacity: 1,    filter: 'blur(0)'   },
    { transform: `translate(${dx*0.45}px, ${dy*0.45}px) scale(.62) rotate(-2deg)`, opacity: .95, filter: 'blur(0)', offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.04)   rotate(10deg)`, opacity: 0,    filter: 'blur(6px)' },
  ], { duration: 1050, easing: 'cubic-bezier(.22, .61, .36, 1)', fill: 'forwards' });

  /* 与动画并行写入档案 */
  const entry = { ...STATE.session, savedAt: new Date().toISOString() };
  const idx = ARCHIVE.findIndex(e => e.id === entry.id);
  if (idx >= 0) ARCHIVE[idx] = entry; else ARCHIVE.unshift(entry);
  try { await saveArchive(ARCHIVE); }
  catch (err) { console.error(err); toast('存储已满,先清理几条旧档案吧'); }

  anim.onfinish = () => {
    diaryOverlay.hidden = true;
    diaryOverlay.classList.remove('is-archiving');
    diaryCard.style.transform = '';
    diaryCard.style.opacity = '';
    diaryCard.style.filter = '';
    /* 卡片飞走 → 粒子云回到正中 */
    document.body.classList.remove('show-diary-card');
    _diaryArchiving = false;
    STATE.session = null;
    tickTime();
    /* 不再自动跳转到档案;停在 landing(已经从对话页关闭) */
    showView('landing');
    /* 让 ARCHIVE 按钮闪一下,提示"已落入此处" */
    if (archiveNav) {
      archiveNav.animate([
        { boxShadow: '0 0 0 0 rgba(148,184,255,0)',  filter: 'brightness(1)'  },
        { boxShadow: '0 0 24px 4px rgba(148,184,255,.65)', filter: 'brightness(1.3)' },
        { boxShadow: '0 0 0 0 rgba(148,184,255,0)',  filter: 'brightness(1)'  },
      ], { duration: 900, easing: 'cubic-bezier(.22, .61, .36, 1)' });
    }
    toast('已收入档案 · SAVED');
  };
});

/* ESC 关闭保存确认 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!saveConfirmOverlay.hidden) closeSaveConfirm();
  }
});

/* ============ 档案 ============ */
let archiveFilterDate = null;   // 'YYYY-MM-DD' 或 null
function _entryDateKey(entry) {
  const d = new Date(entry.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function renderArchive() {
  const grid = $('#entries-grid');
  const empty = $('#entries-empty');
  const clearBtn = $('#archive-clear-filter');
  grid.innerHTML = '';
  const filtered = archiveFilterDate
    ? ARCHIVE.filter(e => _entryDateKey(e) === archiveFilterDate)
    : ARCHIVE;
  if (clearBtn) {
    if (archiveFilterDate) {
      clearBtn.hidden = false;
      clearBtn.innerHTML = `<span>清除筛选 · ${archiveFilterDate}</span>`;
    } else clearBtn.hidden = true;
  }
  if (filtered.length === 0) {
    if (ARCHIVE.length === 0) { empty.style.display = 'block'; grid.style.display = 'none'; return; }
    /* 有档案但筛后为空 */
    empty.style.display = 'block'; grid.style.display = 'none';
    const sub = empty.querySelector('.empty-sub');
    if (sub) sub.innerHTML = `${archiveFilterDate} 当天没有对话。<br />点上方"清除筛选"看全部。`;
    return;
  }
  /* 恢复默认空态文案 */
  const sub = empty.querySelector('.empty-sub');
  if (sub) sub.innerHTML = '从开启页面上传一张照片,<br />开始你的第一段对话。';
  empty.style.display = 'none'; grid.style.display = 'grid';
  filtered.forEach(entry => {
    const card = document.createElement('article');
    card.className = 'entry-card';
    const messages = Array.isArray(entry.messages) ? entry.messages : [];
    const firstGemini = messages.find(m => m.role === 'gemini');
    const snippet = firstGemini ? (firstGemini.textZh || firstGemini.text || '').replace(/\s+/g, ' ').slice(0, 90) : '（尚未开口）';
    const entryId = String(entry.id || '');

    const photo = document.createElement('div');
    photo.className = 'entry-photo';
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    const imageDataUrl = String(entry.imageDataUrl || '');
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(imageDataUrl)) img.src = imageDataUrl;
    photo.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'entry-meta';

    const date = document.createElement('div');
    date.className = 'entry-date';
    date.textContent = fmtDate(entry.createdAt);

    const mood = document.createElement('div');
    mood.className = 'entry-mood';
    mood.textContent = entry.mood && entry.mood !== '— · —' ? entry.mood : '未命名的心境';

    const body = document.createElement('div');
    body.className = 'entry-snippet';
    body.textContent = snippet + '…';

    const foot = document.createElement('div');
    foot.className = 'entry-foot';
    const count = document.createElement('span');
    count.textContent = `${messages.length} 句 · ${messages.length} TURNS`;
    const del = document.createElement('button');
    del.className = 'entry-delete';
    del.dataset.id = entryId;
    del.textContent = '删除 / DEL';
    foot.append(count, del);

    meta.append(date, mood, body, foot);
    card.append(photo, meta);

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('entry-delete')) return;
      /* 不再跳回对话界面;改为打开档案详情(粒子化照片 + 卡片内容) */
      openArchiveDetail(entry);
    });
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.dataset.id;
      if (confirm('确定要删除这段对话吗？此操作不可撤销。')) {
        ARCHIVE = ARCHIVE.filter(x => x.id !== id);
        await saveArchive(ARCHIVE);
        renderArchive();
        tickTime();
        toast('已删除');
      }
    });
    grid.appendChild(card);
  });
}

/* =====================================================
   日历(按日期查找对话)
   ===================================================== */
const calOverlay = $('#calendar-overlay');
let calCursor = new Date();
calCursor.setDate(1);

function _archiveDateMap() {
  /* 'YYYY-MM-DD' → count */
  const map = {};
  for (const e of ARCHIVE) {
    const k = _entryDateKey(e);
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

function renderCalendar() {
  const grid = $('#cal-grid');
  if (!grid) return;
  const y = calCursor.getFullYear();
  const m = calCursor.getMonth();
  $('#cal-title').textContent = `${y} · ${String(m+1).padStart(2,'0')}`;
  grid.innerHTML = '';
  const first = new Date(y, m, 1);
  const last  = new Date(y, m+1, 0);
  const firstDow = first.getDay();
  const days     = last.getDate();
  const map = _archiveDateMap();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  /* 前导占位 */
  for (let i = 0; i < firstDow; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell is-blank';
    grid.appendChild(cell);
  }
  for (let d = 1; d <= days; d++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const num = document.createElement('span');
    num.textContent = String(d);
    cell.appendChild(num);
    if (key === todayKey) cell.classList.add('is-today');
    const cnt = map[key];
    if (cnt) {
      cell.classList.add('has-entries');
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      cell.appendChild(dot);
      const c = document.createElement('span');
      c.className = 'cal-count';
      c.textContent = cnt + '条';
      cell.appendChild(c);
      cell.addEventListener('click', () => {
        archiveFilterDate = key;
        renderArchive();
        closeCalendar();
        /* 滚到顶部以便看到筛选结果 */
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    grid.appendChild(cell);
  }
}

function openCalendar() {
  /* 打开时默认定位到最近一条档案所在月,若无则当前月 */
  if (ARCHIVE.length > 0) {
    const newest = new Date(ARCHIVE[0].createdAt);
    calCursor = new Date(newest.getFullYear(), newest.getMonth(), 1);
  } else {
    const n = new Date();
    calCursor = new Date(n.getFullYear(), n.getMonth(), 1);
  }
  calOverlay.hidden = false;
  renderCalendar();
}
function closeCalendar() { calOverlay.hidden = true; }

$('#archive-calendar-btn').addEventListener('click', openCalendar);
$('#cal-close').addEventListener('click', closeCalendar);
$('#cal-prev').addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
  renderCalendar();
});
$('#cal-next').addEventListener('click', () => {
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
  renderCalendar();
});
calOverlay.addEventListener('click', (e) => { if (e.target === calOverlay) closeCalendar(); });

$('#archive-clear-filter').addEventListener('click', () => {
  archiveFilterDate = null;
  renderArchive();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !calOverlay.hidden) closeCalendar();
});

/* =====================================================
   档案详情(粒子化照片全屏 + 右侧卡片)
   - 共享 ParticleCloud 类,挂到独立的 canvas 上
   - 关闭时停止 RAF,保留 geometry 以便下次复用
   ===================================================== */
let archiveCloud = null;
function getArchiveCloud() {
  if (archiveCloud) return archiveCloud;
  const cv = $('#archive-particle-canvas');
  if (!cv || typeof THREE === 'undefined') return null;
  archiveCloud = new ParticleCloud(cv);
  return archiveCloud;
}

async function openArchiveDetail(entry) {
  /* 填面板内容 */
  const created = new Date(entry.createdAt);
  const ended   = new Date(entry.endedAt || entry.savedAt || entry.createdAt);
  $('#adp-date').textContent = `${created.getFullYear()}.${String(created.getMonth()+1).padStart(2,'0')}.${String(created.getDate()).padStart(2,'0')} · ${fmtTime(created)}`;
  $('#adp-weather').textContent = entry.weather ? formatWeather(entry.weather) : '—';
  $('#adp-mood').textContent = entry.mood && entry.mood !== '— · —' ? entry.mood : '未命名';
  $('#adp-theme').textContent = entry.theme || '—';
  $('#adp-duration').textContent = entry.endedAt ? fmtMMSS(Math.max(0, ended - created)) : '—';
  $('#adp-turns').textContent = (entry.messages || []).length;

  const list = $('#adp-messages');
  list.innerHTML = '';
  for (const m of (entry.messages || [])) {
    const row = document.createElement('div');
    row.className = 'dc-msg ' + (m.role === 'gemini' ? 'is-gemini' : 'is-user');
    const a = document.createElement('div');
    a.className = 'dc-msg-a';
    a.textContent = (m.role === 'gemini' ? 'GEMINI · ' : 'YOU · ') + fmtTime(m.ts);
    const b = document.createElement('div');
    b.className = 'dc-msg-b';
    b.textContent = (m.textZh || m.text || '').replace(/<<[A-Z]+:[^>]*>>/g, '').trim();
    row.append(a, b);
    list.appendChild(row);
  }

  /* 显示覆盖层 + 加载粒子化照片 */
  const overlay = $('#archive-detail-overlay');
  overlay.hidden = false;
  /* requestAnimationFrame 让浏览器先把 canvas 布局好,再 resize 粒子 */
  requestAnimationFrame(async () => {
    const c = getArchiveCloud();
    if (!c) return;
    try {
      if (c.currentEntryId === entry.id && c.points) {
        c.start();
        c._resize();
      } else {
        await c.loadImage(entry.imageDataUrl);
        c.currentEntryId = entry.id;
      }
    } catch (err) {
      console.warn('archive particle load failed', err);
    }
  });
}

function closeArchiveDetail() {
  const overlay = $('#archive-detail-overlay');
  overlay.hidden = true;
  if (archiveCloud) archiveCloud.stop();
}

$('#archive-detail-close').addEventListener('click', closeArchiveDetail);
/* 只允许通过关闭按钮(× / Esc)退出,点空白处不关 → 给右键长按 / 爆破等粒子交互留空间 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#archive-detail-overlay').hidden) closeArchiveDetail();
});

/* ============ 设置 ============ */
const settingsOverlay = $('#settings-overlay');
const settingsFocusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let lastFocusedBeforeSettings = null;

function visibleFocusable(container) {
  return $$(settingsFocusableSelector, container).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function openSettings() {
  lastFocusedBeforeSettings = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $('#api-key-input').value   = SETTINGS.apiKey || '';
  updateApiKeyHint();
  $('#density-select').value = activeDensity();
  $('#tts-select').value     = activeTTS() ? 'on' : 'off';
  $('#music-select').value   = (SETTINGS.music === 'off') ? 'off' : 'on';
  settingsOverlay.hidden = false;
  const first = $('#api-key-input') || visibleFocusable(settingsOverlay)[0];
  if (first) first.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    if (first) first.focus({ preventScroll: true });
  });
  setTimeout(() => {
    if (!settingsOverlay.hidden && first) first.focus({ preventScroll: true });
  }, 0);
}
function closeSettings() {
  settingsOverlay.hidden = true;
  if (lastFocusedBeforeSettings && document.contains(lastFocusedBeforeSettings)) {
    lastFocusedBeforeSettings.focus({ preventScroll: true });
  }
  lastFocusedBeforeSettings = null;
}

function trapSettingsFocus(e) {
  const focusables = visibleFocusable(settingsOverlay);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}

$('#settings-close').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
document.addEventListener('keydown', (e) => {
  if (!settingsOverlay.hidden && e.key === 'Tab') {
    trapSettingsFocus(e);
    return;
  }
  if (e.key === 'Escape') {
    if (!settingsOverlay.hidden) closeSettings();
    else if (!historyEl.hidden) historyEl.hidden = true;
  }
});

const apiKeyInput = $('#api-key-input');
if (apiKeyInput) {
  apiKeyInput.addEventListener('input', () => updateApiKeyHint(apiKeyInput.value.trim()));
  apiKeyInput.addEventListener('blur', () => {
    const raw = apiKeyInput.value.trim();
    if (!raw) return;
    applyApiKeyResolution(raw);
    saveSettings(SETTINGS);
    updateApiKeyHint();
  });
}

$('#settings-save').addEventListener('click', () => {
  const rawKey = $('#api-key-input').value.trim();
  applyApiKeyResolution(rawKey);
  SETTINGS = Object.assign({}, SETTINGS, {
    apiKey:  SETTINGS.apiKey,
    provider: SETTINGS.provider,
    baseUrl: SETTINGS.baseUrl,
    model: SETTINGS.model,
    density: $('#density-select').value,
    tts:     $('#tts-select').value,
    music:   $('#music-select').value,
  });
  saveSettings(SETTINGS);
  const detected = resolveApiFromKey(SETTINGS.apiKey);
  updateApiKeyHint();
  toast(`已保存 · ${detected.label}`);
  applySavedMusicVolume();
  TTS.pickBestVoice();
  setVoiceVisualState();
  if (SETTINGS.tts === 'off') TTS.cancel();
  setMusic(SETTINGS.music !== 'off');
  Sound.syncUI();
  toast('已保存');
  closeSettings();
});

/* =====================================================
   HUD 收纳栏（右下角，对话视图）—— 粒子 + 声音
   ===================================================== */
(function setupHud() {
  const panel  = $('#hud-panel');
  const toggle = $('#hud-toggle');
  if (!panel || !toggle) return;

  /* 展开 / 收起 */
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });

  /* —— Slider 工厂：绑定 input → 写 uniform / SETTINGS —— */
  const SLIDERS = [
    { id: 'hud-ir',   key: 'innerRadius',   uniform: 'uInnerRadius',   defv: 0.35, fmt: v => v.toFixed(2) },
    { id: 'hud-or',   key: 'outerRadius',   uniform: 'uOuterRadius',   defv: 0.88, fmt: v => v.toFixed(2) },
    { id: 'hud-ps',   key: 'pointSizeBase', uniform: 'uPointSizeBase', defv: 1.00, fmt: v => v.toFixed(2) },
    { id: 'hud-wind', key: 'idleWind',      uniform: 'uIdleWind',      defv: 0.42, fmt: v => v.toFixed(2) },
  ];
  SLIDERS.forEach(s => {
    const el  = $('#' + s.id);
    const val = $('#' + s.id + '-val');
    if (!el) return;
    const saved = (SETTINGS[s.key] != null) ? SETTINGS[s.key] : s.defv;
    el.value = saved;
    if (val) val.textContent = s.fmt(parseFloat(saved));
    /* 应用到 uniform（首次） */
    if (cloud.material) cloud.material.uniforms[s.uniform].value = parseFloat(saved);

    const sync = () => {
      let v = parseFloat(el.value);
      /* 内外圈互锁：清晰区 < 消散圈 - 0.05 */
      if (s.id === 'hud-ir') {
        const outer = parseFloat($('#hud-or').value);
        if (v > outer - 0.05) { v = outer - 0.05; el.value = v; }
      } else if (s.id === 'hud-or') {
        const inner = parseFloat($('#hud-ir').value);
        if (v < inner + 0.05) { v = inner + 0.05; el.value = v; }
      }
      if (val) val.textContent = s.fmt(v);
      SETTINGS[s.key] = v;
      if (cloud.material) cloud.material.uniforms[s.uniform].value = v;
    };
    el.addEventListener('input', sync);
    ['change', 'pointerup'].forEach(ev => el.addEventListener(ev, () => saveSettings(SETTINGS)));
  });

  /* —— 音乐开关 —— */
  const musicToggle = $('#hud-music-toggle');
  Sound.syncUI();
  musicToggle.addEventListener('click', async () => {
    await Sound.ensureReady();
    await Sound.setMusic(!Sound.musicOn());
  });

  const ttsToggle = $('#hud-tts-toggle');
  ttsToggle.addEventListener('click', async () => {
    await Sound.ensureReady();
    const turnOn = !Sound.ttsOn();
    Sound.setTts(turnOn);
    setVoiceVisualState();
    if (turnOn) {
      const s = STATE.session;
      const lastG = s && [...s.messages].reverse().find(m => m.role === 'gemini');
      if (lastG) TTS.speak(lastG.textEn || '', lastG.textZh || '');
    }
  });
})();

$('#clear-archive').addEventListener('click', async () => {
  if (confirm('确定清空所有档案吗？这无法撤销。')) {
    ARCHIVE = [];
    await saveArchive(ARCHIVE);
    renderArchive();
    tickTime();
    toast('档案已清空');
  }
});

/* ============ 启动 ============ */
TTS.init();
renderArchive();
showView('landing');
hydrateArchive();
Sound.init();

/* =====================================================
   头部天气 pill — 仅展示；位置授权改在保存日记时询问
   ===================================================== */
(function setupWeatherPill() {
  const pill = $('#weather-pill');
  const overlay = $('#geo-prompt-overlay');
  const btnAllow = $('#gp-allow');
  const btnDeny  = $('#gp-deny');
  if (!pill) return;

  function closeGeoPrompt(result) {
    if (overlay) overlay.hidden = true;
    if (_geoSaveResolve) {
      const r = _geoSaveResolve;
      _geoSaveResolve = null;
      r(result);
    }
  }

  if (btnAllow) {
    btnAllow.addEventListener('click', async () => {
      const w = await refreshWeatherFromGeolocation();
      closeGeoPrompt(w ? 'allow' : 'deny');
    });
  }
  if (btnDeny) {
    btnDeny.addEventListener('click', () => {
      SETTINGS.geoOptIn = false;
      saveSettings(SETTINGS);
      closeGeoPrompt('deny');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeGeoPrompt('deny');
    });
  }

  pill.addEventListener('click', async () => {
    if (SETTINGS.geoOptIn === true) {
      await refreshWeatherFromGeolocation();
      return;
    }
    await showGeoPromptForSave();
    /* 用户点「授权」时由 gp-allow 触发 refreshWeatherFromGeolocation */
  });

  if (CURRENT_WEATHER) updateWeatherPillUI(CURRENT_WEATHER);
  else if (SETTINGS.geoOptIn === true) refreshWeatherFromGeolocation({ silent: true });
  else if (SETTINGS.geoOptIn !== false) refreshWeatherFromIPOnly({ silent: true });
  else updateWeatherPillUI(null);
})();

console.log('%csylvan 的私人日记 · Sylvan’s Private Diary', 'font-family:serif;font-size:18px;letter-spacing:.4em;color:#94B8FF;');
console.log('%cThe garden is open.', 'font-style:italic;color:#5BD08C;');
