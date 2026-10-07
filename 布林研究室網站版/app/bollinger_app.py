# -*- coding: utf-8 -*-
"""
布林選股工具 — 後端
只用 Python 內建函式庫，不需要 pip install 任何東西。
功能：主選股區與雷達共用全上市／上櫃普通股宇宙；「個股分析專區」可查全部上市／上櫃普通股，並在每次輸入後重新取得日K／盤中資料。
"""
import json
import math
import tempfile
import os
import random
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
import urllib.parse
import webbrowser
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
import market_calendar as calendar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import marketdata_r9 as md9

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE, "cache_mock" if os.environ.get("BB_MOCK") == "1" else "cache")
LIST_CACHE = os.path.join(CACHE_DIR, "stock_list.json")
PRICE_CACHE = os.path.join(CACHE_DIR, "prices.json")
ALL_LIST_CACHE = os.path.join(CACHE_DIR, "all_stock_list.json")
ALL_LIST_TW_CACHE = os.path.join(CACHE_DIR, "all_stock_list_tw.json")
ALL_LIST_TWO_CACHE = os.path.join(CACHE_DIR, "all_stock_list_two.json")
RESEARCH_CACHE = os.path.join(CACHE_DIR, "research_prices_5y.json")
TRACKING_VALIDATION_CACHE = os.path.join(CACHE_DIR, "tracking_validation.json")
STRONG_RADAR_CACHE = os.path.join(CACHE_DIR, "strong_radar.json")
INDEX_HTML = os.path.join(os.path.dirname(__file__), "index.html")

TPE = timezone(timedelta(hours=8))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
KEEP_BARS = 260          # 畫面快取：保留約1年交易日；長回測資料另存
RESEARCH_BARS = 1250      # 約5年事件研究資料，與畫面快取分離
WORKERS = 8
MOCK = os.environ.get("BB_MOCK") == "1"   # 測試用假資料

# 電子／科技相關產業代碼（證交所、櫃買共用）
INDUSTRIES = {
    "24": "半導體",
    "25": "電腦及週邊",
    "26": "光電",
    "27": "通信網路",
    "28": "電子零組件",
    "29": "電子通路",
    "30": "資訊服務",
    "31": "其他電子",
    "36": "數位雲端",
}

LIST_SOURCES = [
    ("TW", "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
     "公司代號", "公司簡稱", "產業別"),
    ("TWO", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O",
     "SecuritiesCompanyCode", "CompanyAbbreviation", "SecuritiesIndustryCode"),
]

# v6.5.3: the full-market radar universe is independent from the ~950-stock electronics screener.
# Sanity floors deliberately sit well above the electronics-only counts so a partial response
# can never be mistaken for "全上市櫃".  They are validation floors, not expected exact counts.
FULL_MARKET_MIN_BY_MARKET = {"TW": 800, "TWO": 600}
FULL_MARKET_MIN_TOTAL = 1500
ALL_UNIVERSE_STATUS = {"complete": False, "count": 0, "market_counts": {}, "source": "",
                       "status": "尚未建立全市場清單", "updated": None}

state = {"state": "idle", "done": 0, "total": 0, "msg": "", "failed": 0}
state_lock = threading.Lock()
data_lock = threading.Lock()
DATA = {"updated": None, "stocks": [], "live_revision": 0}
LIVE_PATCH = {"live_revision": 0, "quotes": [], "quality": {}}
# v6.4: retain the latest intraday quote for every symbol so a client that was hidden
# can catch up with the whole rotation instead of receiving only the latest 80-symbol batch.
LIVE_QUOTE_CACHE = {}
# v6.5 強勢雷達：以全上市櫃 MIS 快照做獨立掃描，不改變原 M/A/C 選股策略。
RADAR_QUOTE_CACHE = {}
RADAR_UNIVERSE_CACHE = []
RADAR_UNIVERSE_TS = 0.0
RADAR_STATE = {"revision": 0.0, "updated": None, "cursor": 0, "cycle": 0, "batches": 0,
               "universe_count": 0, "universe_complete": False, "universe_status": "尚未建立全市場清單", "market_counts": {}, "universe_source": "",
               "last_source": "", "last_reason": "", "last_count": 0,
               "hot_last": 0.0, "mode": "idle", "data_date": None,
               "postclose_complete_date": None, "postclose_scan_day": None,
               "postclose_enriched_date": None,
               "full_scan_running": False, "full_scan_done": 0, "full_scan_total": 0,
               "full_scan_started": None, "full_scan_finished": None, "full_scan_error": ""}
refresh_thread = None
live_lock = threading.Lock()
radar_lock = threading.Lock()
radar_full_scan_lock = threading.Lock()
radar_full_scan_thread = None
last_live_refresh = 0.0
rotation_cursor = 0
rotation_cycle = 0
rotation_batches = 0
auto_live_lock = threading.Lock()
auto_live_status = {
    "enabled": True, "state": "idle", "last_attempt_ts": 0.0, "last_success_ts": 0.0,
    "next_due_ts": 0.0, "last_ok": None, "last_reason": "", "last_source": "", "last_count": 0,
    "trigger": "", "attempts": 0, "successes": 0,
}
research_state = {"state": "idle", "done": 0, "total": 0, "failed": 0, "msg": "尚未準備長期回測資料", "updated": None}
research_lock = threading.Lock()
research_thread = None
SINGLE_CACHE = {}
single_cache_lock = threading.Lock()
OFFLINE = "--offline" in sys.argv or os.environ.get("CODEX_SANDBOX_NETWORK_DISABLED") == "1"


def atomic_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def valid_stock(s):
    try:
        n = len(s["d"])
        if n < 30 or not s.get("c") or s.get("m") not in ("TW", "TWO"):
            return False
        if any(len(s[k]) != n for k in ("o", "h", "l", "cl", "v")):
            return False
        if s["d"] != sorted(set(s["d"])):
            return False
        for d in s["d"]:
            date.fromisoformat(d)
            if date.fromisoformat(d).isoformat() != d or d > calendar.taipei_now().date().isoformat() or not calendar.is_trading_day(d):
                return False
        for o, h, l, c, v in zip(s["o"], s["h"], s["l"], s["cl"], s["v"]):
            if not all(type(x) in (int, float) and math.isfinite(x) for x in (o,h,l,c,v)):
                return False
            if min(o,h,l,c) <= 0 or v < 0 or h < max(o,c,l) or l > min(o,c,h):
                return False
        return True
    except (KeyError, TypeError, ValueError):
        return False


def data_quality(payload):
    stocks = payload.get("stocks", [])
    expected = calendar.expected_trade_date(completed=True)
    dates = [s["d"][-1] for s in stocks if s.get("d")]
    live = payload.get("live_market") or {}
    context = payload.get("market_context") or {}
    now = datetime.now(TPE)
    today = now.strftime("%Y-%m-%d")
    fresh = stale = old = pending = live_any = 0
    for st in stocks:
        last_date = (st.get("d") or [None])[-1]
        stamp = st.get("live_quote_at") or st.get("live_fetched_at")
        if last_date != today:
            pending += 1
            continue
        if not stamp:
            pending += 1
            continue
        live_any += 1
        try:
            dt = datetime.fromisoformat(str(stamp))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TPE)
            age = (now - dt.astimezone(TPE)).total_seconds() / 60.0
            if age < 0:
                old += 1
                continue
            if age <= 15:
                fresh += 1
            elif age <= 30:
                stale += 1
            else:
                old += 1
        except Exception:
            old += 1
    rot = payload.get("rotation_market") or {}
    return {"latest_bar": max(dates, default=None), "oldest_bar": min(dates, default=None),
            "expected_weekday": expected, "calendar": calendar.calendar_info(),
            "expected_trade_date": calendar.expected_trade_date(),
            "lagging": sum(d < expected for d in dates),
            "fallback": sum(bool(st.get("cached_fallback")) for st in stocks),
            "rejected": len(payload.get("rejected_stocks", [])),
            "mock": MOCK, "offline": OFFLINE,
            "live_source": live.get("source"), "live_count": live_any,
            "live_batch_count": live.get("count", 0),
            "live_fresh_count": fresh, "live_stale_count": stale,
            "live_old_count": old, "live_pending_count": pending,
            "live_coverage_pct": round((live_any / len(stocks) * 100.0), 1) if stocks else 0.0,
            "live_date": live.get("date"), "live_time": live.get("time"),
            "realtime_active": bool(live_any or (live.get("ok") and live.get("count"))),
            "rotation": rot,
            "market_context": context,
            "marketdata_config": md9.public_settings(),
            "calendar_note": calendar.calendar_info()["note"],
            "universe": universe_quality(payload)}



def universe_quality(payload):
    metadata = dict(ALL_UNIVERSE_STATUS if ALL_UNIVERSE_STATUS.get("complete") else (payload.get("universe") or ALL_UNIVERSE_STATUS))
    stocks = payload.get("stocks") or []
    target = int(metadata.get("count") or 0)
    complete = bool(metadata.get("complete"))
    loaded_keys = {(str(x.get("c")), str(x.get("m"))) for x in stocks}
    if complete:
        official = _read_json_list(ALL_LIST_CACHE)
        expected = {(str(x.get("c")), str(x.get("m"))) for x in official}
        covered = len(loaded_keys & expected) if expected else len(loaded_keys)
    else:
        covered = len(loaded_keys)
    return {**metadata, "count": target, "loaded": len(loaded_keys), "covered": covered,
            "missing_history": max(0, target-covered) if complete else None,
            "history_complete": complete and covered >= target,
            "scope": payload.get("universe_scope") or "legacy-partial"}


# ---------------------------------------------------------------- 網路
@lru_cache(maxsize=2)
def _ctx(relaxed=False):
    ctx = ssl.create_default_context()
    if relaxed and hasattr(ssl, "VERIFY_X509_STRICT"):
        # 證交所憑證在 Python 3.13 的「嚴格模式」會被誤判，關掉嚴格模式（仍會驗證憑證）
        ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
            return r.read()
    except urllib.error.URLError as e:
        if isinstance(getattr(e, "reason", None), ssl.SSLError):
            with urllib.request.urlopen(req, timeout=timeout, context=_ctx(True)) as r:
                return r.read()
        raise


# ---------------------------------------------------------------- 股票清單
def _read_json_list(path):
    try:
        with open(path, encoding="utf-8") as f:
            x = json.load(f)
        return x if isinstance(x, list) else []
    except Exception:
        return []


def _market_cache_path(market):
    return ALL_LIST_TW_CACHE if market == "TW" else ALL_LIST_TWO_CACHE


def _normal_company_rows(data, market, k_code, k_name, k_ind):
    out = []
    for r in data if isinstance(data, list) else []:
        code = str(r.get(k_code, "")).strip()
        name = str(r.get(k_name, "")).strip()
        ind = str(r.get(k_ind, "")).strip()
        if len(code) == 4 and code.isdigit() and name:
            out.append({"c": code, "n": name, "m": market,
                        "i": INDUSTRIES.get(ind, "非電子／其他")})
    return list({(x["c"], x["m"]): x for x in out}.values())


def _market_rows_sane(rows, market):
    floor = int(FULL_MARKET_MIN_BY_MARKET.get(market, 1))
    unique = {(str(x.get("c")), str(x.get("m"))): x for x in rows
              if x.get("m") == market and len(str(x.get("c", ""))) == 4
              and str(x.get("c", "")).isdigit() and x.get("n")}
    return len(unique) >= floor


def _full_universe_sane(rows):
    counts = {m: sum(1 for x in rows if x.get("m") == m) for m in ("TW", "TWO")}
    return (len(rows) >= FULL_MARKET_MIN_TOTAL
            and all(counts[m] >= FULL_MARKET_MIN_BY_MARKET[m] for m in counts)), counts


def _set_all_universe_status(rows, source, complete, status):
    global ALL_UNIVERSE_STATUS
    counts = {m: sum(1 for x in rows if x.get("m") == m) for m in ("TW", "TWO")}
    ALL_UNIVERSE_STATUS = {"complete": bool(complete), "count": len(rows), "market_counts": counts,
                           "source": source, "status": status,
                           "updated": datetime.now(TPE).isoformat(timespec="seconds")}
    return dict(ALL_UNIVERSE_STATUS)


