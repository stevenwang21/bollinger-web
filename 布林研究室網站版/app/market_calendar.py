"""Taiwan exchange clock. Calendar hints never replace dates supplied by a feed.

2026 scheduled closures checked against TWSE on 2026-10-06. Unscheduled
closures (e.g. typhoons) still require source-date verification.
"""
from datetime import date, datetime, timedelta, timezone

TPE = timezone(timedelta(hours=8))
CALENDAR_SOURCE = "https://www.twse.com.tw/holidaySchedule/holidaySchedule?queryYear=115&response=html"
HOLIDAYS = {
    2026: frozenset([
        "2026-01-01", "2026-02-12", "2026-02-13", "2026-02-16",
        "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
        "2026-02-27", "2026-04-03", "2026-04-06", "2026-05-01",
        "2026-06-19", "2026-09-25", "2026-09-28", "2026-10-09",
        "2026-10-26", "2026-12-25",
    ])
}


def normalize_trade_date(value):
    """Accept ISO/Gregorian eight-digit/ROC slash dates; reject invalid dates."""
    text = str(value or "").strip().replace("/", "-")
    if len(text) == 8 and text.isdigit():
        text = f"{text[:4]}-{text[4:6]}-{text[6:]}"
    parts = text.split("-")
    try:
        if len(parts) != 3:
            return None
        year, month, day = map(int, parts)
        if len(parts[0]) <= 3:
            year += 1911
        return date(year, month, day).isoformat()
    except (ValueError, TypeError):
        return None


def taipei_now(now=None):
    now = now or datetime.now(TPE)
    return now.replace(tzinfo=TPE) if now.tzinfo is None else now.astimezone(TPE)


def is_trading_day(day):
    if isinstance(day, datetime):
        day = taipei_now(day).date()
    elif isinstance(day, str):
        normalized = normalize_trade_date(day)
        if not normalized:
            return False
        day = date.fromisoformat(normalized)
    return day.weekday() < 5 and day.isoformat() not in HOLIDAYS.get(day.year, ())


def expected_trade_date(now=None, completed=False):
    now = taipei_now(now)
    day = now.date()
    cutoff = (13, 35) if completed else (9, 0)
    if (now.hour, now.minute) < cutoff:
        day -= timedelta(days=1)
    while not is_trading_day(day):
        day -= timedelta(days=1)
    return day.isoformat()


def session_mode(now=None):
    now = taipei_now(now)
    if not is_trading_day(now.date()):
        return "off"
    minute = now.hour * 60 + now.minute
    if 540 <= minute < 810:
        return "intraday"
    if 810 <= minute < 815:
        return "closing"
    return "postclose" if minute >= 815 else "off"


def calendar_info(now=None):
    now = taipei_now(now)
    return {
        "today": now.date().isoformat(), "year": now.year,
        "verified_year": now.year in HOLIDAYS,
        "trading_day": is_trading_day(now.date()),
        "session": session_mode(now),
        "expected_trade_date": expected_trade_date(now),
        "expected_completed_date": expected_trade_date(now, completed=True),
        "source": CALENDAR_SOURCE,
        "note": "2026 預定休市日已核對；臨時休市與個股停牌以資料來源為準。"
                if now.year in HOLIDAYS else "本年度休市表尚未核對；平日日期僅為提示，須確認來源資料日。",
    }


def quote_datetime(day, value):
    """Parse a feed's Taiwan quote time; do not substitute the local fetch time."""
    day = normalize_trade_date(day)
    text = str(value or "").replace(":", "").strip()
    if not day or len(text) != 6 or not text.isdigit():
        return None
    try:
        return datetime.fromisoformat(f"{day}T{text[:2]}:{text[2:4]}:{text[4:6]}+08:00").isoformat()
    except ValueError:
        return None
