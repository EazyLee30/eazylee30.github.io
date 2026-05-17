#!/usr/bin/env python3
"""Generate A-share quant dashboard data with Eastmoney MX APIs.

The script is intentionally self-contained for GitHub Actions:
- no third-party Python packages
- no dependency on local Codex skill paths
- writes compact JSON for a static GitHub Pages dashboard
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


API_BASE = "https://mkapi2.dfcfs.com/finskillshub/api/claw"
TIMEZONE = dt.timezone(dt.timedelta(hours=8), name="Asia/Shanghai")


CORE_THEME_GROUPS = [
    "半导体 CPO概念 光通信模块 消费电子 机器人概念 成交额 涨跌幅 主力净额",
    "电力行业 绿色电力 光伏设备 电网设备 储能 成交额 涨跌幅 主力净额",
    "银行 白酒 养殖业 有色金属 小金属 成交额 涨跌幅 主力净额",
    "人工智能 AI算力 数据中心 算力租赁 液冷服务器 PCB 成交额 涨跌幅 主力净额",
]

SCREENERS = [
    ("资金进攻", "A股 非ST 成交额大于20亿元 主力资金净流入大于2亿元 今日涨幅在1%到9%之间 按主力净流入降序"),
    ("强趋势", "A股 非ST 近5日涨幅大于5% 成交额大于10亿元 主力资金净流入大于0 按成交额降序"),
    ("低吸修复", "A股 非ST 今日涨跌幅在-4%到1%之间 成交额大于10亿元 主力资金净流入大于0 近20日涨幅大于0"),
    ("放量突破", "A股 非ST 今日涨幅大于3% 成交额大于8亿元 换手率大于5% 主力资金净流入大于0"),
    ("流动性核心", "A股 非ST 成交额大于50亿元 主力资金净流入大于0 按成交额降序"),
    ("小微盘活跃", "A股 非ST 总市值小于100亿元 成交额大于3亿元 换手率大于8% 主力资金净流入大于0"),
    ("半导体", "半导体 A股 非ST 成交额大于8亿元 主力资金净流入大于0"),
    ("CPO光模块", "CPO概念 光通信模块 A股 非ST 成交额大于8亿元 主力资金净流入大于0"),
    ("消费电子", "消费电子 苹果概念 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("机器人", "机器人概念 人形机器人 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("AI算力", "AI算力 算力租赁 液冷服务器 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("电力绿电", "电力行业 绿色电力 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("电网设备", "电网设备 特高压 智能电网 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("光伏修复", "光伏设备 光伏概念 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("红利防守", "银行 电力 煤炭 A股 非ST 市盈率小于15 股息率大于3% 成交额大于3亿元"),
    ("央国企", "央国企改革 A股 非ST 成交额大于5亿元 主力资金净流入大于0"),
    ("北向活跃", "沪股通 深股通 A股 非ST 成交额大于10亿元 今日涨幅大于0 主力资金净流入大于0"),
    ("业绩增长", "A股 非ST 净利润同比增长大于30% 营业收入同比增长大于10% 成交额大于3亿元"),
    ("低估值", "A股 非ST 市盈率大于0 市盈率小于20 市净率小于2 成交额大于3亿元 今日涨幅大于0"),
    ("高换手资金", "A股 非ST 换手率大于10% 成交额大于5亿元 主力资金净流入大于0"),
]

NEWS_QUERIES = [
    ("盘前策略", "今日A股盘前策略 热点题材 资金流向 政策消息 风险提示"),
    ("收盘复盘", "今日A股收盘复盘 涨跌原因 热门板块 主力资金流向"),
    ("外围影响", "昨夜美股 全球市场 英伟达 半导体 中概股 对A股影响"),
    ("公告风险", "今日A股异动公告 风险提示 减持 立案调查 业绩亏损"),
    ("政策催化", "今日A股政策催化 人工智能 半导体 机器人 电力 光伏"),
]


def now_cn() -> dt.datetime:
    return dt.datetime.now(TIMEZONE)


def format_cn_time(value: dt.datetime | None = None) -> str:
    return (value or now_cn()).strftime("%Y-%m-%d %H:%M:%S")


def safe_slug(text: str, max_len: int = 60) -> str:
    text = re.sub(r"[^\w\u4e00-\u9fff.-]+", "_", text, flags=re.UNICODE)
    return text.strip("._")[:max_len] or "query"


def compact(value: Any, max_len: int = 220) -> Any:
    if value is None:
        return ""
    if isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, str):
        return value if len(value) <= max_len else value[: max_len - 1] + "..."
    if isinstance(value, (list, dict)):
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return text if len(text) <= max_len else text[: max_len - 1] + "..."
    return str(value)


class MXClient:
    def __init__(self, api_key: str, call_budget: int = 480, timeout: int = 30, sleep: float = 0.15):
        self.api_key = api_key
        self.call_budget = max(1, call_budget)
        self.timeout = timeout
        self.sleep = sleep
        self.calls_used = 0
        self.errors: list[dict[str, str]] = []

    @property
    def remaining(self) -> int:
        return self.call_budget - self.calls_used

    def post(self, path: str, payload: dict[str, Any], label: str) -> dict[str, Any] | None:
        if self.calls_used >= self.call_budget:
            return None

        self.calls_used += 1
        if self.calls_used == 1 or self.calls_used % 10 == 0 or self.calls_used == self.call_budget:
            print(f"[mx] {self.calls_used}/{self.call_budget} {label}", flush=True)
        url = f"{API_BASE}/{path}"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "apikey": self.api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
            time.sleep(self.sleep)
            return json.loads(raw)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            self.errors.append({"label": label, "error": str(exc)[:240]})
            time.sleep(self.sleep)
            return None

    def data(self, query: str, label: str) -> dict[str, Any] | None:
        return self.post("query", {"toolQuery": query}, label)

    def screen(self, query: str, label: str) -> dict[str, Any] | None:
        return self.post("stock-screen", {"keyword": query}, label)

    def news(self, query: str, label: str) -> dict[str, Any] | None:
        return self.post("news-search", {"query": query}, label)


def table_to_rows(block: dict[str, Any], limit: int = 120) -> list[dict[str, Any]]:
    table = block.get("table") or {}
    name_map = block.get("nameMap") or {}
    if not isinstance(table, dict):
        return []
    if not isinstance(name_map, dict):
        name_map = {}

    heads = table.get("headName") or []
    if not isinstance(heads, list):
        heads = []
    keys = [key for key in table.keys() if key != "headName"]
    rows: list[dict[str, Any]] = []
    for idx, head in enumerate(heads[:limit]):
        row: dict[str, Any] = {"date": compact(head)}
        for key in keys:
            label = name_map.get(str(key)) or name_map.get(key) or str(key)
            values = table.get(key, [])
            if isinstance(values, list):
                value = values[idx] if idx < len(values) else ""
            else:
                value = values
            row[str(label)] = compact(value)
        rows.append(row)
    return rows


def parse_data_tables(result: dict[str, Any] | None, limit: int = 120) -> list[dict[str, Any]]:
    if not result or result.get("status") != 0:
        return []
    dto_list = (
        result.get("data", {})
        .get("data", {})
        .get("searchDataResultDTO", {})
        .get("dataTableDTOList", [])
    )
    tables: list[dict[str, Any]] = []
    for dto in dto_list if isinstance(dto_list, list) else []:
        if not isinstance(dto, dict):
            continue
        rows = table_to_rows(dto, limit=limit)
        if rows:
            tables.append(
                {
                    "title": compact(dto.get("title") or dto.get("entityName") or "数据表"),
                    "code": compact(dto.get("code") or ""),
                    "rows": rows,
                }
            )
    return tables


def build_column_map(columns: list[dict[str, Any]]) -> tuple[dict[str, str], list[str]]:
    names: dict[str, str] = {}
    order: list[str] = []
    for col in columns:
        if not isinstance(col, dict):
            continue
        key = col.get("field") or col.get("name") or col.get("key")
        title = col.get("displayName") or col.get("title") or col.get("label") or key
        date_msg = col.get("dateMsg")
        if key:
            order.append(str(key))
            names[str(key)] = f"{title} {date_msg}".strip() if date_msg else str(title)
    return names, order


def parse_screen_rows(result: dict[str, Any] | None, limit: int = 80) -> list[dict[str, Any]]:
    if not result or result.get("status") != 0:
        return []
    inner = result.get("data", {}).get("data", {})
    data_list = inner.get("allResults", {}).get("result", {}).get("dataList", [])
    columns = inner.get("allResults", {}).get("result", {}).get("columns", [])
    if not isinstance(data_list, list) or not data_list:
        return []
    column_map, column_order = build_column_map(columns if isinstance(columns, list) else [])
    rows: list[dict[str, Any]] = []
    for raw in data_list[:limit]:
        if not isinstance(raw, dict):
            continue
        keys = column_order + [key for key in raw.keys() if key not in column_order]
        row: dict[str, Any] = {}
        for key in keys:
            if key in raw:
                row[column_map.get(str(key), str(key))] = compact(raw[key])
        rows.append(row)
    return rows


def parse_news_items(result: dict[str, Any] | None, limit: int = 12) -> list[dict[str, Any]]:
    if not result or result.get("status") != 0:
        return []
    items = (
        result.get("data", {})
        .get("data", {})
        .get("llmSearchResponse", {})
        .get("data", [])
    )
    parsed: list[dict[str, Any]] = []
    for item in items[:limit] if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        parsed.append(
            {
                "title": compact(item.get("title"), 120),
                "date": compact(str(item.get("date", "")).split()[0]),
                "type": compact(item.get("informationType") or item.get("type") or ""),
                "source": compact(item.get("insName") or item.get("source") or ""),
                "entity": compact(item.get("entityFullName") or ""),
                "content": compact(item.get("content"), 420),
            }
        )
    return parsed


def find_code(row: dict[str, Any]) -> str:
    for key, value in row.items():
        if "代码" in key or key in {"SECURITY_CODE", "code"}:
            text = str(value).strip()
            if re.match(r"^\d{4,6}$", text):
                return text
    return ""


def find_name(row: dict[str, Any]) -> str:
    for key, value in row.items():
        if "名称" in key or "简称" in key or key in {"SECURITY_SHORT_NAME", "name"}:
            text = str(value).strip()
            if text and text.lower() not in {"false", "true"}:
                return text
    return ""


def collect_candidates(screeners: list[dict[str, Any]], limit: int) -> list[dict[str, str]]:
    seen: set[str] = set()
    candidates: list[dict[str, str]] = []
    for group in screeners:
        for row in group.get("rows", []):
            code = find_code(row)
            name = find_name(row)
            if not code or code in seen:
                continue
            seen.add(code)
            candidates.append({"code": code, "name": name or code, "source": group.get("name", "")})
            if len(candidates) >= limit:
                return candidates
    return candidates


def make_mock_payload(output: Path, mode: str) -> dict[str, Any]:
    generated_at = format_cn_time()
    return {
        "meta": {
            "generatedAt": generated_at,
            "tradingDate": generated_at[:10],
            "mode": mode,
            "isMock": True,
            "callsUsed": 0,
            "callBudget": 0,
            "note": "Seed data only. GitHub Actions will replace this when MX_APIKEY is configured.",
        },
        "market": [
            {"title": "A股主要指数", "rows": [{"date": "上证指数", "最新价": "4135.39", "涨跌幅": "-1.02%", "成交额": "1.519万亿元"}]},
        ],
        "themes": [
            {"title": "题材热度示例", "rows": [{"date": "消费电子", "涨跌幅": "-0.23%", "成交额": "示例"}]},
        ],
        "screeners": [
            {
                "name": "资金进攻",
                "query": "A股 非ST 成交额大于20亿元 主力资金净流入大于2亿元",
                "rows": [
                    {"代码": "300433", "名称": "蓝思科技", "涨跌幅": "5.88%", "主力净额": "3.323亿元", "成交额": "89.43亿元"},
                    {"代码": "002564", "名称": "天沃科技", "涨跌幅": "-2.33%", "主力净额": "-589.9万元", "成交额": "1.147亿元"},
                ],
            }
        ],
        "news": [],
        "stockDetails": [],
        "quotaPlan": quota_plan(),
        "errors": [],
    }


def quota_plan() -> dict[str, Any]:
    return {
        "dailyLimit": 500,
        "reserve": 20,
        "runs": [
            {"name": "premarket", "timeCN": "08:20", "budget": 120, "focus": "外围资讯、盘前题材、候选池预热"},
            {"name": "midday", "timeCN": "12:45", "budget": 120, "focus": "午间行情、题材温度、风险复核"},
            {"name": "postclose", "timeCN": "15:45", "budget": 240, "focus": "收盘截面、题材排名、个股细查、次日候选"},
        ],
        "storagePolicy": {
            "repo": "只提交代码和轻量 seed 数据，不日更提交大 JSON",
            "pagesArtifact": "定时生成 latest.json 并直接部署到 Pages artifact",
            "history": "默认保留 20 个交易日小 JSON，可在 workflow 中关闭或缩短",
        },
    }


def generate(
    api_key: str,
    output: Path,
    mode: str,
    call_budget: int,
    detail_limit: int,
    history_days: int,
    request_timeout: int,
) -> dict[str, Any]:
    client = MXClient(api_key=api_key, call_budget=call_budget, timeout=request_timeout)
    generated_at = now_cn()
    trading_date = generated_at.date().isoformat()

    market_query = "A股主要指数 上证指数 深证成指 创业板指 科创50 北证50 沪深300 中证500 中证1000 最新价 涨跌幅 成交额 成交量"
    market = parse_data_tables(client.data(market_query, "market-index"), limit=40)

    themes: list[dict[str, Any]] = []
    for query in CORE_THEME_GROUPS:
        if client.remaining <= 0:
            break
        tables = parse_data_tables(client.data(query, f"theme:{query[:16]}"), limit=80)
        themes.extend(tables)

    screeners: list[dict[str, Any]] = []
    for name, query in SCREENERS:
        if client.remaining <= 0:
            break
        rows = parse_screen_rows(client.screen(query, f"screener:{name}"), limit=80)
        screeners.append({"name": name, "query": query, "rows": rows})

    news_groups: list[dict[str, Any]] = []
    for name, query in NEWS_QUERIES:
        if client.remaining <= 0:
            break
        items = parse_news_items(client.news(query, f"news:{name}"), limit=10)
        news_groups.append({"name": name, "query": query, "items": items})

    print("[mx] fetching market and theme data", flush=True)

    if mode == "premarket":
        max_details = min(detail_limit, 150)
    elif mode == "exhaustive":
        max_details = min(detail_limit, 440)
    elif mode == "midday":
        max_details = min(detail_limit, 150)
    else:
        max_details = min(detail_limit, 270)

    candidates = collect_candidates(screeners, max_details)
    print(f"[mx] collected {len(candidates)} detail candidates", flush=True)
    stock_details: list[dict[str, Any]] = []
    for candidate in candidates:
        if client.remaining <= 5:
            break
        label = f"detail:{candidate['code']}"
        query = (
            f"{candidate['name']} {candidate['code']} 最新价 涨跌幅 成交额 换手率 "
            "主力资金净流入 最高价 最低价 市盈率 市净率 近5日涨跌幅 近20日涨跌幅"
        )
        detail_tables = parse_data_tables(client.data(query, label), limit=12)
        if detail_tables:
            stock_details.append({**candidate, "tables": detail_tables[:3]})

    payload = {
        "meta": {
            "generatedAt": format_cn_time(generated_at),
            "tradingDate": trading_date,
            "mode": mode,
            "isMock": False,
            "callsUsed": client.calls_used,
            "callBudget": call_budget,
            "detailCandidates": len(candidates),
            "source": "东方财富妙想 MX APIs",
        },
        "market": market,
        "themes": themes[:12],
        "screeners": screeners,
        "news": news_groups,
        "stockDetails": stock_details,
        "quotaPlan": quota_plan(),
        "errors": client.errors[:40],
    }

    write_payload(output, payload, history_days)
    return payload


def write_payload(output: Path, payload: dict[str, Any], history_days: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    history_dir = output.parent / "history"
    if history_days > 0:
        history_dir.mkdir(parents=True, exist_ok=True)
        date = payload.get("meta", {}).get("tradingDate") or now_cn().date().isoformat()
        mode = payload.get("meta", {}).get("mode", "run")
        history_path = history_dir / f"{date}-{safe_slug(mode, 20)}.json"
        history_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        files = sorted(history_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for stale in files[history_days:]:
            stale.unlink(missing_ok=True)

    summary_path = output.parent / "summary.csv"
    rows: list[dict[str, Any]] = []
    for group in payload.get("screeners", []):
        for idx, row in enumerate(group.get("rows", [])[:30], start=1):
            rows.append(
                {
                    "strategy": group.get("name", ""),
                    "rank": idx,
                    "code": find_code(row),
                    "name": find_name(row),
                    "raw": json.dumps(row, ensure_ascii=False, separators=(",", ":"))[:800],
                }
            )
    with summary_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["strategy", "rank", "code", "name", "raw"])
        writer.writeheader()
        writer.writerows(rows)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate stock/cn dashboard data with MX APIs.")
    parser.add_argument("--output", default="stock/cn/data/latest.json", help="Output JSON path")
    parser.add_argument("--mode", choices=["premarket", "midday", "postclose", "exhaustive", "mock"], default="postclose")
    parser.add_argument("--call-budget", type=int, default=300)
    parser.add_argument("--detail-limit", type=int, default=180)
    parser.add_argument("--history-days", type=int, default=20)
    parser.add_argument("--request-timeout", type=int, default=12)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    output = Path(args.output)
    api_key = os.getenv("MX_APIKEY", "").strip()

    if args.mode == "mock" or not api_key:
        payload = make_mock_payload(output, args.mode)
        write_payload(output, payload, args.history_days)
        print(f"wrote mock dashboard data to {output}")
        return 0

    payload = generate(
        api_key=api_key,
        output=output,
        mode=args.mode,
        call_budget=args.call_budget,
        detail_limit=args.detail_limit,
        history_days=args.history_days,
        request_timeout=args.request_timeout,
    )
    meta = payload["meta"]
    print(
        "generated stock/cn data: "
        f"mode={meta['mode']} calls={meta['callsUsed']}/{meta['callBudget']} "
        f"errors={len(payload.get('errors', []))} output={output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