def _best_full_market_rows(fetch_network=True):
    """Build the true listed+OTC company universe without ever falling back to DATA['stocks'].

    Each market has its own persistent cache.  A successful fresh market may be combined with
    the last known-good cache of the other market.  Partial API responses never overwrite a
    good cache and never qualify as the full-market radar universe.
    """
    best = {"TW": [], "TWO": []}
    sources = []
    errors = []
    # Start from per-market caches; if only the legacy merged cache exists, split it once.
    merged_cache = _read_json_list(ALL_LIST_CACHE)
    for market in ("TW", "TWO"):
        cached = _read_json_list(_market_cache_path(market))
        if not _market_rows_sane(cached, market) and merged_cache:
            cached = [x for x in merged_cache if x.get("m") == market]
        if _market_rows_sane(cached, market):
            best[market] = cached
            sources.append(f"{market}快取")
    if fetch_network and not (OFFLINE or MOCK):
        for market, url, k_code, k_name, k_ind in LIST_SOURCES:
            try:
                raw = json.loads(http_get(url, timeout=12).decode("utf-8-sig"))
                fresh = _normal_company_rows(raw, market, k_code, k_name, k_ind)
                if _market_rows_sane(fresh, market):
                    fresh = sorted(fresh, key=lambda x: x["c"])
                    best[market] = fresh
                    atomic_json(_market_cache_path(market), fresh)
                    sources.append(f"{market}官方清單")
                else:
                    errors.append(f"{market}清單筆數異常({len(fresh)})，未覆寫完整快取")
            except Exception as e:
                errors.append(f"{market}清單抓取失敗：{type(e).__name__}: {e}")
    rows = sorted({(x["c"], x["m"]): x for market in ("TW", "TWO") for x in best[market]}.values(),
                  key=lambda x: (x["c"], x["m"]))
    complete, counts = _full_universe_sane(rows)
    if complete:
        atomic_json(ALL_LIST_CACHE, rows)
        status = f"全市場完整：上市 {counts['TW']}＋上櫃 {counts['TWO']}＝{len(rows)} 檔"
    else:
        missing = [m for m in ("TW", "TWO") if counts.get(m, 0) < FULL_MARKET_MIN_BY_MARKET[m]]
        status = (f"全市場清單不完整：目前 {len(rows)} 檔（上市 {counts['TW']}／上櫃 {counts['TWO']}）"
                  + (f"；待補 {'、'.join(missing)}" if missing else ""))
        if errors:
            status += "；" + "；".join(errors[-2:])
    _set_all_universe_status(rows, "＋".join(dict.fromkeys(sources)) or "無", complete, status)
    return rows, dict(ALL_UNIVERSE_STATUS)


def load_stock_list():
    """The screener and radar share the validated listed + OTC common-stock universe.

    A legacy electronics cache is allowed only for explicitly offline preview. An online
    update must not silently succeed with that partial list. Fetch metadata once per day,
    reuse each market's last good list if its endpoint fails, and retain existing prices.
    """
    if MOCK:
        return mock_list()
    fresh = all(os.path.exists(_market_cache_path(m))
                and time.time() - os.path.getmtime(_market_cache_path(m)) < 86400
                for m in ("TW", "TWO"))
    rows, meta = _best_full_market_rows(fetch_network=not OFFLINE and not fresh)
    if meta.get("complete"):
        atomic_json(LIST_CACHE, rows)
        return rows
    if OFFLINE:
        legacy = _read_json_list(LIST_CACHE)
        if legacy:
            return legacy
    raise RuntimeError(meta.get("status") or "上市＋上櫃股票清單尚未完整，保留原價格快取")


# ---------------------------------------------------------------- 日K
def _latest_known_trade_date():
    return calendar.expected_trade_date()


def _yahoo_history_url(host, sym, end_date=None, start_date=None):
    base = "https://%s.finance.yahoo.com/v8/finance/chart/%s" % (host, sym)
    if not end_date and not start_date:
        return base + "?range=2y&interval=1d&includePrePost=false"
    end = date.fromisoformat(end_date or calendar.expected_trade_date())
    start = date.fromisoformat(start_date) if start_date else end - timedelta(days=800)
    p1 = int(datetime.combine(start, datetime.min.time(), TPE).timestamp())
    p2 = int(datetime.combine(end + timedelta(days=1), datetime.min.time(), TPE).timestamp())
    return base + "?period1=%d&period2=%d&interval=1d&includePrePost=false&events=history" % (p1, p2)


HISTORY_LOCKS = {}
HISTORY_STATS = {"requests": 0, "incremental": 0, "reused": 0, "full": 0}


def _history_current(stock, target):
    if not stock or stock.get("cached_fallback") or not stock.get("d") or stock["d"][-1] != target:
        return False
    if stock.get("live_source") and not stock.get("history_fetched_at"): return False
    stamp = stock.get("history_fetched_at") or stock.get("fetched_at")
    try:
        dt = datetime.fromisoformat(str(stamp))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=TPE)
        now = datetime.now(TPE)
        age = (now - dt.astimezone(TPE)).total_seconds()
        if age < 0: return False
        cutoff = datetime.fromisoformat(target + "T13:35:00+08:00")
        if dt >= cutoff and not calendar.session_mode(now) in ("intraday", "closing"):
            return True
        return age <= 45
    except (ValueError, TypeError):
        return False


def fetch_history(stock, attempts=2, timeout=8, end_date=None, cached=None):
    """Per-symbol single flight, small overlapping refresh, full fallback on gaps/revisions.

    Retained history is Yahoo OHLCV only. Retrieving/reusing cache never advances
    its provider fetch time. A source date remains independent of that timestamp.
    """
    if MOCK: return mock_history(stock)
    if OFFLINE: raise RuntimeError("離線模式，不呼叫外網行情")
    key = (stock["c"], stock["m"])
    target = end_date or _latest_known_trade_date()
    with single_cache_lock:
        lock = HISTORY_LOCKS.setdefault(key, threading.Lock())
    with lock:
        with single_cache_lock:
            memory = SINGLE_CACHE.get(key)
        candidates = [x for x in (memory, cached) if x and valid_stock(x)]
        if not candidates:
            path = os.path.join(CACHE_DIR, "single_history", "%s.%s.json" % key)
            try:
                with open(path, encoding="utf-8") as f: saved = json.load(f)
                if valid_stock(saved): candidates.append(saved)
            except (OSError, ValueError, TypeError): pass
        old = max(candidates, key=lambda x: (x["d"][-1], x.get("history_fetched_at") or x.get("fetched_at") or ""), default=None)
        if _history_current(old, target):
            HISTORY_STATS["reused"] += 1
            return dict(old, history_cache_reused=True)
        sym = "%s.%s" % key
        incremental = bool(old and len(old["d"]) >= 140 and old["d"][-1] <= target)
        modes = [True, False] if incremental else [False]
        last_err = None
        for small in modes:
            start = (date.fromisoformat(old["d"][-1]) - timedelta(days=35)).isoformat() if small else None
            HISTORY_STATS["incremental" if small else "full"] += 1
            for attempt in range(min(3, max(1, int(attempts)))):
                host = "query1" if attempt % 2 == 0 else "query2"
                try:
                    HISTORY_STATS["requests"] += 1
                    j = json.loads(http_get(_yahoo_history_url(host, sym, target, start), timeout=timeout))
                    chart = j.get("chart") or {}
                    results = chart.get("result") or []
                    if not results: raise ValueError((chart.get("error") or {}).get("description") or "Yahoo 無歷史資料")
                    res = results[0]; q = res["indicators"]["quote"][0]
                    rows = {}
                    for k, stamp in enumerate(res.get("timestamp") or []):
                        d = datetime.fromtimestamp(stamp, TPE).date().isoformat()
                        if d > target or d > calendar.taipei_now().date().isoformat() or not calendar.is_trading_day(d): continue
                        vals = [q[name][k] for name in ("open", "high", "low", "close")]
                        if any(type(x) not in (int, float) or not math.isfinite(x) or x <= 0 for x in vals): continue
                        o,h,l,c = (round(x, 2) for x in vals)
                        v = q.get("volume", [0] * len(res["timestamp"]))[k] or 0
                        if not math.isfinite(v) or v < 0 or h < max(o,c,l) or l > min(o,c,h): continue
                        rows[d] = (o,h,l,c,round(v / 1000, 3))
                    if not rows: raise ValueError("來源未回傳有效日K")
                    if small:
                        overlap = set(old["d"]) & set(rows)
                        if not overlap: break  # suspension/cache gap: retrieve complete window
                        positions = {d:i for i,d in enumerate(old["d"])}
                        # Historical adjustments/corrections require a consistent full basis.
                        revised = any(abs(rows[d][3] / old["cl"][positions[d]] - 1) > .005
                                      for d in overlap if d != old["d"][-1])
                        if revised: break
                        merged = {d:tuple(old[k][i] for k in ("o","h","l","cl","v"))
                                  for i,d in enumerate(old["d"]) if d <= target}
                        merged.update(rows); rows = merged
                    ds = sorted(rows)[-KEEP_BARS:]
                    if len(ds) < 30: raise ValueError("有效日K不足30根")
                    out = {k:stock[k] for k in ("c","m","n","i") if k in stock}
                    out["n"] = out.get("n") if out.get("n") != stock["c"] else (res.get("meta", {}).get("shortName") or out["n"])
                    out["d"] = ds
                    for col,k in enumerate(("o","h","l","cl","v")): out[k] = [rows[d][col] for d in ds]
                    if not valid_stock(out): raise ValueError("日K日期或OHLCV不完整")
                    out["fetched_at"] = out["history_fetched_at"] = datetime.now(TPE).isoformat(timespec="seconds")
                    out.update(latest_trade_date=ds[-1], requested_trade_date=target, cached_fallback=False,
                               history_source="Yahoo Finance", history_cache_reused=False, price_basis="unadjusted", refresh_mode="incremental" if small else "full")
                    with single_cache_lock: SINGLE_CACHE[key] = out
                    atomic_json(os.path.join(CACHE_DIR, "single_history", sym + ".json"), out)
                    return out
                except urllib.error.HTTPError as e:
                    last_err = e
                    if e.code in (400,404):
                        raise RuntimeError("%s 無來源資料：HTTP %d" % (sym,e.code)) from e
                except Exception as e:
                    last_err = e
                if attempt + 1 < min(3,max(1,int(attempts))): time.sleep(.2 * (attempt + 1))
        raise RuntimeError("%s 資料抓取失敗：%s" % (sym,last_err))


def apply_live_market(stocks):
    """Apply the best available intraday whole-market snapshot.

    R10.12: Fugle Snapshot Quotes is plan-restricted, so auto mode gracefully falls back
    to TWSE MIS instead of leaving the app on yesterday's bar.
    """
    if MOCK or OFFLINE:
        return [dict(x) for x in stocks], {"ok": False, "source": "盤中行情", "reason": "mock/offline", "count": 0}
    settings = md9.load_settings()
    if settings.get("provider") == "yahoo":
        return [dict(x) for x in stocks], {"ok": False, "source": "Yahoo日K", "reason": "已選Yahoo日K，盤中快照停用", "count": 0}
    snaps, meta = md9.fetch_best_intraday_snapshots(stocks)
    if not snaps:
        return [dict(x) for x in stocks], meta
    merged, count = md9.merge_snapshots(stocks, snaps)
    meta = dict(meta, count=count)
    return merged, meta


def refresh_live_market(trigger="manual"):
    """Fast intraday refresh with Fugle -> TWSE MIS fallback."""
    global last_live_refresh, LIVE_PATCH
    if OFFLINE or MOCK or not md9.intraday_auto_enabled():
        return False
    if not live_lock.acquire(blocking=False):
        return False
    try:
        with data_lock:
            base = [dict(s) for s in DATA.get("stocks", []) if valid_stock(s)]
        if not base:
            return False
        snaps, meta = md9.fetch_best_intraday_snapshots(base)
        if not snaps:
            with data_lock:
                DATA["live_market"] = dict(meta, trigger=trigger, refreshed_at=datetime.now(TPE).isoformat(timespec="seconds"))
            return False
        merged, count = md9.merge_snapshots(base, snaps)
        meta = dict(meta, count=count, trigger=trigger, refreshed_at=datetime.now(TPE).isoformat(timespec="seconds"))
        if not meta.get("ok") or not count:
            with data_lock:
                DATA["live_market"] = meta
            return False
        rev = time.time()
        live_fetched_at = datetime.now(TPE).isoformat(timespec="seconds")
        quotes = []
        for (code, market), q in snaps.items():
            quotes.append({"c": code, "m": market, "d": q.get("date"), "o": q.get("o"), "h": q.get("h"),
                           "l": q.get("l"), "cl": q.get("c"), "v": q.get("v"), "time": q.get("time"),
                           "source": q.get("source"), "fetched_at": live_fetched_at})
        with data_lock:
            DATA["stocks"] = merged
            DATA["live_market"] = meta
            DATA["live_revision"] = rev
            qinfo = data_quality(DATA)
        _publish_live_patch(quotes, qinfo, rev)
        last_live_refresh = rev
        return True
    except Exception as e:
        with data_lock:
            DATA["live_market"] = {"ok": False, "source": "盤中行情", "count": 0, "reason": str(e)}
        return False
    finally:
        live_lock.release()



def _publish_live_patch(quotes, qinfo, rev):
    """Publish a catch-up patch containing the latest quote known for each symbol."""
    global LIVE_PATCH, LIVE_QUOTE_CACHE
    dates = {str(q.get("d") or "") for q in quotes if q.get("d")}
    if dates:
        newest = max(dates)
        # Drop yesterday's quote cache when a new trading date begins.
        if any(str(v.get("d") or "") and str(v.get("d")) != newest for v in LIVE_QUOTE_CACHE.values()):
            LIVE_QUOTE_CACHE = {k: v for k, v in LIVE_QUOTE_CACHE.items() if str(v.get("d") or "") == newest}
    for q in quotes:
        LIVE_QUOTE_CACHE[(str(q.get("c")), str(q.get("m")))] = dict(q)
    LIVE_PATCH = {"live_revision": rev, "quotes": list(LIVE_QUOTE_CACHE.values()), "quality": qinfo}


