const DATA_URL = "/stock/cn/data/latest.json";
const DATA_AUTO_REFRESH_MS = 60 * 1000;
const BREADTH_ENDPOINTS = [
  "https://push2delay.eastmoney.com/api/qt/ulist.np/get",
  "https://push2.eastmoney.com/api/qt/ulist.np/get",
];
const BREADTH_FIELDS = "f12,f14,f2,f3,f4,f5,f6,f104,f105,f106";
const BREADTH_SECIDS = "1.000001,0.399001,0.899050";
const BREADTH_CODES = new Set(["000001", "399001", "899050"]);
const BREADTH_STORAGE_KEY = "stock-cn-breadth-series-v2";
const BREADTH_UI_STORAGE_KEY = "stock-cn-breadth-ui-v1";
const BREADTH_POLL_MS = 15000;
const BREADTH_MAX_POINTS = 1600;
const BREADTH_MAX_AGE_DAYS = 390;
const BREADTH_MA_WINDOWS = [20, 60, 120, 250];
const BREADTH_WINDOW_OPTIONS = new Set(["all", "60", "120", "250"]);
const BREADTH_INTRADAY_FALLBACK_POINTS = {
  "15s": 1,
  "15m": 20,
  "4h": 60,
};
const CN_MARKET_WINDOWS = [
  [9 * 60 + 30, 11 * 60 + 30],
  [13 * 60, 15 * 60],
];
const VIEWS = new Set(["overview", "picks", "confidence", "cross-section", "themes", "news"]);
const BREADTH_PERIODS = {
  "15s": { label: "15s", kind: "interval", ms: 15 * 1000 },
  "15m": { label: "15min", kind: "interval", ms: 15 * 60 * 1000 },
  "4h": { label: "4h", kind: "interval", ms: 4 * 60 * 60 * 1000 },
  "1d": { label: "日", kind: "day" },
  "1w": { label: "周", kind: "week" },
  "1mo": { label: "月", kind: "month" },
};

let dashboardData = null;
let flatRows = [];
let breadthSeries = [];
let breadthTimer = null;
let breadthInitialized = false;
let breadthDrawQueued = false;
let currentInsight = null;
let activeBreadthPeriod = "1d";
let activeBreadthWindow = "all";
let activeMaWindows = new Set(BREADTH_MA_WINDOWS);
let dataLoadInFlight = false;
let dataRefreshTimer = null;
let dailyBreadthCache = null;
let dailyBreadthDirty = true;
let chartSeriesCache = {};
let chartSeriesDirty = true;
let cachedBreadthPeriodBtns = null;
let cachedBreadthWindowBtns = null;
let cachedMaToggleBtns = null;
let cachedMaLegendItems = null;

// --- Live market data layer ---
const INDEX_SECIDS = "1.000001,0.399001,0.399006,1.000688,0.899050";
const INDEX_POLL_BASE_MS = 15000;
const INDEX_FIELDS = "f12,f14,f2,f3,f4,f6";
const STOCK_BATCH_SIZE = 40;
const STOCK_POLL_BASE_MS = 30000;
const STOCK_FIELDS = "f12,f14,f2,f3";
const FRESHNESS_THRESHOLDS = { live: 20000, stale: 300000 };
const SESSION_PHASE_LABELS = {
  premarket: "盘前", opening: "开盘", open_am: "上午交易",
  lunch: "午休", open_pm: "午后交易", postclose: "已收盘", weekend: "周末",
};
const PIPELINE_SCHEDULE = [
  { hh: 8, mm: 20, mode: "premarket", weekdays: true },
  { hh: 9, mm: 35, mode: "open", weekdays: true },
  { hh: 12, mm: 45, mode: "midday", weekdays: true },
  { hh: 15, mm: 45, mode: "postclose", weekdays: true },
  { hh: 9, mm: 30, mode: "weekend", weekdays: false },
];

const liveState = {
  indices: {},
  stockQuotes: {},
  screenerCodes: null,
  freshness: {
    breadth: { ts: 0, ok: false },
    indices: { ts: 0, ok: false },
    stocks: { ts: 0, ok: false },
    pipeline: { ts: 0, ok: false },
  },
  session: { phase: "unknown", nextEvent: null, countdown: 0 },
  errors: [],
  polling: {
    breadth: { interval: 15000, timer: null, backoff: 1, consecutiveErrors: 0 },
    indices: { interval: 15000, timer: null, backoff: 1, consecutiveErrors: 0 },
    stocks: { interval: 30000, timer: null, backoff: 1, consecutiveErrors: 0 },
  },
  sessionTickerTimer: null,
  lastPipelineCutoff: null,
};

let breadthDrawTimer = null;
let gaugeDrawTimer = null;
const DRAW_DEBOUNCE_MS = 200;

const el = (id) => document.getElementById(id);

function setText(id, value, fallback = "-") {
  const node = el(id);
  if (node) node.textContent = text(value, fallback);
}

