# -*- coding: utf-8 -*-
"""R9 market-data helpers.

- Historical/chart data: Yahoo Finance remains the cache-friendly source.
- Intraday whole-market snapshots: Fugle MarketData v1.0 when an API key is configured.
  Fugle documents snapshot quotes as 5-second updates sourced from TWSE/TPEx.
- The API key is stored only in a local JSON file beside the app and is never returned to the UI.
"""
from __future__ import annotations
import json
import math
import os
import ssl
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import market_calendar as calendar
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
ROOT = APP_DIR.parent
SETTINGS_FILE = ROOT / "marketdata_settings.json"
TPE = timezone(timedelta(hours=8))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


@lru_cache(maxsize=2)
def _ctx(relaxed=False):
    ctx = ssl.create_default_context()
    if relaxed and hasattr(ssl, "VERIFY_X509_STRICT"):
        ctx.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return ctx


def http_json(url, timeout=15, headers=None):
    if os.environ.get("CODEX_SANDBOX_NETWORK_DISABLED") == "1":
        raise RuntimeError("Codex shell 網路受限：使用離線快取")
    hd = {"User-Agent": UA, "Accept": "application/json,*/*", "Connection": "close"}
    if headers:
        hd.update(headers)
    req = urllib.request.Request(url, headers=hd)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as r:
            return json.loads(r.read().decode("utf-8-sig"))
    except urllib.error.URLError as e:
        if isinstance(getattr(e, "reason", None), ssl.SSLError):
            with urllib.request.urlopen(req, timeout=timeout, context=_ctx(True)) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        raise


def atomic_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def load_settings():
    data = {"provider": "auto", "fugle_api_key": ""}
    try:
        if SETTINGS_FILE.exists():
            obj = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if isinstance(obj, dict):
                data.update({k: obj.get(k, data.get(k)) for k in data})
    except Exception:
        pass
    env_key = os.environ.get("FUGLE_API_KEY", "").strip()
    if env_key:
        data["fugle_api_key"] = env_key
    if data.get("provider") not in ("auto", "fugle", "yahoo"):
        data["provider"] = "auto"
    return data


def public_settings():
    s = load_settings()
    return {
        "provider": s.get("provider", "auto"),
        "has_fugle_key": bool((s.get("fugle_api_key") or "").strip()),
        "fugle_key_mask": "••••••••" if (s.get("fugle_api_key") or "").strip() else "",
        "fugle_snapshot_frequency": "約5秒（供應商文件）",
        "app_auto_refresh_minutes": 0.75,
        "app_auto_refresh_seconds": 45,
        "app_rotation_batch_size": 80,
        "app_rotation_cycle_estimate": "約8–10分鐘完成原策略股票池一輪（依股票數與來源回應）",
        "strong_radar_refresh_seconds": 25,
        "strong_radar_batch_size": 120,
        "strong_radar_hot_refresh_seconds": 60,
        "strong_radar_note": "v6.5 全上市櫃分批掃描；L1～L4 強勢股另走快速刷新，但不等於買點。",
        "app_auto_refresh_window": "09:00-13:30 Asia/Taipei",
        "fallback_intraday_source": "TWSE MIS",
        "fugle_snapshot_plan_note": "Fugle 全市場 Snapshot Quotes 僅開發者／進階方案；若不可用，自動模式改用 TWSE MIS。",
    }


def save_settings(obj):
    old = load_settings()
    provider = str(obj.get("provider", old.get("provider", "auto"))).strip().lower()
    if provider not in ("auto", "fugle", "yahoo"):
        raise ValueError("行情來源必須是 auto / fugle / yahoo")
    key = obj.get("fugle_api_key", None)
    if key is None or str(key).strip() == "••••••••":
        key = old.get("fugle_api_key", "")
    else:
        key = str(key).strip()
    if obj.get("clear_fugle_key"):
        key = ""
    payload = {"provider": provider, "fugle_api_key": key}
    atomic_json(SETTINGS_FILE, payload)
    return public_settings()


def market_open(now=None):
    return calendar.session_mode(now) == "intraday"