def refresh_rotating_market_batch(trigger="rotation", batch_size=80):
    """v6.4: refresh one TWSE MIS batch and advance through the universe.

    Around 80 symbols are requested every ~45 seconds.  An 866-symbol universe therefore
    completes a pass in roughly 8–10 minutes without hammering MIS with 11 back-to-back
    requests.  High-priority M/A/N symbols still use the separate fast lane.
    """
    global last_live_refresh, rotation_cursor, rotation_cycle, rotation_batches
    if OFFLINE or MOCK or not md9.intraday_auto_enabled() or not md9.market_open():
        return False, {"reason": "非盤中或盤中行情來源停用", "count": 0}
    if not live_lock.acquire(blocking=False):
        return False, {"reason": "盤中更新正在執行", "count": 0}
    try:
        with data_lock:
            base = [dict(x) for x in DATA.get("stocks", []) if valid_stock(x)]
        if not base:
            return False, {"reason": "目前股票清單為空", "count": 0}
        n = len(base)
        size = max(20, min(int(batch_size or 80), 100, n))
        start = rotation_cursor % n
        end = min(n, start + size)
        subset = base[start:end]
        if not subset:
            start, end, subset = 0, min(n, size), base[:size]
        snaps, meta = md9.fetch_twse_mis_snapshots(subset, chunk_size=len(subset))
        next_cursor = end
        wrapped = next_cursor >= n
        if wrapped:
            next_cursor = 0
            rotation_cycle += 1
        rotation_cursor = next_cursor
        rotation_batches += 1
        if not snaps:
            # Retry the same batch on the short retry timer instead of silently skipping it.
            rotation_cursor = start
            if wrapped and rotation_cycle > 0:
                rotation_cycle -= 1
            info = dict(meta, trigger=trigger, requested=len(subset), start=start, end=end,
                        cursor=rotation_cursor, cycle=rotation_cycle, batches=rotation_batches)
            with data_lock:
                DATA["rotation_market"] = info
                DATA["live_market"] = info
            return False, info
        merged, count = md9.merge_snapshots(base, snaps)
        rev = time.time()
        fetched = datetime.now(TPE).isoformat(timespec="seconds")
        quotes = [{"c": code, "m": market, "d": q.get("date"), "o": q.get("o"), "h": q.get("h"),
                   "l": q.get("l"), "cl": q.get("c"), "v": q.get("v"), "time": q.get("time"),
                   "source": q.get("source"), "fetched_at": fetched}
                  for (code, market), q in snaps.items()]
        info = dict(meta, ok=bool(count), count=count, trigger=trigger, requested=len(subset),
                    start=start, end=end, cursor=rotation_cursor, cycle=rotation_cycle,
                    batches=rotation_batches, wrapped=wrapped, refreshed_at=fetched)
        with data_lock:
            DATA["stocks"] = merged
            DATA["rotation_market"] = info
            DATA["live_market"] = info
            DATA["live_revision"] = rev
            qinfo = data_quality(DATA)
        _publish_live_patch(quotes, qinfo, rev)
        last_live_refresh = rev
        return bool(count), info
    except Exception as e:
        info = {"reason": f"輪詢更新失敗：{type(e).__name__}: {e}", "count": 0, "trigger": trigger}
        with data_lock:
            DATA["rotation_market"] = info
        return False, info
    finally:
        live_lock.release()

def refresh_priority_market(codes, trigger="midline-fastlane"):
    """Refresh only high-priority midline/continuation candidates via TWSE MIS.

    The full universe remains on the conservative 10-minute scheduler.  This fast lane
    refreshes at most 60 symbols, so it improves timeliness without multiplying the
    whole-market request load.  It never changes the full-market scheduler due time.
    """
    global LIVE_PATCH
    if OFFLINE or MOCK or not md9.intraday_auto_enabled() or not md9.market_open():
        return False, {"reason": "非盤中或盤中行情來源停用", "count": 0}
    try:
        codes = [str(x).strip() for x in (codes or []) if str(x).strip().isdigit()]
        codes = list(dict.fromkeys(codes))[:60]
    except Exception:
        codes = []
    if not codes:
        return False, {"reason": "沒有優先候選", "count": 0}
    if not live_lock.acquire(blocking=False):
        return False, {"reason": "盤中更新正在執行", "count": 0}
    try:
        with data_lock:
            base = [dict(x) for x in DATA.get("stocks", []) if valid_stock(x)]
        subset = [x for x in base if str(x.get("c")) in codes]
        if not subset:
            return False, {"reason": "優先候選不在目前股票清單", "count": 0}
        # Use targeted MIS batches here. Fugle whole-market snapshot would defeat the point
        # of a small fast lane and may require a higher subscription tier.
        snaps, meta = md9.fetch_twse_mis_snapshots(subset, chunk_size=min(60, max(1, len(subset))))
        if not snaps:
            return False, dict(meta, count=0, trigger=trigger)
        merged, count = md9.merge_snapshots(base, snaps)
        if not count:
            return False, dict(meta, count=0, trigger=trigger)
        rev = time.time()
        fetched = datetime.now(TPE).isoformat(timespec="seconds")
        quotes = [{"c": code, "m": market, "d": q.get("date"), "o": q.get("o"),
                   "h": q.get("h"), "l": q.get("l"), "cl": q.get("c"), "v": q.get("v"),
                   "time": q.get("time"), "source": q.get("source"), "fetched_at": fetched}
                  for (code, market), q in snaps.items()]
        with data_lock:
            DATA["stocks"] = merged
            DATA["priority_market"] = dict(meta, ok=True, count=count, trigger=trigger,
                                                refreshed_at=fetched, requested=len(subset))
            DATA["live_revision"] = rev
            qinfo = data_quality(DATA)
            qinfo["priority_count"] = count
            qinfo["priority_source"] = meta.get("source", "TWSE MIS")
        _publish_live_patch(quotes, qinfo, rev)
        return True, dict(meta, ok=True, count=count, requested=len(subset), trigger=trigger)
    except Exception as e:
        return False, {"reason": f"優先候選更新失敗：{type(e).__name__}: {e}", "count": 0}
    finally:
        live_lock.release()



# ---------------------------------------------------------------- v6.5 全市場強勢雷達
def _radar_universe(force=False):
    """Return the independent true full-market radar universe.

    v6.5.3 never falls back to the electronics/technology screener universe.  If the official
    all-market list is incomplete, the radar reports that state explicitly and retries soon.
    """
    global RADAR_UNIVERSE_CACHE, RADAR_UNIVERSE_TS
    now = time.time()
    # Complete universes are stable for hours; incomplete universes retry every 90 seconds.
    ttl = 6 * 3600 if RADAR_STATE.get("universe_complete") else 90
    if RADAR_UNIVERSE_CACHE and not force and now - RADAR_UNIVERSE_TS < ttl:
        return RADAR_UNIVERSE_CACHE
    try:
        # Prefer a verified complete cache first; only hit the two official company-list APIs
        # when one market cache is missing/incomplete.  This reduces rate-limit exposure.
        rows, meta = _best_full_market_rows(fetch_network=False)
        if not meta.get("complete") and not OFFLINE:
            rows, meta = _best_full_market_rows(fetch_network=True)
    except Exception as e:
        rows, meta = [], {"complete": False, "count": 0, "market_counts": {},
                          "source": "錯誤", "status": f"全市場清單建立失敗：{type(e).__name__}: {e}"}
    unique = {(str(x.get("c")), str(x.get("m"))): dict(x) for x in rows
              if len(str(x.get("c", ""))) == 4 and str(x.get("c", "")).isdigit()
              and x.get("m") in ("TW", "TWO")}
    rows = sorted(unique.values(), key=lambda x: (x.get("c", ""), x.get("m", "")))
    RADAR_UNIVERSE_CACHE = rows
    RADAR_UNIVERSE_TS = now
    RADAR_STATE.update(universe_count=len(rows), universe_complete=bool(meta.get("complete")),
                       universe_status=meta.get("status") or "全市場清單狀態未知",
                       market_counts=dict(meta.get("market_counts") or {}),
                       universe_source=meta.get("source") or "")
    return RADAR_UNIVERSE_CACHE

def radar_session_mode(now=None):
    return calendar.session_mode(now)


def _radar_level(entry, mode=None):
    """Classify momentum. Intraday and post-close use different confirmation thresholds."""
    mode = mode or entry.get("mode") or "intraday"
    chg = entry.get("change_pct")
    clv = entry.get("clv")
    dist_high = entry.get("dist_high_pct")
    at_limit = bool(entry.get("at_limit"))
    if chg is None:
        return None, ""
    if mode == "postclose":
        # After the close we care about where the stock FINISHED, not merely whether it
        # touched an intraday extreme.  This prevents long-upper-shadow spikes from being
        # promoted to the same tier as a strong close.
        if at_limit or (chg >= 9.0 and ((clv is not None and clv >= 0.82) or (dist_high is not None and dist_high <= 0.35))):
            return "L4", "漲停／近漲停收盤"
        if chg >= 7.0 and ((clv is not None and clv >= 0.68) or (dist_high is not None and dist_high <= 0.65)):
            return "L3", "收盤急拉強勢"
        if chg >= 5.0 and ((clv is not None and clv >= 0.58) or (dist_high is not None and dist_high <= 1.00)):
            return "L2", "收盤強勢突破"
        if chg >= 3.0 and ((clv is not None and clv >= 0.55) or (dist_high is not None and dist_high <= 1.50)):
            return "L1", "收盤啟動預警"
        return None, ""
    if at_limit or chg >= 9.0 or (entry.get("dist_limit_pct") is not None and entry.get("dist_limit_pct") <= 0.35):
        return "L4", "漲停／近漲停"
    if chg >= 7.0 and ((clv is not None and clv >= 0.70) or (dist_high is not None and dist_high <= 0.45)):
        return "L3", "急拉攻擊"
    if chg >= 5.0 and ((clv is not None and clv >= 0.58) or (dist_high is not None and dist_high <= 0.70)):
        return "L2", "強勢突破"
    if chg >= 3.0 and ((clv is not None and clv >= 0.62) or (dist_high is not None and dist_high <= 0.90)
                       or (entry.get("volume_delta") or 0) >= 100):
        return "L1", "啟動預警"
    return None, ""


def _update_radar_quotes(meta_rows, snapshots, trigger="rotation", mode=None):
    """Normalize MIS snapshots and refresh the all-market radar cache."""
    mode = mode or radar_session_mode()
    now_ts = time.time()
    fetched = datetime.now(TPE).isoformat(timespec="seconds")
    meta_map = {(str(x.get("c")), str(x.get("m"))): x for x in meta_rows}
    with data_lock:
        core_keys = {(str(x.get("c")), str(x.get("m"))) for x in meta_rows if x.get("i") in INDUSTRIES.values()}
    changed = []
    for key, q in snapshots.items():
        code, market = str(key[0]), str(key[1])
        meta = meta_map.get((code, market), {})
        quote_date = calendar.normalize_trade_date(q.get("date"))
        if quote_date != calendar.expected_trade_date(): continue
        c = q.get("c"); h = q.get("h"); l = q.get("l"); prev = q.get("prev")
        try:
            c, h, l = float(c), float(h), float(l)
            if not all(math.isfinite(z) and z > 0 for z in (c,h,l)) or h < max(c,l) or l > min(c,h): continue
        except (TypeError, ValueError):
            continue
        try:
            prev = float(prev) if prev is not None else None
        except (TypeError, ValueError):
            prev = None
        chg = ((c / prev) - 1.0) * 100.0 if prev and prev > 0 else None
        rng = max(0.0, h - l)
        clv = (c - l) / rng if rng > 0 else (1.0 if c >= h else 0.5)
        dist_high = max(0.0, (h - c) / h * 100.0) if h > 0 else None
        limit_up = q.get("limit_up")
        try:
            limit_up = float(limit_up) if limit_up is not None else None
        except (TypeError, ValueError):
            limit_up = None
        dist_limit = max(0.0, (limit_up - c) / limit_up * 100.0) if limit_up and limit_up > 0 else None
        at_limit = bool(limit_up and c >= limit_up - max(0.01, limit_up * 0.00025))
        old = RADAR_QUOTE_CACHE.get((code, market), {})
        old_ts = float(old.get("_ts") or 0)
        old_v = int(old.get("volume") or 0)
        v = int(q.get("v") or 0)
        age_min = max((now_ts - old_ts) / 60.0, 0.01) if old_ts else None
        vol_delta = max(0, v - old_v) if old_ts and old.get("date")==q.get("date") and v >= old_v else 0
        vol_per_min = (vol_delta / age_min) if age_min and mode == "intraday" else None
        o = q.get("o")
        try: o = float(o)
        except (TypeError, ValueError): o = c
        upper_shadow_ratio = ((h - max(o, c)) / rng) if rng > 0 else 0.0
        entry = {
            "code": code, "name": str(meta.get("n") or code), "market": market,
            "industry": str(meta.get("i") or "其他"), "is_core": (code, market) in core_keys,
            "date": q.get("date"), "time": q.get("time"), "price": round(c, 4),
            "open": o, "high": h, "low": l, "prev": prev,
            "change_pct": round(chg, 3) if chg is not None else None,
            "clv": round(clv, 4), "dist_high_pct": round(dist_high, 3) if dist_high is not None else None,
            "limit_up": limit_up, "dist_limit_pct": round(dist_limit, 3) if dist_limit is not None else None,
            "at_limit": at_limit, "volume": v, "volume_delta": vol_delta,
            "volume_per_min": round(vol_per_min, 2) if vol_per_min is not None else None,
            "upper_shadow_ratio": round(upper_shadow_ratio, 4),
            "source": q.get("source") or "TWSE MIS", "fetched_at": fetched, "trigger": trigger,
            "mode": mode, "_ts": now_ts,
        }
        level, label = _radar_level(entry, mode)
        entry["level"], entry["label"] = level, label
        level_bonus = {"L4": 40, "L3": 30, "L2": 20, "L1": 10}.get(level, 0)
        entry["radar_score"] = round(level_bonus + max(0.0, chg or 0) * 3 + clv * 10
                                      + (0 if mode == "postclose" else min(10.0, (vol_delta / max(v, 1)) * 100.0)), 2)
        if mode == "postclose":
            if level == "L4": entry["sop"] = "盤後漲停／近漲停：列明日焦點；不預設隔日續漲，先看開盤承接與是否爆量開板。"
            elif level == "L3": entry["sop"] = "盤後急拉強勢：列明日高優先觀察；先看開盤是否守住今日突破區。"
            elif level == "L2": entry["sop"] = "盤後強勢突破：列明日續強候選；等待量價與回測確認。"
            elif level == "L1": entry["sop"] = "盤後啟動預警：尚非買點；明日觀察是否升級 L2。"
            else: entry["sop"] = "未達盤後強勢雷達門檻。"
        else:
            if level == "L4": entry["sop"] = "漲停／近漲停：列市場焦點，不追價；等開板承接或隔日回測再判斷。"
            elif level == "L3": entry["sop"] = "急拉攻擊：不在加速末端追價；觀察量價是否能守住突破區。"
            elif level == "L2": entry["sop"] = "強勢突破：加入高優先監控，等待回測／守價確認。"
            elif level == "L1": entry["sop"] = "啟動預警：尚非買點；觀察是否升級 L2、量速是否持續。"
            else: entry["sop"] = "未達強勢雷達門檻。"
        # Keep previously enriched daily technicals when the same trading date is refreshed.
        if old.get("date") == entry.get("date"):
            for k in ("volume_ratio20","rsi14","macd_hist","macd_state","boll_mid","boll_up","break20","break60","next_day_candidate","next_day_score"):
                if k in old: entry[k] = old[k]
        RADAR_QUOTE_CACHE[(code, market)] = entry
        changed.append(entry)
    return changed


