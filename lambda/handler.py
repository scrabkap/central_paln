"""Central Planning POC API.

Single Lambda behind a Function URL (fronted by CloudFront at /api/*).
Reads mock data from the cp_* DynamoDB tables and serves the dashboard.

Always returns HTTP 200 with an envelope {"ok": bool, ...} so that CloudFront's
SPA error-rewrite (403/404 -> index.html) never masks API responses. Auth is a
stateless HMAC token issued by /api/login.
"""
import base64
import decimal
import hashlib
import hmac
import json
import os
import time

import boto3
from boto3.dynamodb.conditions import Key

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Prodbug76")
AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-secret").encode("utf-8")
TOKEN_TTL_SECONDS = 12 * 3600

_ddb = boto3.resource("dynamodb")
_table_cache = {}

T = {
    "items": "cp_items",
    "item_groups": "cp_item_groups",
    "formats": "cp_formats",
    "stores": "cp_stores",
    "warehouses": "cp_warehouses",
    "vendors": "cp_vendors",
    "display_types": "cp_display_types",
    "assortment": "cp_assortment",
    "store_planogram": "cp_store_planogram",
    "wh_9box": "cp_wh_9box",
    "location_stock": "cp_location_stock",
    "stock_on_the_way": "cp_stock_on_the_way",
    "wh_mrp": "cp_wh_mrp",
    "store_mrp": "cp_store_mrp",
    "central_planner": "cp_central_planner",
    "purchase_orders": "cp_purchase_orders",
    "forecast": "cp_forecast",
    "promotions": "cp_promotions",
    "cannibalization_trees": "cp_cannibalization_trees",
    "cannibalization_suggestions": "cp_cannibalization_suggestions",
    "oos_blocks": "cp_oos_blocks",
    "trade_agreements": "cp_trade_agreements",
    "kpi": "cp_kpi_snapshots",
}

KEY_ATTRS = {
    "PK", "SK",
    "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK",
    "GSI3PK", "GSI3SK", "GSI4PK", "GSI4SK",
    "ttl_epoch",
}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
class _DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            f = float(o)
            return int(f) if f.is_integer() else f
        return super().default(o)


def _table(name):
    if name not in _table_cache:
        _table_cache[name] = _ddb.Table(name)
    return _table_cache[name]


def _scan_all(logical):
    name = T[logical]
    table = _table(name)
    items, kwargs = [], {}
    while True:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        lek = resp.get("LastEvaluatedKey")
        if not lek:
            break
        kwargs["ExclusiveStartKey"] = lek
    return items


def _clean(rows):
    out = []
    for r in rows:
        out.append({k: v for k, v in r.items() if k not in KEY_ATTRS})
    return out


def _rows(logical):
    try:
        return _clean(_scan_all(logical))
    except Exception as exc:  # noqa: BLE001 - POC: never 500 on a missing table
        print(f"scan failed for {logical}: {exc}")
        return []


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(username: str) -> str:
    payload = json.dumps(
        {"u": username, "exp": int(time.time()) + TOKEN_TTL_SECONDS},
        separators=(",", ":"),
    ).encode("utf-8")
    sig = hmac.new(AUTH_SECRET, payload, hashlib.sha256).digest()
    return f"{_b64u(payload)}.{_b64u(sig)}"


def verify_token(token: str) -> bool:
    try:
        body, sig = token.split(".", 1)
        payload = _b64u_dec(body)
        expected = hmac.new(AUTH_SECRET, payload, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64u_dec(sig)):
            return False
        return json.loads(payload).get("exp", 0) > int(time.time())
    except Exception:  # noqa: BLE001
        return False


