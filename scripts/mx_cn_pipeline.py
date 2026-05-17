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
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
from pathlib import Path
from typing import Any


API_BASE = "https://mkapi2.dfcfs.com/finskillshub/api/claw"
PUBLIC_QUOTE_BASE = "https://push2.eastmoney.com/api/qt"
PUBLIC_HISTORY_BASE = "https://push2his.eastmoney.com/api/qt"
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

WEEKEND_NEWS_QUERIES = [
    ("周末政策", "周末A股政策消息 证监会 交易所 财政 产业政策 影响板块"),
    ("公告风险", "周末A股公告 风险提示 减持 立案调查 业绩预告亏损"),
    ("外围变量", "周末全球市场 美股 英伟达 半导体 中概股 汇率 大宗商品 对A股影响"),
    ("题材发酵", "周末A股题材发酵 人工智能 半导体 机器人 电力 光伏 消费电子"),
    ("下周日历", "下周A股财经日历 新股解禁 财报 会议 政策事件 风险提示"),
]

PUBLIC_INDEX_SECIDS = "1.000001,0.399001,0.399006,1.000688,0.899050"
PUBLIC_A_SHARE_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
DEFAULT_PREVIOUS_LATEST_URL = "https://eazylee.xyz/stock/cn/data/latest.json"
BREADTH_PULSE_MAX_POINTS = 1600
HISTORICAL_BREADTH_DAYS = 280
HISTORICAL_BREADTH_MIN_ROWS = 250
HISTORICAL_BREADTH_WORKERS = 16
MARKET_OPEN_AM = dt.time(9, 30)
MARKET_CLOSE_AM = dt.time(11, 30)
MARKET_OPEN_PM = dt.time(13, 0)
MARKET_CLOSE_PM = dt.time(15, 0)


def now_cn() -> dt.datetime:
    return dt.datetime.now(TIMEZONE)


def format_cn_time(value: dt.datetime | None = None) -> str:
    return (value or now_cn()).strftime("%Y-%m-%d %H:%M:%S")


def parse_cn_time(value: Any) -> dt.datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        # Browser samples use epoch milliseconds.
        timestamp = float(value) / 1000 if float(value) > 1e12 else float(value)
        return dt.datetime.fromtimestamp(timestamp, TIMEZONE)
    raw = str(value).strip().replace("T", " ").replace("+08:00", "")
    if raw.endswith("Z"):
        try:
            return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(TIMEZONE)
        except ValueError:
            return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            parsed = dt.datetime.strptime(raw, fmt)
            return parsed.replace(tzinfo=TIMEZONE)
        except ValueError:
            continue
    return None


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