def _ema_last(values, span):
    if not values: return None
    alpha = 2.0 / (span + 1.0)
    e = float(values[0])
    for v in values[1:]: e = alpha * float(v) + (1.0-alpha) * e
    return e


def _postclose_technicals(entry, stock):
    closes=list(stock.get("cl") or []); highs=list(stock.get("h") or []); vols=list(stock.get("v") or [])
    if len(closes) < 30: return entry
    # Yahoo can lag the official close for a short time. Replace/append today's MIS final bar.
    d=str(entry.get("date") or "")
    dates=list(stock.get("d") or [])
    c=float(entry.get("price") or closes[-1]); h=float(entry.get("high") or c); l=float(entry.get("low") or c); o=float(entry.get("open") or c); v=float(entry.get("volume") or 0)
    if dates and dates[-1] == d:
        closes[-1]=c; highs[-1]=h; vols[-1]=v
    elif d and (not dates or d > dates[-1]):
        dates.append(d); closes.append(c); highs.append(h); vols.append(v)
    prev_closes=closes[:-1] if len(closes)>1 else closes
    prev_vols=vols[:-1] if len(vols)>1 else vols
    if len(prev_vols)>=20:
        av=sum(float(x) for x in prev_vols[-20:])/20.0
        entry["volume_ratio20"]=round(v/av,2) if av>0 else None
    if len(closes)>=20:
        w=[float(x) for x in closes[-20:]]; mid=sum(w)/20.0; sd=(sum((x-mid)**2 for x in w)/20.0)**0.5
        entry["boll_mid"]=round(mid,2); entry["boll_up"]=round(mid+2*sd,2)
    if len(closes)>=15:
        ag=sum(max(closes[i]-closes[i-1],0) for i in range(1,15))/14
        al=sum(max(closes[i-1]-closes[i],0) for i in range(1,15))/14
        for i in range(15,len(closes)):
            delta=closes[i]-closes[i-1]; ag=(ag*13+max(delta,0))/14; al=(al*13+max(-delta,0))/14
        entry["rsi14"]=round(50 if ag==al==0 else (100 if al==0 else 100-100/(1+ag/al)),1)
    if len(closes)>=35:
        e12=e26=closes[0]; dea=0; prior_hist=0; hist=0
        for c0 in closes[1:]:
            prior_hist=hist; e12+=(c0-e12)*2/13; e26+=(c0-e26)*2/27
            dif=e12-e26; dea+=(dif-dea)*.2; hist=dif-dea
        entry["macd_hist"]=round(hist,4)
        entry["macd_state"]="多頭加速" if hist>0 and hist>prior_hist else ("多頭" if hist>0 else "偏弱")
    if len(prev_closes)>=20: entry["break20"]=bool(c>max(float(x) for x in prev_closes[-20:]))
    if len(prev_closes)>=60: entry["break60"]=bool(c>max(float(x) for x in prev_closes[-60:]))
    vr=entry.get("volume_ratio20"); clv=float(entry.get("clv") or 0); dist=float(entry.get("dist_high_pct") if entry.get("dist_high_pct") is not None else 99); shadow=float(entry.get("upper_shadow_ratio") or 0)
    score=0
    if entry.get("level") in ("L4","L3"): score+=3
    elif entry.get("level")=="L2": score+=2
    if clv>=0.72: score+=2
    elif clv>=0.60: score+=1
    if dist<=0.6: score+=1
    if vr is not None and vr>=1.5: score+=2
    elif vr is not None and vr>=1.1: score+=1
    if entry.get("break20"): score+=1
    if entry.get("break60"): score+=1
    if entry.get("macd_hist") is not None and entry.get("macd_hist")>0: score+=1
    if shadow>0.38: score-=2
    entry["next_day_score"]=score
    entry["next_day_candidate"]=bool(entry.get("level") in ("L2","L3","L4") and score>=5)
    return entry


def refresh_postclose_radar_technicals(limit=100):
    """Reuse full-market daily history; cap uncached candidate downloads and elapsed time."""
    if radar_session_mode() not in ("postclose","off"):
        return False,{"reason":"非盤後模式","count":0}
    target=calendar.expected_trade_date()
    previous=calendar.expected_trade_date(datetime.fromisoformat(target+"T00:00:00+08:00"),completed=True)
    rows=[x for x in _radar_rows_snapshot() if x.get("mode")=="postclose" and x.get("date")==target and x.get("level")]
    rows.sort(key=lambda x:(-(x.get("radar_score") or 0),x.get("code","")))
    rows=rows[:max(1,int(limit))]
    if not rows:
        RADAR_STATE.update(technical_pending=0,technical_total=0)
        return False,{"reason":"尚無盤後強勢股","count":0}
    with data_lock:
        local={(x["c"],x["m"]):x for x in DATA.get("stocks",[])}
    with single_cache_lock:
        local={**SINGLE_CACHE,**local}
    meta_map={(x["c"],x["m"]):x for x in _radar_universe()}
    done=0
    pending=[]
    def apply(e,stock):
        if not stock or len(stock.get("cl") or [])<30 or (stock.get("d") or [None])[-1] not in (target,previous):return False
        key=(e["code"],e["market"])
        cur=RADAR_QUOTE_CACHE.get(key)
        if not cur or cur.get("date")!=target:return False
        RADAR_QUOTE_CACHE[key]=_postclose_technicals(dict(cur),stock)
        return True
    for e in rows:
        if apply(e,local.get((e["code"],e["market"]))):done+=1
        else:pending.append(e)
    deadline=time.monotonic()+90
    def work(e):
        if time.monotonic()>=deadline:return e,None
        key=(e["code"],e["market"])
        meta=meta_map.get(key,{"c":e["code"],"n":e.get("name",e["code"]),"m":e["market"],"i":e.get("industry","其他")})
        stock=fetch_history(meta,attempts=1,timeout=5,end_date=target,cached=local.get(key))
        return e,stock
    # A Yahoo outage cannot make a one-click quote scan wait on hundreds of histories.
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures=[ex.submit(work,e) for e in pending[:40]]
        for future in as_completed(futures):
            try:
                e,stock=future.result()
                if apply(e,stock):done+=1
            except Exception:pass
    RADAR_STATE["technical_pending"]=len(rows)-done
    RADAR_STATE["technical_total"]=len(rows)
    if done:RADAR_STATE["postclose_enriched_date"]=target
    save_strong_radar_cache()
    return bool(done),{"count":done,"pending":len(rows)-done,"total":len(rows)}


def _radar_rows_snapshot():
    """Copy dictionary storage before iteration; HTTP polls can overlap scan writes."""
    return [dict(x) for x in list(RADAR_QUOTE_CACHE.copy().values())]


def save_strong_radar_cache():
    try:
        rows=[]
        for x in _radar_rows_snapshot():
            y=dict(x); y.pop("_ts",None); rows.append(y)
        atomic_json(STRONG_RADAR_CACHE,{"version":"v6.9.0","saved_at":datetime.now(TPE).isoformat(timespec="seconds"),"state":dict(RADAR_STATE),"items":rows})
        return True
    except Exception:
        return False


def load_strong_radar_cache():
    if not os.path.exists(STRONG_RADAR_CACHE): return False
    try:
        with open(STRONG_RADAR_CACHE,encoding="utf-8") as f: j=json.load(f)
        # v6.5.3 deliberately distrusts older radar caches because they may have been built
        # from the 948-stock electronics fallback and must never be relabeled as 全上市櫃.
        if str(j.get("version") or "") not in ("v6.5.3","v6.5.4","v6.6.0","v6.8.0","v6.9.0"):
            RADAR_STATE.update(universe_count=0, universe_complete=False,
                               universe_status="正在重建真正全上市櫃股票池", market_counts={}, universe_source="")
            return False
        now=time.time()
        for x in j.get("items") or []:
            code=str(x.get("code") or ""); market=str(x.get("market") or "")
            if code and market in ("TW","TWO"):
                
                try: x["_ts"] = datetime.fromisoformat(x.get("fetched_at") or "").timestamp()
                except (ValueError, TypeError): x["_ts"] = 0
                RADAR_QUOTE_CACHE[(code,market)]=x
        if isinstance(j.get("state"),dict): RADAR_STATE.update(j["state"])
        # A process may have exited while a full scan was in progress. Never restore a stale
        # running flag; a new one-click scan can be started immediately after relaunch.
        RADAR_STATE["full_scan_running"] = False
        RADAR_STATE["full_scan_error"] = ""
        return bool(RADAR_QUOTE_CACHE)
    except Exception:
        return False

def _patch_main_from_radar(snapshots):
    """Reuse radar quotes to improve the original electronic/tech screener freshness."""
    if not snapshots:
        return 0
    with data_lock:
        base = [dict(x) for x in DATA.get("stocks", []) if valid_stock(x)]
    main_keys = {(str(x.get("c")), str(x.get("m"))) for x in base}
    sub = {k: q for k, q in snapshots.items() if (str(k[0]), str(k[1])) in main_keys}
    if not sub:
        return 0
    merged, count = md9.merge_snapshots(base, sub)
    if not count:
        return 0
    rev = time.time()
    fetched = datetime.now(TPE).isoformat(timespec="seconds")
    quotes = [{"c": code, "m": market, "d": q.get("date"), "o": q.get("o"), "h": q.get("h"),
               "l": q.get("l"), "cl": q.get("c"), "v": q.get("v"), "time": q.get("time"),
               "source": q.get("source"), "fetched_at": fetched}
              for (code, market), q in sub.items()]
    with data_lock:
        DATA["stocks"] = merged
        DATA["live_revision"] = rev
        qinfo = data_quality(DATA)
    _publish_live_patch(quotes, qinfo, rev)
    return count


def _postclose_daily_fallback(meta_rows):
    """Build close snapshots from today's completed local daily-K cache.

    MIS is primarily an intraday service and can occasionally return no rows after the close.
    The main updater has already downloaded official/latest daily bars, so post-close radar should
    not remain empty merely because MIS is temporarily unavailable.  This fallback is used only
    for symbols present in DATA; missing non-core symbols remain eligible for MIS on later batches.
    """
    with data_lock:
        local = {(str(x.get("c")), str(x.get("m"))): x for x in DATA.get("stocks", []) if valid_stock(x)}
    out = {}
    for meta in meta_rows:
        key=(str(meta.get("c")), str(meta.get("m")))
        st=local.get(key)
        if not st or not st.get("d") or len(st.get("cl") or []) < 2:
            continue
        try:
            i=len(st["d"])-1
            d=str(st["d"][i]); o=float(st["o"][i]); h=float(st["h"][i]); l=float(st["l"][i]); c=float(st["cl"][i]); v=int(st["v"][i] or 0)
            prev=float(st["cl"][i-1])
            if min(o,h,l,c,prev) <= 0:
                continue
        except (KeyError,IndexError,TypeError,ValueError):
            continue
        out[key]={"date":d,"time":"","o":o,"h":max(h,o,c),"l":min(l,o,c),"c":c,"v":max(0,v),
                  "prev":prev,"limit_up":None,"limit_down":None,"source":"日K盤後備援"}
    return out