def fugle_enabled():
    s = load_settings()
    return s.get("provider") in ("auto", "fugle") and bool((s.get("fugle_api_key") or "").strip())


def _fugle(path, params=None):
    s = load_settings()
    key = (s.get("fugle_api_key") or "").strip()
    if not key:
        raise RuntimeError("尚未設定 Fugle API Key")
    url = "https://api.fugle.tw/marketdata/v1.0/stock/" + path.lstrip("/")
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return http_json(url, timeout=12, headers={"X-API-KEY": key})



def intraday_auto_enabled():
    """Whether the app should attempt an intraday refresh.

    Auto/Fugle modes may fall back to TWSE MIS, so a Fugle key is no longer required.
    Yahoo-only mode intentionally disables intraday patching.
    """
    return load_settings().get("provider", "auto") != "yahoo"


def _num(value):
    if value is None:
        return None
    try:
        text = str(value).strip().replace(",", "")
        if not text or text in ("-", "--", "---"):
            return None
        x = float(text)
        return x if math.isfinite(x) else None
    except Exception:
        return None


def _fmt_epoch_time(value):
    try:
        x = float(value)
        # Fugle uses microseconds in documented quote examples.
        if x > 1e14:
            x /= 1_000_000.0
        elif x > 1e11:
            x /= 1000.0
        return datetime.fromtimestamp(x, TPE).strftime("%H%M%S")
    except Exception:
        return ""


def fetch_fugle_quote(symbol):
    """Fetch one symbol through Fugle intraday quote.

    This endpoint is useful even when the account cannot use whole-market Snapshot Quotes.
    Returns a normalized quote and metadata.
    """
    if not fugle_enabled():
        return None, {"ok": False, "source": "Fugle 個股即時", "reason": "未設定 Fugle API Key"}
    try:
        j = _fugle(f"intraday/quote/{urllib.parse.quote(str(symbol))}")
        o, h, l = _num(j.get("openPrice")), _num(j.get("highPrice")), _num(j.get("lowPrice"))
        c = _num(j.get("lastPrice")) or _num(j.get("closePrice"))
        total = j.get("total") if isinstance(j.get("total"), dict) else {}
        v = _num(total.get("tradeVolume")) or 0
        if not all(x is not None and x > 0 for x in (o, h, l, c)):
            return None, {"ok": False, "source": "Fugle 個股即時", "reason": "回傳資料尚無完整 OHLC"}
        m = "TW" if str(j.get("market") or "").upper() in ("TSE", "TWSE") else "TWO"
        q = {
            "date": str(j.get("date") or ""),
            "time": _fmt_epoch_time(j.get("lastUpdated") or total.get("time")),
            "o": float(o), "h": max(float(h), float(o), float(c)),
            "l": min(float(l), float(o), float(c)), "c": float(c),
            "v": max(0, int(round(v))), "source": "Fugle 個股即時",
            "market": m, "symbol": str(j.get("symbol") or symbol),
        }
        return q, {"ok": True, "source": q["source"], "count": 1, "date": q["date"], "time": q["time"]}
    except urllib.error.HTTPError as e:
        reason = f"HTTP {e.code}"
        if e.code in (401, 403):
            reason += "（API Key／方案權限不足）"
        elif e.code == 429:
            reason += "（API 呼叫次數已達上限）"
        return None, {"ok": False, "source": "Fugle 個股即時", "reason": reason}
    except Exception as e:
        return None, {"ok": False, "source": "Fugle 個股即時", "reason": f"{type(e).__name__}: {e}"}