# --------------------------------------------------------------------------
# endpoints
# --------------------------------------------------------------------------
def ep_overview():
    kpi_rows = _rows("kpi")
    by_code = {}
    for r in kpi_rows:
        by_code.setdefault(r.get("kpi_code"), []).append(r)
    kpis = []
    for code, series in by_code.items():
        series.sort(key=lambda x: x.get("date", ""))
        latest = series[-1] if series else {}
        prev = series[-2] if len(series) > 1 else latest
        trend = [{"date": s.get("date"), "value": s.get("value")} for s in series]
        try:
            delta = float(latest.get("value", 0)) - float(prev.get("value", 0))
        except Exception:  # noqa: BLE001
            delta = 0
        kpis.append(
            {
                "code": code,
                "label_he": latest.get("label_he"),
                "label_en": latest.get("label_en"),
                "value": latest.get("value"),
                "unit": latest.get("unit"),
                "target": latest.get("target"),
                "direction": latest.get("direction", "up"),
                "delta": round(delta, 2),
                "trend": trend,
            }
        )
    order = ["forecast_accuracy", "store_overrides", "wh_adoption",
             "availability", "otif", "shrink"]
    kpis.sort(key=lambda k: order.index(k["code"]) if k["code"] in order else 99)

    promos = _rows("promotions")
    promo_meta = [p for p in promos if p.get("record_type") == "promo"]
    status_breakdown = {}
    for p in promo_meta:
        status_breakdown[p.get("status", "?")] = status_breakdown.get(
            p.get("status", "?"), 0) + 1
    sugg = _rows("cannibalization_suggestions")
    pos = _rows("purchase_orders")
    po_headers = [p for p in pos if p.get("record_type") == "header"]
    oos = _rows("oos_blocks")

    wh_mrp = _rows("wh_mrp")
    store_mrp = _rows("store_mrp")
    # Sales vs forecast, grouped by article hierarchy (category).
    # Only completed promos have real sold_total; ongoing+upcoming would skew
    # the comparison.
    cat_agg = {}
    for p in promo_meta:
        if p.get("phase") != "COMPLETED":
            continue
        cat = p.get("category_name") or p.get("category_code") or "—"
        bucket = cat_agg.setdefault(cat, {"category": cat, "forecast": 0.0,
                                           "sold": 0.0, "promos": 0})
        bucket["forecast"] += float(p.get("original_forecast_total") or 0)
        bucket["sold"] += float(p.get("sold_total") or 0)
        bucket["promos"] += 1
    sales_vs_forecast = sorted(
        (b for b in cat_agg.values() if b["forecast"] > 0),
        key=lambda b: b["forecast"],
        reverse=True,
    )[:10]
    mrp_trend = {}
    for r in wh_mrp:
        d = r.get("snapshot_date")
        mrp_trend.setdefault(d, {"date": d, "wh_qty": 0, "store_qty": 0})
        mrp_trend[d]["wh_qty"] += float(r.get("recom_qty_base", 0) or 0)
    for r in store_mrp:
        d = r.get("snapshot_date")
        mrp_trend.setdefault(d, {"date": d, "wh_qty": 0, "store_qty": 0})
        mrp_trend[d]["store_qty"] += float(r.get("recom_qty_base", 0) or 0)
    mrp_series = sorted(mrp_trend.values(), key=lambda x: x.get("date") or "")

    return {
        "kpis": kpis,
        "counts": {
            "active_promotions": len([p for p in promo_meta
                                      if p.get("status") != "DISTRIBUTED"]),
            "total_promotions": len(promo_meta),
            "aces_pending": len([p for p in promo_meta
                                 if p.get("activity_type") == "ACES"]),
            "open_pos": len([h for h in po_headers
                             if h.get("status") not in ("DELIVERED", "CANCELLED")]),
            "pending_suggestions": len([s for s in sugg
                                        if s.get("status") == "PENDING"]),
            "oos_blocks": len([b for b in oos if b.get("is_active")]),
            "wh_items": len({r.get("item_barcode") for r in wh_mrp}),
            "store_items": len({r.get("leading_barcode") for r in store_mrp}),
        },
        "promo_status_breakdown": [
            {"status": k, "count": v} for k, v in status_breakdown.items()
        ],
        "sales_vs_forecast": sales_vs_forecast,
        "mrp_trend": mrp_series,
    }