def refresh_strong_radar_batch(trigger="radar-rotation", batch_size=None, start_index=None, scan_mode=None):
    """Scan one all-market batch in either intraday or post-close mode."""
    mode=scan_mode or radar_session_mode()
    if OFFLINE or MOCK or mode not in ("intraday","postclose"):
        return False,{"reason":"目前不在盤中／盤後雷達時段","count":0,"mode":mode}
    if mode=="intraday" and not md9.intraday_auto_enabled():
        return False,{"reason":"盤中來源停用","count":0,"mode":mode}
    if not radar_lock.acquire(blocking=False):
        return False,{"reason":"強勢雷達更新中","count":0,"mode":mode}
    live_acquired=False
    try:
        universe=_radar_universe()
        if not RADAR_STATE.get("universe_complete"):
            return False,{"reason":RADAR_STATE.get("universe_status") or "全市場股票清單尚未完整", "count":0,
                         "mode":mode, "universe_count":len(universe), "universe_complete":False}
        if not universe: return False,{"reason":"全市場股票清單為空","count":0,"mode":mode}
        if not live_lock.acquire(blocking=False): return False,{"reason":"主行情更新中，雷達稍後重試","count":0,"mode":mode}
        live_acquired=True
        n=len(universe); start=int(RADAR_STATE.get("cursor") or 0 if start_index is None else start_index)%n
        size=max(40,min(int(batch_size or globals().get("RADAR_BATCH_SIZE",120)),160,n))
        finish=min(n,start+size); subset=universe[start:finish] or universe[:size]
        snaps,meta=md9.fetch_twse_mis_snapshots(subset,chunk_size=len(subset))
        if mode=="postclose":
            # v6.5.2: after the close, do not depend exclusively on the intraday MIS endpoint.
            # Fill any missing core symbols from the freshly completed daily-K cache.
            daily_fb=_postclose_daily_fallback(subset)
            missing_before=max(0,len(subset)-len(snaps))
            for key,q in daily_fb.items():
                snaps.setdefault(key,q)
            if daily_fb:
                meta=dict(meta or {})
                meta["source"]=(meta.get("source")+"＋日K盤後備援") if meta.get("source") and meta.get("count") else "日K盤後備援"
                meta["count"]=len(snaps); meta["ok"]=bool(snaps)
                if missing_before:
                    meta["fallback_reason"]=(meta.get("reason") or "MIS 部分／全部無資料")+f"；日K補 {len(daily_fb)} 檔"
        accepted = _update_radar_quotes(subset,snaps,trigger=trigger,mode=mode)
        valid_keys = {(x["code"], x["market"]) for x in accepted}
        missing = [{"code": x["c"], "market": x["m"], "name": x["n"],
                    "target_date": calendar.expected_trade_date(), "reason": "未取得資料日一致的有效快照"}
                   for x in subset if (x["c"],x["m"]) not in valid_keys]
        if mode=="intraday": _patch_main_from_radar(snaps)
        dates=[q.get("date") for q in accepted if q.get("date")]
        data_date=max(dates) if dates else RADAR_STATE.get("data_date")
        next_cursor=finish; wrapped=next_cursor>=n
        if wrapped:
            next_cursor=0; RADAR_STATE["cycle"]=int(RADAR_STATE.get("cycle") or 0)+1
        RADAR_STATE.update(revision=time.time(),updated=datetime.now(TPE).isoformat(timespec="seconds"),cursor=next_cursor,
                           batches=int(RADAR_STATE.get("batches") or 0)+1,universe_count=n,last_source=meta.get("source") or "TWSE MIS",
                           last_reason=meta.get("fallback_reason") or meta.get("reason") or "",last_count=len(accepted),last_batch_ts=time.time(),wrapped=wrapped,
                           mode=mode,data_date=data_date)
        if mode=="postclose" and wrapped and data_date:
            eligible=sum(1 for q in _radar_rows_snapshot() if q.get("date")==data_date and q.get("mode")=="postclose")
            RADAR_STATE["postclose_complete_date"]=data_date if eligible >= n else None
            RADAR_STATE["missing_quotes"]=max(0,n-eligible)
            RADAR_STATE["postclose_scan_day"]=datetime.now(TPE).strftime("%Y-%m-%d")
        save_strong_radar_cache()
        return True,dict(meta,start=start,end=finish,cursor=next_cursor,wrapped=wrapped,universe_count=n,mode=mode,data_date=data_date,accepted=len(accepted),missing=missing)
    except Exception as e:
        RADAR_STATE.update(last_reason=f"雷達更新失敗：{type(e).__name__}: {e}",updated=datetime.now(TPE).isoformat(timespec="seconds"),mode=mode)
        return False,{"reason":RADAR_STATE["last_reason"],"count":0,"mode":mode}
    finally:
        if live_acquired: live_lock.release()
        radar_lock.release()


def refresh_strong_radar_hot(trigger="radar-fastlane"):
    """Refresh detected movers during the session. Post-close final data does not need a hot loop."""
    if radar_session_mode()!="intraday": return False,{"reason":"非盤中快速刷新時段","count":0}
    if OFFLINE or MOCK or not md9.intraday_auto_enabled(): return False,{"reason":"盤中來源停用","count":0}
    if not radar_lock.acquire(blocking=False): return False,{"reason":"強勢雷達更新中","count":0}
    live_acquired=False
    try:
        universe=_radar_universe()
        if not RADAR_STATE.get("universe_complete"):
            return False,{"reason":RADAR_STATE.get("universe_status") or "全市場股票清單尚未完整","count":0}
        meta_map={(str(x.get("c")),str(x.get("m"))):x for x in universe}
        hot=[x for x in _radar_rows_snapshot() if x.get("level") in ("L4","L3","L2","L1") and x.get("mode")=="intraday"]
        hot.sort(key=lambda x:(-(x.get("radar_score") or 0),x.get("code","")))
        subset=[meta_map[(x["code"],x["market"])] for x in hot[:RADAR_HOT_LIMIT] if (x.get("code"),x.get("market")) in meta_map]
        if not subset: return False,{"reason":"尚無 L1~L4 強勢股","count":0}
        if not live_lock.acquire(blocking=False): return False,{"reason":"主行情更新中，強勢快速線稍後重試","count":0}
        live_acquired=True
        snaps,meta=md9.fetch_twse_mis_snapshots(subset,chunk_size=min(len(subset),RADAR_HOT_LIMIT))
        if not snaps:return False,meta
        _update_radar_quotes(subset,snaps,trigger=trigger,mode="intraday"); _patch_main_from_radar(snaps)
        RADAR_STATE.update(revision=time.time(),updated=datetime.now(TPE).isoformat(timespec="seconds"),hot_last=time.time(),last_source=meta.get("source") or "TWSE MIS",last_reason=meta.get("reason") or "",last_count=len(snaps),mode="intraday")
        return True,meta
    except Exception as e:return False,{"reason":f"強勢快速刷新失敗：{type(e).__name__}: {e}","count":0}
    finally:
        if live_acquired: live_lock.release()
        radar_lock.release()


def strong_radar_payload():
    now=time.time(); dates=sorted({str(x.get("date")) for x in _radar_rows_snapshot() if x.get("date")})
    target_date=RADAR_STATE.get("data_date") or (dates[-1] if dates else None)
    current_mode=radar_session_mode()
    display_mode="postclose" if (current_mode=="postclose" or (current_mode=="off" and RADAR_STATE.get("mode")=="postclose")) else "intraday"
    universe_keys={(x["c"],x["m"]) for x in RADAR_UNIVERSE_CACHE}
    visible=[x for x in _radar_rows_snapshot()
             if (not target_date or x.get("date")==target_date)
             and x.get("mode")==display_mode
             and (not universe_keys or (x.get("code"),x.get("market")) in universe_keys)]
    rows=[]
    for x in visible:
        if not x.get("level"): continue
        y={k:v for k,v in x.items() if not k.startswith("_")}; y["age_seconds"]=max(0,int(now-float(x.get("_ts") or 0))); rows.append(y)
    weight={"L4":4,"L3":3,"L2":2,"L1":1}
    rows.sort(key=lambda x:(-weight.get(x.get("level"),0),-(x.get("radar_score") or 0),x.get("code","")))
    counts={"L1":0,"L2":0,"L3":0,"L4":0}
    for x in rows: counts[x["level"]]+=1
    universe_count=int(RADAR_STATE.get("universe_count") or len(RADAR_UNIVERSE_CACHE) or 0)
    seen=len(visible)
    fresh_seen=sum(1 for x in visible if 0 <= now-float(x.get("_ts") or 0)<=600)
    next_count=sum(1 for x in rows if x.get("next_day_candidate"))
    return {"version":"v6.9.0","mode":display_mode,"clock_mode":current_mode,"data_date":target_date,"offline":OFFLINE,"stale":OFFLINE or target_date != calendar.expected_trade_date(),"items":rows[:350],"counts":counts,
            "coverage":seen,"fresh_10m":fresh_seen,"universe_count":universe_count,"next_day_count":next_count,
            "universe_complete":bool(RADAR_STATE.get("universe_complete")),
            "universe_status":RADAR_STATE.get("universe_status") or "尚未建立全市場清單",
            "market_counts":dict(RADAR_STATE.get("market_counts") or {}),
            "universe_source":RADAR_STATE.get("universe_source") or "",
            "rotation":dict(RADAR_STATE),"note":"盤中找正在加速；盤後以正式收盤位置重新分級並標示明日續強候選。主選股與雷達共用上市＋上櫃普通股清單；電子科技可另行篩選。所有 L1~L4 都是研究雷達，不是直接買進訊號。"}

def load_research_cache():
    if not os.path.exists(RESEARCH_CACHE):
        return None
    try:
        with open(RESEARCH_CACHE, encoding="utf-8") as f:
            j = json.load(f)
        if isinstance(j, dict) and isinstance(j.get("stocks"), list) and j.get("stocks"):
            return j
    except Exception:
        pass
    return None


def do_research_refresh():
    try:
        with research_lock:
            research_state.update(state="running", done=0, total=0, failed=0, msg="正在準備約5年回測資料…")
        stocks = load_stock_list()
        with research_lock:
            research_state["total"] = len(stocks)
        results, failed = [], 0
        with ThreadPoolExecutor(max_workers=max(2, min(WORKERS, 6))) as ex:
            futs = {ex.submit(md9.fetch_long_history, st, RESEARCH_BARS): st for st in stocks}
            for n, fu in enumerate(as_completed(futs), 1):
                try:
                    r = fu.result()
                    if r and valid_stock(r) and len(r.get("d", [])) >= 200:
                        results.append(r)
                    else:
                        failed += 1
                except Exception:
                    failed += 1
                with research_lock:
                    research_state.update(done=n, failed=failed)
        if not results:
            raise RuntimeError("長期回測資料全部下載失敗")
        results.sort(key=lambda x: (x["c"], x["m"]))
        payload = {"updated": datetime.now(TPE).strftime("%Y-%m-%d %H:%M:%S"),
                   "updated_ts": time.time(), "bars_target": RESEARCH_BARS,
                   "stocks": results, "failed": failed}
        atomic_json(RESEARCH_CACHE, payload)
        with research_lock:
            research_state.update(state="done", msg=f"長期回測資料完成：{len(results)} 檔，失敗 {failed} 檔", updated=payload["updated"])
    except Exception as e:
        with research_lock:
            research_state.update(state="error", msg=str(e))


def start_research_refresh():
    global research_thread
    with research_lock:
        if research_state["state"] == "running":
            return False
        research_state["state"] = "running"
    research_thread = threading.Thread(target=do_research_refresh, daemon=True)
    research_thread.start()
    return True


def set_state(**kw):
    with state_lock:
        state.update(kw)