def fetch_twse_mis_snapshots(stocks, chunk_size=80):
    """Best-effort intraday fallback from TWSE Market Information System.

    The public MIS covers both TWSE and TPEx symbols.  Requests are chunked so the local
    app does not issue hundreds of individual quote calls every ten minutes.
    """
    if not stocks:
        return {}, {"ok": False, "source": "TWSE MIS", "reason": "股票清單為空", "count": 0}
    out, errors = {}, []
    wanted = {(str(s.get("c")), str(s.get("m"))): s for s in stocks if str(s.get("c", "")).isdigit()}
    pairs = list(wanted)
    latest_date, latest_time = None, None
    for start in range(0, len(pairs), max(1, int(chunk_size))):
        chunk = pairs[start:start+max(1, int(chunk_size))]
        ex_ch = "|".join(("tse_" if market == "TW" else "otc_") + code + ".tw" for code, market in chunk)
        params = urllib.parse.urlencode({"ex_ch": ex_ch, "json": "1", "delay": "0", "_": str(int(time.time()*1000))})
        url = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?" + params
        j = None
        last_err = None
        # MIS 對連續大量請求偶爾會限流；每批最多重試一次並稍作節流，避免只拿到第一批約80檔。
        for attempt in range(2):
            try:
                j = http_json(url, timeout=8, headers={
                    "Referer": "https://mis.twse.com.tw/stock/index.jsp",
                    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
                })
                break
            except Exception as e:
                last_err = e
                if attempt == 0:
                    time.sleep(0.45)
        try:
            if j is None:
                raise last_err or RuntimeError("MIS 無回應")
            rows = j.get("msgArray") if isinstance(j, dict) else None
            if not isinstance(rows, list):
                raise ValueError("MIS 未回傳 msgArray")
            for q in rows:
                code = str(q.get("c") or str(q.get("ch") or "").split(".")[0]).strip()
                ex = str(q.get("ex") or "").lower()
                market = "TW" if ex in ("tse", "twse") else "TWO" if ex in ("otc", "tpex") else None
                if market is None:
                    hits = [m for c, m in chunk if c == code]
                    market = hits[0] if len(hits) == 1 else None
                if not market or (code, market) not in wanted:
                    continue
                d0 = str(q.get("d") or "").strip()
                if len(d0) == 8 and d0.isdigit():
                    d = f"{d0[:4]}-{d0[4:6]}-{d0[6:8]}"
                else:
                    d = d0
                d = calendar.normalize_trade_date(d)
                t = str(q.get("t") or "").replace(":", "")
                o, h, l = _num(q.get("o")), _num(q.get("h")), _num(q.get("l"))
                c = _num(q.get("z")) or _num(q.get("pz"))
                v = _num(q.get("v")) or 0
                # MIS 另外提供昨收與當日漲跌停價。v6.5 強勢雷達直接用這些欄位
                # 計算全市場盤中漲幅，不必先為每一檔下載完整歷史日K。
                prev = _num(q.get("y"))
                limit_up = _num(q.get("u"))
                limit_down = _num(q.get("w"))
                if not d or d > calendar.taipei_now().date().isoformat() or not all(x is not None and x > 0 for x in (o, h, l, c)):
                    continue
                out[(code, market)] = {
                    "date": d, "time": t, "o": float(o),
                    "h": max(float(h), float(o), float(c)),
                    "l": min(float(l), float(o), float(c)), "c": float(c),
                    "v": max(0, int(round(v))), "source": "TWSE MIS 盤中快照",
                    "prev": float(prev) if prev and prev > 0 else None,
                    "limit_up": float(limit_up) if limit_up and limit_up > 0 else None,
                    "limit_down": float(limit_down) if limit_down and limit_down > 0 else None,
                }
                if not latest_date or d >= latest_date:
                    latest_date, latest_time = d, t
        except Exception as e:
            errors.append(f"chunk{start//max(1,int(chunk_size))+1}:{type(e).__name__}:{e}")
        # 避免MIS把後續批次視為過密請求。
        if start + max(1, int(chunk_size)) < len(pairs):
            time.sleep(0.12)
    return out, {
        "ok": bool(out), "source": "TWSE MIS 盤中快照", "count": len(out),
        "date": latest_date, "time": latest_time, "errors": errors,
        "reason": "" if out else ("；".join(errors[-3:]) or "MIS 無可用盤中資料"),
    }


