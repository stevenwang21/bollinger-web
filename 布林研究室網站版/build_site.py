"""布林研究室 · 網站版建置程式

在 GitHub Actions（或任何有網路的電腦）上執行：
  1. 用原本的 bollinger_app 更新全市場清單＋每檔日 K（沿用 cache/ 增量更新）
  2. 用日 K 盤後備援跑一次「強勢雷達」全市場掃描
  3. 把原本的介面複製到 _site/，並把後端 /api/* 的結果存成靜態 JSON

用法：
  python build_site.py            # 抓最新資料並產生網站
  python build_site.py --offline  # 不連網，只用 cache/ 既有資料產生網站（測試用）
"""
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, "app")
SITE = os.path.join(ROOT, "_site")
WEB = os.path.join(ROOT, "web")

OFFLINE = "--offline" in sys.argv
if OFFLINE:
    os.environ["CODEX_SANDBOX_NETWORK_DISABLED"] = "1"
    sys.argv.append("--offline")

sys.path.insert(0, APP)
import bollinger_app as app  # noqa: E402
import marketdata_r9 as md9  # noqa: E402
import market_calendar as calendar  # noqa: E402


_real_http_get = app.http_get


def _http_get_with_retry(url, timeout=20):
    """官方公司清單檔較大，海外主機常被中途斷線：清單網址改為最多重試 4 次、放寬逾時。"""
    if "openapi" not in url:
        return _real_http_get(url, timeout=timeout)
    last = None
    for attempt in range(4):
        try:
            return _real_http_get(url, timeout=max(timeout, 45))
        except Exception as e:  # IncompleteRead、逾時等
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


app.http_get = _http_get_with_retry


def log(*a):
    print(datetime.now(app.TPE).strftime("%H:%M:%S"), *a, flush=True)