def do_refresh():
    try:
        if OFFLINE and not MOCK:
            raise RuntimeError("離線模式：保留本機快取；請從啟動檔在一般Windows環境更新")
        set_state(state="running", done=0, total=0, failed=0, msg="正在建立全上市／上櫃普通股清單…")
        stocks = load_stock_list()
        with data_lock:
            previous = {(s["c"], s["m"]): s for s in DATA.get("stocks", []) if valid_stock(s)}
        latest_trade_date = _latest_known_trade_date()
        set_state(total=len(stocks), msg=f"正在抓每檔股票的日K資料…（目標資料日 {latest_trade_date}）")
        results, failures, success = [], [], 0
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(fetch_history, st, attempts=2, timeout=8, end_date=latest_trade_date, cached=previous.get((st["c"], st["m"]))): st for st in stocks}
            for n, fu in enumerate(as_completed(futs), 1):
                stock = futs[fu]
                try:
                    r = fu.result()
                    if not r or not valid_stock(r):
                        raise ValueError("無有效日K或歷史不足30根")
                    r["cached_fallback"] = False
                    results.append(r)
                    success += 1
                except Exception as e:
                    old = previous.get((stock["c"], stock["m"]))
                    failures.append({"code": stock["c"], "market": stock["m"],
                                     "name": stock["n"], "reason": str(e), "retained": bool(old)})
                    if old:
                        results.append(dict(old, cached_fallback=True))
                set_state(done=n, failed=len(failures))
        atomic_json(os.path.join(CACHE_DIR, "failed_stocks.json"), failures)
        if not success:
            raise RuntimeError("本次全部更新失敗，已保留原快取。請檢查網路、稍後再試，或切換資料來源；詳見失敗清單。")
        results.sort(key=lambda s: (s["c"], s["m"]))
        market_context = md9.fetch_market_context() if not OFFLINE and not MOCK else {"state":"unknown","recommendation_penalty":0,"indexes":[],"errors":[],"note":"離線／模擬模式"}
        # v6.4: do not immediately hammer MIS with the whole universe after a daily-history
        # refresh.  Publish the clean daily cache first; the rotating 80-symbol scheduler
        # patches today's intraday bars progressively.
        live_meta = {"ok": False, "count": 0, "source": "全市場輪詢", "reason": "日K完成；等待分批盤中輪詢"}
        payload = {"updated": datetime.now(TPE).strftime("%Y-%m-%d %H:%M:%S"),
                   "updated_ts": time.time(), "stocks": results, "performance": dict(HISTORY_STATS),
                   "universe_count": len(stocks), "universe_scope": "all", "universe": dict(ALL_UNIVERSE_STATUS), "success_count": success,
                   "failed_stocks": failures, "mock": MOCK,
                   "live_market": live_meta, "market_context": market_context, "live_revision": time.time() if live_meta.get("ok") else 0}
        atomic_json(PRICE_CACHE, payload)
        with data_lock:
            DATA.clear()
            DATA.update(payload)
        msg = "全市場 %d 檔：%d 檔日K更新，%d 檔失敗，保留 %d 檔舊資料" % (
            len(stocks), success, len(failures), sum(bool(s.get("cached_fallback")) for s in results))
        set_state(state="done", msg=msg)
        if auto_intraday_window() and md9.intraday_auto_enabled():
            # Start the first batch immediately; later batches are handled by auto_update_loop.
            try:
                refresh_rotating_market_batch(trigger="post-daily", batch_size=ROTATION_BATCH_SIZE)
                _auto_status(state="ok", last_ok=True, last_success_ts=time.time(),
                             next_due_ts=time.time()+AUTO_LIVE_REFRESH_SECONDS,
                             last_reason="日K完成後已啟動全市場分批輪詢", trigger="post-daily")
            except Exception:
                pass
    except Exception as e:
        set_state(state="error", msg=str(e))


def start_refresh():
    global refresh_thread
    with state_lock:
        if state["state"] == "running":
            return False
        state["state"] = "running"
    refresh_thread = threading.Thread(target=do_refresh, daemon=True)
    refresh_thread.start()
    return True


def last_close_ts():
    day = calendar.expected_trade_date(completed=True)
    return datetime.fromisoformat(day + "T13:35:00+08:00").timestamp()


def cache_is_stale(ts):
    return ts < last_close_ts()


# v6.4 rotates through the market instead of firing the whole universe at once.
AUTO_LIVE_REFRESH_SECONDS = 45
AUTO_LIVE_RETRY_SECONDS = 25
ROTATION_BATCH_SIZE = 80
# v6.5.1：盤中約每25秒掃120檔；盤後13:35起重新跑一輪正式收盤雷達。
RADAR_REFRESH_SECONDS = 25
RADAR_POSTCLOSE_REFRESH_SECONDS = 18
RADAR_BATCH_SIZE = 120
RADAR_HOT_REFRESH_SECONDS = 60
RADAR_HOT_LIMIT = 60

def auto_intraday_window(now=None):
    return calendar.session_mode(now) == "intraday"


def _auto_status(**kw):
    with auto_live_lock:
        auto_live_status.update(kw)

def get_auto_live_status():
    now = time.time()
    with auto_live_lock:
        out = dict(auto_live_status)
    out["now_ts"] = now
    out["market_open"] = auto_intraday_window()
    out["provider_enabled"] = md9.intraday_auto_enabled()
    out["seconds_to_next"] = max(0, int((out.get("next_due_ts") or 0) - now)) if out.get("next_due_ts") else None
    out["overdue_seconds"] = max(0, int(now - (out.get("next_due_ts") or now))) if out.get("next_due_ts") else 0
    return out

def _initial_live_due(now_ts=None):
    now_ts = now_ts or time.time()
    with data_lock:
        rev = float(DATA.get("live_revision", 0) or 0)
    with auto_live_lock:
        success = float(auto_live_status.get("last_success_ts", 0) or 0)
    base = max(rev, success, float(last_live_refresh or 0))
    # v6.4 每45秒輪詢一批；啟動時若沒有近期資料立即抓第一批。
    return now_ts if not base or now_ts - base >= AUTO_LIVE_REFRESH_SECONDS else base + AUTO_LIVE_REFRESH_SECONDS

def maybe_auto_live_refresh(trigger="scheduler", force=False):
    """單次盤中自動更新。後端排程與前端 watchdog 共用，live_lock 防止重複抓取。"""
    now = time.time()
    if not auto_intraday_window() or not md9.intraday_auto_enabled():
        _auto_status(enabled=md9.intraday_auto_enabled(), state="paused", next_due_ts=0.0,
                     last_reason="非台股正常盤或已選Yahoo日K")
        return False, "paused"
    with state_lock:
        running = state.get("state") == "running"
    if running and not force:
        _auto_status(state="waiting", next_due_ts=now + 20, last_reason="完整日K更新中，稍後重試")
        return False, "busy"
    with auto_live_lock:
        due = float(auto_live_status.get("next_due_ts", 0) or 0)
        already_updating = auto_live_status.get("state") == "updating"
    if already_updating and not force:
        return False, "busy"
    if not force and due and now + 1 < due:
        return False, "not_due"
    _auto_status(enabled=True, state="updating", last_attempt_ts=now, trigger=trigger,
                 attempts=int(auto_live_status.get("attempts", 0) or 0) + 1)
    ok, meta = refresh_rotating_market_batch(trigger=trigger, batch_size=ROTATION_BATCH_SIZE)
    with data_lock:
        meta = dict(DATA.get("rotation_market") or meta or {})
    done = time.time()
    reason = meta.get("fallback_reason") or meta.get("reason") or ""
    if ok:
        _auto_status(state="ok", last_ok=True, last_success_ts=done, next_due_ts=done + AUTO_LIVE_REFRESH_SECONDS,
                     last_reason=reason, last_source=meta.get("source", "盤中行情"), last_count=int(meta.get("count") or 0),
                     successes=int(auto_live_status.get("successes", 0) or 0) + 1)
        return True, "ok"
    _auto_status(state="retry", last_ok=False, next_due_ts=done + AUTO_LIVE_RETRY_SECONDS,
                 last_reason=reason or "盤中來源未回傳有效資料", last_source=meta.get("source", "盤中行情"),
                 last_count=int(meta.get("count") or 0))
    return False, "failed"

def auto_update_loop():
    """v6.4：每45秒輪詢約80檔，完整股票池約8–10分鐘覆蓋一輪。"""
    last_daily_try = 0
    _auto_status(enabled=md9.intraday_auto_enabled(), state="starting", next_due_ts=_initial_live_due())
    while True:
        try:
            now = time.time()
            with data_lock:
                ts = DATA.get("updated_ts", 0)
            if auto_intraday_window() and md9.intraday_auto_enabled():
                with auto_live_lock:
                    due = float(auto_live_status.get("next_due_ts", 0) or 0)
                if not due:
                    _auto_status(state="waiting", next_due_ts=_initial_live_due(now), last_reason="等待下一次盤中更新")
                    due = _initial_live_due(now)
                if now >= due:
                    maybe_auto_live_refresh("scheduler")
            else:
                _auto_status(enabled=md9.intraday_auto_enabled(), state="paused", next_due_ts=0.0,
                             last_reason="非台股正常盤或盤中來源停用")
            with state_lock:
                running = state.get("state") == "running"
            if not running and cache_is_stale(ts) and not md9.market_open() and now - last_daily_try > 600:
                last_daily_try = now
                start_refresh()
        except Exception as e:
            _auto_status(state="error", next_due_ts=time.time()+AUTO_LIVE_RETRY_SECONDS, last_ok=False,
                         last_reason=f"自動排程錯誤：{type(e).__name__}: {e}")
        time.sleep(3)




def _postclose_full_scan_worker():
    """One request processes every symbol; progress never implies valid quote coverage."""
    global radar_full_scan_thread
    missing = []
    try:
        clock_mode = radar_session_mode()
        mode = "intraday" if clock_mode == "intraday" else "postclose"
        universe = _radar_universe()
        if not RADAR_STATE.get("universe_complete") or not universe:
            raise RuntimeError(RADAR_STATE.get("universe_status") or "全市場股票池尚未完整")
        total = len(universe)
        target = calendar.expected_trade_date()
        RADAR_STATE.update(cursor=0, full_scan_done=0, full_scan_total=total,
                           full_scan_mode=mode, full_scan_quotes=0, full_scan_missing=0,
                           full_scan_error="", full_scan_phase="quotes", mode=mode,
                           postclose_complete_date=None, postclose_scan_day=None)
        deadline = time.monotonic() + 600
        cursor = 0
        while cursor < total:
            if time.monotonic() >= deadline:
                raise RuntimeError("掃描逾時；可再次按一鍵掃描，未回報完整行情")
            if radar_session_mode() != clock_mode or calendar.expected_trade_date() != target:
                raise RuntimeError("交易時段／資料日切換，請重新掃描以取得一致行情")
            ok, meta = refresh_strong_radar_batch("radar-oneclick", RADAR_BATCH_SIZE,
                                                start_index=cursor, scan_mode=mode)
            if not ok:
                reason = str((meta or {}).get("reason") or "未取得有效資料")
                if "更新中" in reason or "稍後重試" in reason:
                    time.sleep(0.25)
                    continue
                raise RuntimeError(reason)
            end = int(meta.get("end") or 0)
            if end <= cursor:
                raise RuntimeError("掃描游標未前進，已停止本次作業")
            missing.extend(meta.get("missing") or [])
            cursor = end
            RADAR_STATE.update(full_scan_done=cursor,
                               full_scan_quotes=int(RADAR_STATE.get("full_scan_quotes") or 0)+int(meta.get("accepted") or 0),
                               full_scan_missing=len(missing))
            save_strong_radar_cache()
            if cursor < total:
                time.sleep(0.12)
        if missing:
            RADAR_STATE["full_scan_error"] = f"已處理全市場；{len(missing)} 檔缺有效報價（可能停牌／無成交／來源失敗），詳見缺報價清單"
        if mode == "postclose":
            RADAR_STATE["postclose_scan_day"] = datetime.now(TPE).strftime("%Y-%m-%d")
            if not missing:
                RADAR_STATE["postclose_complete_date"] = target
            RADAR_STATE["full_scan_phase"] = "technicals"
            refresh_postclose_radar_technicals(350)
            if RADAR_STATE.get("technical_pending"):
                note=f"{RADAR_STATE['technical_pending']} 檔候選技術指標待補，請先一鍵更新全市場日K"
                RADAR_STATE["full_scan_error"]="；".join(x for x in (RADAR_STATE.get("full_scan_error"),note) if x)
        RADAR_STATE["full_scan_phase"] = "done"
    except Exception as e:
        RADAR_STATE["full_scan_error"] = f"全市場掃描未完成：{e}"
        RADAR_STATE["full_scan_phase"] = "error"
    finally:
        RADAR_STATE["full_scan_running"] = False
        RADAR_STATE["full_scan_finished"] = datetime.now(TPE).isoformat(timespec="seconds")
        try:
            atomic_json(os.path.join(CACHE_DIR, "radar_missing_quotes.json"), missing)
            save_strong_radar_cache()
        finally:
            radar_full_scan_thread = None
            radar_full_scan_lock.release()


def start_postclose_full_scan():
    """Compatibility name for the asynchronous all-session full-market action."""
    global radar_full_scan_thread
    mode = radar_session_mode()
    if mode == "closing":
        return False, {"reason":"13:30～13:35 收盤資料整理中，請於13:35後掃描"}
    if OFFLINE or MOCK:
        return False, {"reason":"離線／模擬模式；目前顯示快取，請在一般Windows環境啟動程式更新"}
    if mode == "intraday" and not md9.intraday_auto_enabled():
        return False, {"reason":"盤中來源停用；請在行情來源設定選擇自動模式"}
    if not radar_full_scan_lock.acquire(blocking=False):
        return True, {"reason":"全市場掃描已在進行中", "started":False}
    RADAR_STATE.update(full_scan_running=True, full_scan_done=0, full_scan_quotes=0,
                       full_scan_missing=0, full_scan_phase="universe",
                       full_scan_total=int(RADAR_STATE.get("universe_count") or 0), full_scan_error="",
                       full_scan_started=datetime.now(TPE).isoformat(timespec="seconds"), full_scan_finished=None)
    radar_full_scan_thread = threading.Thread(target=_postclose_full_scan_worker, daemon=True, name="radar-fullmarket-oneclick")
    radar_full_scan_thread.start()
    return True, {"reason":"已啟動一鍵全市場掃描", "started":True}


