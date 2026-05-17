const DATA_URL = "/stock/cn/data/latest.json";

let dashboardData = null;
let flatRows = [];

const el = (id) => document.getElementById(id);

function text(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatTime(value) {
  const raw = text(value);
  return raw.replace("T", " ").replace(/\+08:00$/, "");
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
  el("generated-at").textContent = formatTime(meta.generatedAt);
  el("run-mode").textContent = `${text(meta.mode)}${meta.isMock ? " / seed" : ""}`;
  el("call-usage").textContent = `${text(meta.callsUsed, 0)} / ${text(meta.callBudget, 0)}`;
  el("strategy-count").textContent = text((data.screeners || []).length, 0);
  el("detail-count").textContent = text((data.stockDetails || []).length, 0);
  el("error-count").textContent = text((data.errors || []).length, 0);

  const marketRows = firstRows(data.market);
  const red = marketRows.some((row) => String(row["涨跌幅"] || row["涨跌幅(%)"] || "").includes("-"));
  el("market-state").textContent = red ? "防守/分化" : "可进攻";
  el("market-note").textContent = meta.isMock ? "当前为 seed 数据，请配置 MX_APIKEY 后自动刷新" : "由妙想定时生成";
}

function renderMarket(data) {
  const rows = firstRows(data.market);
  renderTable("market-table", rows, ["date", "最新价", "涨跌幅", "成交额", "成交量"], 60);
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
}

el("search-input").addEventListener("input", (event) => renderRanking(event.target.value));
document.querySelector("[data-refresh]").addEventListener("click", loadData);

loadData().catch((error) => {
  console.error(error);
  el("generated-at").textContent = "加载失败";
  el("market-table").innerHTML = '<div class="empty">无法读取 /stock/cn/data/latest.json</div>';
});