ROUTES_SIMPLE = {
    "/api/wh-mrp": "wh_mrp",
    "/api/store-mrp": "store_mrp",
    "/api/forecast": "forecast",
    "/api/purchase-orders": "purchase_orders",
    "/api/oos-blocks": "oos_blocks",
    "/api/trade-agreements": "trade_agreements",
    "/api/wh-9box": "wh_9box",
    "/api/location-stock": "location_stock",
    "/api/stock-on-the-way": "stock_on_the_way",
}


def ep_central_planner():
    rows = _rows("central_planner")
    return {
        "runs": [r for r in rows if r.get("record_type") == "run"],
        "allocations": [r for r in rows if r.get("record_type") == "allocation"],
    }


def ep_promotions():
    """List endpoint: promo headers + per-item aggregates only (kept small;
    store-level rows are synthesized on demand in ep_promo_detail)."""
    rows = _rows("promotions")
    return {
        "promotions": [r for r in rows if r.get("record_type") == "promo"],
        "promo_items": [r for r in rows if r.get("record_type") == "promo_item"],
        "wh_supply": [r for r in rows if r.get("record_type") == "wh_supply"],
        "aces_strength": [r for r in rows
                          if r.get("record_type") == "aces_strength"],
    }


_store_cache = None


def _store_caps():
    global _store_cache
    if _store_cache is None:
        _store_cache = {}
        try:
            for s in _scan_all("stores"):
                _store_cache[s.get("store_id")] = (
                    s.get("name"), float(s.get("sale_capability_score") or 0.6))
        except Exception as exc:  # noqa: BLE001
            print(f"store cap load failed: {exc}")
            _store_cache = {}
    return _store_cache


def _jit(seed, lo, hi):
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * h


def ep_promo_detail(pid):
    """Single promotion: header + item aggregates + WH supply + synthesized
    per-store allocations (distributed across the promo's stores by capability)."""
    table = _table(T["promotions"])
    resp = table.query(KeyConditionExpression=Key("PK").eq(f"PROMO#{pid}"))
    rows = _clean(resp.get("Items", []))
    header = next((r for r in rows if r.get("record_type") == "promo"), None)
    items = [r for r in rows if r.get("record_type") == "promo_item"]
    wh = [r for r in rows if r.get("record_type") == "wh_supply"]
    strength = [r for r in rows if r.get("record_type") == "aces_strength"]
    store_ids = (header or {}).get("store_ids") or []
    caps = _store_caps()
    weights = [(s, (caps.get(s) or (s, 0.6))) for s in store_ids]
    wsum = sum(c[1][1] for c in weights) or 1.0
    keep = ("format_code", "display_type_code", "category_code", "category_name",
            "vendor_id", "supply_method", "managing_warehouse_id",
            "promo_type_code", "phase", "item_desc")
    allocs = []
    for it in items:
        bc = it.get("item_barcode")
        base = {k: it.get(k) for k in keep}
        O = float(it.get("original_forecast_qty") or 0)
        A = float(it.get("approved_forecast_qty") or 0)
        R = float(it.get("store_recommended_qty") or 0)
        Od = float(it.get("store_ordered_qty") or 0)
        S = float(it.get("sold_qty") or 0)
        for s, (nm, cap) in weights:
            frac = cap / wsum
            row = dict(base)
            row.update(
                promo_id=pid, store_id=s, store_name=nm, item_barcode=bc,
                original_forecast_qty=round(O * frac * _jit(f"{pid}{s}{bc}o", 0.85, 1.15)),
                approved_forecast_qty=round(A * frac),
                store_recommended_qty=round(R * frac * _jit(f"{pid}{s}{bc}r", 0.9, 1.1)),
                store_ordered_qty=round(Od * frac * _jit(f"{pid}{s}{bc}d", 0.8, 1.05)),
                sold_qty=round(S * frac * _jit(f"{pid}{s}{bc}x", 0.6, 1.3)),
                record_type="allocation")
            allocs.append(row)
    return {"header": header, "items": items, "allocations": allocs,
            "wh_supply": wh, "aces_strength": strength}