def radar_update_loop():
    """v6.5.4 all-market radar: intraday acceleration + post-close one-click final ranking."""
    next_batch=time.time()+4; next_hot=time.time()+RADAR_HOT_REFRESH_SECONDS; enrich_running=False
    while True:
        try:
            now=time.time(); mode=radar_session_mode()
            if RADAR_STATE.get("full_scan_running"):
                time.sleep(1)
                continue
            if mode=="intraday" and md9.intraday_auto_enabled():
                if now>=next_batch:
                    ok,_=refresh_strong_radar_batch("radar-scheduler",RADAR_BATCH_SIZE)
                    next_batch=time.time()+(RADAR_REFRESH_SECONDS if ok else max(15,RADAR_REFRESH_SECONDS))
                now=time.time()
                if now>=next_hot:
                    refresh_strong_radar_hot("radar-fastlane"); next_hot=time.time()+RADAR_HOT_REFRESH_SECONDS
            elif mode=="postclose":
                if RADAR_STATE.get("full_scan_running"):
                    next_batch=time.time()+5
                    next_hot=time.time()+RADAR_HOT_REFRESH_SECONDS
                    time.sleep(1)
                    continue
                today=datetime.now(TPE).strftime("%Y-%m-%d")
                complete=(RADAR_STATE.get("postclose_scan_day")==today and int(RADAR_STATE.get("cursor") or 0)==0)
                if not complete and now>=next_batch:
                    ok,meta=refresh_strong_radar_batch("radar-postclose",RADAR_BATCH_SIZE)
                    next_batch=time.time()+(RADAR_POSTCLOSE_REFRESH_SECONDS if ok else 25)
                    if ok and meta.get("wrapped"):
                        complete=True
                data_date=RADAR_STATE.get("data_date")
                if complete and data_date and RADAR_STATE.get("postclose_enriched_date")!=data_date and not enrich_running:
                    enrich_running=True
                    try: refresh_postclose_radar_technicals(100)
                    finally: enrich_running=False
                if complete: next_batch=max(next_batch,time.time()+600)
                next_hot=time.time()+RADAR_HOT_REFRESH_SECONDS
            else:
                next_batch=time.time()+20; next_hot=time.time()+RADAR_HOT_REFRESH_SECONDS
        except Exception as e:
            RADAR_STATE["last_reason"]=f"雷達排程錯誤：{type(e).__name__}: {e}"; next_batch=time.time()+20
        time.sleep(2)

def load_cache():
    _best_full_market_rows(fetch_network=False)
    if MOCK or not os.path.exists(PRICE_CACHE):
        return False
    try:
        with open(PRICE_CACHE, encoding="utf-8") as f:
            payload = json.load(f)
        with data_lock:
            if not isinstance(payload, dict) or not isinstance(payload.get("stocks"), list) or payload.get("mock"):
                return False
            payload["rejected_stocks"] = [s.get("c", "未知") for s in payload["stocks"] if not valid_stock(s)]
            payload["stocks"] = [s for s in payload["stocks"] if valid_stock(s)]
            if not payload["stocks"]:
                return False
            payload.setdefault("live_market", {"ok":False,"count":0,"source":"快取"})
            payload.setdefault("market_context", {"state":"unknown","recommendation_penalty":0,"indexes":[],"errors":[],"note":"快取未含市場濾網"})
            payload.setdefault("live_revision", 0)
            DATA.update(payload)
            global last_live_refresh
            last_live_refresh = float(payload.get("live_revision", 0) or 0)
        return True
    except Exception:  # noqa
        return False



def load_all_stock_list(require_complete=False):
    """All TWSE + TPEx common four-digit companies, independent from the core screener.

    v6.5.3 keeps separate last-known-good TWSE and TPEx caches.  The strong radar calls this
    with require_complete=True; the single-stock analyzer may use the best available partial
    universe but it is never mislabeled as a complete all-market radar universe.
    """
    fresh = all(os.path.exists(_market_cache_path(m))
                and time.time() - os.path.getmtime(_market_cache_path(m)) < 86400
                for m in ("TW", "TWO"))
    if OFFLINE or MOCK or fresh:
        rows, meta = _best_full_market_rows(fetch_network=False)
    else:
        rows, meta = _best_full_market_rows(fetch_network=True)
    if require_complete and not meta.get("complete"):
        raise RuntimeError(meta.get("status") or "全市場清單不完整")
    if rows:
        return rows
    # Analyzer-only last resort: core metadata is still useful for direct code lookup.
    if not require_complete:
        with data_lock:
            existing = [{"c":x["c"],"n":x.get("n",x["c"]),"m":x["m"],"i":x.get("i","其他")}
                        for x in DATA.get("stocks", [])]
        if existing:
            return existing
    raise RuntimeError(meta.get("status") or "股票名稱清單暫時無法取得")

def _live_quote_for(code, market):
    for q in LIVE_PATCH.get("quotes", []):
        if str(q.get("c")) == str(code) and str(q.get("m")) == str(market):
            return q
    return None


def _merge_single_live(stock, quote):
    x = dict(stock)
    for k in ("d","o","h","l","cl","v"):
        x[k] = list(stock.get(k) or [])
    if not quote or not quote.get("d"):
        return x
    d = calendar.normalize_trade_date(quote["d"])
    if not d or d > calendar.taipei_now().date().isoformat() or (x["d"] and d < x["d"][-1]): return x
    try:
        o,h,l,c,v = float(quote["o"]),float(quote["h"]),float(quote["l"]),float(quote["cl"]),int(quote.get("v") or 0)
    except (TypeError,ValueError):
        return x
    if not all(math.isfinite(z) and z > 0 for z in (o,h,l,c)) or v < 0:
        return x
    row=(round(o,2),round(max(h,o,c),2),round(min(l,o,c),2),round(c,2),max(0,v))
    if x["d"] and x["d"][-1] == d:
        i=len(x["d"])-1;x["o"][i],x["h"][i],x["l"][i],x["cl"][i],x["v"][i]=row
    elif not x["d"] or d > x["d"][-1]:
        x["d"].append(d);x["o"].append(row[0]);x["h"].append(row[1]);x["l"].append(row[2]);x["cl"].append(row[3]);x["v"].append(row[4])
    x["live_source"] = quote.get("source") or "盤中快照"
    x["live_time"] = quote.get("time")
    x["live_fetched_at"] = quote.get("fetched_at") or datetime.now(TPE).isoformat(timespec="seconds")
    x["live_quote_at"] = calendar.quote_datetime(d, quote.get("time"))
    return x


def single_stock_payload(query, force_refresh=True):
    """Single-stock analyzer: all TWSE/TPEx common stocks, with fresh data on every request.

    Main screener may remain technology-focused, but this endpoint deliberately does not
    use that industry filter.  A fresh Yahoo daily series is attempted first; during market
    hours, a configured Fugle key can additionally refresh the current bar.  Cached data is
    only a fallback when the network/provider fails.
    """
    q = str(query or "").strip()
    if not q:
        return 400, {"error":"請輸入股票名稱或代號"}
    base_q = q.upper()
    forced_market = None
    if base_q.endswith(".TW"):
        base_q=base_q[:-3];forced_market="TW"
    elif base_q.endswith(".TWO"):
        base_q=base_q[:-4];forced_market="TWO"

    with data_lock:
        existing=list(DATA.get("stocks",[]))
    existing_exact=[s for s in existing if s.get("c")==base_q or str(s.get("n","")).lower()==q.lower()]
    if forced_market:
        existing_exact=[s for s in existing_exact if s.get("m")==forced_market]

    # Metadata lookup is all-industry.  For a stock already present in the main cache we can
    # reuse only its identity/market metadata, but price history is still re-fetched below.
    exact_meta=[]
    if len(existing_exact)==1:
        x=existing_exact[0]
        exact_meta=[{"c":x["c"],"n":x.get("n",x["c"]),"m":x["m"],"i":x.get("i","其他")}]
    elif len(base_q)==4 and base_q.isdigit():
        # R10.10: exact 4-digit codes bypass the remote all-market company list entirely.
        # This prevents a first-time non-electronics lookup from waiting on TWSE/TPEx list
        # endpoints before price data can even be requested.  Try the explicit suffix if
        # supplied; otherwise probe TW first, then TWO.
        markets=(forced_market,) if forced_market else ("TW","TWO")
        exact_meta=[{"c":base_q,"n":base_q,"m":m,"i":"其他"} for m in markets]
    else:
        universe=[]
        try:
            universe=load_all_stock_list()
        except Exception:
            universe=[{"c":x["c"],"n":x.get("n",x["c"]),"m":x["m"],"i":x.get("i","其他")} for x in existing]
        if forced_market:
            universe=[x for x in universe if x.get("m")==forced_market]
        exact_meta=[x for x in universe if x.get("c")==base_q or str(x.get("n","")).lower()==q.lower()]
        if not exact_meta:
            fuzzy=[x for x in universe if base_q.lower() in str(x.get("c","")).lower() or q.lower() in str(x.get("n","")).lower()]
            if len(fuzzy)>1:
                return 200,{"matches":fuzzy[:20],"source":"全部上市／上櫃股票清單"}
            exact_meta=fuzzy
        if len(exact_meta)>1:
            return 200,{"matches":exact_meta[:20],"source":"全部上市／上櫃股票清單"}
    if not exact_meta:
        return 404,{"error":"查無符合的上市／上櫃股票（個股分析不限電子股）"}

    last_error=None
    recent_trade_date = _latest_known_trade_date()
    for meta in exact_meta:
        key=(meta["c"],meta["m"])
        cached=None
        with single_cache_lock:
            cached=SINGLE_CACHE.get(key)
        # Also allow the main cache as a fallback snapshot, but never as the first choice.
        main_cached=next((x for x in existing if x.get("c")==meta["c"] and x.get("m")==meta["m"]),None)
        stock=None
        fresh_history=False
        if force_refresh and not OFFLINE:
            try:
                stock=fetch_history(meta, attempts=2, timeout=8, end_date=recent_trade_date, cached=cached or main_cached)
                fresh_history=bool(stock)
                if stock:
                    with single_cache_lock:SINGLE_CACHE[key]=stock
            except Exception as e:
                last_error=e
        if not stock:
            stock=cached or main_cached
        if not stock and not force_refresh and not OFFLINE:
            try:
                stock=fetch_history(meta, end_date=recent_trade_date)
                fresh_history=bool(stock)
                if stock:
                    with single_cache_lock:SINGLE_CACHE[key]=stock
            except Exception as e:
                last_error=e
        if not stock:
            continue

        live_source=None
        # R10.12: single-stock analysis uses Fugle's per-symbol Intraday Quote first.
        # This avoids requiring the Developer/Advanced whole-market Snapshot entitlement.
        if not OFFLINE and md9.market_open() and md9.intraday_auto_enabled():
            try:
                quote, info = md9.fetch_best_single_quote(meta["c"], meta["m"])
                if quote:
                    stock = _merge_single_live(stock, {
                        "d": quote.get("date"), "o": quote.get("o"), "h": quote.get("h"),
                        "l": quote.get("l"), "cl": quote.get("c"), "v": quote.get("v"),
                        "time": quote.get("time"), "source": quote.get("source")})
                    live_source = stock.get("live_source") or info.get("source")
            except Exception as e:
                last_error = last_error or e
        if not live_source and not OFFLINE:
            quote=_live_quote_for(meta["c"],meta["m"])
            if quote and quote.get("d") == calendar.expected_trade_date() and time.time()-float(quote.get("_ts") or 0) <= 900:
                stock=_merge_single_live(stock,quote)
            live_source=stock.get("live_source")

        source_parts=[]
        if fresh_history:
            source_parts.append(("近期已驗證快取 · Yahoo 日K %s" if stock.get("history_cache_reused") else "Yahoo 來源日K %s") % stock.get("d", ["—"])[-1])
        else:
            source_parts.append("離線模式，使用本機歷史快取" if OFFLINE else "網路更新失敗，使用本機快取")
        if live_source:
            source_parts.append(live_source)
        return 200,{"stock":stock,
                    "source":"＋".join(source_parts),
                    "refreshed_at":stock.get("history_fetched_at") or stock.get("fetched_at"),
                    "response_at":datetime.now(TPE).isoformat(timespec="seconds"),
                    "fresh":bool(fresh_history and stock["d"][-1] == recent_trade_date),
                    "provisional":calendar.session_mode() in ("intraday","closing") and stock["d"][-1] == calendar.taipei_now().date().isoformat(),
                    "calendar": calendar.calendar_info(),
                    "cache_reused": bool(stock.get("history_cache_reused")),
                    "latest_trade_date":stock.get("d", [None])[-1] if stock.get("d") else recent_trade_date,
                    "requested_trade_date":recent_trade_date,
                    "all_industries":True,
                    "stale_fallback":not fresh_history or stock["d"][-1] < recent_trade_date}
    return 502,{"error":"查無可分析的最近交易日資料："+str(last_error or "無資料"),
                "requested_trade_date":recent_trade_date}

# ---------------------------------------------------------------- 測試用假資料
def mock_list():
    inds = list(INDUSTRIES.values())
    return [{"c": str(2300 + k), "n": "測試%d" % k, "m": "TW" if k % 2 else "TWO",
             "i": inds[k % len(inds)]} for k in range(120)]