def fetch_best_intraday_snapshots(stocks):
    """Whole-universe refresh with graceful provider fallback.

    If Fugle returns only one market (for example a transient OTC failure), TWSE MIS is
    queried only for the missing symbols and the two sources are merged.
    """
    settings = load_settings()
    provider = settings.get("provider", "auto")
    if provider == "yahoo":
        return {}, {"ok": False, "source": "Yahoo日K", "reason": "已選 Yahoo 日K；盤中快照停用", "count": 0}
    attempts = []
    fugle_snaps = {}
    fugle_meta = {}
    if fugle_enabled():
        fugle_snaps, fugle_meta = fetch_fugle_snapshots()
        if not fugle_snaps:
            attempts.append(fugle_meta.get("reason") or "；".join(fugle_meta.get("errors") or []) or "Fugle Snapshot 無資料")
    elif provider == "fugle":
        attempts.append("未設定 Fugle API Key")

    wanted = {(str(s.get("c")), str(s.get("m"))) for s in stocks}
    missing = [s for s in stocks if (str(s.get("c")), str(s.get("m"))) not in fugle_snaps]
    # A complete Fugle response needs no fallback.
    if fugle_snaps and not missing:
        meta = dict(fugle_meta)
        meta["provider_chain"] = ["Fugle Snapshot"]
        meta["count"] = len(fugle_snaps)
        return fugle_snaps, meta

    # Snapshot Quotes is restricted to Fugle Developer/Advanced plans. Auto/Fugle modes
    # therefore fill missing symbols from TWSE MIS instead of remaining on yesterday's bar.
    mis_snaps, mis_meta = fetch_twse_mis_snapshots(missing or stocks)
    combined = dict(fugle_snaps)
    combined.update(mis_snaps)
    if combined:
        src = "Fugle＋TWSE MIS 盤中快照" if fugle_snaps and mis_snaps else (
            fugle_meta.get("source", "Fugle 5秒快照") if fugle_snaps else mis_meta.get("source", "TWSE MIS 盤中快照"))
        meta = {
            "ok": True, "source": src, "count": len(combined),
            "date": mis_meta.get("date") or fugle_meta.get("date"),
            "time": mis_meta.get("time") or fugle_meta.get("time"),
            "provider_chain": (["Fugle Snapshot"] if fugle_enabled() else []) + (["TWSE MIS"] if mis_snaps else []),
            "errors": (fugle_meta.get("errors") or []) + (mis_meta.get("errors") or []),
        }
        fallback_reasons = list(attempts)
        if fugle_snaps and missing:
            fallback_reasons.append(f"Fugle僅取得{len(fugle_snaps)}檔，TWSE MIS補齊{len(mis_snaps)}檔")
        if fallback_reasons:
            meta["fallback_reason"] = "；".join(fallback_reasons[-3:])
        return combined, meta

    reason_parts = attempts + [mis_meta.get("reason") or "TWSE MIS 無可用資料"]
    return {}, {"ok": False, "source": "盤中行情", "count": 0,
                "reason": "；".join(x for x in reason_parts if x),
                "errors": (fugle_meta.get("errors") or []) + (mis_meta.get("errors") or [])}


def fetch_best_single_quote(code, market):
    """Single-symbol intraday quote. Fugle per-symbol quote first, TWSE MIS second."""
    settings = load_settings()
    provider = settings.get("provider", "auto")
    attempts = []
    if provider != "yahoo" and fugle_enabled():
        q, meta = fetch_fugle_quote(code)
        if q and (not market or q.get("market") == market):
            return q, meta
        attempts.append(meta.get("reason") or "Fugle 個股即時無資料")
    if provider != "yahoo":
        snaps, meta = fetch_twse_mis_snapshots([{"c": str(code), "m": str(market)}], chunk_size=1)
        q = snaps.get((str(code), str(market)))
        if q:
            if attempts:
                meta["fallback_reason"] = "；".join(attempts[-2:])
            return q, meta
        attempts.append(meta.get("reason") or "TWSE MIS 無資料")
    return None, {"ok": False, "source": "盤中行情", "reason": "；".join(attempts) or "盤中來源未啟用", "count": 0}