def ep_cannibalization():
    trees = _rows("cannibalization_trees")
    return {
        "trees": [r for r in trees if r.get("record_type") == "tree"],
        "members": [r for r in trees if r.get("record_type") == "member"],
        "suggestions": _rows("cannibalization_suggestions"),
    }


def ep_master():
    return {
        "items": _rows("items"),
        "item_groups": _rows("item_groups"),
        "formats": _rows("formats"),
        "stores": _rows("stores"),
        "warehouses": _rows("warehouses"),
        "vendors": _rows("vendors"),
        "display_types": _rows("display_types"),
        "assortment": _rows("assortment"),
        "store_planogram": _rows("store_planogram"),
    }


# --------------------------------------------------------------------------
# dispatch
# --------------------------------------------------------------------------
def _resp(body, status=200):
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "content-type,authorization",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "cache-control": "no-store",
        },
        "body": json.dumps(body, cls=_DecimalEncoder, ensure_ascii=False),
    }


def _get_token(headers):
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return headers.get("x-cp-token") or headers.get("X-Cp-Token") or ""


def handler(event, _context):
    rc = event.get("requestContext", {})
    method = rc.get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")
    # tolerate a stale cached client that double-prefixes the API path
    if path.startswith("/api/api/"):
        path = path.replace("/api/api/", "/api/", 1)

    if method == "OPTIONS":
        return _resp({"ok": True})

    if path in ("/api/health", "/health"):
        return _resp({"ok": True, "service": "central-planning-poc"})

    # login
    if path == "/api/login" and method == "POST":
        try:
            raw = event.get("body") or "{}"
            if event.get("isBase64Encoded"):
                raw = base64.b64decode(raw).decode("utf-8")
            creds = json.loads(raw or "{}")
        except Exception:  # noqa: BLE001
            creds = {}
        u = (creds.get("username") or "").strip()
        p = creds.get("password") or ""
        if hmac.compare_digest(u, ADMIN_USERNAME) and hmac.compare_digest(
            p, ADMIN_PASSWORD
        ):
            return _resp({"ok": True, "token": issue_token(u), "user": u})
        return _resp({"ok": False, "error": "invalid_credentials"})

    # everything else requires a valid token
    if not verify_token(_get_token(event.get("headers", {}))):
        return _resp({"ok": False, "error": "unauthorized"})

    try:
        if path == "/api/overview":
            return _resp({"ok": True, "data": ep_overview()})
        if path == "/api/central-planner":
            return _resp({"ok": True, "data": ep_central_planner()})
        if path == "/api/promotions":
            return _resp({"ok": True, "data": ep_promotions()})
        if path == "/api/promo":
            qs = event.get("queryStringParameters") or {}
            pid = qs.get("promo_id")
            if not pid:
                import urllib.parse
                pid = urllib.parse.parse_qs(event.get("rawQueryString", "")).get("promo_id", [None])[0]
            if not pid:
                return _resp({"ok": False, "error": "missing promo_id"})
            return _resp({"ok": True, "data": ep_promo_detail(pid)})
        if path == "/api/cannibalization":
            return _resp({"ok": True, "data": ep_cannibalization()})
        if path == "/api/master":
            return _resp({"ok": True, "data": ep_master()})
        if path in ROUTES_SIMPLE:
            return _resp({"ok": True, "data": _rows(ROUTES_SIMPLE[path])})
    except Exception as exc:  # noqa: BLE001
        print(f"handler error on {path}: {exc}")
        return _resp({"ok": False, "error": "server_error", "detail": str(exc)}, 500)

    return _resp({"ok": False, "error": "not_found", "path": path}, 404)