def dump(name, payload):
    path = os.path.join(SITE, "api", name + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


# ------------------------------------------------------------------ 1. 日 K
def refresh_daily():
    if OFFLINE:
        log("離線模式：沿用 cache/prices.json")
        return
    original_list = app.load_stock_list

    def list_with_fallback():
        try:
            return original_list()
        except Exception as e:  # 官方清單抓不到時，至少用既有清單繼續更新
            log("⚠ 全市場清單無法取得，改用既有清單：", e)
            rows, _meta = app._best_full_market_rows(fetch_network=False)
            legacy = app._read_json_list(app.LIST_CACHE)
            merged = {(x["c"], x["m"]): x for x in legacy + rows}
            if not merged:
                raise
            return sorted(merged.values(), key=lambda x: (x["c"], x["m"]))

    app.load_stock_list = list_with_fallback
    started = time.time()
    app.do_refresh()
    log("日K更新：", app.state.get("state"), app.state.get("msg"), "（%.0f 秒）" % (time.time() - started))


# ------------------------------------------------------------------ 2. 強勢雷達
def refresh_radar():
    if OFFLINE:
        app.load_strong_radar_cache()
        return
    real_mis = md9.fetch_twse_mis_snapshots
    mis_state = {"failed": 0}

    def mis_with_budget(stocks, chunk_size=80):
        # 海外主機常連不上 MIS；連續失敗兩次就只用日K盤後備援，避免整輪等逾時。
        if mis_state["failed"] >= 2:
            return {}, {"ok": False, "count": 0, "source": "", "reason": "MIS 無法連線，改用日K盤後備援"}
        try:
            snaps, meta = real_mis(stocks, chunk_size=chunk_size)
        except Exception as e:
            snaps, meta = {}, {"ok": False, "count": 0, "reason": str(e)}
        if not snaps:
            mis_state["failed"] += 1
        return snaps, meta

    md9.fetch_twse_mis_snapshots = mis_with_budget
    app.load_strong_radar_cache()
    if not app.radar_full_scan_lock.acquire(blocking=False):
        return
    app.RADAR_STATE.update(full_scan_running=True, full_scan_done=0, full_scan_quotes=0, full_scan_missing=0,
                           full_scan_phase="universe", full_scan_error="",
                           full_scan_started=datetime.now(app.TPE).isoformat(timespec="seconds"),
                           full_scan_finished=None)
    started = time.time()
    app._postclose_full_scan_worker()  # 同步執行；結束時會自行釋放 lock
    log("強勢雷達：", app.RADAR_STATE.get("full_scan_phase"), app.RADAR_STATE.get("full_scan_error") or "",
        "（%.0f 秒）" % (time.time() - started))


# ------------------------------------------------------------------ 3. 產生網站
STATIC_FILES = [
    "research.js", "backtest.js", "portable_settings.js", "selection_rules.js", "desktop_selection.js",
    "strong_radar.js", "single_stock_core.js", "single_stock_analyzer.js", "stock_report.js", "elegant_ui.js",
    "precision_guide.js", "elegant.css", "boutique.css", "pastel_atelier.css", "midnight_champagne.css",
    "starry_korean.css", "starry_sapphire.css",
]
# 原程式用「/檔名」絕對路徑；改成相對路徑，放在任何子目錄（例如 GitHub Pages 專案網址）都能用。
ABS_PATH = re.compile(r"""(["'(])/(?=(?:assets/|[A-Za-z_]+\.(?:js|css)))""")


def relativize(text):
    return ABS_PATH.sub(r"\1", text)


def write_site():
    if os.path.isdir(SITE):
        shutil.rmtree(SITE)
    os.makedirs(os.path.join(SITE, "api"))
    shutil.copytree(os.path.join(APP, "assets"), os.path.join(SITE, "assets"))
    for name in STATIC_FILES:
        with open(os.path.join(APP, name), encoding="utf-8") as f:
            text = f.read()
        with open(os.path.join(SITE, name), "w", encoding="utf-8") as f:
            f.write(relativize(text))
    for name in os.listdir(WEB):
        shutil.copy2(os.path.join(WEB, name), os.path.join(SITE, name))

    with open(os.path.join(APP, "index.html"), encoding="utf-8") as f:
        html = relativize(f.read())
    build_id = str(int(time.time()))
    inject = ('<link rel="stylesheet" href="web.css?b=%s">\n'
              '<script src="static_api.js?b=%s"></script>\n'
              '<meta name="theme-color" content="#5B4B8A">\n') % (build_id, build_id)
    html = html.replace("</head>", inject + "</head>", 1)
    html = html.replace("<title>布林研究室 · Starry Sapphire v6.9.5 Lavender Palette</title>",
                        "<title>布林研究室 · 台股布林選股</title>")
    with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    open(os.path.join(SITE, ".nojekyll"), "w").close()

    # ---- API 快照
    with app.data_lock:
        data = dict(app.DATA)
    quality = app.data_quality(data)
    quality["offline"] = False          # 網站版資料由排程更新，不當成「離線快取」
    data["quality"] = quality
    data.pop("failed_stocks", None)     # 另存 failures.json，減少主檔大小
    sizes = {"data": dump("data", data)}

    auto_live = app.get_auto_live_status()
    auto_live.update(enabled=False, provider_enabled=False, market_open=False, state="idle",
                     next_due_ts=0, overdue_seconds=0, last_reason="網站版：每個交易日收盤後自動更新")
    status = {"state": "done", "done": 0, "total": 0, "failed": 0,
              "msg": app.state.get("msg") or "", "updated": data.get("updated"),
              "count": len(data.get("stocks", [])), "updated_ts": data.get("updated_ts", 0),
              "live_revision": 0, "quality": quality, "auto_live": auto_live,
              "site_build": datetime.now(app.TPE).isoformat(timespec="seconds"),
              "site_build_offline": OFFLINE}
    sizes["status"] = dump("status", status)

    failures = app._read_json_list(os.path.join(app.CACHE_DIR, "failed_stocks.json"))
    sizes["failures"] = dump("failures", failures)
    sizes["radar_failures"] = dump("radar_failures", app._read_json_list(os.path.join(app.CACHE_DIR, "radar_missing_quotes.json")))
    radar = app.strong_radar_payload()
    radar["offline"] = False
    sizes["strong_radar"] = dump("strong_radar", radar)
    sizes["live_patch"] = dump("live_patch", {"live_revision": 0, "quotes": [], "quality": {}})
    cfg = md9.public_settings()
    cfg.update(provider="yahoo", has_fugle_key=False)
    sizes["marketdata_config"] = dump("marketdata_config", cfg)
    for k, v in sizes.items():
        log("api/%s.json  %.1f KB" % (k, v / 1024))


def main():
    log("網站版建置開始", "（離線）" if OFFLINE else "")
    app.load_cache()
    refresh_daily()
    try:
        refresh_radar()
    except Exception as e:
        log("⚠ 強勢雷達掃描失敗，沿用舊雷達資料：", e)
    if not app.DATA.get("stocks"):
        log("✖ 沒有任何日K資料，不產生網站")
        sys.exit(1)
    write_site()
    log("完成：", SITE)


if __name__ == "__main__":
    main()