def int_value(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        cleaned = re.sub(r"[^0-9.+-]+", "", str(value).replace(",", ""))
        if not cleaned:
            return None
        return int(round(float(cleaned)))
    except (TypeError, ValueError):
        return None


def public_get_json(path: str, params: dict[str, str | int], timeout: int = 12) -> dict[str, Any] | None:
    query = urllib.parse.urlencode(params, safe=",:.+")
    url = f"{PUBLIC_QUOTE_BASE}/{path}?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://quote.eastmoney.com/",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    try:
        raw = subprocess.check_output(
            ["curl", "-sL", "--retry", "2", "--max-time", str(timeout), url],
            text=True,
            timeout=timeout + 4,
        )
        return json.loads(raw)
    except Exception:
        pass
    return None


def public_history_get_json(path: str, params: dict[str, str | int], timeout: int = 12) -> dict[str, Any] | None:
    query = urllib.parse.urlencode(params, safe=",:.+")
    url = f"{PUBLIC_HISTORY_BASE}/{path}?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://quote.eastmoney.com/",
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
    try:
        raw = subprocess.check_output(
            ["curl", "-sL", "--retry", "2", "--max-time", str(timeout), url],
            text=True,
            timeout=timeout + 4,
            stderr=subprocess.DEVNULL,
        )
        return json.loads(raw)
    except Exception:
        pass
    return None


def fallback_previous_weekday(value: dt.date) -> dt.date:
    current = value
    while current.weekday() >= 5:
        current -= dt.timedelta(days=1)
    return current


def fallback_trade_dates(end_date: dt.date, count: int = 20) -> list[dt.date]:
    dates: list[dt.date] = []
    current = end_date
    while len(dates) < count:
        if current.weekday() < 5:
            dates.append(current)
        current -= dt.timedelta(days=1)
    return list(reversed(dates))


def fetch_recent_trade_dates(end_date: dt.date, limit: int = 20) -> list[dt.date]:
    result = public_history_get_json(
        "stock/kline/get",
        {
            "secid": "1.000001",
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": 101,
            "fqt": 1,
            "end": end_date.strftime("%Y%m%d"),
            "lmt": limit,
        },
    )
    rows = ((result or {}).get("data") or {}).get("klines") or []
    dates: list[dt.date] = []
    for row in rows:
        raw_date = str(row).split(",", 1)[0]
        try:
            dates.append(dt.date.fromisoformat(raw_date))
        except ValueError:
            continue
    return sorted(set(dates))


def combine_cn(date_value: dt.date, time_value: dt.time) -> dt.datetime:
    return dt.datetime.combine(date_value, time_value, tzinfo=TIMEZONE)


def previous_trade_date(value: dt.date, trade_dates: list[dt.date]) -> dt.date:
    for trade_date in reversed(trade_dates):
        if trade_date < value:
            return trade_date
    return fallback_previous_weekday(value - dt.timedelta(days=1))


def trade_date_on_or_before(value: dt.date, trade_dates: list[dt.date]) -> dt.date:
    for trade_date in reversed(trade_dates):
        if trade_date <= value:
            return trade_date
    return fallback_previous_weekday(value)


def resolve_market_clock(generated_at: dt.datetime) -> dict[str, Any]:
    today = generated_at.date()
    trade_dates = fetch_recent_trade_dates(today, 24)
    calendar_source = "Eastmoney daily kline"
    if not trade_dates:
        trade_dates = fallback_trade_dates(today, 24)
        calendar_source = "weekday fallback"

    latest_trade_date = trade_date_on_or_before(today, trade_dates)
    current_time = generated_at.time()
    is_open = False
    session = "closed"
    session_text = "已收盘"

    if latest_trade_date == today:
        if MARKET_OPEN_AM <= current_time <= MARKET_CLOSE_AM or MARKET_OPEN_PM <= current_time <= MARKET_CLOSE_PM:
            is_open = True
            session = "open"
            session_text = "交易中"
            cutoff_at = generated_at.replace(microsecond=0)
        elif MARKET_CLOSE_AM < current_time < MARKET_OPEN_PM:
            session = "lunch_break"
            session_text = "午间休市"
            cutoff_at = combine_cn(today, MARKET_CLOSE_AM)
        elif current_time > MARKET_CLOSE_PM:
            session = "postclose"
            session_text = "已收盘"
            cutoff_at = combine_cn(today, MARKET_CLOSE_PM)
        else:
            last_trade_date = previous_trade_date(today, trade_dates)
            latest_trade_date = last_trade_date
            session = "premarket"
            session_text = "盘前未开盘"
            cutoff_at = combine_cn(last_trade_date, MARKET_CLOSE_PM)
    else:
        if today.weekday() >= 5:
            session = "non_trading_day"
            session_text = "非交易日"
        elif current_time < MARKET_OPEN_AM:
            session = "premarket"
            session_text = "盘前未开盘"
        else:
            session = "market_holiday_or_no_quote"
            session_text = "未开盘"
        cutoff_at = combine_cn(latest_trade_date, MARKET_CLOSE_PM)

    return {
        "isOpen": is_open,
        "session": session,
        "sessionText": session_text,
        "lastTradingDate": latest_trade_date.isoformat(),
        "dataCutoffAt": format_cn_time(cutoff_at),
        "calendarSource": calendar_source,
        "recentTradingDates": [value.isoformat() for value in trade_dates[-10:]],
    }


def fetch_previous_payload(output: Path, timeout: int = 8) -> dict[str, Any]:
    url = os.getenv("STOCK_CN_PREVIOUS_URL", DEFAULT_PREVIOUS_LATEST_URL).strip()
    if url:
        req = urllib.request.Request(
            f"{url}?t={int(time.time())}",
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            pass
        try:
            raw = subprocess.check_output(
                ["curl", "-fsSL", "--max-time", str(timeout), f"{url}?t={int(time.time())}"],
                text=True,
                timeout=timeout + 4,
                stderr=subprocess.DEVNULL,
            )
            return json.loads(raw)
        except Exception:
            pass

    if output.exists():
        try:
            return json.loads(output.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def secid_for_code(code: str, market: Any = None) -> str:
    code = str(code).strip()
    market_text = str(market or "").strip()
    if market_text in {"0", "1"}:
        return f"{market_text}.{code}"
    if code.startswith(("5", "6", "9")):
        return f"1.{code}"
    return f"0.{code}"


def fetch_a_share_universe(page_size: int = 500) -> list[dict[str, str]]:
    base_params: dict[str, str | int] = {
        "pn": 1,
        "pz": page_size,
        "po": 1,
        "np": 1,
        "fltt": 2,
        "invt": 2,
        "fid": "f3",
        "fs": PUBLIC_A_SHARE_FS,
        "fields": "f12,f13,f14",
    }
    first = public_get_json("clist/get", base_params)
    data = (first or {}).get("data", {})
    total = int(data.get("total") or 0)
    pages = max(1, (total + page_size - 1) // page_size) if total else 1
    rows = data.get("diff") if isinstance(data.get("diff"), list) else []

    for page in range(2, pages + 1):
        params = dict(base_params)
        params["pn"] = page
        result = public_get_json("clist/get", params)
        diff = (result or {}).get("data", {}).get("diff", [])
        if isinstance(diff, list):
            rows.extend(diff)

    universe: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        code = str(row.get("f12") or "").strip()
        if not re.fullmatch(r"\d{6}", code) or code in seen:
            continue
        seen.add(code)
        universe.append(
            {
                "code": code,
                "name": compact(row.get("f14")),
                "secid": secid_for_code(code, row.get("f13")),
            }
        )
    return universe


def parse_kline_pct(row: str) -> tuple[dt.date, float] | None:
    parts = str(row).split(",")
    if len(parts) < 9:
        return None
    try:
        trade_date = dt.date.fromisoformat(parts[0])
        pct = float(parts[8])
        return trade_date, pct
    except ValueError:
        return None


def fetch_stock_daily_moves(secid: str, days: int = HISTORICAL_BREADTH_DAYS) -> list[tuple[dt.date, float]]:
    result = public_history_get_json(
        "stock/kline/get",
        {
            "secid": secid,
            "fields1": "f1,f2,f3,f4,f5,f6",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": 101,
            "fqt": 1,
            "end": "20500101",
            "lmt": days,
        },
        timeout=8,
    )
    rows = ((result or {}).get("data") or {}).get("klines") or []
    parsed = [parse_kline_pct(row) for row in rows]
    return [item for item in parsed if item is not None]


def existing_breadth_rows(previous_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    rows = ((previous_payload or {}).get("breadthPulse") or {}).get("rows", [])
    if not isinstance(rows, list):
        return []
    normalized: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            item = normalize_breadth_sample(row)
            if item:
                normalized.append(item)
    return normalized


def needs_historical_breadth(previous_payload: dict[str, Any] | None) -> bool:
    rows = existing_breadth_rows(previous_payload)
    unique_dates = {
        (parse_cn_time(row.get("time")) or dt.datetime.min.replace(tzinfo=TIMEZONE)).date()
        for row in rows
    }
    return len(unique_dates) < HISTORICAL_BREADTH_MIN_ROWS


def build_historical_breadth(previous_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not needs_historical_breadth(previous_payload):
        return []

    symbol_limit = int(os.getenv("STOCK_CN_HISTORY_SYMBOL_LIMIT", "0") or 0)
    workers = max(1, int(os.getenv("STOCK_CN_HISTORY_WORKERS", str(HISTORICAL_BREADTH_WORKERS)) or HISTORICAL_BREADTH_WORKERS))
    days = max(HISTORICAL_BREADTH_MIN_ROWS, int(os.getenv("STOCK_CN_HISTORY_DAYS", str(HISTORICAL_BREADTH_DAYS)) or HISTORICAL_BREADTH_DAYS))

    universe = fetch_a_share_universe()
    if symbol_limit > 0:
        universe = universe[:symbol_limit]
    if not universe:
        return []

    print(f"[public-history] rebuilding breadth: symbols={len(universe)} days={days} workers={workers}", flush=True)
    buckets: dict[dt.date, dict[str, int]] = defaultdict(lambda: {"up": 0, "down": 0, "flat": 0, "total": 0})

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_stock_daily_moves, item["secid"], days): item for item in universe}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            if completed % 500 == 0 or completed == len(futures):
                print(f"[public-history] {completed}/{len(futures)} symbols", flush=True)
            try:
                moves = future.result()
            except Exception:
                continue
            for trade_date, pct in moves:
                bucket = buckets[trade_date]
                bucket["total"] += 1
                if pct > 0:
                    bucket["up"] += 1
                elif pct < 0:
                    bucket["down"] += 1
                else:
                    bucket["flat"] += 1

    rows: list[dict[str, Any]] = []
    for trade_date in sorted(buckets)[-days:]:
        bucket = buckets[trade_date]
        if bucket["total"] <= 0:
            continue
        rows.append(
            {
                "time": format_cn_time(combine_cn(trade_date, MARKET_CLOSE_PM)),
                "up": bucket["up"],
                "down": bucket["down"],
                "flat": bucket["flat"],
                "total": bucket["total"],
                "source": "Eastmoney stock kline reconstructed breadth",
                "scope": "A股日K重建涨跌家数",
            }
        )
    return rows


def parse_trade_date_text(value: Any) -> dt.date | None:
    match = re.search(r"\d{4}-\d{2}-\d{2}", str(value or ""))
    if not match:
        return None
    try:
        return dt.date.fromisoformat(match.group(0))
    except ValueError:
        return None


def breadth_rows_from_tables(tables: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for table in tables:
        for row in table.get("rows", []):
            if not isinstance(row, dict):
                continue
            trade_date = parse_trade_date_text(row.get("date") or row.get("日期") or row.get("交易日"))
            up = int_value(row.get("上涨家数"))
            down = int_value(row.get("下跌家数"))
            flat = int_value(row.get("平盘家数") or row.get("持平家数")) or 0
            if not trade_date or up is None or down is None:
                continue
            rows.append(
                {
                    "time": format_cn_time(combine_cn(trade_date, MARKET_CLOSE_PM)),
                    "up": up,
                    "down": down,
                    "flat": flat,
                    "total": up + down + flat,
                    "source": source,
                    "scope": "全部A股历史涨跌家数",
                }
            )
    deduped = {row["time"]: row for row in rows}
    return sorted(deduped.values(), key=lambda row: parse_cn_time(row["time"]) or dt.datetime.min.replace(tzinfo=TIMEZONE))


def fetch_mx_historical_breadth(client: "MXClient") -> list[dict[str, Any]]:
    if client.remaining <= 0:
        return []
    queries = [
        "全部A股近300个交易日上涨家数 下跌家数 平盘家数",
        "沪深京A股近一年每个交易日上涨家数 下跌家数 平盘家数",
    ]
    for query in queries:
        if client.remaining <= 0:
            break
        tables = parse_data_tables(client.data(query, "history-breadth"), limit=900)
        rows = breadth_rows_from_tables(tables, "东方财富妙想历史涨跌家数")
        if len(rows) >= HISTORICAL_BREADTH_MIN_ROWS:
            return rows[-BREADTH_PULSE_MAX_POINTS:]
    return []


def normalize_breadth_sample(sample: dict[str, Any]) -> dict[str, Any] | None:
    sample_time = parse_cn_time(sample.get("time") or sample.get("generatedAt") or sample.get("t"))
    up = int_value(sample.get("up"))
    down = int_value(sample.get("down"))
    if not sample_time or up is None or down is None:
        return None
    flat = int_value(sample.get("flat")) or 0
    total = int_value(sample.get("total")) or up + down + flat
    return {
        "time": format_cn_time(sample_time),
        "up": up,
        "down": down,
        "flat": flat,
        "total": total,
        "source": compact(sample.get("source") or "Eastmoney public quote index breadth"),
        "scope": compact(sample.get("scope") or "上证指数 + 深证成指 + 北证50"),
    }


def coerce_sample_to_trade_time(sample: dict[str, Any], trade_dates: list[dt.date]) -> dict[str, Any]:
    sample_time = parse_cn_time(sample.get("time"))
    if not sample_time:
        return sample
    sample_date = sample_time.date()
    known_dates = set(trade_dates)
    if sample_date in known_dates:
        return sample
    trade_date = trade_date_on_or_before(sample_date, trade_dates)
    return {**sample, "time": format_cn_time(combine_cn(trade_date, MARKET_CLOSE_PM))}


def breadth_to_sample(cutoff_at: dt.datetime, breadth: dict[str, Any]) -> dict[str, Any] | None:
    if not breadth or breadth.get("up") is None or breadth.get("down") is None:
        return None
    return normalize_breadth_sample(
        {
            "time": format_cn_time(cutoff_at),
            "up": breadth.get("up"),
            "down": breadth.get("down"),
            "flat": breadth.get("flat"),
            "total": breadth.get("total"),
            "source": breadth.get("source"),
            "scope": breadth.get("scope"),
        }
    )


def build_breadth_pulse(
    cutoff_at: dt.datetime,
    breadth: dict[str, Any],
    previous_payload: dict[str, Any] | None,
    trade_dates: list[dt.date] | None = None,
    include_historical: bool = False,
    historical_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    known_trade_dates = trade_dates or fallback_trade_dates(cutoff_at.date(), 24)
    injected_historical_rows = historical_rows or []
    if include_historical and not injected_historical_rows:
        injected_historical_rows = build_historical_breadth(previous_payload)
    rows.extend(injected_historical_rows)

    previous_rows = ((previous_payload or {}).get("breadthPulse") or {}).get("rows", [])
    if isinstance(previous_rows, list):
        for row in previous_rows:
            if isinstance(row, dict):
                normalized = normalize_breadth_sample(row)
                if normalized:
                    rows.append(coerce_sample_to_trade_time(normalized, known_trade_dates))

    previous_breadth = (previous_payload or {}).get("breadth") or {}
    previous_meta = (previous_payload or {}).get("meta") or {}
    previous_cutoff = previous_meta.get("dataCutoffAt") or previous_meta.get("generatedAt")
    if previous_breadth and previous_cutoff:
        previous_sample = normalize_breadth_sample({**previous_breadth, "time": previous_cutoff})
        if previous_sample:
            rows.append(coerce_sample_to_trade_time(previous_sample, known_trade_dates))

    current_sample = breadth_to_sample(cutoff_at, breadth)
    if current_sample:
        rows.append(coerce_sample_to_trade_time(current_sample, known_trade_dates))

    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        deduped[row["time"]] = row

    ordered = sorted(deduped.values(), key=lambda row: parse_cn_time(row["time"]) or dt.datetime.min.replace(tzinfo=TIMEZONE))
    ordered = ordered[-BREADTH_PULSE_MAX_POINTS:]
    return {
        "intervalSeconds": 15,
        "maxPoints": BREADTH_PULSE_MAX_POINTS,
        "historicalRows": len(injected_historical_rows),
        "source": "historical daily breadth + workflow snapshots + optional browser realtime polling",
        "rows": ordered,
    }


def fmt_amount(value: Any) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return ""
    if abs(n) >= 1e12:
        return f"{n / 1e12:.3f}万亿元"
    if abs(n) >= 1e8:
        return f"{n / 1e8:.2f}亿元"
    if abs(n) >= 1e4:
        return f"{n / 1e4:.2f}万元"
    return f"{n:.0f}"


def fetch_public_indices() -> list[dict[str, Any]]:
    result = public_get_json(
        "ulist.np/get",
        {
            "fltt": 2,
            "fields": "f12,f14,f2,f3,f4,f5,f6,f104,f105,f106",
            "secids": PUBLIC_INDEX_SECIDS,
        },
    )
    rows: list[dict[str, Any]] = []
    for item in (result or {}).get("data", {}).get("diff", []) or []:
        rows.append(
            {
                "date": compact(item.get("f14")),
                "代码": compact(item.get("f12")),
                "最新价": compact(item.get("f2")),
                "涨跌幅": f"{item.get('f3')}%",
                "涨跌额": compact(item.get("f4")),
                "成交额": fmt_amount(item.get("f6")),
                "上涨家数": compact(item.get("f104")),
                "下跌家数": compact(item.get("f105")),
                "平盘家数": compact(item.get("f106")),
            }
        )
    return rows


def fetch_public_breadth(page_size: int = 100) -> dict[str, Any]:
    base_params: dict[str, str | int] = {
        "pn": 1,
        "pz": page_size,
        "po": 1,
        "np": 1,
        "fltt": 2,
        "invt": 2,
        "fid": "f3",
        "fs": PUBLIC_A_SHARE_FS,
        "fields": "f12,f14,f2,f3,f4,f5,f6",
    }
    first = public_get_json("clist/get", base_params)
    data = (first or {}).get("data", {})
    total = int(data.get("total") or 0)
    if total <= 0:
        return {}
    pages = max(1, (total + page_size - 1) // page_size)

    rows: list[dict[str, Any]] = []
    if isinstance(data.get("diff"), list):
        rows.extend(data["diff"])
    for page in range(2, pages + 1):
        params = dict(base_params)
        params["pn"] = page
        result = public_get_json("clist/get", params)
        diff = (result or {}).get("data", {}).get("diff", [])
        if isinstance(diff, list):
            rows.extend(diff)

    up = down = flat = suspended = limit_up = limit_down = 0
    amount = 0.0
    for item in rows:
        chg = item.get("f3")
        try:
            pct = float(chg)
        except (TypeError, ValueError):
            suspended += 1
            continue
        if pct > 0:
            up += 1
        elif pct < 0:
            down += 1
        else:
            flat += 1
        if pct >= 9.8:
            limit_up += 1
        if pct <= -9.8:
            limit_down += 1
        try:
            amount += float(item.get("f6") or 0)
        except (TypeError, ValueError):
            pass

    return {
        "total": total or len(rows),
        "sampled": len(rows),
        "partial": bool(total and len(rows) < total * 0.9),
        "up": up,
        "down": down,
        "flat": flat,
        "suspended": suspended,
        "limitUpApprox": limit_up,
        "limitDownApprox": limit_down,
        "amount": fmt_amount(amount),
        "source": "Eastmoney public quote",
    }


def summarize_index_breadth(index_rows: list[dict[str, Any]]) -> dict[str, Any]:
    # Use broad market rows only; 创业板指/科创50 are subsets and would double count.
    broad_codes = {"000001", "399001", "899050"}
    selected = [row for row in index_rows if str(row.get("代码")) in broad_codes]
    up = sum(int(row.get("上涨家数") or 0) for row in selected)
    down = sum(int(row.get("下跌家数") or 0) for row in selected)
    flat = sum(int(row.get("平盘家数") or 0) for row in selected)
    return {
        "total": up + down + flat,
        "sampled": len(selected),
        "partial": False,
        "up": up,
        "down": down,
        "flat": flat,
        "suspended": "",
        "limitUpApprox": "",
        "limitDownApprox": "",
        "amount": "",
        "source": "Eastmoney public quote index breadth",
        "scope": "上证指数 + 深证成指 + 北证50",
    }


def fetch_public_market() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    indices = fetch_public_indices()
    breadth = summarize_index_breadth(indices) if indices else {}
    tables = []
    if indices:
        tables.append({"title": "公开行情-主要指数", "code": "public.indices", "rows": indices})
    if breadth and breadth.get("total"):
        tables.append(
            {
                "title": "公开行情-沪深京涨跌家数",
                "code": "public.breadth",
                "rows": [
                    {
                        "date": breadth.get("scope", "沪深京"),
                        "总数": breadth.get("total"),
                        "上涨家数": breadth.get("up"),
                        "下跌家数": breadth.get("down"),
                        "平盘家数": breadth.get("flat"),
                        "口径": breadth.get("source"),
                    }
                ],
            }
        )
    return tables, breadth


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
    generated_dt = now_cn()
    generated_at = format_cn_time(generated_dt)
    market_clock = resolve_market_clock(generated_dt)
    cutoff_at = parse_cn_time(market_clock["dataCutoffAt"]) or generated_dt
    recent_trade_dates = [dt.date.fromisoformat(value) for value in market_clock.get("recentTradingDates", [])]
    breadth = {
        "total": 5573,
        "up": 1847,
        "down": 3617,
        "flat": 109,
        "suspended": "",
        "limitUpApprox": "",
        "limitDownApprox": "",
        "amount": "示例",
        "source": "seed",
        "scope": "上证指数 + 深证成指 + 北证50",
    }
    payload = {
        "meta": {
            "generatedAt": generated_at,
            "dataCutoffAt": market_clock["dataCutoffAt"],
            "tradingDate": market_clock["lastTradingDate"],
            "marketClock": market_clock,
            "mode": mode,
            "isMock": True,
            "callsUsed": 0,
            "callBudget": 0,
            "note": "Seed data only. GitHub Actions will replace this when MX_APIKEY is configured.",
        },
        "market": [
            {"title": "A股主要指数", "rows": [{"date": "上证指数", "最新价": "4135.39", "涨跌幅": "-1.02%", "成交额": "1.519万亿元"}]},
            {
                "title": "沪深京涨跌家数",
                "rows": [{"date": "上证指数 + 深证成指 + 北证50", "总数": 5573, "上涨家数": 1847, "下跌家数": 3617, "平盘家数": 109, "口径": "seed"}],
            },
        ],
        "breadth": breadth,
        "breadthPulse": build_breadth_pulse(cutoff_at, breadth, {}, recent_trade_dates, include_historical=False),
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
    return payload


def quota_plan() -> dict[str, Any]:
    return {
        "dailyLimit": 500,
        "reserve": 20,
        "freePublicData": "大盘指数、全A涨跌家数、近似涨停跌停使用东方财富公开行情接口，不消耗妙想额度。",
        "runs": [
            {"name": "premarket", "timeCN": "08:20", "budget": 120, "focus": "外围资讯、盘前题材、候选池预热"},
            {"name": "midday", "timeCN": "12:45", "budget": 120, "focus": "午间行情、题材温度、风险复核"},
            {"name": "postclose", "timeCN": "15:45", "budget": 240, "focus": "收盘截面、题材排名、个股细查、次日候选"},
            {"name": "weekend", "timeCN": "09:30", "budget": 80, "focus": "周末只刷新政策、公告、外围和下周事件，不更新盘中交易结论"},
        ],
        "storagePolicy": {
            "repo": "只提交代码和轻量 seed 数据，不日更提交大 JSON",
            "pagesArtifact": "定时生成 latest.json 并直接部署到 Pages artifact",
            "history": "涨跌家数首次补全 250+ 个交易日，日更 JSON 默认保留 20 个交易日",
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
    market_clock = resolve_market_clock(generated_at)
    cutoff_at = parse_cn_time(market_clock["dataCutoffAt"]) or generated_at
    recent_trade_dates = [dt.date.fromisoformat(value) for value in market_clock.get("recentTradingDates", [])]
    trading_date = market_clock["lastTradingDate"]
    previous_payload = fetch_previous_payload(output)
    news_only_mode = mode == "weekend" or (market_clock.get("session") == "non_trading_day" and mode != "exhaustive")
    history_needed = needs_historical_breadth(previous_payload)

    market, breadth = fetch_public_market()
    if not market:
        market = previous_payload.get("market") or []
        breadth = previous_payload.get("breadth") or {}
        if not news_only_mode:
            market_query = "A股主要指数 上证指数 深证成指 创业板指 科创50 北证50 沪深300 中证500 中证1000 最新价 涨跌幅 成交额 成交量"
            market = parse_data_tables(client.data(market_query, "market-index"), limit=40) or market
            breadth = breadth if market == previous_payload.get("market") else {}

    historical_breadth = fetch_mx_historical_breadth(client) if history_needed else []

    themes: list[dict[str, Any]] = []
    if news_only_mode:
        themes = list(previous_payload.get("themes") or [])
    else:
        for query in CORE_THEME_GROUPS:
            if client.remaining <= 0:
                break
            tables = parse_data_tables(client.data(query, f"theme:{query[:16]}"), limit=80)
            themes.extend(tables)

    screeners: list[dict[str, Any]] = []
    if news_only_mode:
        screeners = list(previous_payload.get("screeners") or [])
    else:
        for name, query in SCREENERS:
            if client.remaining <= 0:
                break
            rows = parse_screen_rows(client.screen(query, f"screener:{name}"), limit=80)
            screeners.append({"name": name, "query": query, "rows": rows})

    news_groups: list[dict[str, Any]] = []
    news_queries = WEEKEND_NEWS_QUERIES if news_only_mode else NEWS_QUERIES
    for name, query in news_queries:
        if client.remaining <= 0:
            break
        items = parse_news_items(client.news(query, f"news:{name}"), limit=10)
        news_groups.append({"name": name, "query": query, "items": items})

    print("[mx] fetching market and theme data", flush=True)

    if news_only_mode:
        max_details = 0
    elif mode == "premarket":
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
    if news_only_mode:
        stock_details = list(previous_payload.get("stockDetails") or [])
    else:
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
            "dataCutoffAt": market_clock["dataCutoffAt"],
            "tradingDate": trading_date,
            "marketClock": market_clock,
            "mode": mode,
            "runFocus": "news_only" if news_only_mode else "market_and_selection",
            "isMock": False,
            "callsUsed": client.calls_used,
            "callBudget": call_budget,
            "detailCandidates": len(candidates),
            "source": "东方财富妙想 MX APIs",
            "publicMarketSource": "Eastmoney public quote",
        },
        "market": market,
        "breadth": breadth,
        "breadthPulse": build_breadth_pulse(
            cutoff_at,
            breadth,
            previous_payload,
            recent_trade_dates,
            include_historical=True,
            historical_rows=historical_breadth,
        ),
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
    parser.add_argument("--mode", choices=["premarket", "midday", "postclose", "weekend", "exhaustive", "mock"], default="postclose")
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