function text(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(value) {
  const raw = text(value);
  return raw.replace("T", " ").replace(/\+08:00$/, "");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const n = Number(String(value).replace(/,/g, "").replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

function parsePercent(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatInteger(value) {
  const n = toNumber(value);
  if (n === null) return "-";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function formatPercentValue(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

function cnDateKey(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function formatCnClock(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function cnClockMinutes(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function cnWeekday(timestamp) {
  const [year, month, day] = cnDateKey(timestamp).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay() || 7;
}

function isCnMarketSessionNow(timestamp = Date.now()) {
  const day = cnWeekday(timestamp);
  if (day < 1 || day > 5) return false;
  const minute = cnClockMinutes(timestamp);
  return CN_MARKET_WINDOWS.some(([start, end]) => minute >= start && minute <= end);
}

function formatRefreshInterval(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}min` : `${seconds}s`;
}

function codeToSecid(code) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  return raw.startsWith("5") || raw.startsWith("6") || raw.startsWith("9") ? `1.${raw}` : `0.${raw}`;
}

function getSessionPhase(timestamp = Date.now()) {
  const day = cnWeekday(timestamp);
  if (day >= 6) return "weekend";
  const minute = cnClockMinutes(timestamp);
  if (minute < 9 * 60 + 15) return "premarket";
  if (minute < 9 * 60 + 30) return "opening";
  if (minute <= 11 * 60 + 30) return "open_am";
  if (minute < 13 * 60) return "lunch";
  if (minute <= 15 * 60) return "open_pm";
  return "postclose";
}

function getNextSessionEvent(phase, timestamp = Date.now()) {
  const dateKey = cnDateKey(timestamp);
  const makeTs = (hh, mm, dayOffset = 0) => {
    const d = new Date(`${dateKey}T00:00:00+08:00`);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hh, mm, 0, 0);
    return d.getTime();
  };
  const nextWeekday = (from) => {
    const d = new Date(from);
    const day = d.getDay();
    if (day === 5) return from + 3 * 86400000;
    if (day === 6) return from + 2 * 86400000;
    return from + 86400000;
  };
  switch (phase) {
    case "premarket":
    case "opening":
      return { type: "open", at: makeTs(9, 30) };
    case "open_am":
      return { type: "lunch", at: makeTs(11, 30) };
    case "lunch":
      return { type: "open_pm", at: makeTs(13, 0) };
    case "open_pm":
      return { type: "close", at: makeTs(15, 0) };
    case "postclose":
    case "weekend":
    default: {
      const now = timestamp;
      const today930 = makeTs(9, 30);
      const target = now < today930 ? today930 : nextWeekday(makeTs(9, 30, 1));
      return { type: "open", at: target };
    }
  }
}

function tickSession() {
  if (document.hidden) return;
  const now = Date.now();
  const phase = getSessionPhase(now);
  const prevPhase = liveState.session.phase;
  const nextEvent = getNextSessionEvent(phase, now);
  const countdown = Math.max(0, nextEvent.at - now);
  liveState.session = { phase, nextEvent, countdown };
  renderSessionTicker();
  renderPipelineCountdown();
  if (phase !== prevPhase) adjustPollingIntervals();
}

function updateFreshness(source, ok, error) {
  const entry = liveState.freshness[source];
  if (!entry) return;
  entry.ts = Date.now();
  entry.ok = ok;
  if (!ok && error) {
    liveState.errors.push({ source, message: error, ts: Date.now() });
    if (liveState.errors.length > 20) liveState.errors.shift();
  }
  renderFreshnessBadges();
}

function renderSessionTicker() {
  const { phase, countdown } = liveState.session;
  const phaseEl = el("ticker-phase");
  const countdownEl = el("ticker-countdown");
  const clockEl = el("ticker-clock");
  if (phaseEl) phaseEl.querySelector(".value").textContent = SESSION_PHASE_LABELS[phase] || phase;
  if (countdownEl) {
    const totalSec = Math.floor(countdown / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    countdownEl.querySelector(".countdown").textContent = `${h}:${m}:${s}`;
    countdownEl.classList.toggle("is-warning", totalSec < 300 && totalSec > 0);
  }
  if (clockEl) clockEl.querySelector(".value").textContent = formatCnClock(Date.now());
}

function getNextPipelineRun() {
  const now = new Date();
  const cnNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const hh = cnNow.getHours();
  const mm = cnNow.getMinutes();
  const day = cnNow.getDay();
  const isWeekend = day === 0 || day === 6;
  const todayStr = cnDateKey(Date.now());

  const candidates = PIPELINE_SCHEDULE.filter((s) => {
    if (isWeekend) return !s.weekdays;
    return s.weekdays;
  });

  for (const sched of candidates) {
    const targetMin = sched.hh * 60 + sched.mm;
    const currentMin = hh * 60 + mm;
    if (currentMin < targetMin) {
      return { time: new Date(`${todayStr}T${String(sched.hh).padStart(2, "0")}:${String(sched.mm).padStart(2, "0")}:00+08:00`).getTime(), mode: sched.mode };
    }
  }
  // All today's runs passed — next is tomorrow's first applicable
  const tomorrow = new Date(cnNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.getDay();
  const tomorrowIsWeekend = tomorrowDay === 0 || tomorrowDay === 6;
  const nextSched = PIPELINE_SCHEDULE.find((s) => tomorrowIsWeekend ? !s.weekdays : s.weekdays);
  if (!nextSched) return null;
  const tomorrowStr = cnDateKey(tomorrow.getTime());
  return { time: new Date(`${tomorrowStr}T${String(nextSched.hh).padStart(2, "0")}:${String(nextSched.mm).padStart(2, "0")}:00+08:00`).getTime(), mode: nextSched.mode };
}

function renderPipelineCountdown() {
  const el_ = el("ticker-pipeline");
  if (!el_) return;
  const next = getNextPipelineRun();
  if (!next) {
    el_.querySelector(".value").textContent = "--";
    return;
  }
  const ms = next.time - Date.now();
  if (ms < 0 && ms > -180000) {
    el_.querySelector(".value").textContent = "刷新中";
    el_.classList.add("is-active");
    return;
  }
  el_.classList.remove("is-active");
  if (ms <= 0) {
    el_.querySelector(".value").textContent = "--";
    return;
  }
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  el_.querySelector(".value").textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function renderFreshnessBadges() {
  const now = Date.now();
  const summaryEl = el("freshness-summary");
  if (!summaryEl) return;
  const sources = Object.entries(liveState.freshness);
  const liveCount = sources.filter(([, v]) => v.ok && (now - v.ts) < FRESHNESS_THRESHOLDS.live).length;
  const totalCount = sources.length;
  if (liveCount === totalCount) {
    summaryEl.innerHTML = '<span class="freshness-badge live">全部实时</span>';
  } else if (liveCount > 0) {
    summaryEl.innerHTML = `<span class="freshness-badge stale">${liveCount}/${totalCount} 实时</span>`;
  } else {
    const oldest = sources.reduce((min, [, v]) => v.ts && v.ts < min ? v.ts : min, Infinity);
    const age = oldest < Infinity ? now - oldest : 0;
    const ageText = age < 60000 ? `${Math.floor(age / 1000)}s` : age < 3600000 ? `${Math.floor(age / 60000)}m` : `${Math.floor(age / 3600000)}h`;
    summaryEl.innerHTML = `<span class="freshness-badge old">${ageText} ago</span>`;
  }
}

function startSessionTicker() {
  tickSession();
  liveState.sessionTickerTimer = setInterval(tickSession, 1000);
}

// --- Smart polling ---

function getAdaptiveInterval(source) {
  const phase = liveState.session.phase;
  const now = Date.now();
  const minute = cnClockMinutes(now);
  const isFirstLast30 = (minute >= 9 * 60 + 30 && minute < 10 * 60) || (minute >= 14 * 60 + 30 && minute <= 15 * 60);

  if (phase === "weekend" || phase === "postclose") return 0;
  if (phase === "lunch") return 60000;

  if (source === "breadth" || source === "indices") {
    return isFirstLast30 ? 10000 : 15000;
  }
  if (source === "stocks") {
    return isFirstLast30 ? 20000 : 30000;
  }
  return 30000;
}

function adjustPollingIntervals() {
  ["breadth", "indices", "stocks"].forEach((source) => {
    const newInterval = getAdaptiveInterval(source);
    const poll = liveState.polling[source];
    if (!poll) return;
    if (newInterval === poll.interval) return;
    poll.interval = newInterval;
    if (poll.timer) {
      clearInterval(poll.timer);
      poll.timer = null;
    }
    if (newInterval > 0) {
      const fn = source === "breadth" ? pollLiveBreadth : source === "indices" ? pollLiveIndices : pollLiveStockQuotes;
      poll.timer = setInterval(() => {
        if (!document.hidden) fn();
      }, newInterval);
    }
  });
}

function pauseAllPolling() {
  Object.values(liveState.polling).forEach((poll) => {
    if (poll.timer) { clearInterval(poll.timer); poll.timer = null; }
  });
}

function resumeAllPolling() {
  adjustPollingIntervals();
  if (!document.hidden) {
    pollLiveBreadth();
    pollLiveIndices();
    pollLiveStockQuotes();
  }
}

function loadBreadthUiPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(BREADTH_UI_STORAGE_KEY) || "{}");
    if (BREADTH_WINDOW_OPTIONS.has(String(stored.window))) {
      activeBreadthWindow = String(stored.window);
    }
    if (Array.isArray(stored.maWindows)) {
      activeMaWindows = new Set(
        stored.maWindows
          .map((value) => Number(value))
          .filter((value) => BREADTH_MA_WINDOWS.includes(value))
      );
    }
  } catch (error) {
    console.warn("Unable to read breadth UI prefs", error);
  }
}

function saveBreadthUiPrefs() {
  try {
    localStorage.setItem(BREADTH_UI_STORAGE_KEY, JSON.stringify({
      window: activeBreadthWindow,
      maWindows: [...activeMaWindows],
    }));
  } catch (error) {
    console.warn("Unable to save breadth UI prefs", error);
  }
}

function isMaVisible(windowSize) {
  return activeMaWindows.has(Number(windowSize));
}

function parseCnTimestamp(value, fallback = Date.now()) {
  const raw = formatTime(value).trim();
  if (!raw || raw === "-") return fallback;
  const normalized = raw.includes(" ") ? `${raw.replace(" ", "T")}+08:00` : raw;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function formatCnTick(timestamp, includeDate = false) {
  const clock = formatCnClock(timestamp);
  if (!includeDate) return clock;
  return `${cnDateKey(timestamp).slice(5)} ${clock.slice(0, 5)}`;
}

function formatCnDateTime(timestamp) {
  return `${cnDateKey(timestamp)} ${formatCnClock(timestamp)}`;
}

function valueClass(value) {
  const raw = String(value || "");
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return "neutral";
  const n = Number(match[0]);
  if (n > 0 && raw.includes("%")) return "positive";
  if (n < 0 && raw.includes("%")) return "negative";
  if (raw.includes("净流入") || raw.includes("亿元") || raw.includes("万")) {
    if (n > 0 && !raw.startsWith("-")) return "positive";
    if (raw.startsWith("-")) return "negative";
  }
  return "neutral";
}

function firstRows(tables) {
  if (!tables || !tables.length) return [];
  return tables.flatMap((table) => table.rows || []);
}

function pickValue(row, labels) {
  const keys = Object.keys(row || {});
  for (const label of labels) {
    if (row[label] !== undefined) return row[label];
  }
  for (const label of labels) {
    const key = keys.find((item) => item.includes(label));
    if (key) return row[key];
  }
  return "";
}

function findRowCode(row) {
  return text(pickValue(row, ["代码", "SECURITY_CODE", "code"]), "");
}

function findRowName(row) {
  return text(pickValue(row, ["名称", "简称", "SECURITY_SHORT_NAME", "name"]), "");
}

function findScreener(data, labels) {
  const groups = data?.screeners || [];
  return groups.find((group) => labels.some((label) => String(group?.name || "").includes(label))) || null;
}

function isHighVolatilityBoardCode(code) {
  const raw = String(code || "").trim();
  return raw.startsWith("688") || raw.startsWith("30") || raw.startsWith("920") || raw.startsWith("83") || raw.startsWith("87") || raw.startsWith("88") || raw.startsWith("43");
}

function formatSignalPick(row) {
  const code = findRowCode(row);
  const name = findRowName(row) || code;
  const pct = text(pickValue(row, ["涨跌幅(%)", "涨跌幅"]), "");
  const turnover = text(pickValue(row, ["换手率(%)", "换手率"]), "");
  const amount = text(pickValue(row, ["成交额(元)", "成交额"]), "");
  const pctText = pct ? (pct.includes("%") ? pct : `${pct}%`) : "";
  const turnoverText = turnover ? (turnover.includes("%") ? turnover : `${turnover}%`) : "";
  const metrics = [pctText, turnoverText ? `换手${turnoverText}` : "", amount ? `成交${amount}` : ""].filter(Boolean).join(" / ");
  return `${name}${code ? ` ${code}` : ""}${metrics ? ` ${metrics}` : ""}`;
}

function buildHighVolScalpSignal(data) {
  const group = findScreener(data, ["超短搏杀", "688/创业板", "688/300", "688超短", "科创板超短"]);
  const rows = (group?.rows || []).filter((row) => isHighVolatilityBoardCode(findRowCode(row)));
  if (!rows.length) {
    return {
      signal: "高波动超短：688/创业板/北交所未触发量价资金共振；没有候选时不做高波动搏杀。",
      operation: "高波动板块只做隔日/日内观察，低开破位或冲高回落不接力。",
    };
  }
  const picks = rows.slice(0, 3).map(formatSignalPick).join("；");
  return {
    signal: `高波动超短：${rows.length} 只触发，优先看 ${picks}`,
    operation: "688/创业板/北交所按高波动仓位处理，触发后只看量价延续和次日承接。",
  };
}

function buildNReversalSignal(data) {
  const group = findScreener(data, ["N字反弹", "20/30cm", "尾盘N字"]);
  const rows = (group?.rows || []).filter((row) => isHighVolatilityBoardCode(findRowCode(row)));
  if (!rows.length) {
    return {
      signal: "20/30cm N字反弹：未触发强阳、放量、回踩后再确认组合；T+1 下不做日内进出。",
      operation: "N字策略只在 14:00-14:45 看尾盘确认，次日 5-30 分钟处理，低开不修复优先退出。",
    };
  }
  const picks = rows.slice(0, 3).map(formatSignalPick).join("；");
  return {
    signal: `20/30cm N字反弹：${rows.length} 只进入尾盘观察，优先看 ${picks}`,
    operation: "N字反弹是买次日溢价，不是抓日内最低；只买第二段资金确认，次日冲高分批卖。",
  };
}

function buildSmartMoneyTrendSignal(data) {
  const group = findScreener(data, ["机构趋势跟随", "Smart Money", "趋势跟随"]);
  const rows = group?.rows || [];
  if (!rows.length) {
    return {
      signal: "机构趋势跟随：未触发强趋势、放量突破和行业共振组合；不追情绪单点。",
      operation: "趋势策略等待突破回踩、趋势二买或行业确认，跌破20日线/平台低点降级。",
    };
  }
  const picks = rows.slice(0, 3).map(formatSignalPick).join("；");
  return {
    signal: `机构趋势跟随：${rows.length} 只进入候选，优先看 ${picks}`,
    operation: "趋势策略只吃中段，确认后用20日线、平台低点和单笔1R做硬风控。",
  };
}

function buildForcedSellerSignal(data) {
  const group = findScreener(data, ["机构踩踏反转", "被迫卖出", "Forced Seller", "踩踏反转"]);
  const rows = group?.rows || [];
  if (!rows.length) {
    return {
      signal: "机构踩踏反转：未触发急跌放量、机构拥挤和基本面未崩组合；不捡无因下跌。",
      operation: "反转策略等待恐慌衰竭、站回5日线或突破恐慌日高点，跌破恐慌低点直接退出。",
    };
  }
  const picks = rows.slice(0, 3).map(formatSignalPick).join("；");
  return {
    signal: `机构踩踏反转：${rows.length} 只进入观察，优先看 ${picks}`,
    operation: "反转策略分批确认卖压衰竭；出现业绩暴雷、监管立案或再次破5日线则降级。",
  };
}

function pickColumns(rows, preferred, options = {}) {
  const maxColumns = options.maxColumns || 8;
  const available = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => available.add(key)));
  const picked = preferred.filter((key) => available.has(key));
  if (picked.length) return picked.slice(0, maxColumns);
  return [...available].filter((key) => !key.startsWith("_")).slice(0, maxColumns);
}

function renderTable(target, rows, preferred = [], limit = 80, options = {}) {
  const container = typeof target === "string" ? el(target) : target;
  if (!container) return;
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  const visibleRows = rows.slice(0, limit);
  const columns = pickColumns(visibleRows, preferred, options);
  const head = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
  const body = visibleRows.map((row) => {
    const code = row["代码"] || row["code"] || "";
    const codeAttr = code ? ` data-stock-code="${escapeHtml(String(code))}"` : "";
    const cells = columns.map((col) => {
      const value = text(row[col]);
      const klass = valueClass(value);
      return `<td class="${klass}">${escapeHtml(value)}</td>`;
    }).join("");
    return `<tr${codeAttr}>${cells}</tr>`;
  }).join("");

  container.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  bindStockClicks();
}

function getIndexRows(data) {
  return firstRows(data?.market).filter((row) => parsePercent(pickValue(row, ["涨跌幅", "涨跌幅(%)"])) !== null);
}

function getLatestBreadth(data) {
  const breadth = data?.breadth || {};
  const history = data?.breadthPulse?.rows || [];
  const latest = history[history.length - 1] || {};
  const up = toNumber(breadth.up) ?? toNumber(latest.up);
  const down = toNumber(breadth.down) ?? toNumber(latest.down);
  const flat = toNumber(breadth.flat) ?? toNumber(latest.flat) ?? 0;
  const total = toNumber(breadth.total) ?? toNumber(latest.total) ?? (up !== null && down !== null ? up + down + flat : null);
  return {
    up,
    down,
    flat,
    total,
    source: breadth.source || latest.source || "",
    scope: breadth.scope || latest.scope || "沪深京",
  };
}

function latestMovingAverage(points, windowSize) {
  if (!points || points.length < windowSize) return null;
  const slice = points.slice(-windowSize);
  const sum = slice.reduce((acc, point) => acc + (toNumber(point.up) || 0), 0);
  return sum / windowSize;
}

function sentimentLabel(score) {
  if (score <= 20) return "极度恐惧";
  if (score <= 40) return "恐惧";
  if (score <= 60) return "中性";
  if (score <= 75) return "贪婪";
  return "极度贪婪";
}

function sentimentTone(score) {
  if (score <= 40) return "fear";
  if (score <= 60) return "neutral";
  if (score <= 75) return "greed";
  return "extreme";
}

function inferMarketBias(data) {
  const breadth = getLatestBreadth(data);
  const active = (breadth.up || 0) + (breadth.down || 0);
  const upRatio = active > 0 ? breadth.up / active : null;

  // Merge live index data when available and newer than pipeline
  const pipelineCutoff = parseCnTimestamp(data?.meta?.dataCutoffAt || data?.meta?.generatedAt, 0);
  const liveEntries = Object.values(liveState.indices);
  const hasLiveIndices = liveEntries.some((e) => e.ts > pipelineCutoff && e.changePct != null);
  let indexPcts;
  if (hasLiveIndices) {
    indexPcts = liveEntries
      .filter((e) => e.changePct != null)
      .map((e) => Number(e.changePct));
  } else {
    indexPcts = getIndexRows(data).map((row) => parsePercent(pickValue(row, ["涨跌幅", "涨跌幅(%)"]))).filter((value) => value !== null);
  }
  const avgPct = indexPcts.length ? indexPcts.reduce((sum, value) => sum + value, 0) / indexPcts.length : null;
  const pulseRows = data?.breadthPulse?.rows || [];
  const latestPulse = pulseRows[pulseRows.length - 1] || breadth;
  const ma250 = latestMovingAverage(pulseRows, 250);
  const aboveMa250 = ma250 !== null && toNumber(latestPulse.up) !== null ? toNumber(latestPulse.up) > ma250 : null;

  let score = 50;
  if (upRatio !== null) score += (upRatio - 0.5) * 90;
  if (avgPct !== null) score += clamp(avgPct * 5, -18, 18);
  if (aboveMa250 === true) score += 8;
  if (aboveMa250 === false) score -= 8;
  score = Math.round(clamp(score, 0, 100));

  let bias = "震荡";
  let tone = "neutral";
  if ((upRatio !== null && upRatio >= 0.58 && (avgPct === null || avgPct >= 0)) || score >= 64) {
    bias = "看涨";
    tone = "positive";
  } else if ((upRatio !== null && upRatio <= 0.42 && (avgPct === null || avgPct <= 0)) || score <= 38) {
    bias = "看跌";
    tone = "negative";
  } else if (upRatio !== null && upRatio < 0.48) {
    bias = "偏空";
    tone = "negative";
  } else if (upRatio !== null && upRatio > 0.54) {
    bias = "偏多";
    tone = "positive";
  }

  return { breadth, active, upRatio, avgPct, ma250, aboveMa250, score, bias, tone };
}

function analyzeDashboard(data) {
  const meta = data?.meta || {};
  const clock = meta.marketClock || {};
  const inferred = inferMarketBias(data);
  const newsOnly = meta.runFocus === "news_only" || clock.session === "non_trading_day";
  const tradingDate = meta.tradingDate || clock.lastTradingDate || "-";
  const sessionText = clock.sessionText || "未知";
  const breadthText = inferred.breadth.up !== null && inferred.breadth.down !== null
    ? `${formatInteger(inferred.breadth.up)} 涨 / ${formatInteger(inferred.breadth.down)} 跌`
    : "宽度缺失";

  let stance = inferred.bias;
  let action = "控制仓位，等待涨跌宽度和主线资金给出同向确认。";
  let actionShort = "等待";
  if (inferred.bias === "看涨" || inferred.bias === "偏多") {
    action = "可做结构性进攻，优先强趋势和资金进攻；加仓条件是上涨家数继续扩张且指数不回落。";
    actionShort = "轻进攻";
  } else if (inferred.bias === "看跌" || inferred.bias === "偏空") {
    action = "以防守为主，降低追高和隔夜暴露；只保留高流动性核心或等宽度修复。";
    actionShort = "防守";
  } else {
    action = "按结构性行情处理，做强不做弱；单笔仓位降低，等待方向突破。";
    actionShort = "结构性";
  }

  if (newsOnly) {
    stance = `资讯观察 / ${inferred.bias}`;
    action = `非交易日只跟踪资讯、公告和外围变量；行情判断沿用 ${tradingDate} 收盘宽度，等下个交易日开盘重新确认。`;
    actionShort = "只看资讯";
  }

  const signals = [
    `涨跌宽度：${breadthText}${inferred.upRatio !== null ? `，上涨占比 ${formatPercentValue(inferred.upRatio)}` : ""}`,
    inferred.avgPct !== null ? `指数均值：${inferred.avgPct.toFixed(2)}%` : "指数均值：暂无",
    inferred.ma250 !== null
      ? `MA250 支撑：上涨家数 ${inferred.aboveMa250 ? "站上" : "跌破"} 250 样本均线`
      : "MA250 支撑：历史样本不足",
    `交易时段：${sessionText}`,
  ];
  const strategySignals = [
    buildHighVolScalpSignal(data),
    buildNReversalSignal(data),
    buildSmartMoneyTrendSignal(data),
    buildForcedSellerSignal(data),
  ];
  signals.push(...strategySignals.map((item) => item.signal));

  const operations = newsOnly
    ? ["复核周末政策、公告风险、外围市场。", "把候选池保留到优选页，不在周末新增盘中结论。", "下个交易日只在宽度重新扩张后提高仓位。"]
    : [action, "优选页看候选，截面页做搜索和复核。", "若资讯页出现减持、监管或澄清公告，候选降级处理。"];
  operations.push(...strategySignals.map((item) => item.operation));

  return {
    ...inferred,
    stance,
    action,
    actionShort,
    signals,
    operations,
    newsOnly,
    tradingDate,
    sessionText,
    sentimentLabel: sentimentLabel(inferred.score),
    sentimentTone: sentimentTone(inferred.score),
  };
}

function updateMeta(data) {
  const meta = data.meta || {};
  currentInsight = analyzeDashboard(data);

  setText("generated-at", formatTime(meta.dataCutoffAt || meta.generatedAt));
  setText("run-mode", `${text(meta.mode)}${meta.runFocus ? ` / ${meta.runFocus}` : ""}${meta.isMock ? " / seed" : ""}${currentInsight.sessionText ? ` / ${currentInsight.sessionText}` : ""}`);
  setText("call-usage", `${text(meta.callsUsed, 0)} / ${text(meta.callBudget, 0)}`);
  setText("fg-score", currentInsight.score);
  setText("fg-label", currentInsight.sentimentLabel);
  setText("fg-tier", currentInsight.sentimentLabel);

  setText("hero-stance", `${currentInsight.sentimentLabel} / ${currentInsight.bias}`);
  setText("hero-action", currentInsight.action);
  setText("market-state", currentInsight.stance);
  setText("market-note", `${currentInsight.tradingDate} / ${currentInsight.sessionText}`);
  setText("breadth-ratio", currentInsight.upRatio !== null ? formatPercentValue(currentInsight.upRatio) : "-");
  setText("breadth-note", currentInsight.breadth.up !== null ? `${formatInteger(currentInsight.breadth.up)} 涨 / ${formatInteger(currentInsight.breadth.down)} 跌 / ${formatInteger(currentInsight.breadth.flat)} 平` : "暂无宽度");
  setText("trend-score", currentInsight.score);
  setText("trend-note", currentInsight.avgPct !== null ? `指数均值 ${currentInsight.avgPct.toFixed(2)}%` : "指数方向缺失");
  setText("action-bias", currentInsight.actionShort);
  setText("action-note", currentInsight.newsOnly ? "非交易日不做盘中动作" : "按宽度和资讯确认");

  const sessionBadge = el("session-badge");
  const riskBadge = el("risk-badge");
  if (sessionBadge) {
    sessionBadge.textContent = currentInsight.sessionText;
    sessionBadge.className = `badge ${currentInsight.newsOnly ? "neutral" : currentInsight.tone}`;
  }
  if (riskBadge) {
    riskBadge.textContent = currentInsight.bias;
    riskBadge.className = `badge ${currentInsight.tone}`;
  }
  renderFactorStrip(currentInsight);
  drawFearGreedGauge(currentInsight);
  renderInsight(currentInsight);
}

function updateMetaLight(data) {
  currentInsight = analyzeDashboard(data);
  setText("fg-score", currentInsight.score);
  setText("fg-label", currentInsight.sentimentLabel);
  setText("fg-tier", currentInsight.sentimentLabel);
  setText("hero-stance", `${currentInsight.sentimentLabel} / ${currentInsight.bias}`);
  setText("hero-action", currentInsight.action);
  setText("market-state", currentInsight.stance);
  setText("breadth-ratio", currentInsight.upRatio !== null ? formatPercentValue(currentInsight.upRatio) : "-");
  setText("breadth-note", currentInsight.breadth.up !== null ? `${formatInteger(currentInsight.breadth.up)} 涨 / ${formatInteger(currentInsight.breadth.down)} 跌 / ${formatInteger(currentInsight.breadth.flat)} 平` : "暂无宽度");
  setText("trend-score", currentInsight.score);
  setText("trend-note", currentInsight.avgPct !== null ? `指数均值 ${currentInsight.avgPct.toFixed(2)}%` : "指数方向缺失");
  setText("action-bias", currentInsight.actionShort);
  const sessionBadge = el("session-badge");
  const riskBadge = el("risk-badge");
  if (sessionBadge) {
    sessionBadge.textContent = currentInsight.sessionText;
    sessionBadge.className = `badge ${currentInsight.newsOnly ? "neutral" : currentInsight.tone}`;
  }
  if (riskBadge) {
    riskBadge.textContent = currentInsight.bias;
    riskBadge.className = `badge ${currentInsight.tone}`;
  }
  renderFactorStrip(currentInsight);
  scheduleGaugeDraw(currentInsight);
  renderInsight(currentInsight);
}

function scheduleGaugeDraw(insight) {
  if (gaugeDrawTimer) clearTimeout(gaugeDrawTimer);
  gaugeDrawTimer = setTimeout(() => {
    gaugeDrawTimer = null;
    drawFearGreedGauge(insight);
  }, DRAW_DEBOUNCE_MS);
}

function renderFactorStrip(insight) {
  const root = el("factor-strip");
  if (!root) return;
  const factors = [
    ["宽度", insight.upRatio !== null ? formatPercentValue(insight.upRatio) : "-", insight.upRatio !== null ? Math.round(insight.upRatio * 100) : 50],
    ["指数", insight.avgPct !== null ? `${insight.avgPct.toFixed(2)}%` : "-", insight.avgPct !== null ? clamp(50 + insight.avgPct * 8, 0, 100) : 50],
    ["MA250", insight.ma250 === null ? "不足" : (insight.aboveMa250 ? "上方" : "下方"), insight.ma250 === null ? 50 : (insight.aboveMa250 ? 68 : 32)],
    ["时段", insight.newsOnly ? "资讯" : "交易", insight.newsOnly ? 45 : 58],
  ];
  root.innerHTML = factors.map(([label, value, score]) => `
    <div class="factor-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <i><b style="width:${clamp(Number(score) || 0, 0, 100)}%"></b></i>
    </div>
  `).join("");
}

function drawFearGreedGauge(insight) {
  const canvas = el("fear-greed-gauge");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(300, Math.floor(rect.width));
  const height = Math.max(210, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height * 0.92;
  const radius = Math.min(width * 0.42, height * 0.78);
  const start = Math.PI;
  const end = Math.PI * 2;
  const segments = [
    [0, 20, "#22d3ee"],
    [20, 40, "#14b8a6"],
    [40, 60, "#64748b"],
    [60, 75, "#f59e0b"],
    [75, 100, "#ef4444"],
  ];

  ctx.lineCap = "round";
  segments.forEach(([from, to, color]) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.globalAlpha = 0.92;
    ctx.arc(cx, cy, radius, start + (from / 100) * Math.PI, start + (to / 100) * Math.PI);
    ctx.stroke();
  });

  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.strokeStyle = "rgba(226, 232, 240, 0.72)";
  ctx.lineWidth = 2;
  ctx.arc(cx, cy, radius - 20, start, end);
  ctx.stroke();

  const score = clamp(insight?.score ?? 50, 0, 100);
  const angle = start + (score / 100) * Math.PI;
  const needleLength = radius - 18;
  const nx = cx + Math.cos(angle) * needleLength;
  const ny = cy + Math.sin(angle) * needleLength;

  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.24)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 3;
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.fillStyle = "#111827";
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(100, 116, 139, 0.9)";
  ctx.textAlign = "left";
  ctx.fillText("0", cx - radius - 4, cy + 18);
  ctx.textAlign = "right";
  ctx.fillText("100", cx + radius + 8, cy + 18);
}

function renderInsight(insight) {
  const signalRoot = el("signal-list");
  if (signalRoot) {
    signalRoot.innerHTML = insight.signals.map((item) => `<div class="signal-item">${escapeHtml(item)}</div>`).join("");
  }
  const operationRoot = el("operation-list");
  if (operationRoot) {
    operationRoot.innerHTML = insight.operations.map((item) => `<div class="operation-item">${escapeHtml(item)}</div>`).join("");
  }
}

function renderMarket(data) {
  const rows = firstRows(data.market);
  renderMarketCards(data);
  renderTable("market-table", rows, ["date", "代码", "最新价", "涨跌幅", "成交额", "上涨家数", "下跌家数"], 12, { maxColumns: 7 });
}

function renderMarketCards(data) {
  const root = el("market-cards");
  if (!root) return;
  const rows = getIndexRows(data).slice(0, 6);
  if (!rows.length) {
    root.innerHTML = '<div class="empty">暂无指数快照</div>';
    return;
  }
  root.innerHTML = rows.map((row) => {
    const name = pickValue(row, ["date", "名称", "指数"]);
    const code = pickValue(row, ["代码", "code"]);
    const pct = pickValue(row, ["涨跌幅", "涨跌幅(%)"]);
    const price = pickValue(row, ["最新价", "最新价(元)"]);
    const amount = pickValue(row, ["成交额", "成交额(元)"]);
    return `
      <div class="market-card" data-index-code="${escapeHtml(text(code))}">
        <span>${escapeHtml(name || "-")}</span>
        <strong class="${valueClass(pct)}" data-live-pct>${escapeHtml(text(pct))}</strong>
        <small><span data-live-price>${escapeHtml(text(price))}</span> / ${escapeHtml(text(amount))}</small>
      </div>
    `;
  }).join("");
  renderLiveIndices();
}

function loadBreadthSeries() {
  try {
    const stored = JSON.parse(localStorage.getItem(BREADTH_STORAGE_KEY) || "[]");
    const cutoff = Date.now() - BREADTH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return stored
      .filter((item) => item && Number(item.t) >= cutoff)
      .map((item) => ({
        t: Number(item.t),
        up: toNumber(item.up),
        down: toNumber(item.down),
        flat: toNumber(item.flat) || 0,
        total: toNumber(item.total),
        source: item.source || "local",
        scope: item.scope || "沪深京",
      }))
      .filter((item) => Number.isFinite(item.t) && item.up !== null && item.down !== null);
  } catch (error) {
    console.warn("Unable to read breadth series", error);
    return [];
  }
}

function saveBreadthSeries() {
  try {
    localStorage.setItem(BREADTH_STORAGE_KEY, JSON.stringify(breadthSeries));
  } catch (error) {
    console.warn("Unable to save breadth series", error);
  }
}

function addBreadthSample(sample, persist = true) {
  const up = toNumber(sample.up);
  const down = toNumber(sample.down);
  if (up === null || down === null) return false;

  const flat = toNumber(sample.flat) || 0;
  const total = toNumber(sample.total) || up + down + flat;
  if (total <= 0) return false;
  const sampleTime = Number(sample.t) || parseCnTimestamp(sample.time || sample.generatedAt, NaN);
  if (!Number.isFinite(sampleTime)) return false;

  const normalized = {
    t: sampleTime,
    up,
    down,
    flat,
    total,
    source: sample.source || "latest.json",
    scope: sample.scope || "沪深京",
  };

  const sameIndex = breadthSeries.findIndex((item) => Math.abs(item.t - normalized.t) < 1000);
  if (sameIndex >= 0) {
    breadthSeries[sameIndex] = normalized;
  } else {
    breadthSeries.push(normalized);
  }

  breadthSeries.sort((a, b) => a.t - b.t);
  if (breadthSeries.length > BREADTH_MAX_POINTS) {
    breadthSeries = breadthSeries.slice(-BREADTH_MAX_POINTS);
  }
  if (persist) saveBreadthSeries();
  dailyBreadthDirty = true;
  chartSeriesDirty = true;
  return true;
}

function mergeBreadthHistoryFromDashboard(data) {
  const rows = data?.breadthPulse?.rows || [];
  if (!Array.isArray(rows) || rows.length === 0) return;
  let changed = false;
  rows.forEach((row) => {
    if (row && addBreadthSample(row, false)) changed = true;
  });
  if (changed) saveBreadthSeries();
}

function seedBreadthFromDashboard(data) {
  const breadth = data?.breadth || {};
  if (breadth.up === undefined || breadth.down === undefined) return;
  addBreadthSample({
    t: parseCnTimestamp(data.meta?.dataCutoffAt || data.meta?.generatedAt),
    up: breadth.up,
    down: breadth.down,
    flat: breadth.flat,
    total: breadth.total,
    source: breadth.source || "latest.json",
    scope: breadth.scope || "沪深京",
  });
}

function applyLiveBreadthToDashboard(sample) {
  if (!dashboardData) return;
  const timeText = formatCnDateTime(sample.t);
  const tradeDate = cnDateKey(sample.t);
  dashboardData.breadth = {
    ...(dashboardData.breadth || {}),
    total: sample.total,
    up: sample.up,
    down: sample.down,
    flat: sample.flat,
    source: sample.source,
    scope: sample.scope,
  };

  const pulse = dashboardData.breadthPulse || {};
  const rows = Array.isArray(pulse.rows) ? pulse.rows : [];
  const liveRow = {
    time: timeText,
    up: sample.up,
    down: sample.down,
    flat: sample.flat,
    total: sample.total,
    source: sample.source,
    scope: sample.scope,
  };
  const sameIndex = rows.findIndex((row) => Math.abs(parseCnTimestamp(row.time, 0) - sample.t) < 1000);
  if (sameIndex >= 0) {
    rows[sameIndex] = liveRow;
  } else {
    rows.push(liveRow);
  }
  dashboardData.breadthPulse = { ...pulse, rows: rows.slice(-BREADTH_MAX_POINTS) };

  const meta = dashboardData.meta || {};
  const marketClock = meta.marketClock || {};
  const recentTradingDates = Array.isArray(marketClock.recentTradingDates)
    ? [...new Set([...marketClock.recentTradingDates, tradeDate])].slice(-10)
    : [tradeDate];
  dashboardData.meta = {
    ...meta,
    tradingDate: tradeDate,
    dataCutoffAt: timeText,
    marketClock: {
      ...marketClock,
      isOpen: true,
      session: "open",
      sessionText: "交易中",
      lastTradingDate: tradeDate,
      dataCutoffAt: timeText,
      recentTradingDates,
    },
  };
  updateMetaLight(dashboardData);
}

function weekKey(timestamp) {
  const cnDate = new Date(`${cnDateKey(timestamp)}T00:00:00+08:00`);
  const day = cnDate.getUTCDay() || 7;
  cnDate.setUTCDate(cnDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(cnDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((cnDate - yearStart) / 86400000) + 1) / 7);
  return `${cnDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodBucketKey(timestamp, periodKey) {
  const period = BREADTH_PERIODS[periodKey] || BREADTH_PERIODS["1d"];
  if (period.kind === "interval") return String(Math.floor(timestamp / period.ms));
  if (period.kind === "week") return weekKey(timestamp);
  if (period.kind === "month") return cnDateKey(timestamp).slice(0, 7);
  return cnDateKey(timestamp);
}

function movingAverageValues(points, windowSize, key = "up") {
  let sum = 0;
  return points.map((point, index) => {
    const value = toNumber(point[key]) || 0;
    sum += value;
    if (index >= windowSize) sum -= toNumber(points[index - windowSize][key]) || 0;
    return index >= windowSize - 1 ? sum / windowSize : null;
  });
}

function buildDailyBreadthSeries() {
  if (!dailyBreadthDirty && dailyBreadthCache) return dailyBreadthCache;
  const buckets = new Map();
  breadthSeries.forEach((point) => {
    const key = cnDateKey(point.t);
    const current = buckets.get(key);
    if (!current || point.t >= current.t) {
      buckets.set(key, { ...point, count: current?.count || 1 });
    } else if (current) {
      current.count = (current.count || 1) + 1;
    }
  });

  const daily = [...buckets.values()].sort((a, b) => a.t - b.t);
  const maSets = Object.fromEntries(BREADTH_MA_WINDOWS.map((windowSize) => [windowSize, movingAverageValues(daily, windowSize)]));
  dailyBreadthCache = daily.map((point, index) => ({
    ...point,
    ma20: maSets[20][index],
    ma60: maSets[60][index],
    ma120: maSets[120][index],
    ma250: maSets[250][index],
  }));
  dailyBreadthDirty = false;
  return dailyBreadthCache;
}

function latestTradingDaySamples() {
  if (!breadthSeries.length) return [];
  const latest = breadthSeries[breadthSeries.length - 1];
  const latestDate = cnDateKey(latest.t);
  return breadthSeries.filter((point) => cnDateKey(point.t) === latestDate).sort((a, b) => a.t - b.t);
}

function attachDailyMovingAverages(points, dailyPoints) {
  const dailyByDate = new Map(dailyPoints.map((point) => [cnDateKey(point.t), point]));
  return points.map((point) => {
    const daily = dailyByDate.get(cnDateKey(point.t));
    return {
      ...point,
      ma20: daily?.ma20 ?? null,
      ma60: daily?.ma60 ?? null,
      ma120: daily?.ma120 ?? null,
      ma250: daily?.ma250 ?? null,
    };
  });
}

function aggregatePoints(points, periodKey) {
  if (periodKey === "15s") return points.slice(-BREADTH_MAX_POINTS);
  const buckets = new Map();
  points.forEach((point) => {
    const key = periodBucketKey(point.t, periodKey);
    const current = buckets.get(key) || {
      t: point.t,
      up: 0,
      down: 0,
      flat: 0,
      total: 0,
      count: 0,
      ma20: null,
      ma60: null,
      ma120: null,
      ma250: null,
      source: point.source,
      scope: point.scope,
    };
    current.t = Math.max(current.t, point.t);
    current.up += point.up || 0;
    current.down += point.down || 0;
    current.flat += point.flat || 0;
    current.total += point.total || 0;
    current.count += 1;
    BREADTH_MA_WINDOWS.forEach((windowSize) => {
      const keyName = `ma${windowSize}`;
      if (point[keyName] !== null && point[keyName] !== undefined && point.t >= current.t) {
        current[keyName] = point[keyName];
      } else if (current[keyName] === null && point[keyName] !== null && point[keyName] !== undefined) {
        current[keyName] = point[keyName];
      }
    });
    current.source = point.source || current.source;
    current.scope = point.scope || current.scope;
    buckets.set(key, current);
  });

  return [...buckets.values()]
    .map((bucket) => ({
      t: bucket.t,
      up: bucket.up / bucket.count,
      down: bucket.down / bucket.count,
      flat: bucket.flat / bucket.count,
      total: bucket.total / bucket.count,
      ma20: bucket.ma20,
      ma60: bucket.ma60,
      ma120: bucket.ma120,
      ma250: bucket.ma250,
      source: bucket.source,
      scope: bucket.scope,
      count: bucket.count,
    }))
    .sort((a, b) => a.t - b.t)
    .slice(-BREADTH_MAX_POINTS);
}

function getBreadthChartSeries(periodKey = activeBreadthPeriod) {
  if (!chartSeriesDirty && chartSeriesCache[periodKey]) return chartSeriesCache[periodKey];
  const dailyPoints = buildDailyBreadthSeries();
  const period = BREADTH_PERIODS[periodKey] || BREADTH_PERIODS["1d"];
  const intradayKeys = new Set(["15s", "15m", "4h"]);
  const intradaySamples = latestTradingDaySamples();
  const hasRealIntraday = intradaySamples.length > 1;

  let result;
  if (intradayKeys.has(periodKey) && hasRealIntraday) {
    const pointsWithMa = attachDailyMovingAverages(intradaySamples, dailyPoints);
    result = {
      points: aggregatePoints(pointsWithMa, periodKey),
      label: period.label,
      mode: "intraday",
      note: "盘中实时采样",
    };
  } else if (intradayKeys.has(periodKey)) {
    const fallbackCount = BREADTH_INTRADAY_FALLBACK_POINTS[periodKey] || 60;
    const fallbackPoints = aggregatePoints(dailyPoints, "1d").slice(-fallbackCount);
    result = {
      points: fallbackPoints,
      label: `${period.label} / 收盘参照`,
      mode: "daily-fallback",
      note: periodKey === "15s"
        ? "暂无真实15s盘中历史，显示最新收盘快照"
        : `暂无真实${period.label}盘中历史，显示近${fallbackCount}个交易日收盘参照`,
    };
  } else {
    result = {
      points: aggregatePoints(dailyPoints, periodKey),
      label: period.label,
      mode: period.kind,
      note: periodKey === "1d" ? "日线MA" : `${period.label}聚合，MA沿用日线历史`,
    };
  }
  chartSeriesCache[periodKey] = result;
  chartSeriesDirty = false;
  return result;
}

function aggregateBreadthSeries(periodKey = activeBreadthPeriod) {
  return getBreadthChartSeries(periodKey).points;
}

function applyBreadthWindow(points) {
  if (!Array.isArray(points)) return [];
  if (activeBreadthWindow === "all") return points;
  const size = Number(activeBreadthWindow);
  return Number.isFinite(size) && size > 0 ? points.slice(-size) : points;
}

function breadthWindowLabel() {
  return activeBreadthWindow === "all" ? "全量" : `近${activeBreadthWindow}`;
}

function cacheDomRefs() {
  cachedBreadthPeriodBtns = document.querySelectorAll("[data-breadth-period]");
  cachedBreadthWindowBtns = document.querySelectorAll("[data-breadth-window]");
  cachedMaToggleBtns = document.querySelectorAll("[data-ma-toggle]");
  cachedMaLegendItems = document.querySelectorAll("[data-ma-legend]");
}

function updatePeriodTabs() {
  (cachedBreadthPeriodBtns || document.querySelectorAll("[data-breadth-period]")).forEach((button) => {
    const active = button.dataset.breadthPeriod === activeBreadthPeriod;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateBreadthWindowTabs() {
  (cachedBreadthWindowBtns || document.querySelectorAll("[data-breadth-window]")).forEach((button) => {
    const active = button.dataset.breadthWindow === activeBreadthWindow;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateMaToggles() {
  (cachedMaToggleBtns || document.querySelectorAll("[data-ma-toggle]")).forEach((button) => {
    const active = isMaVisible(button.dataset.maToggle);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  (cachedMaLegendItems || document.querySelectorAll("[data-ma-legend]")).forEach((item) => {
    item.classList.toggle("is-muted", !isMaVisible(item.dataset.maLegend));
  });
}

function updateBreadthControls() {
  updatePeriodTabs();
  updateBreadthWindowTabs();
  updateMaToggles();
}

function renderBreadthStats(message = "") {
  const upEl = el("pulse-up");
  if (!upEl) return;

  const series = getBreadthChartSeries();
  const points = applyBreadthWindow(series.points);
  const latest = points[points.length - 1];
  if (!latest) {
    upEl.textContent = "-";
    setText("pulse-down", "-");
    setText("pulse-samples", "0");
    setText("pulse-updated", message || "等待快照");
    return;
  }

  upEl.textContent = formatInteger(latest.up);
  setText("pulse-down", formatInteger(latest.down));
  setText("pulse-samples", formatInteger(points.length));
  setText("pulse-updated", message || `${series.label} / ${breadthWindowLabel()} / ${latest.scope} / ${formatCnTick(latest.t, true)} / ${series.note}`);
}

function jsonpRequest(url, params, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const callback = `__stockCnBreadth${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("实时接口暂不可用"));
    }, timeout);

    function cleanup() {
      window.clearTimeout(timer);
      script.remove();
      try {
        delete window[callback];
      } catch (error) {
        window[callback] = undefined;
      }
    }

    window[callback] = (payload) => {
      cleanup();
      resolve(payload);
    };

    const search = new URLSearchParams({ ...params, cb: callback, _: String(Date.now()) });
    script.async = true;
    script.src = `${url}?${search.toString()}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("实时接口暂不可用"));
    };
    document.head.appendChild(script);
  });
}

function parseBreadthPayload(payload) {
  const rows = payload?.data?.diff || [];
  const selected = rows.filter((row) => BREADTH_CODES.has(String(row.f12)));
  const sourceRows = selected.length ? selected : rows;
  const sums = sourceRows.reduce((acc, row) => {
    acc.up += toNumber(row.f104) || 0;
    acc.down += toNumber(row.f105) || 0;
    acc.flat += toNumber(row.f106) || 0;
    return acc;
  }, { up: 0, down: 0, flat: 0 });

  if (!sourceRows.length || (!sums.up && !sums.down && !sums.flat)) {
    throw new Error("实时接口暂不可用");
  }

  return {
    t: Date.now(),
    up: sums.up,
    down: sums.down,
    flat: sums.flat,
    total: sums.up + sums.down + sums.flat,
    source: "Eastmoney public quote",
    scope: "上证指数 + 深证成指 + 北证50",
  };
}

async function pollLiveBreadth() {
  if (!el("breadth-chart")) return;
  try {
    let payload = null;
    let lastError = null;
    for (const endpoint of BREADTH_ENDPOINTS) {
      try {
        payload = await jsonpRequest(endpoint, {
          fltt: "2",
          fields: BREADTH_FIELDS,
          secids: BREADTH_SECIDS,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!payload) throw lastError || new Error("实时接口暂不可用");
    const sample = parseBreadthPayload(payload);
    addBreadthSample(sample);
    applyLiveBreadthToDashboard(sample);
    renderBreadthStats();
    scheduleBreadthDraw();
    updateFreshness("breadth", true);
    liveState.polling.breadth.consecutiveErrors = 0;
    liveState.polling.breadth.backoff = 1;
  } catch (error) {
    const latest = breadthSeries[breadthSeries.length - 1];
    const prefix = latest ? `${latest.scope} / 最近 ${formatCnTick(latest.t, true)}` : "宽度快照";
    renderBreadthStats(`${prefix} / ${error.message}，沿用最新快照`);
    updateFreshness("breadth", false, error.message);
    recordError("breadth", error.message);
  }
}

// --- Live index quote polling ---

async function pollLiveIndices() {
  if (document.hidden) return;
  const phase = liveState.session.phase;
  if (phase === "weekend" || phase === "postclose") return;
  try {
    let payload = null;
    for (const endpoint of BREADTH_ENDPOINTS) {
      try {
        payload = await jsonpRequest(endpoint, {
          fltt: "2", fields: INDEX_FIELDS, secids: INDEX_SECIDS,
        });
        break;
      } catch (_) {}
    }
    if (!payload?.data?.diff) throw new Error("无数据");
    const rows = payload.data.diff;
    rows.forEach((row) => {
      const code = String(row.f12 || "");
      const secid = codeToSecid(code);
      liveState.indices[secid] = {
        price: row.f2, changePct: row.f3, changeAmt: row.f4,
        name: row.f14, code, turnover: row.f6, ts: Date.now(),
      };
    });
    updateFreshness("indices", true);
    liveState.polling.indices.consecutiveErrors = 0;
    liveState.polling.indices.backoff = 1;
    renderLiveIndices();
    updateFearGreedWithLiveData();
  } catch (error) {
    updateFreshness("indices", false, error.message);
    recordError("indices", error.message);
  }
}

function renderLiveIndices() {
  const cards = document.querySelectorAll(".market-card[data-index-code]");
  if (!cards.length) return;
  cards.forEach((card) => {
    const code = card.dataset.indexCode;
    const secid = codeToSecid(code);
    const live = liveState.indices[secid];
    if (!live || live.price === undefined) return;
    const priceEl = card.querySelector("[data-live-price]");
    const pctEl = card.querySelector("[data-live-pct]");
    if (priceEl) priceEl.textContent = text(live.price);
    if (pctEl) {
      const pctText = live.changePct != null ? `${live.changePct}%` : "-";
      pctEl.textContent = pctText;
      pctEl.className = `value ${valueClass(pctText)}`;
    }
    const badge = card.querySelector(".freshness-badge") || document.createElement("span");
    badge.className = "freshness-badge live";
    badge.textContent = "live";
    if (!card.querySelector(".freshness-badge")) card.appendChild(badge);
  });
}

// --- Live stock quote polling for screener candidates ---

function collectScreenerCodes() {
  if (liveState.screenerCodes) return liveState.screenerCodes;
  const codes = new Set();
  (dashboardData?.screeners || []).forEach((group) => {
    (group.rows || []).forEach((row) => {
      const code = findRowCode(row);
      if (code) codes.add(code);
    });
  });
  liveState.screenerCodes = [...codes].map((code) => ({ code, secid: codeToSecid(code) }));
  return liveState.screenerCodes;
}

async function pollLiveStockQuotes() {
  if (document.hidden) return;
  const phase = liveState.session.phase;
  if (phase === "weekend" || phase === "postclose") return;
  const stockList = collectScreenerCodes();
  if (!stockList.length) return;
  try {
    const batches = [];
    for (let i = 0; i < stockList.length; i += STOCK_BATCH_SIZE) {
      batches.push(stockList.slice(i, i + STOCK_BATCH_SIZE));
    }
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const secids = batch.map((s) => s.secid).join(",");
      let payload = null;
      for (const endpoint of BREADTH_ENDPOINTS) {
        try {
          payload = await jsonpRequest(endpoint, {
            fltt: "2", fields: STOCK_FIELDS, secids,
          });
          break;
        } catch (_) {}
      }
      if (payload?.data?.diff) {
        payload.data.diff.forEach((row) => {
          const code = String(row.f12 || "");
          liveState.stockQuotes[code] = {
            price: row.f2, changePct: row.f3, name: row.f14, ts: Date.now(),
          };
        });
      }
      if (b < batches.length - 1) await new Promise((r) => setTimeout(r, 200));
    }
    updateFreshness("stocks", true);
    liveState.polling.stocks.consecutiveErrors = 0;
    liveState.polling.stocks.backoff = 1;
    enrichScreenerDisplay();
  } catch (error) {
    updateFreshness("stocks", false, error.message);
    recordError("stocks", error.message);
  }
}

function enrichScreenerDisplay() {
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-code]").forEach((el) => {
      const code = el.dataset.code;
      const live = liveState.stockQuotes[code];
      if (!live || live.price === undefined) return;
      const priceEl = el.querySelector("[data-live-price]");
      if (priceEl) priceEl.textContent = text(live.price);
      const pctEl = el.querySelector("[data-live-pct]");
      if (pctEl) {
        const pctText = live.changePct != null ? `${live.changePct}%` : "-";
        pctEl.textContent = pctText;
        pctEl.className = `${pctEl.className.replace(/\b(positive|negative|neutral)\b/g, "").trim()} ${valueClass(pctText)}`.trim();
      }
      const badge = el.querySelector(".freshness-badge") || (() => {
        const b = document.createElement("span");
        b.className = "freshness-badge live";
        b.textContent = "live";
        const heading = el.querySelector("h3, .conf-header");
        if (heading) heading.appendChild(b);
        return b;
      })();
      badge.className = "freshness-badge live";
      badge.textContent = "live";
    });
  });
}

function updateFearGreedWithLiveData() {
  if (!dashboardData || document.hidden) return;
  const view = getCurrentView();
  if (view !== "overview") return;
  updateMeta(dashboardData);
}

function recordError(source, message) {
  const polling = liveState.polling[source];
  if (polling) {
    polling.consecutiveErrors++;
    polling.backoff = Math.min(32, Math.pow(2, polling.consecutiveErrors));
  }
  liveState.errors.push({ source, message, ts: Date.now() });
  if (liveState.errors.length > 20) liveState.errors.shift();
}

function drawPolyline(ctx, points, values, scaleX, scaleY, color, width, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let hasPoint = false;
  points.forEach((point, index) => {
    const value = Array.isArray(values) ? values[index] : values(point, index);
    if (value === null || value === undefined || Number.isNaN(value)) {
      hasPoint = false;
      return;
    }
    const x = scaleX(index);
    const y = scaleY(value);
    if (!hasPoint) {
      ctx.moveTo(x, y);
      hasPoint = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

function drawBreadthChart() {
  const canvas = el("breadth-chart");
  if (!canvas || canvas.offsetParent === null) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 14, right: 62, top: 18, bottom: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const series = getBreadthChartSeries();
  const points = applyBreadthWindow(series.points);
  const latest = points[points.length - 1];
  const maKeys = BREADTH_MA_WINDOWS
    .filter((windowSize) => isMaVisible(windowSize))
    .map((windowSize) => `ma${windowSize}`);
  const maxObserved = Math.max(
    5000,
    ...points.map((point) => Math.max(
      point.up,
      ...maKeys.map((key) => toNumber(point[key]) || 0)
    ))
  );
  const yMin = 0;
  const yMax = Math.ceil(maxObserved / 500) * 500;
  const axisLabels = [0, 1000, 2000, 3000, 4000, 5000].filter((value) => value <= yMax);
  if (!axisLabels.includes(yMax)) axisLabels.push(yMax);

  const scaleX = (index) => {
    if (points.length <= 1) return pad.left + plotW / 2;
    return pad.left + (index / (points.length - 1)) * plotW;
  };
  const scaleY = (value) => {
    const clamped = Math.min(yMax, Math.max(yMin, value));
    return pad.top + ((yMax - clamped) / (yMax - yMin)) * plotH;
  };

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  axisLabels.forEach((value) => {
    const y = scaleY(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right + 6, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(203, 213, 225, 0.68)";
    ctx.fillText(String(value), width - pad.right + 12, y);
  });

  if (latest?.total) {
    const mid = latest.total / 2;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.26)";
    ctx.beginPath();
    ctx.moveTo(pad.left, scaleY(mid));
    ctx.lineTo(width - pad.right, scaleY(mid));
    ctx.stroke();
    ctx.restore();
  }

  if (points.length < 2) {
    if (latest) {
      const x = pad.left + plotW / 2;
      const y = scaleY(latest.up);
      ctx.strokeStyle = "rgba(248, 113, 113, 0.28)";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = "#fb5353";
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(248, 250, 252, 0.86)";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`上涨 ${formatInteger(latest.up)}`, x, y - 10);
    }
    ctx.fillStyle = "rgba(203, 213, 225, 0.72)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("等待历史宽度快照", width / 2, height / 2);
  } else {
    drawPolyline(ctx, points, (point) => point.up, scaleX, scaleY, "#fb5353", 1.55, 0.72);
    if (isMaVisible(250)) drawPolyline(ctx, points, (point) => point.ma250, scaleX, scaleY, "#a78bfa", 2.05, 0.96);
    if (isMaVisible(120)) drawPolyline(ctx, points, (point) => point.ma120, scaleX, scaleY, "#60a5fa", 2.0, 0.96);
    if (isMaVisible(60)) drawPolyline(ctx, points, (point) => point.ma60, scaleX, scaleY, "#e2e8f0", 1.75, 0.88);
    if (isMaVisible(20)) drawPolyline(ctx, points, (point) => point.ma20, scaleX, scaleY, "#f59e0b", 1.85, 0.96);
  }

  ctx.fillStyle = "rgba(203, 213, 225, 0.72)";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${series.label} / ${breadthWindowLabel()}`, pad.left, pad.top - 4);

  if (points.length) {
    const includeDate = cnDateKey(points[0].t) !== cnDateKey(points[points.length - 1].t);
    ctx.textBaseline = "bottom";
    ctx.fillText(formatCnTick(points[0].t, includeDate), pad.left, height - 8);
    ctx.textAlign = "right";
    ctx.fillText(formatCnTick(points[points.length - 1].t, includeDate), width - pad.right, height - 8);
  }
}

function scheduleBreadthDraw() {
  if (breadthDrawTimer) clearTimeout(breadthDrawTimer);
  breadthDrawTimer = setTimeout(() => {
    breadthDrawTimer = null;
    requestAnimationFrame(drawBreadthChart);
  }, DRAW_DEBOUNCE_MS);
}

function shouldPollLiveBreadth(data) {
  const meta = data?.meta || {};
  if (meta.runFocus === "news_only") return false;
  if (meta.marketClock?.isOpen === true) return true;
  const session = meta.marketClock?.session;
  if (session === "non_trading_day" || session === "market_holiday_or_no_quote") return false;
  return isCnMarketSessionNow();
}

function initBreadthPulse(data) {
  if (!el("breadth-chart")) return;

  if (!breadthInitialized) {
    breadthSeries = loadBreadthSeries();
    window.addEventListener("resize", () => {
      scheduleBreadthDraw();
      if (currentInsight) drawFearGreedGauge(currentInsight);
    });
    breadthInitialized = true;
  }

  mergeBreadthHistoryFromDashboard(data);
  seedBreadthFromDashboard(data);
  updateBreadthControls();
  renderBreadthStats();
  scheduleBreadthDraw();

  if (breadthTimer) {
    window.clearInterval(breadthTimer);
    breadthTimer = null;
  }
  if (shouldPollLiveBreadth(data)) {
    pollLiveBreadth();
    breadthTimer = window.setInterval(pollLiveBreadth, BREADTH_POLL_MS);
    // Start live index polling
    if (liveState.polling.indices.timer) window.clearInterval(liveState.polling.indices.timer);
    pollLiveIndices();
    liveState.polling.indices.timer = window.setInterval(pollLiveIndices, INDEX_POLL_BASE_MS);
    // Start live stock quote polling
    if (liveState.polling.stocks.timer) window.clearInterval(liveState.polling.stocks.timer);
    pollLiveStockQuotes();
    liveState.polling.stocks.timer = window.setInterval(pollLiveStockQuotes, STOCK_POLL_BASE_MS);
  } else {
    renderBreadthStats();
  }
}

function renderStrategySelect(data) {
  const select = el("strategy-select");
  if (!select) return;
  const groups = data.screeners || [];
  select.innerHTML = groups.length
    ? groups.map((group, index) => `<option value="${index}">${escapeHtml(group.name || `策略${index + 1}`)}</option>`).join("")
    : '<option value="0">暂无策略</option>';
  select.onchange = () => renderTopCandidates();
}

function renderCandidateCards(rows, strategyName) {
  const root = el("candidate-cards");
  if (!root) return;
  if (!rows || !rows.length) {
    root.innerHTML = '<div class="empty">暂无优选候选</div>';
    return;
  }
  root.innerHTML = rows.slice(0, 8).map((row, index) => {
    const code = findRowCode(row);
    const name = findRowName(row) || code || `候选 ${index + 1}`;
    const pct = pickValue(row, ["涨跌幅(%)", "涨跌幅"]);
    const flow = pickValue(row, ["主力净额(元)", "主力净额", "主力资金净流入"]);
    const amount = pickValue(row, ["成交额(元)", "成交额"]);
    const turnover = pickValue(row, ["换手率(%)", "换手率"]);
    const rowTone = valueClass(pct);
    return `
      <div class="candidate-card" data-code="${escapeHtml(code)}" data-stock-code="${escapeHtml(code)}">
        <div>
          <span class="rank">#${index + 1}</span>
          <h3>${escapeHtml(name)} <small>${escapeHtml(code)}</small></h3>
          <p>${escapeHtml(strategyName || "策略候选")}</p>
        </div>
        <strong class="${rowTone}" data-live-pct>${escapeHtml(text(pct))}</strong>
        <dl>
          <div><dt>主力</dt><dd class="${valueClass(flow)}">${escapeHtml(text(flow))}</dd></div>
          <div><dt>成交</dt><dd>${escapeHtml(text(amount))}</dd></div>
          <div><dt>换手</dt><dd>${escapeHtml(text(turnover))}</dd></div>
        </dl>
      </div>
    `;
  }).join("");
  enrichScreenerDisplay();
  bindStockClicks();
}

function renderTopCandidates() {
  const groups = dashboardData?.screeners || [];
  const select = el("strategy-select");
  const index = Number(select?.value || 0);
  const group = groups[index] || groups[0] || {};
  renderCandidateCards(group.rows || [], group.name || "");
  renderTable(
    "top-candidates",
    group.rows || [],
    ["代码", "名称", "最新价(元)", "最新价", "涨跌幅(%)", "涨跌幅", "主力净额(元)", "主力净额", "成交额(元)", "成交额", "换手率(%)", "换手率"],
    40,
    { maxColumns: 8 }
  );
}

function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).replace(/,/g, "").trim();
  const match = raw.match(/(-?[\d.]+)\s*(万亿|亿|万)?/);
  if (!match) return null;
  let n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = match[2];
  if (unit === "万亿") n *= 10000;
  else if (unit === "亿") n *= 1;
  else if (unit === "万") n *= 0.0001;
  return n;
}

function scoreConfidence(stock) {
  let score = 0;

  // 策略覆盖 (30分): 出现在越多策略中，信心越高
  const strategyCount = stock._strategies.length;
  score += Math.min(30, (strategyCount / 5) * 30);

  // 排名表现 (20分): 平均排名越靠前越好
  const avgRank = stock._strategies.reduce((sum, s) => sum + s.rank, 0) / strategyCount;
  score += Math.max(0, 20 * (1 - (avgRank - 1) / 29));

  // 资金动量 (20分): 主力净流入越大越好
  const flow = parseAmount(stock._bestFlow);
  if (flow !== null) {
    if (flow >= 10) score += 20;
    else if (flow >= 5) score += 16;
    else if (flow >= 2) score += 12;
    else if (flow >= 1) score += 8;
    else if (flow > 0) score += 4;
  }

  // 价格动量 (15分): 当日涨幅
  const pct = parsePercent(stock._bestPct);
  if (pct !== null) {
    score += clamp(pct * 3, -10, 15);
  }

  // 换手率 (15分): 适中换手率最佳 (5-15%)
  const turnover = parsePercent(stock._bestTurnover);
  if (turnover !== null) {
    if (turnover >= 3 && turnover <= 20) score += 15;
    else if (turnover >= 1 && turnover <= 30) score += 10;
    else score += 5;
  }

  return Math.round(clamp(score, 0, 100));
}

function buildConfidenceRanking(data) {
  const stockMap = new Map();
  (data.screeners || []).forEach((group) => {
    (group.rows || []).forEach((row, idx) => {
      const code = findRowCode(row);
      if (!code) return;
      if (!stockMap.has(code)) {
        stockMap.set(code, {
          code,
          name: findRowName(row) || code,
          _strategies: [],
          _bestPct: pickValue(row, ["涨跌幅(%)", "涨跌幅"]),
          _bestFlow: pickValue(row, ["主力净额(元)", "主力净额", "主力资金净流入"]),
          _bestTurnover: pickValue(row, ["换手率(%)", "换手率"]),
          _bestAmount: pickValue(row, ["成交额(元)", "成交额"]),
          _bestPrice: pickValue(row, ["最新价(元)", "最新价"]),
        });
      }
      const stock = stockMap.get(code);
      stock._strategies.push({ name: group.name || "", rank: idx + 1 });
    });
  });

  return [...stockMap.values()]
    .map((stock) => ({ ...stock, confidence: scoreConfidence(stock) }))
    .sort((a, b) => b.confidence - a.confidence);
}

function flattenRanking(data) {
  const rows = [];
  (data.screeners || []).forEach((group) => {
    (group.rows || []).forEach((row, idx) => {
      const enriched = {
        "策略": group.name || "",
        "Rank": idx + 1,
        ...row,
      };
      enriched._search = JSON.stringify(enriched).toLowerCase();
      rows.push(enriched);
    });
  });
  return rows;
}

function renderRanking(filter = "") {
  const q = filter.trim().toLowerCase();
  const rows = q
    ? flatRows.filter((row) => row._search.includes(q))
    : flatRows;
  renderTable(
    "ranking-table",
    rows,
    ["策略", "Rank", "代码", "名称", "最新价(元)", "最新价", "涨跌幅(%)", "涨跌幅", "主力净额(元)", "主力净额", "成交额(元)", "成交额", "换手率(%)", "换手率", "总市值(元)"],
    240,
    { maxColumns: 10 }
  );
}

function renderThemes(data) {
  const root = el("theme-list");
  const themes = data.themes || [];
  if (!root) return;
  if (!themes.length) {
    root.innerHTML = '<div class="empty">暂无题材数据</div>';
    return;
  }
  root.innerHTML = themes.slice(0, 12).map((theme) => {
    const rows = (theme.rows || []).slice(0, 8);
    const mini = document.createElement("div");
    renderTable(mini, rows, ["date", "涨跌幅", "成交额", "主力净额"], 8, { maxColumns: 4 });
    return `
      <div class="theme-item">
        <h3>${escapeHtml(theme.title || "题材")}</h3>
        <div class="mini-table">${mini.innerHTML}</div>
      </div>
    `;
  }).join("");
}

function renderDetails(data) {
  const root = el("stock-details");
  const details = data.stockDetails || [];
  if (!root) return;
  if (!details.length) {
    root.innerHTML = '<div class="empty">暂无逐股细查；优先看候选与截面页。</div>';
    return;
  }
  root.innerHTML = details.slice(0, 24).map((item) => {
    const table = (item.tables || [])[0];
    const rows = table?.rows || [];
    const mini = document.createElement("div");
    renderTable(mini, rows, ["date", "最新价", "涨跌幅", "成交额", "换手率", "主力净流入"], 6, { maxColumns: 6 });
    return `
      <div class="detail-item" data-stock-code="${escapeHtml(item.code || "")}">
        <h3>${escapeHtml(item.name || item.code)} <span class="tag">${escapeHtml(item.code || "")}</span></h3>
        <div class="inline-meta"><span>来源：${escapeHtml(item.source || "-")}</span></div>
        <div class="mini-table">${mini.innerHTML}</div>
      </div>
    `;
  }).join("");
  bindStockClicks();
}

let confidenceRanking = [];

function renderConfidence(data) {
  confidenceRanking = buildConfidenceRanking(data);
  const root = el("confidence-cards");
  const tableRoot = el("confidence-table");
  if (!root) return;

  const top = confidenceRanking.slice(0, 20);
  if (!top.length) {
    root.innerHTML = '<div class="empty">暂无候选数据</div>';
    return;
  }

  root.innerHTML = top.slice(0, 10).map((stock, i) => {
    const confTone = stock.confidence >= 70 ? "conf-high" : stock.confidence >= 40 ? "conf-mid" : "conf-low";
    const stratTags = stock._strategies.map((s) => `<span class="conf-strat">${escapeHtml(s.name)} #${s.rank}</span>`).join("");
    return `
      <div class="confidence-card ${confTone}" data-stock-code="${escapeHtml(stock.code)}" style="cursor:pointer">
        <div class="conf-header">
          <span class="conf-rank">#${i + 1}</span>
          <div class="conf-score-ring" style="--conf:${stock.confidence}">
            <strong>${stock.confidence}</strong>
          </div>
        </div>
        <h3>${escapeHtml(stock.name)} <small>${escapeHtml(stock.code)}</small></h3>
        <div class="conf-metrics">
          <span class="${valueClass(stock._bestPct)}">${escapeHtml(text(stock._bestPct))}</span>
          <span>换手 ${escapeHtml(text(stock._bestTurnover))}</span>
          <span>${escapeHtml(text(stock._bestAmount))}</span>
        </div>
        <div class="conf-strats">${stratTags}</div>
        <div class="conf-bar"><b style="width:${stock.confidence}%"></b></div>
      </div>
    `;
  }).join("");

  if (tableRoot) {
    const tableRows = top.map((stock) => ({
      "信心分": stock.confidence,
      "代码": stock.code,
      "名称": stock.name,
      "策略数": stock._strategies.length,
      "平均排名": (stock._strategies.reduce((sum, s) => sum + s.rank, 0) / stock._strategies.length).toFixed(1),
      "策略明细": stock._strategies.map((s) => `${s.name}#${s.rank}`).join(", "),
      "涨跌幅": stock._bestPct,
      "主力净额": stock._bestFlow,
      "换手率": stock._bestTurnover,
      "成交额": stock._bestAmount,
    }));
    renderTable(tableRoot, tableRows, ["信心分", "代码", "名称", "策略数", "平均排名", "涨跌幅", "主力净额", "换手率", "成交额", "策略明细"], 30, { maxColumns: 10 });
  }
  bindStockClicks();
}

function flattenNews(data) {
  return (data.news || []).flatMap((group) => (group.items || []).map((item) => ({ ...item, group: group.name || "资讯" })));
}

function renderNewsPreview(data) {
  const root = el("news-preview");
  if (!root) return;
  const items = flattenNews(data).slice(0, 6);
  if (!items.length) {
    root.innerHTML = '<div class="empty">暂无资讯数据。周末运行会优先刷新政策、公告和外围变量。</div>';
    return;
  }
  root.innerHTML = items.map((item, idx) => `
    <div class="news-brief" data-news-flat-idx="${idx}" style="cursor:pointer">
      <span>${escapeHtml(item.group || "资讯")}</span>
      <strong>${escapeHtml(item.title || "-")}</strong>
      <small>${escapeHtml(item.date || "")} ${escapeHtml(item.source || "")}</small>
    </div>
  `).join("");
  root.querySelectorAll("[data-news-flat-idx]").forEach((node) => {
    node.addEventListener("click", () => {
      const idx = parseInt(node.dataset.newsFlatIdx, 10);
      const flat = flattenNews(dashboardData);
      if (flat[idx]) openNewsDetail(flat[idx]);
    });
  });
}

let activeNewsTab = null;

function renderNews(data) {
  const root = el("news-list");
  const tabsRoot = el("news-tabs");
  const risksRoot = el("news-risks");
  const groups = data.news || [];
  if (!root) return;
  renderNewsPreview(data);

  if (!groups.length) {
    root.innerHTML = '<div class="empty">暂无资讯数据。周末运行会优先刷新政策、公告和外围变量。</div>';
    if (tabsRoot) tabsRoot.innerHTML = "";
    if (risksRoot) risksRoot.innerHTML = '<div class="neutral">暂无风险提醒。</div>';
    return;
  }

  // Category tabs
  if (tabsRoot) {
    const tabNames = groups.map((g) => g.name || "资讯");
    if (!activeNewsTab || !tabNames.includes(activeNewsTab)) {
      activeNewsTab = tabNames[0];
    }
    tabsRoot.innerHTML = tabNames.map((name) =>
      `<button type="button" data-news-tab="${escapeHtml(name)}" class="${name === activeNewsTab ? "is-active" : ""}">${escapeHtml(name)}</button>`
    ).join("");
  }

  // Render active tab's news
  const activeGroup = groups.find((g) => (g.name || "资讯") === activeNewsTab) || groups[0];
  const items = (activeGroup.items || []).slice(0, 10);
  root.innerHTML = items.length
    ? items.map((item, idx) => {
        const riskLevel = detectNewsRisk(item);
        return `
          <article class="news-article ${riskLevel ? "risk-" + riskLevel : ""}" data-news-idx="${idx}">
            <div class="news-article-head">
              <strong>${escapeHtml(item.title || "-")}</strong>
              ${riskLevel ? `<span class="risk-tag risk-${riskLevel}">${riskLevel === "high" ? "高风险" : "关注"}</span>` : ""}
            </div>
            <div class="inline-meta">
              <span>${escapeHtml(item.date || "")}</span>
              <span>${escapeHtml(item.source || "")}</span>
            </div>
            <p class="neutral">${escapeHtml(truncate(item.content || "", 180))}</p>
          </article>`;
      }).join("")
    : '<div class="empty">该分类暂无资讯。</div>';
  bindNewsClicks();

  // Extract risk items from announcement group
  if (risksRoot) {
    const riskGroups = groups.filter((g) => {
      const name = (g.name || "").toLowerCase();
      return name.includes("公告") || name.includes("风险");
    });
    const riskItems = riskGroups.flatMap((g) => (g.items || [])).slice(0, 5);
    if (riskItems.length) {
      risksRoot.innerHTML = riskItems.map((item) => `
        <div class="risk-item">
          <strong>${escapeHtml(item.title || "-")}</strong>
          <small>${escapeHtml(item.date || "")} · ${escapeHtml(item.source || "")}</small>
        </div>
      `).join("");
    } else {
      risksRoot.innerHTML = '<div class="neutral">暂无公告风险提醒。</div>';
    }
  }

  // Bind tab clicks
  if (tabsRoot) {
    tabsRoot.querySelectorAll("[data-news-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeNewsTab = btn.dataset.newsTab;
        renderNews(data);
      });
    });
  }
}

function detectNewsRisk(item) {
  const text = `${item.title || ""} ${item.content || ""}`;
  const highKeywords = ["退市", "ST", "停牌", "减持", "违规", "立案", "暴跌", "跌停", "实控人减持", "大跌"];
  const midKeywords = ["澄清", "异动", "波动", "流出", "风险", "下跌", "亏损", "利空"];
  if (highKeywords.some((k) => text.includes(k))) return "high";
  if (midKeywords.some((k) => text.includes(k))) return "mid";
  return "";
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function setRefreshStatus(state = "idle") {
  const interval = formatRefreshInterval(DATA_AUTO_REFRESH_MS);
  if (state === "loading") {
    setText("refresh-mode", "同步中");
    return;
  }
  if (state === "error") {
    setText("refresh-mode", `${interval} / 自动重试`);
    return;
  }
  setText("refresh-mode", `${interval} / ${formatCnClock(Date.now())}`);
}

function handleLoadError(error) {
  console.error(error);
  setRefreshStatus("error");
  setText("generated-at", "加载失败");
  const market = el("market-table");
  if (market) market.innerHTML = '<div class="empty">无法读取 /stock/cn/data/latest.json</div>';
  initBreadthPulse(null);
}

function getCurrentView() {
  const hash = window.location.hash.replace("#", "");
  return VIEWS.has(hash) ? hash : "overview";
}

function setView(view) {
  const target = VIEWS.has(view) ? view : "overview";
  document.body.dataset.activeView = target;
  document.querySelectorAll(".page-view").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.view === target);
  });
  document.querySelectorAll(".overview-only").forEach((node) => {
    node.classList.toggle("is-hidden", target !== "overview");
    node.setAttribute("aria-hidden", target === "overview" ? "false" : "true");
  });
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    const active = link.dataset.viewLink === target;
    link.classList.toggle("is-active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  if (target === "overview") {
    scheduleBreadthDraw();
    if (currentInsight) drawFearGreedGauge(currentInsight);
  }
}

function initRouting() {
  window.addEventListener("hashchange", () => setView(getCurrentView()));
  setView(getCurrentView());
}

function renderAll(data) {
  flatRows = flattenRanking(data);
  liveState.screenerCodes = null; // invalidate cached screener codes
  updateMeta(data);
  renderMarket(data);
  renderStrategySelect(data);
  renderTopCandidates();
  renderConfidence(data);
  renderRanking();
  renderThemes(data);
  renderDetails(data);
  renderNews(data);
  initBreadthPulse(data);
  updateFreshness("pipeline", true);
}

async function loadData() {
  if (dataLoadInFlight) return dashboardData;
  dataLoadInFlight = true;
  setRefreshStatus("loading");
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const newData = await response.json();
    const newCutoff = newData?.meta?.dataCutoffAt || newData?.meta?.generatedAt || "";
    const prevCutoff = liveState.lastPipelineCutoff || "";
    dashboardData = newData;

    if (newCutoff !== prevCutoff) {
      liveState.lastPipelineCutoff = newCutoff;
      renderAll(dashboardData);
    } else {
      // Pipeline data unchanged — just refresh live data layer
      updateMetaLight(dashboardData);
    }
    setRefreshStatus("idle");
    return dashboardData;
  } catch (error) {
    handleLoadError(error);
    return dashboardData;
  } finally {
    dataLoadInFlight = false;
  }
}

function bindEvents() {
  const searchInput = el("search-input");
  if (searchInput) searchInput.addEventListener("input", (event) => renderRanking(event.target.value));
  (cachedBreadthPeriodBtns || document.querySelectorAll("[data-breadth-period]")).forEach((button) => {
    button.addEventListener("click", () => {
      activeBreadthPeriod = button.dataset.breadthPeriod || "1d";
      updateBreadthControls();
      renderBreadthStats();
      scheduleBreadthDraw();
    });
  });
  (cachedBreadthWindowBtns || document.querySelectorAll("[data-breadth-window]")).forEach((button) => {
    button.addEventListener("click", () => {
      const nextWindow = button.dataset.breadthWindow || "all";
      activeBreadthWindow = BREADTH_WINDOW_OPTIONS.has(nextWindow) ? nextWindow : "all";
      saveBreadthUiPrefs();
      updateBreadthControls();
      renderBreadthStats();
      scheduleBreadthDraw();
    });
  });
  (cachedMaToggleBtns || document.querySelectorAll("[data-ma-toggle]")).forEach((button) => {
    button.addEventListener("click", () => {
      const windowSize = Number(button.dataset.maToggle);
      if (!BREADTH_MA_WINDOWS.includes(windowSize)) return;
      if (activeMaWindows.has(windowSize)) {
        activeMaWindows.delete(windowSize);
      } else {
        activeMaWindows.add(windowSize);
      }
      saveBreadthUiPrefs();
      updateBreadthControls();
      scheduleBreadthDraw();
    });
  });
}

function initAutoRefresh() {
  setText("refresh-mode", `${formatRefreshInterval(DATA_AUTO_REFRESH_MS)} / 页面可见`);
  if (dataRefreshTimer) window.clearInterval(dataRefreshTimer);
  dataRefreshTimer = window.setInterval(() => {
    if (!document.hidden) loadData().catch(handleLoadError);
  }, DATA_AUTO_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAllPolling();
    } else {
      resumeAllPolling();
      loadData().catch(handleLoadError);
    }
  });
}

// ── Modal system ──
const modalState = { overlay: null, title: null, body: null };

function initModal() {
  modalState.overlay = el("modal-overlay");
  modalState.title = el("modal-title");
  modalState.body = el("modal-body");
  if (!modalState.overlay) return;
  el("modal-close")?.addEventListener("click", closeModal);
  modalState.overlay.addEventListener("click", (e) => {
    if (e.target === modalState.overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function openModal(title, html) {
  if (!modalState.overlay) return;
  if (modalState.title) modalState.title.textContent = title;
  if (modalState.body) modalState.body.innerHTML = html;
  modalState.overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  if (!modalState.overlay) return;
  modalState.overlay.classList.remove("is-open");
  document.body.style.overflow = "";
}

function openNewsDetail(item) {
  const riskLevel = detectNewsRisk(item);
  const html = `
    <h3>${escapeHtml(item.title || "-")}</h3>
    <div class="meta-row">
      <span>${escapeHtml(item.date || "")}</span>
      <span>${escapeHtml(item.source || "")}</span>
      <span>${escapeHtml(item.type || "")}</span>
      ${riskLevel ? `<span style="color:${riskLevel === "high" ? "var(--red)" : "var(--amber)"}">● ${riskLevel === "high" ? "高风险" : "关注"}</span>` : ""}
    </div>
    <div class="content-text">${escapeHtml(item.content || "暂无详细内容。")}</div>
  `;
  openModal(item.title || "资讯详情", html);
}

function openStockDetail(code) {
  const row = flatRows.find((r) => String(r["代码"] || r.code) === String(code));
  if (!row) {
    openModal("个股详情", `<p>未找到代码 ${escapeHtml(code)} 的详细数据。</p>`);
    return;
  }
  const name = row["名称"] || row.name || code;
  const strategy = row["策略"] || row.strategy || "";
  const fields = [
    ["代码", row["代码"] || row.code],
    ["名称", name],
    ["策略", strategy],
    ["涨跌幅", row["涨跌幅(%)"] || row["涨跌幅"] || row.changePct],
    ["最新价", row["最新价(元)"] || row["最新价"] || row.price],
    ["成交额", row["成交额(元)"] || row["成交额"] || row.amount],
    ["换手率", row["换手率(%)"] || row["换手率"] || row.turnover],
    ["主力净额", row["主力净额(元)"] || row["主力净额"] || row.flow],
    ["总市值", row["总市值(元)"] || row["总市值"]],
    ["Rank", row["Rank"]],
  ].filter(([, v]) => v != null && v !== "");
  const dataGrid = fields.map(([label, value]) =>
    `<div class="data-cell"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(String(value))}</span></div>`
  ).join("");
  const html = `
    <div class="data-grid">${dataGrid}</div>
  `;
  openModal(`${name} · 个股详情`, html);
}

function bindNewsClicks() {
  document.querySelectorAll(".news-article[data-news-idx]").forEach((article) => {
    article.addEventListener("click", () => {
      const idx = parseInt(article.dataset.newsIdx, 10);
      const group = (dashboardData?.news || []).find((g) => (g.name || "资讯") === activeNewsTab);
      const item = (group?.items || [])[idx];
      if (item) openNewsDetail(item);
    });
  });
}

function bindStockClicks() {
  document.querySelectorAll("[data-stock-code]").forEach((node) => {
    node.addEventListener("click", (e) => {
      e.stopPropagation();
      openStockDetail(node.dataset.stockCode);
    });
  });
}

loadBreadthUiPrefs();
cacheDomRefs();
initRouting();
bindEvents();
initModal();
startSessionTicker();
initAutoRefresh();
loadData().catch(handleLoadError);