def mock_history(stock):
    rnd = random.Random(int(stock["c"]))
    n, kind = KEEP_BARS, int(stock["c"]) % 4
    p = rnd.uniform(40, 400)
    day = datetime(2026, 9, 18)
    days = []
    while len(days) < n:
        if day.weekday() < 5:
            days.append(day.strftime("%Y-%m-%d"))
        day -= timedelta(days=1)
    days.reverse()
    o, h, l, c, v = [], [], [], [], []
    for k in range(n):
        left = n - 1 - k
        vol, drift, volu = 0.022, 0.0, rnd.uniform(800, 6000)
        if kind in (0, 1) and left < 22:
            vol = 0.004                      # 收斂
        if kind == 0 and left < 2:
            vol, drift, volu = 0.006, 0.03, volu * 3   # 剛突破
        if kind == 1 and left < 9 and left >= 0 and left < 9:
            if left < 8:
                vol, drift, volu = 0.008, 0.022, volu * 2  # 已漲一段
        op = p
        p = max(5, p * (1 + drift + rnd.gauss(0, vol)))
        hi, lo = max(op, p) * (1 + abs(rnd.gauss(0, vol / 2))), min(op, p) * (1 - abs(rnd.gauss(0, vol / 2)))
        o.append(round(op, 2)); h.append(round(hi, 2)); l.append(round(lo, 2))
        c.append(round(p, 2)); v.append(int(volu))
    out = dict(stock)
    out.update({"d": days, "o": o, "h": h, "l": l, "cl": c, "v": v})
    time.sleep(0.005)
    return out


# ---------------------------------------------------------------- 追蹤驗證快照
tracking_validation_lock = threading.Lock()


def _valid_trade_date(value):
    if not isinstance(value, str) or len(value) != 10:
        return False
    try:
        return calendar.normalize_trade_date(value) == value and value <= calendar.taipei_now().date().isoformat() and calendar.is_trading_day(value)
    except ValueError:
        return False


def load_tracking_validation_store():
    """Read the durable recommendation snapshots used by the next-session validator."""
    try:
        with open(TRACKING_VALIDATION_CACHE, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict) and isinstance(payload.get("snapshots"), dict):
            return payload
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return {"version": 1, "snapshots": {}}


def tracking_validation_view(current_date=None):
    with tracking_validation_lock:
        store = load_tracking_validation_store()
    snapshots = store.get("snapshots", {})
    dates = sorted(d for d in snapshots if _valid_trade_date(d))
    current = snapshots.get(current_date) if current_date else None
    previous = None
    if current_date and _valid_trade_date(current_date):
        older = [d for d in dates if d < current_date]
        if older:
            previous = snapshots.get(older[-1])
    elif dates:
        previous = snapshots.get(dates[-1])
    return {
        "version": 1,
        "current_date": current_date,
        "current": current,
        "previous": previous,
        "dates": dates[-30:],
    }


def save_tracking_validation_snapshot(body):
    """Persist one data-date's priority-research list. Keep enough history for validation."""
    if not isinstance(body, dict):
        raise ValueError("追蹤快照格式錯誤")
    date = body.get("date")
    if not _valid_trade_date(date):
        raise ValueError("追蹤快照缺少有效資料日")
    items = body.get("items")
    if not isinstance(items, list):
        raise ValueError("追蹤快照缺少股票清單")
    cleaned = []
    for raw in items[:20]:
        if not isinstance(raw, dict):
            continue
        code = str(raw.get("code") or "").strip()[:16]
        if not code:
            continue
        price = raw.get("price")
        try:
            price = round(float(price), 4) if price is not None else None
        except (TypeError, ValueError):
            price = None
        try:
            score = int(round(float(raw.get("score")))) if raw.get("score") is not None else None
        except (TypeError, ValueError):
            score = None
        reasons = raw.get("reasons") if isinstance(raw.get("reasons"), list) else []
        risks = raw.get("risks") if isinstance(raw.get("risks"), list) else []
        cleaned.append({
            "rank": len(cleaned) + 1,
            "code": code,
            "name": str(raw.get("name") or code)[:40],
            "market": str(raw.get("market") or "")[:12],
            "group": str(raw.get("group") or "")[:12],
            "group_label": str(raw.get("group_label") or "")[:40],
            "score": score,
            "price": price,
            "signal_date": str(raw.get("signal_date") or "")[:16],
            "tier": str(raw.get("tier") or "")[:16],
            "macd": str(raw.get("macd") or "")[:40],
            "reasons": [str(x)[:160] for x in reasons[:4]],
            "risks": [str(x)[:160] for x in risks[:4]],
        })
    snapshot = {
        "date": date,
        "saved_at": datetime.now(TPE).isoformat(timespec="seconds"),
        "mode": str(body.get("mode") or "auto")[:24],
        "items": cleaned,
    }
    with tracking_validation_lock:
        store = load_tracking_validation_store()
        snapshots = store.setdefault("snapshots", {})
        snapshots[date] = snapshot
        # Keep the last 90 distinct data dates; enough for several months without unbounded growth.
        for old in sorted(snapshots)[:-90]:
            snapshots.pop(old, None)
        atomic_json(TRACKING_VALIDATION_CACHE, store)
    view = tracking_validation_view(date)
    view["ok"] = True
    view["saved"] = snapshot
    return view


# ---------------------------------------------------------------- HTTP
class AppServer(ThreadingHTTPServer):
    request_queue_size = 64
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(15)
        super().setup()

    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
        if isinstance(body, str):
            body = body.encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError):
            # 分頁關閉、休眠或取消請求，不影響更新工作及其他連線。
            pass

    def _read_json(self, max_bytes=16384):
        try:
            n = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            n = 0
        if n < 0 or n > max_bytes:
            raise ValueError("請求內容過大")
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw.decode("utf-8")) if raw else {}

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            with open(INDEX_HTML, "rb") as f:
                self._send(200, f.read(), "text/html; charset=utf-8")
        elif path in ('/research.js', '/backtest.js', '/portable_settings.js', '/selection_rules.js', '/desktop_selection.js', '/strong_radar.js', '/single_stock_core.js', '/single_stock_analyzer.js', '/stock_report.js', '/elegant_ui.js', '/elegant.css', '/boutique.css', '/pastel_atelier.css', '/midnight_champagne.css', '/starry_korean.css', '/starry_sapphire.css', '/precision_guide.js'):
            name = path[1:]
            mime = 'text/css; charset=utf-8' if name.endswith('.css') else 'text/javascript; charset=utf-8'
            with open(os.path.join(os.path.dirname(__file__), name), 'rb') as asset:
                self._send(200, asset.read(), mime)
        elif path == "/assets/starry-sky.jpg":
            with open(os.path.join(os.path.dirname(__file__), "assets", "starry-sky.jpg"), "rb") as asset:
                self._send(200, asset.read(), "image/jpeg")
        elif path == "/api/status":
            with state_lock:
                s = dict(state)
            with data_lock:
                s["updated"] = DATA.get("updated")
                s["count"] = len(DATA.get("stocks", []))
                s["updated_ts"] = DATA.get("updated_ts", 0)
                s["live_revision"] = DATA.get("live_revision", 0)
                s["quality"] = data_quality(DATA)
            s["auto_live"] = get_auto_live_status()
            self._send(200, s)
        elif path == "/api/data":
            with data_lock:
                payload = dict(DATA)
                payload["quality"] = data_quality(DATA)
            self._send(200, payload)
        elif path == "/api/failures":
            try:
                with open(os.path.join(CACHE_DIR, "failed_stocks.json"), encoding="utf-8") as f:
                    self._send(200, json.load(f))
            except FileNotFoundError:
                self._send(200, [])
        elif path == "/api/live_patch":
            self._send(200, LIVE_PATCH)
        elif path == "/api/strong_radar":
            self._send(200, strong_radar_payload())
        elif path == "/api/radar_failures":
            self._send(200, _read_json_list(os.path.join(CACHE_DIR, "radar_missing_quotes.json")))
        elif path == "/api/marketdata_config":
            self._send(200, md9.public_settings())
        elif path == "/api/research_status":
            with research_lock:
                st = dict(research_state)
            cached = load_research_cache()
            st["available"] = bool(cached and cached.get("stocks"))
            st["stock_count"] = len(cached.get("stocks", [])) if cached else 0
            st["updated"] = cached.get("updated") if cached else st.get("updated")
            self._send(200, st)
        elif path == "/api/research_data":
            cached = load_research_cache()
            if cached:
                self._send(200, cached)
            else:
                self._send(404, {"error": "尚未準備長期回測資料"})
        elif path == "/api/tracking_validation":
            try:
                params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                current_date = params.get("date", [None])[0]
                self._send(200, tracking_validation_view(current_date))
            except Exception as e:
                self._send(500, {"error": "追蹤驗證資料讀取失敗：" + str(e)})
        elif path == "/api/single_stock":
            try:
                params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                query = params.get("q", [""])[0]
                force_refresh = params.get("refresh", ["1"])[0] != "0"
                code, payload = single_stock_payload(query, force_refresh=force_refresh)
                self._send(code, payload)
            except Exception as e:
                self._send(500, {"error": "單股分析資料失敗：" + str(e)})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if host != "127.0.0.1:%d" % self.server.server_address[1] or (origin and origin != "http://" + host) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self._send(403, {"error": "僅接受本機工具頁面操作"})
            return
        path = self.path.split("?")[0]
        if path == "/api/refresh":
            self._send(200, {"started": start_refresh()})
        elif path == "/api/live_refresh":
            ok, _manual_meta = refresh_rotating_market_batch(trigger="manual", batch_size=ROTATION_BATCH_SIZE)
            now = time.time()
            with data_lock:
                live_meta = dict(DATA.get("live_market") or {})
                q = data_quality(DATA)
            if ok:
                _auto_status(state="ok", last_ok=True, last_attempt_ts=now, last_success_ts=now,
                             next_due_ts=now + AUTO_LIVE_REFRESH_SECONDS, trigger="manual",
                             last_reason=live_meta.get("fallback_reason") or live_meta.get("reason") or "",
                             last_source=live_meta.get("source", "盤中行情"), last_count=int(live_meta.get("count") or 0))
            self._send(200, {"ok": ok, "quality": q, "live_market": live_meta,
                             "auto_live": get_auto_live_status(),
                             "reason": live_meta.get("reason") or live_meta.get("fallback_reason") or ""})
        elif path == "/api/live_watchdog":
            ok, why = maybe_auto_live_refresh(trigger="ui-watchdog", force=False)
            with data_lock:
                live_meta = dict(DATA.get("live_market") or {})
                q = data_quality(DATA)
            self._send(200, {"ok": ok, "watchdog": why, "quality": q, "live_market": live_meta,
                             "auto_live": get_auto_live_status()})
        elif path == "/api/priority_refresh":
            try:
                body = self._read_json(max_bytes=8192)
                ok, meta = refresh_priority_market(body.get("codes") if isinstance(body, dict) else [])
                self._send(200, {"ok": ok, "meta": meta, "live_revision": DATA.get("live_revision", 0)})
            except Exception as e:
                self._send(400, {"ok": False, "error": str(e)})
        elif path == "/api/radar_refresh":
            try:
                ok,meta=start_postclose_full_scan()
                self._send(200,{"ok":bool(ok),"meta":meta,"radar":strong_radar_payload()})
            except Exception as e:
                self._send(400,{"ok":False,"error":str(e)})
        elif path == "/api/marketdata_config":
            try:
                cfg = md9.save_settings(self._read_json())
                self._send(200, {"ok": True, "config": cfg})
            except Exception as e:
                self._send(400, {"ok": False, "error": str(e)})
        elif path == "/api/tracking_validation":
            try:
                body = self._read_json(max_bytes=131072)
                self._send(200, save_tracking_validation_snapshot(body))
            except Exception as e:
                self._send(400, {"ok": False, "error": "追蹤快照儲存失敗：" + str(e)})
        elif path == "/api/research_refresh":
            self._send(200, {"started": start_research_refresh()})
        elif path == "/api/quit":
            self._send(200, {"ok": True})
            threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start()
        else:
            self._send(404, {"error": "not found"})


def update_only():
    """給 Windows 工作排程器用：只更新資料、不開畫面"""
    has_cache = load_cache()
    if has_cache and not cache_is_stale(DATA.get("updated_ts", 0)):
        print("資料已經是最新的，不需要更新。")
        return
    print("開始更新資料…")
    with state_lock:
        state["state"] = "running"
    t = threading.Thread(target=do_refresh, daemon=True)
    t.start()
    while t.is_alive():
        t.join(5)
        with state_lock:
            print("  %s %d / %d" % (state["msg"], state["done"], state["total"]))
    with state_lock:
        print(state["msg"])
    try:
        with open(os.path.join(CACHE_DIR, "auto_update_log.txt"), "a", encoding="utf-8") as f:
            f.write("%s  %s\n" % (datetime.now(TPE).strftime("%Y-%m-%d %H:%M"), state["msg"]))
    except Exception:  # noqa
        pass


def main():
    if "--update-only" in sys.argv:
        update_only()
        if state["state"] == "error":
            sys.exit(1)
        return
    no_browser = "--no-browser" in sys.argv
    has_cache = load_cache()
    load_strong_radar_cache()
    if OFFLINE and not MOCK:
        set_state(msg="離線檢視本機快取")
    elif not has_cache or cache_is_stale(DATA.get("updated_ts", 0)):
        start_refresh()

    server = None
    for port in range(8765, 8790):
        try:
            server = AppServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        print("找不到可用的連接埠，請關掉其他已開啟的布林選股視窗再試一次。")
        input("按 Enter 結束…")
        return
    if not OFFLINE:
        threading.Thread(target=auto_update_loop, daemon=True).start()
        threading.Thread(target=radar_update_loop, daemon=True).start()
    url = "http://127.0.0.1:%d/" % server.server_address[1]
    print("=" * 56)
    print("  布林選股工具 已啟動")
    print("  瀏覽器介面： " + url)
    print("  使用期間請不要關閉這個黑色視窗（關掉它 = 關閉工具）")
    print("=" * 56)
    if not no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