def fetch_fugle_snapshots():
    """Return {(code, TW/TWO): snapshot}; docs say snapshot endpoint updates about every 5s."""
    if not fugle_enabled():
        return {}, {"ok": False, "source": "Fugle", "reason": "未設定 Fugle API Key"}
    out = {}
    errors = []
    latest_time = None
    latest_date = None
    for market, local in (("TSE", "TW"), ("OTC", "TWO")):
        try:
            j = _fugle(f"snapshot/quotes/{market}", {"type": "COMMONSTOCK"})
            latest_time = j.get("time") or latest_time
            latest_date = j.get("date") or latest_date
            for q in j.get("data") or []:
                code = str(q.get("symbol") or "").strip()
                if len(code) != 4 or not code.isdigit():
                    continue
                vals = [q.get("openPrice"), q.get("highPrice"), q.get("lowPrice"), q.get("closePrice")]
                if any(v is None for v in vals):
                    continue
                try:
                    o, h, l, c = map(float, vals)
                    v = float(q.get("tradeVolume") or 0)
                except (TypeError, ValueError):
                    continue
                if min(o, h, l, c) <= 0:
                    continue
                out[(code, local)] = {
                    "date": str(j.get("date") or ""), "time": str(j.get("time") or ""),
                    "o": o, "h": max(h, o, c), "l": min(l, o, c), "c": c,
                    "v": max(0, int(round(v))), "change": q.get("change"),
                    "changePercent": q.get("changePercent"), "lastUpdated": q.get("lastUpdated"),
                    "source": "Fugle 5秒快照",
                }
        except Exception as e:
            errors.append(f"{market}:{type(e).__name__}:{e}")
    reason = ""
    if not out and errors:
        joined = "；".join(errors)
        if "HTTP Error 403" in joined or "HTTPError:HTTP Error 403" in joined:
            reason = "Fugle Snapshot Quotes 權限不足；此端點需開發者／進階方案"
        elif "HTTP Error 401" in joined:
            reason = "Fugle API Key 驗證失敗"
        elif "HTTP Error 429" in joined:
            reason = "Fugle API 呼叫次數已達方案上限"
        else:
            reason = joined[-500:]
    return out, {
        "ok": bool(out), "source": "Fugle 5秒快照", "count": len(out),
        "date": latest_date, "time": latest_time, "errors": errors, "reason": reason,
    }


def merge_snapshots(stocks, snapshots):
    """Mutates copies and returns (new_stocks, merged_count). Volume is already in Taiwan lots (張).

    R10.14: a row that receives an intraday quote must also receive a fresh fetch timestamp.
    The screener's freshness gate uses this timestamp; without it, today's K bar was
    visible but every stock was incorrectly sent to Q / 資料待確認.
    """
    merged = []
    count = 0
    live_fetched_at = datetime.now(TPE).isoformat(timespec="seconds")
    for s in stocks:
        x = dict(s)
        for k in ("d", "o", "h", "l", "cl", "v"):
            x[k] = list(s.get(k) or [])
        q = snapshots.get((str(s.get("c")), str(s.get("m"))))
        if not q or not q.get("date"):
            merged.append(x)
            continue
        d = calendar.normalize_trade_date(q["date"])
        if not d or d > calendar.taipei_now().date().isoformat() or (x["d"] and d < x["d"][-1]):
            merged.append(x); continue
        vals = [q.get(k) for k in ("o","h","l","c","v")]
        if any(type(z) not in (int,float) or not math.isfinite(z) for z in vals) or min(vals[:4])<=0 or vals[4]<0:
            merged.append(x); continue
        row = (round(q["o"], 2), round(q["h"], 2), round(q["l"], 2), round(q["c"], 2), int(q["v"]))
        if x["d"] and x["d"][-1] == d:
            i = len(x["d"]) - 1
            x["o"][i], x["h"][i], x["l"][i], x["cl"][i], x["v"][i] = row
            count += 1
        elif not x["d"] or d > x["d"][-1]:
            x["d"].append(d); x["o"].append(row[0]); x["h"].append(row[1]); x["l"].append(row[2]); x["cl"].append(row[3]); x["v"].append(row[4])
            count += 1
        x["live_source"] = q.get("source")
        x["live_time"] = q.get("time")
        x["live_fetched_at"] = live_fetched_at
        x["live_quote_at"] = calendar.quote_datetime(d, q.get("time"))
        # fetched_at is deliberately refreshed only for symbols that actually received
        # a live quote. Symbols not covered by the snapshot remain Q / 待確認.
        x["fetched_at"] = live_fetched_at
        merged.append(x)
    return merged, count


