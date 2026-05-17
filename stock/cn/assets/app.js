const DATA_URL = "/stock/cn/data/latest.json";
const BREADTH_ENDPOINT = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const BREADTH_FIELDS = "f12,f14,f2,f3,f4,f5,f6,f104,f105,f106";
const BREADTH_SECIDS = "1.000001,0.399001,0.899050";
const BREADTH_CODES = new Set(["000001", "399001", "899050"]);
const BREADTH_STORAGE_KEY = "stock-cn-breadth-series-v1";
const BREADTH_POLL_MS = 15000;
const BREADTH_MAX_POINTS = 1600;
const BREADTH_MAX_AGE_DAYS = 10;

let dashboardData = null;
let flatRows = [];
let breadthSeries = [];
let breadthTimer = null;
let breadthInitialized = false;
let breadthDrawQueued = false;

const el = (id) => document.getElementById(id);

function text(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatTime(value) {
  const raw = text(value);
  return raw.replace("T", " ").replace(/\+08:00$/, "");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatInteger(value) {
  const n = toNumber(value);
  if (n === null) return "-";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.round(n));
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

function numberLike(value) {
  return /(^|[^0-9])-?\d+(\.\d+)?%?/.test(String(value || ""));
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

function pickColumns(rows, preferred) {
  const available = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => available.add(key)));
  const picked = preferred.filter((key) => available.has(key));
  if (picked.length >= 4) return picked;
  const rest = [...available].filter((key) => !picked.includes(key));
  return [...picked, ...rest].slice(0, 9);
}

function renderTable(target, rows, preferred = [], limit = 80) {
  const container = typeof target === "string" ? el(target) : target;
  if (!container) return;
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty">暂无数据</div>';
    return;
  }

  const visibleRows = rows.slice(0, limit);
  const columns = pickColumns(visibleRows, preferred);
  const head = columns.map((col) => `<th>${col}</th>`).join("");
  const body = visibleRows.map((row) => {
    const cells = columns.map((col) => {
      const value = text(row[col]);
      const klass = numberLike(value) ? valueClass(value) : "neutral";
      return `<td class="${klass}">${escapeHtml(value)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  container.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstRows(tables) {
  if (!tables || !tables.length) return [];
  return tables.flatMap((table) => table.rows || []);
}

function updateMeta(data) {
  const meta = data.meta || {};
  const clock = meta.marketClock || {};
  el("generated-at").textContent = formatTime(meta.dataCutoffAt || meta.generatedAt);
  el("run-mode").textContent = `${text(meta.mode)}${meta.isMock ? " / seed" : ""}${clock.sessionText ? ` / ${clock.sessionText}` : ""}`;
  el("call-usage").textContent = `${text(meta.callsUsed, 0)} / ${text(meta.callBudget, 0)}`;
  el("strategy-count").textContent = text((data.screeners || []).length, 0);
  el("detail-count").textContent = text((data.stockDetails || []).length, 0);
  el("error-count").textContent = text((data.errors || []).length, 0);

  const breadth = data.breadth || {};
  if (breadth.up !== undefined && breadth.down !== undefined) {
    el("market-state").textContent = `${text(breadth.up, 0)} 涨 / ${text(breadth.down, 0)} 跌`;
    el("market-note").textContent = `${text(breadth.scope, "沪深京")} ${text(breadth.total, "-")} 只 / 截止 ${text(meta.tradingDate)}`;
    return;
  }

  const marketRows = firstRows(data.market);
  const red = marketRows.some((row) => String(row["涨跌幅"] || row["涨跌幅(%)"] || "").includes("-"));
  el("market-state").textContent = red ? "防守/分化" : "可进攻";
  el("market-note").textContent = meta.isMock ? "当前为 seed 数据，请配置 MX_APIKEY 后自动刷新" : "由妙想定时生成";
}

function renderMarket(data) {
  const rows = firstRows(data.market);
  renderTable("market-table", rows, ["date", "最新价", "涨跌幅", "成交额", "成交量"], 60);
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
        scope: item.scope || "上证指数 + 深证成指 + 北证50",
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
  const sampleTime = Number(sample.t) || parseCnTimestamp(sample.time || sample.generatedAt, NaN);
  if (!Number.isFinite(sampleTime)) return false;

  const normalized = {
    t: sampleTime,
    up,
    down,
    flat,
    total,
    source: sample.source || "Eastmoney public quote",
    scope: sample.scope || "上证指数 + 深证成指 + 北证50",
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
    scope: breadth.scope || "上证指数 + 深证成指 + 北证50",
  });
}

function renderBreadthStats(message = "") {
  const upEl = el("pulse-up");
  if (!upEl) return;

  const latest = breadthSeries[breadthSeries.length - 1];
  if (!latest) {
    upEl.textContent = "-";
    el("pulse-down").textContent = "-";
    el("pulse-samples").textContent = "0";
    el("pulse-updated").textContent = message || "等待 15 秒采样";
    return;
  }

  upEl.textContent = formatInteger(latest.up);
  el("pulse-down").textContent = formatInteger(latest.down);
  el("pulse-samples").textContent = formatInteger(breadthSeries.length);
  el("pulse-updated").textContent = message || `${latest.scope} / ${formatCnClock(latest.t)} / 15秒`;
}

function jsonpRequest(url, params, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const callback = `__stockCnBreadth${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("实时宽度接口超时"));
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
      reject(new Error("实时宽度接口失败"));
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

  if (!sourceRows.length || !sums.up && !sums.down && !sums.flat) {
    throw new Error("实时宽度接口无有效数据");
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
    const payload = await jsonpRequest(BREADTH_ENDPOINT, {
      fltt: "2",
      fields: BREADTH_FIELDS,
      secids: BREADTH_SECIDS,
    });
    addBreadthSample(parseBreadthPayload(payload));
    renderBreadthStats();
    scheduleBreadthDraw();
  } catch (error) {
    const latest = breadthSeries[breadthSeries.length - 1];
    const prefix = latest ? `${latest.scope} / 最近 ${formatCnClock(latest.t)}` : "实时宽度";
    renderBreadthStats(`${prefix} / ${error.message}`);
  }
}

function movingAverage(points, windowSize) {
  let sum = 0;
  return points.map((point, index) => {
    sum += point.up;
    if (index >= windowSize) sum -= points[index - windowSize].up;
    return index >= windowSize - 1 ? sum / windowSize : null;
  });
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
  if (!canvas) return;

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

  const pad = { left: 12, right: 58, top: 18, bottom: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const points = breadthSeries.slice(-BREADTH_MAX_POINTS);
  const latest = points[points.length - 1];
  const maxObserved = Math.max(4500, latest?.total || 0, ...points.map((point) => point.up));
  const yMin = 800;
  const yMax = Math.ceil(maxObserved / 100) * 100;
  const axisLabels = [1000, 2000, 3000, 4000, 4500];
  if (yMax > 4800 && !axisLabels.includes(yMax)) axisLabels.push(yMax);

  const scaleX = (index) => {
    if (points.length <= 1) return pad.left;
    return pad.left + (index / (points.length - 1)) * plotW;
  };
  const scaleY = (value) => {
    const clamped = Math.min(yMax, Math.max(yMin, value));
    return pad.top + ((yMax - clamped) / (yMax - yMin)) * plotH;
  };

  ctx.fillStyle = "#0b1519";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(138, 160, 162, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  axisLabels
    .filter((value) => value >= yMin && value <= yMax)
    .forEach((value) => {
      const y = scaleY(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right + 6, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(230, 240, 239, 0.66)";
      ctx.fillText(String(value), width - pad.right + 12, y);
    });

  if (latest?.total) {
    const mid = latest.total / 2;
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(125, 211, 252, 0.26)";
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
      ctx.strokeStyle = "rgba(255, 107, 107, 0.32)";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(230, 240, 239, 0.82)";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`上涨 ${formatInteger(latest.up)}`, x, y - 10);
    }
    ctx.fillStyle = "rgba(138, 160, 162, 0.82)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("等待 15 秒采样", width / 2, height / 2);
  } else {
    drawPolyline(ctx, points, movingAverage(points, 250), scaleX, scaleY, "#c084fc", 1.2, 0.78);
    drawPolyline(ctx, points, movingAverage(points, 120), scaleX, scaleY, "#4ade80", 1.3, 0.78);
    drawPolyline(ctx, points, movingAverage(points, 60), scaleX, scaleY, "#f8fafc", 1.1, 0.72);
    drawPolyline(ctx, points, movingAverage(points, 20), scaleX, scaleY, "#facc15", 1.2, 0.75);
    drawPolyline(ctx, points, (point) => point.up, scaleX, scaleY, "#ff6b6b", 2.2);
  }

  ctx.fillStyle = "rgba(138, 160, 162, 0.72)";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("15s", pad.left, pad.top - 4);

  if (points.length) {
    const includeDate = cnDateKey(points[0].t) !== cnDateKey(points[points.length - 1].t);
    ctx.textBaseline = "bottom";
    ctx.fillText(formatCnTick(points[0].t, includeDate), pad.left, height - 8);
    ctx.textAlign = "right";
    ctx.fillText(formatCnTick(points[points.length - 1].t, includeDate), width - pad.right, height - 8);
  }
}

function scheduleBreadthDraw() {
  if (breadthDrawQueued) return;
  breadthDrawQueued = true;
  requestAnimationFrame(() => {
    breadthDrawQueued = false;
    drawBreadthChart();
  });
}

function initBreadthPulse(data) {
  if (!el("breadth-chart")) return;

  if (!breadthInitialized) {
    breadthSeries = loadBreadthSeries();
    window.addEventListener("resize", scheduleBreadthDraw);
    breadthInitialized = true;
  }

  mergeBreadthHistoryFromDashboard(data);
  seedBreadthFromDashboard(data);
  renderBreadthStats();
  scheduleBreadthDraw();

  if (breadthTimer) window.clearInterval(breadthTimer);
  pollLiveBreadth();
  breadthTimer = window.setInterval(pollLiveBreadth, BREADTH_POLL_MS);
}

function renderStrategySelect(data) {
  const select = el("strategy-select");
  const groups = data.screeners || [];
  select.innerHTML = groups.map((group, index) => (
    `<option value="${index}">${escapeHtml(group.name || `策略${index + 1}`)}</option>`
  )).join("");
  select.addEventListener("change", () => renderTopCandidates());
}

function renderTopCandidates() {
  const groups = dashboardData?.screeners || [];
  const index = Number(el("strategy-select").value || 0);
  const group = groups[index] || groups[0] || {};
  renderTable(
    "top-candidates",
    group.rows || [],
    ["代码", "名称", "最新价(元)", "涨跌幅(%)", "主力净额(元)", "成交额(元)", "换手率(%)", "市盈率(动)(倍)"],
    20
  );
}

function flattenRanking(data) {
  const rows = [];
  (data.screeners || []).forEach((group) => {
    (group.rows || []).forEach((row, idx) => {
      rows.push({
        "策略": group.name || "",
        "Rank": idx + 1,
        ...row,
      });
    });
  });
  return rows;
}

function renderRanking(filter = "") {
  const q = filter.trim().toLowerCase();
  const rows = q
    ? flatRows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
    : flatRows;
  renderTable(
    "ranking-table",
    rows,
    ["策略", "Rank", "代码", "名称", "最新价(元)", "涨跌幅(%)", "主力净额(元)", "成交额(元)", "换手率(%)", "总市值(元)"],
    240
  );
}

function renderThemes(data) {
  const root = el("theme-list");
  const themes = data.themes || [];
  if (!themes.length) {
    root.innerHTML = '<div class="empty">暂无题材数据</div>';
    return;
  }
  root.innerHTML = themes.slice(0, 12).map((theme) => {
    const rows = (theme.rows || []).slice(0, 8);
    const mini = document.createElement("div");
    renderTable(mini, rows, ["date", "涨跌幅", "成交额", "主力净额"], 8);
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
  if (!details.length) {
    root.innerHTML = '<div class="empty">暂无逐股细查；seed 数据或预算未覆盖。</div>';
    return;
  }
  root.innerHTML = details.slice(0, 24).map((item) => {
    const table = (item.tables || [])[0];
    const rows = table?.rows || [];
    const mini = document.createElement("div");
    renderTable(mini, rows, ["date", "最新价", "涨跌幅", "成交额", "换手率", "主力净流入"], 6);
    return `
      <div class="detail-item">
        <h3>${escapeHtml(item.name || item.code)} <span class="tag">${escapeHtml(item.code || "")}</span></h3>
        <div class="inline-meta"><span>来源：${escapeHtml(item.source || "-")}</span></div>
        <div class="mini-table">${mini.innerHTML}</div>
      </div>
    `;
  }).join("");
}

function renderNews(data) {
  const root = el("news-list");
  const groups = data.news || [];
  if (!groups.length) {
    root.innerHTML = '<div class="empty">暂无资讯数据</div>';
    return;
  }
  root.innerHTML = groups.map((group) => `
    <div class="news-item">
      <h3>${escapeHtml(group.name || "资讯")}</h3>
      ${(group.items || []).slice(0, 5).map((item) => `
        <p><strong>${escapeHtml(item.title || "-")}</strong></p>
        <div class="inline-meta">
          <span>${escapeHtml(item.date || "")}</span>
          <span>${escapeHtml(item.source || "")}</span>
          <span>${escapeHtml(item.type || "")}</span>
        </div>
        <p class="neutral">${escapeHtml(item.content || "")}</p>
      `).join("")}
    </div>
  `).join("");
}

function renderQuota(data) {
  const root = el("quota-plan");
  const plan = data.quotaPlan || {};
  const runs = plan.runs || [];
  root.innerHTML = `
    <div class="quota-item">
      <h3>每日上限 ${escapeHtml(plan.dailyLimit || 500)} 次，预留 ${escapeHtml(plan.reserve || 20)} 次</h3>
      <div class="inline-meta">
        <span>${escapeHtml(plan.freePublicData || "")}</span>
        <span>仓库策略：${escapeHtml(plan.storagePolicy?.repo || "-")}</span>
        <span>部署策略：${escapeHtml(plan.storagePolicy?.pagesArtifact || "-")}</span>
      </div>
    </div>
    ${runs.map((run) => `
      <div class="quota-item">
        <h3>${escapeHtml(run.name)} / ${escapeHtml(run.timeCN)} / ${escapeHtml(run.budget)} 次</h3>
        <p class="neutral">${escapeHtml(run.focus || "")}</p>
      </div>
    `).join("")}
  `;
}

function renderErrors(data) {
  const errors = data.errors || [];
  el("error-list").innerHTML = errors.length
    ? errors.slice(0, 12).map((err) => `<div>${escapeHtml(err.label || "")}: ${escapeHtml(err.error || "")}</div>`).join("")
    : '<div class="neutral">暂无接口错误。</div>';
}

async function loadData() {
  const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  dashboardData = await response.json();
  flatRows = flattenRanking(dashboardData);
  updateMeta(dashboardData);
  renderMarket(dashboardData);
  renderStrategySelect(dashboardData);
  renderTopCandidates();
  renderRanking();
  renderThemes(dashboardData);
  renderDetails(dashboardData);
  renderNews(dashboardData);
  renderQuota(dashboardData);
  renderErrors(dashboardData);
  initBreadthPulse(dashboardData);
}

el("search-input").addEventListener("input", (event) => renderRanking(event.target.value));
document.querySelector("[data-refresh]").addEventListener("click", loadData);

loadData().catch((error) => {
  console.error(error);
  el("generated-at").textContent = "加载失败";
  el("market-table").innerHTML = '<div class="empty">无法读取 /stock/cn/data/latest.json</div>';
  initBreadthPulse(null);
});