def _yahoo_series(symbol, range_="6mo", interval="1d"):
    last = None
    for host in ("query1", "query2"):
        try:
            url = (f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}"
                   f"?range={range_}&interval={interval}&includePrePost=false")
            j = http_json(url, timeout=12)
            res = j["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            ts = res.get("timestamp") or []
            off = res.get("meta", {}).get("gmtoffset", 28800)
            rows = []
            for i, t in enumerate(ts):
                vals = (q["open"][i], q["high"][i], q["low"][i], q["close"][i], q["volume"][i])
                if any(v is None for v in vals[:4]):
                    continue
                o, h, l, c, v = vals
                if min(o, h, l, c) <= 0:
                    continue
                d = datetime.fromtimestamp(t + off, timezone.utc).strftime("%Y-%m-%d")
                rows.append((d, float(o), float(h), float(l), float(c), float(v or 0)))
            if rows:
                return rows
        except Exception as e:
            last = e
    raise RuntimeError(f"Yahoo {symbol} 失敗：{last}")


def fetch_market_context():
    """Daily market regime: descriptive trend filter, not an outcome forecast."""
    items = []
    errors = []
    for symbol, name in (("^TWII", "加權指數"), ("^TWOII", "櫃買指數")):
        try:
            rows = _yahoo_series(symbol, "6mo", "1d")
            closes = [r[4] for r in rows]
            if len(closes) < 65:
                raise ValueError("歷史不足65根")
            ma20 = sum(closes[-20:]) / 20
            ma60 = sum(closes[-60:]) / 60
            prev20 = sum(closes[-25:-5]) / 20
            close = closes[-1]
            state = "多頭" if close > ma20 > ma60 and ma20 > prev20 else "偏弱" if close < ma20 and ma20 < ma60 else "中性"
            items.append({"symbol": symbol, "name": name, "date": rows[-1][0], "close": close, "ma20": ma20, "ma60": ma60, "state": state})
        except Exception as e:
            errors.append(f"{name}:{e}")
    states = [x["state"] for x in items]
    if len(states) == 2 and all(x == "多頭" for x in states):
        regime, penalty = "risk_on", 0
    elif len(states) == 2 and all(x == "偏弱" for x in states):
        regime, penalty = "risk_off", 8
    elif items:
        regime, penalty = "mixed", 4
    else:
        regime, penalty = "unknown", 0
    return {"state": regime, "recommendation_penalty": penalty, "indexes": items, "errors": errors,
            "note": "以加權／櫃買日K之20/60日均線描述市場環境；僅作研究濾網。"}


def fetch_long_history(stock, keep=1250):
    """5-year daily history for event research, stored separately from UI cache."""
    if os.environ.get("BB_MOCK") == "1":
        return None
    symbol = f"{stock['c']}.{stock['m']}"
    rows = _yahoo_series(symbol, "5y", "1d")
    rows = rows[-keep:]
    if len(rows) < 200:
        return None
    out = dict(stock)
    out["d"] = [r[0] for r in rows]
    out["o"] = [round(r[1], 2) for r in rows]
    out["h"] = [round(r[2], 2) for r in rows]
    out["l"] = [round(r[3], 2) for r in rows]
    out["cl"] = [round(r[4], 2) for r in rows]
    out["v"] = [int(round(r[5] / 1000)) for r in rows]
    out["fetched_at"] = datetime.now(TPE).isoformat(timespec="seconds")
    return out
