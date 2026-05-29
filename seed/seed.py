#!/usr/bin/env python3
"""Seed the Central Planning POC DynamoDB tables with realistic mock data.

Generates a coherent Israeli-retail data set that exercises every concept in
the model: partner-in-stock leaders, מקבץ groups, WH 9-BOX MRP, store MRP,
the Haluka central-planner runs, regular + ACES promotions with strength
scales and WH supply waves, cannibalization trees (by-design parallel +
vendor-suggested), OOS blocks, trade agreements, and 14 days of KPI snapshots.

Usage:
    python3 seed/seed.py            # write to DynamoDB (needs AWS creds)
    python3 seed/seed.py --dry-run  # build everything, validate, no writes
"""
import argparse
import datetime as dt
import random
import sys
from decimal import Decimal

random.seed(76)

TODAY = dt.date(2026, 5, 28)
DAYS = 14


def d(x):
    return Decimal(str(x))


def iso(date):
    return date.isoformat()


def ts(date, h=3, m=0):
    return dt.datetime(date.year, date.month, date.day, h, m).isoformat() + "Z"


# collected rows keyed by logical table name
BUF = {}


def put(table, item):
    BUF.setdefault(table, []).append(item)


# --------------------------------------------------------------------------
# master data
# --------------------------------------------------------------------------
FORMATS = [
    ("2", "שלי"),
    ("8", "יוניברס"),
    ("7", "אקספרס"),
    ("6", "יש"),
    ("5", "פארם"),
    ("4", "דיל"),
]

WAREHOUSES = [
    ("6000", "מחסן מרכזי ראשון לציון"),
    ("6100", "מחסן צפון - חיפה"),
    ("6200", "מחסן דרום - באר שבע"),
]

VENDORS = [
    ("901212", "תנובה", 2),
    ("901310", "שטראוס", 3),
    ("901455", "אסם", 4),
    ("901501", "קוקה-קולה החברה המרכזית", 2),
    ("901622", "יוניליוור ישראל", 5),
    ("901733", "חוגלה קימברלי", 4),
    ("901844", "מאפיות ברמן", 1),
    ("901955", "עלית", 3),
    ("902066", "טרה", 2),
    ("902177", "יטבתה", 2),
]

DISPLAY_TYPES = [
    ("Z000", "עיתון", "Newspaper display", False),
    ("Z137", "גונדולה משתנה", "Variable gondola", False),
    ("Z138", "מקררים", "Refrigerators", False),
    ("Z141", "סטנדים", "Stands", False),
    ("Z142", "סטנדים מרכז", "Stands (variant 2)", False),
    ("Z143", "סטנדים כניסה", "Stands (variant 3)", False),
    ("Z144", "במות", "Stages / platforms", False),
    ("Z160", "מיתחם", "Area / zone", False),
    ("Z166", "מקרר סלטים ארוזים-מדף", "Packaged salads fridge", False),
    ("Z169", "מעדניה חלבית", "Dairy deli", False),
    ("Z170", "מבצעי מדף", "Shelf promotions", False),
    ("Z171", "מבצעי מעדניה מדף", "Deli shelf promotions", False),
    ("Z173", "ראשי גונדולה מקפיאים", "Freezer gondola ends", False),
    ("Z174", "מקרר גלידות", "Ice cream freezer", False),
    ("Z185", "ראשי גונדולה-ניקיון", "Cleaning gondola ends", False),
    ("Z186", "ראשי גונדולה מזון", "Food gondola ends", False),
    ("Z188", "ראשי גונדולה פארם", "Pharma gondola ends", False),
    ("Z189", "ראשי גונדולה מועדון", "Club gondola ends", False),
    ("Z190", "משטחונים", "Pallets / floor displays", False),
    ("Z193", "מקפיאים מדף", "Freezer shelf", False),
    ("Z206", "קופונים בשר וקפואים", "Meat & frozen coupons", False),
    ("Z209", "קופונים חברי מועדון", "Club member coupons", False),
    ("Z210", "מתחם מבצעים חמים", "Hot promotions zone", False),
    ("Z219", "ראש גונדולה מקנזי", "McKenzie gondola end", False),
    ("Z221", "מוצרים בכניסה 50% הנחה", "Store entrance 50% off", False),
    ("Z225", "אמבטיה סוללות", "Battery bath", False),
    ("Z226", "סטריפים", "Strips", False),
    ("Z230", "עגלות בכניסה לחנות", "Entry carts", False),
    ("Z231", "עגלות בכניסה מרכז", "Entry carts (variant 2)", False),
    ("Z232", "ראשי גונדולה כרטיס אשראי", "Credit card gondola ends", False),
    ("Z238", "שדה מוצרים בהשקה", "Product launch area", False),
    ("Z239", "מיוחדים", "Specials", False),
    ("Z240", "מבצע שבועי מתחלף", "Rotating weekly promotion", False),
    ("Z241", "מעטפת חג", "Holiday wrap", False),
    ("Z245", "מצוננים", "Chilled", False),
    ("Z246", "מעדניה חלבית 2", "Dairy deli (variant 2)", False),
    ("Z251", "דאמפים", "Dumps / end-of-aisle bins", False),
    ("Z252", "ר\"ג בית מרקחת", "Pharmacy gondola end", False),
    ("Z301", "דופן צד", "Side panel", False),
    ("Z302", "ר\"ג קוסמטיקה", "Cosmetics gondola end", False),
    ("ZASO", "מגוון כללי", "General assortment", True),
    ("ZPLA", "מגוון פלנוגרמה", "Planogram assortment", True),
    ("ZPRO", "מגוון מבצעים", "Promotions assortment", True),
]

ITEM_GROUPS = [
    ("GRP_YOG", "יוגורט פרי טבעי - מקבץ טעמים", None, "BOTH"),
    ("GRP_MILK", "חלב 3% טרי 1 ליטר - מקבץ ספקים", None, "CANNIBALIZATION_HINT"),
    ("GRP_NOODLE", "אטריות מנת השף - מקבץ וריאציות", None, "PROMO_AGGREGATION"),
]

# barcode, desc, unit_type, vendor_id, leading_barcode, group, supply, dept2
ITEMS = [
    # eggs - standalone leader + partner-in-stock child (from source data)
    ("72838191199", "ביצים L חופש 12 יחידות", "UNITS", "901212", None, None, "WH", ("D10", "מוצרי חלב וביצים")),
    ("72838191193", "ביצים L רגיל 12 יחידות", "UNITS", "901212", "72838191199", None, "WH", ("D10", "מוצרי חלב וביצים")),
    # milk - cannibalization-by-design parallel vendors
    ("7290000110011", "חלב תנובה 3% 1 ליטר", "UNITS", "901212", None, "GRP_MILK", "WH", ("D10", "מוצרי חלב וביצים")),
    ("7290000110028", "חלב טרה 3% 1 ליטר", "UNITS", "902066", None, "GRP_MILK", "WH", ("D10", "מוצרי חלב וביצים")),
    ("7290000110035", "חלב יטבתה 3% 1 ליטר", "UNITS", "902177", None, "GRP_MILK", "WH", ("D10", "מוצרי חלב וביצים")),
    # yogurt group (variations)
    ("7290000220017", "יוגורט פרי תות 150 גרם", "UNITS", "901212", None, "GRP_YOG", "WH", ("D10", "מוצרי חלב וביצים")),
    ("7290000220024", "יוגורט פרי אפרסק 150 גרם", "UNITS", "901212", None, "GRP_YOG", "WH", ("D10", "מוצרי חלב וביצים")),
    ("7290000220031", "יוגורט פרי וניל 150 גרם", "UNITS", "901212", None, "GRP_YOG", "WH", ("D10", "מוצרי חלב וביצים")),
    ("7290000220048", "יוגורט פרי דובדבן 150 גרם", "UNITS", "901212", None, "GRP_YOG", "WH", ("D10", "מוצרי חלב וביצים")),
    # noodles group (the source-doc item)
    ("7290117267004", "אטריות מנת השף 400 גרם", "UNITS", "901455", None, "GRP_NOODLE", "WH", ("D20", "מזון יבש")),
    ("7290117267009", "אטריות מנת השף אורגני 400 גרם", "UNITS", "901455", None, "GRP_NOODLE", "WH", ("D20", "מזון יבש")),
    # pantry / dry
    ("7290000330014", "שמן קנולה 1 ליטר", "UNITS", "901455", None, None, "WH", ("D20", "מזון יבש")),
    ("7290000330021", "קמח לבן 1 ק\"ג", "UNITS", "901455", None, None, "WH", ("D20", "מזון יבש")),
    ("7290000330038", "סוכר לבן 1 ק\"ג", "UNITS", "901955", None, None, "WH", ("D20", "מזון יבש")),
    ("7290000330045", "קפה נמס עלית 200 גרם", "UNITS", "901955", None, None, "WH", ("D20", "מזון יבש")),
    ("7290000440017", "שוקולד פרה חלב 100 גרם", "UNITS", "901310", None, None, "WH", ("D30", "ממתקים וחטיפים")),
    ("7290000440024", "במבה אסם 80 גרם", "UNITS", "901455", None, None, "WH", ("D30", "ממתקים וחטיפים")),
    ("7290000440031", "ביסלי גריל 70 גרם", "UNITS", "901455", None, None, "WH", ("D30", "ממתקים וחטיפים")),
    # beverages - direct from vendor
    ("7290000550018", "קוקה-קולה 1.5 ליטר", "UNITS", "901501", None, None, "DIRECT", ("D40", "משקאות")),
    ("7290000550025", "ספרייט 1.5 ליטר", "UNITS", "901501", None, None, "DIRECT", ("D40", "משקאות")),
    ("7290000550032", "מים מינרליים נביעות 1.5 ליטר", "UNITS", "901501", None, None, "DIRECT", ("D40", "משקאות")),
    # home / pharm
    ("7290000660019", "נייר טואלט לילי 32 גלילים", "UNITS", "901733", None, None, "WH", ("D50", "טואלטיקה וניקיון")),
    ("7290000660026", "מגבונים לחים האגיס", "UNITS", "901733", None, None, "DIRECT", ("D50", "טואלטיקה וניקיון")),
    ("7290000660033", "אבקת כביסה אריאל 5 ק\"ג", "UNITS", "901622", None, None, "WH", ("D50", "טואלטיקה וניקיון")),
    # weighable
    ("2000000000017", "עגבניות שרי", "WEIGHABLE", "901844", None, None, "DIRECT", ("D60", "פירות וירקות")),
    ("2000000000024", "בננות", "WEIGHABLE", "901844", None, None, "DIRECT", ("D60", "פירות וירקות")),
    ("2000000000031", "גבינה צהובה עמק פרוסה", "WEIGHABLE", "901212", None, None, "WH", ("D10", "מוצרי חלב וביצים")),
]

ITEM_BY_BARCODE = {it[0]: it for it in ITEMS}

_ORIG_STORES = [
    ("0801", "יוניברס דיזנגוף סנטר", "8", "XL", 1.00),
    ("0802", "יוניברס רמת אביב", "8", "L", 0.86),
    ("0803", "יוניברס חיפה גרנד קניון", "8", "L", 0.81),
    ("0201", "שלי כיכר המדינה", "2", "M", 0.74),
    ("0202", "שלי רעננה מרכז", "2", "M", 0.69),
    ("0701", "אקספרס פלורנטין", "7", "S", 0.52),
    ("0702", "אקספרס נווה צדק", "7", "S", 0.48),
    ("0601", "יש באר שבע", "6", "L", 0.71),
    ("0602", "יש אשדוד", "6", "M", 0.63),
    ("0401", "דיל ראשון לציון", "4", "XL", 0.92),
    ("0501", "פארם הרצליה", "5", "S", 0.44),
    ("0402", "דיל פתח תקווה", "4", "L", 0.78),
]
_CITIES = [
    "תל אביב", "ירושלים", "חיפה", "ראשון לציון", "פתח תקווה", "אשדוד", "נתניה",
    "באר שבע", "חולון", "בני ברק", "רמת גן", "אשקלון", "רחובות", "הרצליה",
    "כפר סבא", "חדרה", "מודיעין", "רעננה", "רמלה", "לוד", "נהריה", "קריית גת",
    "עפולה", "אילת", "טבריה", "נצרת עילית", "עכו", "דימונה", "כרמיאל", "יבנה",
    "קריית אתא", "אור יהודה", "ראש העין", "גבעתיים", "בת ים", "הוד השרון",
]
_FMT_NAME = {c: dsc for c, dsc in FORMATS}


def _gen_stores(total=400):
    rng = random.Random(404)
    out = list(_ORIG_STORES)
    codes = [c for c, _ in FORMATS]
    per = (total - len(out)) // len(codes) + 1
    for fc in codes:
        for i in range(per):
            if len(out) >= total:
                break
            sid = f"{fc}{100 + i:03d}"
            city = rng.choice(_CITIES)
            size = rng.choices(["S", "M", "L", "XL"], weights=[3, 4, 2, 1])[0]
            out.append((sid, f"{_FMT_NAME.get(fc, fc)} {city} {i + 1}", fc,
                        size, round(rng.uniform(0.35, 1.0), 2)))
    return out[:total]


STORES = _gen_stores(400)


WH_ITEMS = {
    "6000": ["72838191199", "7290000110011", "7290000220017", "7290000220024",
             "7290117267004", "7290000330014", "7290000330021", "7290000440017",
             "7290000440024", "7290000660019", "7290000660033", "2000000000031"],
    "6100": ["7290000110028", "7290000220031", "7290117267009", "7290000330038",
             "7290000440031", "7290000330045"],
    "6200": ["7290000110035", "7290000220048", "7290000440024", "7290000550032"],
}
WH_OF_ITEM = {bc: wh for wh, lst in WH_ITEMS.items() for bc in lst}


def build_master():
    for code, desc in FORMATS:
        put("formats", base_meta(
            f"FORMAT#{code}",
            {"format_code": code, "description": desc, "is_active": True}))
    for wid, name in WAREHOUSES:
        put("warehouses", base_meta(
            f"WAREHOUSE#{wid}",
            {"warehouse_id": wid, "name": name, "is_active": True}))
    for vid, name, lt in VENDORS:
        put("vendors", base_meta(
            f"VENDOR#{vid}",
            {"vendor_id": vid, "name": name,
             "default_lead_time_days": lt, "is_active": True}))
    for code, he, en, std in DISPLAY_TYPES:
        put("display_types", base_meta(
            f"DISPLAY_TYPE#{code}",
            {"code": code, "description_he": he, "description_en": en,
             "is_sap_standard": std}))
    for gc, desc, leader, purpose in ITEM_GROUPS:
        members = [it[0] for it in ITEMS if it[5] == gc]
        leader = leader or (members[0] if members else None)
        put("item_groups", base_meta(
            f"GROUP#{gc}",
            {"group_code": gc, "description": desc, "leader_barcode": leader,
             "purpose": purpose, "member_count": len(members)}))
    for (bc, desc, ut, ven, lead, grp, supply, dept) in ITEMS:
        item = {
            "barcode": bc, "description": desc, "unit_type": ut,
            "base_uom": "KG" if ut == "WEIGHABLE" else "EA",
            "order_uom": "CASE", "qty_per_order_unit": d(12),
            "leading_barcode": lead, "item_group_code": grp,
            "original_vendor_id": ven,
            "default_supply_method": supply,
            "dept_lv2_code": dept[0], "dept_lv2_name": dept[1],
            "is_partner_in_stock": bool(lead and lead != bc),
            "is_active": True, "record_type": "item",
        }
        row = base_meta(f"ITEM#{bc}", item)
        if lead:
            row["GSI1PK"], row["GSI1SK"] = f"LEADER#{lead}", f"ITEM#{bc}"
        if grp:
            row["GSI2PK"], row["GSI2SK"] = f"GROUP#{grp}", f"ITEM#{bc}"
        if ven:
            row["GSI3PK"], row["GSI3SK"] = f"VENDOR#{ven}", f"ITEM#{bc}"
        put("items", row)


def base_meta(pk, attrs, sk="METADATA"):
    row = {"PK": pk, "SK": sk}
    row.update(attrs)
    row.setdefault("created_at", ts(TODAY - dt.timedelta(days=120)))
    row.setdefault("updated_at", ts(TODAY))
    return row


# --------------------------------------------------------------------------
# assortment + planogram + stock + 9-box
# --------------------------------------------------------------------------
def build_assortment():
    # store-format assortment
    for code, _ in FORMATS:
        for (bc, desc, ut, ven, lead, grp, supply, dept) in ITEMS:
            if supply == "WH":
                wh = WH_OF_ITEM.get(bc, "6000")
                src = wh
            else:
                src = ven
            blocked = (code == "5" and dept[0] not in ("D50",))  # pharm narrow
            row = {
                "PK": f"FORMAT#{code}", "SK": f"ITEM#{bc}",
                "parent_scope": "STORE_FORMAT", "parent_id": code,
                "item_barcode": bc, "active_from": "2025-01-01",
                "active_to": "9999-12-31", "is_blocked_for_order": blocked,
                "supply_method": supply, "supply_vendor_id": src,
                "original_vendor_id": ven, "record_type": "assortment",
                "GSI1PK": f"ITEM#{bc}", "GSI1SK": f"FORMAT#{code}",
                "GSI2PK": f"VENDOR#{src}", "GSI2SK": f"ITEM#{bc}",
            }
            put("assortment", row)
    # warehouse assortment (unique SKUs per WH)
    for wh, items in WH_ITEMS.items():
        for bc in items:
            ven = ITEM_BY_BARCODE[bc][3]
            put("assortment", {
                "PK": f"WAREHOUSE#{wh}", "SK": f"ITEM#{bc}",
                "parent_scope": "WAREHOUSE", "parent_id": wh,
                "item_barcode": bc, "active_from": "2025-01-01",
                "active_to": "9999-12-31", "is_blocked_for_order": False,
                "supply_method": "DIRECT", "supply_vendor_id": ven,
                "original_vendor_id": ven, "record_type": "assortment",
                "GSI1PK": f"ITEM#{bc}", "GSI1SK": f"WAREHOUSE#{wh}",
                "GSI2PK": f"VENDOR#{ven}", "GSI2SK": f"ITEM#{bc}",
            })


def build_planogram():
    for sid, *_ in STORES[:20]:
        for (bc, *_rest) in ITEMS[:14]:
            put("store_planogram", {
                "PK": f"STORE#{sid}", "SK": f"ITEM#{bc}",
                "store_id": sid, "item_barcode": bc,
                "display_type_code": "ZPLA",
                "planogram_min_stock_qty": d(random.choice([2, 3, 4, 6, 8])),
                "effective_from": "2025-01-01", "record_type": "planogram",
            })


def build_9box():
    vel = ["H", "M", "L"]
    acc = ["H", "M", "L"]
    for wh, items in WH_ITEMS.items():
        for bc in items:
            v = random.choice(vel)
            a = random.choice(acc)
            lt = ITEM_BY_BARCODE[bc][3]
            lead = {"901501": 2, "901844": 1}.get(lt, random.choice([3, 5, 7]))
            fc = {"H": 1800, "M": 700, "L": 200}[v] + random.randint(-80, 120)
            reorder = round(fc / 30 * lead * 1.4)
            target = round(reorder + fc / 30 * 7)
            put("wh_9box", {
                "PK": f"WAREHOUSE#{wh}", "SK": f"ITEM#{bc}",
                "warehouse_id": wh, "item_barcode": bc,
                "velocity_class": v, "forecast_accuracy_class": a,
                "vendor_lead_time_days": lead,
                "forecast_for_period_qty": d(fc),
                "reorder_point_qty": d(reorder),
                "target_stock_level_qty": d(target),
                "effective_from": "2025-01-01",
                "derived_at": ts(TODAY), "source": "AUTO_CALC",
                "record_type": "wh_9box",
                "GSI1PK": f"BUCKET#VEL_{v}#ACC_{a}",
                "GSI1SK": f"WAREHOUSE#{wh}#ITEM#{bc}",
            })


def build_stock():
    # warehouses
    for wh, items in WH_ITEMS.items():
        for bc in items:
            on_hand = random.randint(40, 900)
            put("location_stock", stock_row("WAREHOUSE", wh, bc, on_hand))
            otw = random.choice([0, 0, 120, 240, 480])
            if otw:
                put("stock_on_the_way", otw_row("WAREHOUSE", wh, bc, otw))
    # stores (sample — full 400-store stock isn't needed for the POC)
    for sid, *_ in STORES[:20]:
        for (bc, *_rest) in ITEMS[:18]:
            on_hand = random.randint(0, 60)
            put("location_stock", stock_row("STORE", sid, bc, on_hand))
            otw = random.choice([0, 0, 0, 12, 24])
            if otw:
                put("stock_on_the_way", otw_row("STORE", sid, bc, otw))


def stock_row(scope, lid, bc, qty):
    return {
        "PK": f"{scope}#{lid}", "SK": f"ITEM#{bc}",
        "location_scope": scope, "location_id": lid, "item_barcode": bc,
        "on_hand_qty_base": d(qty), "last_counted_at": ts(TODAY, 1),
        "record_type": "location_stock",
        "GSI1PK": f"ITEM#{bc}", "GSI1SK": f"{scope}#{lid}",
    }


def otw_row(scope, lid, bc, qty):
    arr = iso(TODAY + dt.timedelta(days=random.randint(1, 5)))
    return {
        "PK": f"{scope}#{lid}", "SK": f"ITEM#{bc}",
        "location_scope": scope, "location_id": lid, "item_barcode": bc,
        "qty_base": d(qty), "next_expected_arrival_at": arr,
        "po_ids": [f"PO-{random.randint(10000, 99999)}"],
        "last_recomputed_at": ts(TODAY, 2), "record_type": "stock_on_the_way",
        "GSI1PK": f"ITEM#{bc}", "GSI1SK": f"{scope}#{lid}",
    }


# --------------------------------------------------------------------------
# MRP (WH classical + store)
# --------------------------------------------------------------------------
def ttl_for(date):
    return int((dt.datetime(date.year, date.month, date.day)
                + dt.timedelta(days=90)).timestamp())


def build_wh_mrp():
    statuses = ["PENDING", "ADOPTED", "ADOPTED", "MODIFIED", "REJECTED"]
    for back in range(DAYS):
        date = TODAY - dt.timedelta(days=back)
        sd = iso(date)
        for wh, items in WH_ITEMS.items():
            for bc in items:
                ven = ITEM_BY_BARCODE[bc][3]
                box = next((r for r in BUF.get("wh_9box", [])
                            if r["warehouse_id"] == wh
                            and r["item_barcode"] == bc), None)
                reorder = float(box["reorder_point_qty"]) if box else 200
                target = float(box["target_stock_level_qty"]) if box else 400
                lead = int(box["vendor_lead_time_days"]) if box else 5
                fc = float(box["forecast_for_period_qty"]) if box else 600
                stock = max(0, reorder - random.randint(-60, 120))
                otw = random.choice([0, 120, 240])
                sd_o = random.randint(0, 80)
                sto = random.randint(20, 220)
                recom = max(0, round(target - (stock + otw) + sto * 0.4))
                row = {
                    "PK": f"WAREHOUSE#{wh}#DATE#{sd}", "SK": f"ITEM#{bc}",
                    "snapshot_date": sd, "run_timestamp": ts(date, 3, 15),
                    "warehouse_id": wh, "item_barcode": bc, "vendor_id": ven,
                    "recom_qty_base": d(recom),
                    "recom_qty_order_unit": d(round(recom / 12, 1)),
                    "current_stock_days": d(round(stock / max(fc / 30, 1), 1)),
                    "reorder_point_qty": d(round(reorder)),
                    "target_stock_level_qty": d(round(target)),
                    "sd_orders_qty": d(sd_o), "sto_orders_qty": d(sto),
                    "forecast_coverage_qty": d(round(fc / 30 * lead)),
                    "stock_on_the_way_qty": d(otw), "lead_time_days": lead,
                    "adoption_status": random.choice(statuses),
                    "ttl_epoch": ttl_for(date), "record_type": "wh_mrp",
                    "GSI1PK": f"ITEM#{bc}#DATE#{sd}", "GSI1SK": f"WAREHOUSE#{wh}",
                    "GSI2PK": f"VENDOR#{ven}#DATE#{sd}",
                    "GSI2SK": f"WAREHOUSE#{wh}#ITEM#{bc}",
                }
                put("wh_mrp", row)


def build_store_mrp():
    statuses = ["PENDING", "ADOPTED", "ADOPTED", "MODIFIED", "REJECTED"]
    leaders = [it for it in ITEMS if not (it[4] and it[4] != it[0])]
    for back in range(DAYS):
        date = TODAY - dt.timedelta(days=back)
        sd = iso(date)
        for sid, name, fmt, size, cap in STORES[:8]:
            for (bc, desc, ut, ven, lead, grp, supply, dept) in leaders[:12]:
                if supply == "WH":
                    src = WH_OF_ITEM.get(bc, "6000")
                else:
                    src = ven
                op = random.randint(2, 40)
                safety = random.choice([4, 6, 8, 10])
                otw = random.choice([0, 0, 12, 24])
                fc = round(random.uniform(8, 60) * cap, 1)
                recom = max(0, round(fc + safety - op - otw))
                nd = iso(date + dt.timedelta(days=random.randint(1, 4)))
                row = {
                    "PK": f"STORE#{sid}#DATE#{sd}", "SK": f"LEAD#{bc}",
                    "snapshot_date": sd, "run_timestamp": ts(date, 4, 30),
                    "store_id": sid, "leading_barcode": bc,
                    "supply_method": supply, "supply_source_id": src,
                    "recom_qty_base": d(recom),
                    "recom_qty_order_unit": d(round(recom / 12, 1)),
                    "operational_stock_qty": d(op),
                    "min_safety_stock_qty": d(safety),
                    "lead_time_days": lead or 3,
                    "stock_on_the_way_qty": d(otw),
                    "forecast_coverage_qty": d(fc),
                    "next_delivery_date": nd,
                    "adoption_status": random.choice(statuses),
                    "ttl_epoch": ttl_for(date), "record_type": "store_mrp",
                    "GSI1PK": f"LEAD#{bc}#DATE#{sd}", "GSI1SK": f"STORE#{sid}",
                    "GSI2PK": f"SOURCE#{supply}#{src}#DATE#{sd}",
                    "GSI2SK": f"STORE#{sid}#LEAD#{bc}",
                }
                put("store_mrp", row)


# --------------------------------------------------------------------------
# central planner (Haluka)
# --------------------------------------------------------------------------
def build_central_planner():
    runs = [
        ("RUN-1001", "Y012", "חלוקת חלב ויוגורט - שבועי", 5, "CALCULATED",
         None, ["72838191199", "7290000110011", "7290000220017"], 0),
        ("RUN-1002", "Y012", "חלוקת מבצע אטריות מנת השף", 7, "APPLIED",
         "PROMO-2001", ["7290117267004", "7290117267009"], 2000),
        ("RUN-1003", "Y015", "דחיפת מלאי קופונים - ACES", 3, "DRAFT",
         "PROMO-3001", ["7290000440017", "7290000440024"], 1500),
    ]
    for (rid, rtype, desc, cover, status, promo, items, force) in runs:
        created = ts(TODAY - dt.timedelta(days=random.randint(1, 6)))
        meta = {
            "PK": f"RUN#{rid}", "SK": "METADATA", "run_id": rid,
            "haluka_type": rtype, "description": desc,
            "start_date": iso(TODAY + dt.timedelta(days=1)),
            "coverage_days": cover, "optional_force_qty": d(force) if force else None,
            "store_filter": [s[0] for s in STORES[:6]], "item_filter": items,
            "linked_promo_id": promo, "created_by": "supply.manager",
            "created_at": created, "status": status, "record_type": "run",
            "GSI1PK": f"STATUS#{status}", "GSI1SK": f"CREATED#{created}#RUN#{rid}",
        }
        if promo:
            meta["GSI2PK"], meta["GSI2SK"] = f"PROMO#{promo}", f"RUN#{rid}"
        put("central_planner", meta)
        for sid, name, fmt, size, cap in STORES[:6]:
            for bc in items:
                supply = ITEM_BY_BARCODE[bc][6]
                src = WH_OF_ITEM.get(bc, "6000") if supply == "WH" else ITEM_BY_BARCODE[bc][3]
                op = random.randint(2, 30)
                plano = random.choice([3, 4, 6])
                otw = random.choice([0, 12])
                fc = round(random.uniform(10, 50) * cap, 1)
                base = max(0, round(fc + plano - op - otw))
                size_w = {"S": 0.6, "M": 1.0, "L": 1.5, "XL": 2.2}[size]
                forced = round(force * size_w * cap / 12) if force else 0
                final = base + forced
                put("central_planner", {
                    "PK": f"RUN#{rid}",
                    "SK": f"ALLOCATION#STORE#{sid}#LEAD#{bc}",
                    "run_id": rid, "store_id": sid, "store_name": name,
                    "leading_barcode": bc,
                    "item_desc": ITEM_BY_BARCODE[bc][1],
                    "supply_method": supply, "supply_source_id": src,
                    "recom_qty_base": d(base),
                    "recom_qty_order_unit": d(round(base / 12, 1)),
                    "operational_stock_qty": d(op),
                    "planogram_min_stock_qty": d(plano),
                    "stock_on_the_way_qty": d(otw),
                    "forecast_coverage_qty": d(fc),
                    "store_size_class": size, "sale_capability_score": d(cap),
                    "forced_qty": d(forced), "final_qty": d(final),
                    "record_type": "allocation",
                })


# --------------------------------------------------------------------------
# forecast
# --------------------------------------------------------------------------
def build_forecast():
    ps = iso(TODAY)
    pe = iso(TODAY + dt.timedelta(days=14))
    for (bc, desc, ut, ven, lead, grp, supply, dept) in ITEMS:
        if lead and lead != bc:
            continue
        prov = round(random.uniform(200, 4000))
        src = random.choice(["PROVIDER", "PROVIDER", "USER_OVERRIDE",
                             "CANNIBALIZATION_ADJUSTED"])
        val = prov if src == "PROVIDER" else round(prov * random.uniform(0.7, 1.3))
        for scope, lid in [("WAREHOUSE", WH_OF_ITEM.get(bc, "6000")),
                           ("STORE", "0801")]:
            put("forecast", {
                "PK": f"{scope}#{lid}#ITEM#{bc}",
                "SK": f"PERIOD#{ps}#{pe}",
                "location_scope": scope, "location_id": lid,
                "item_barcode": bc, "item_desc": desc,
                "period_start": ps, "period_end": pe,
                "forecast_qty_base": d(val), "forecast_source": src,
                "provider_value_qty_base": d(prov),
                "confidence_class": random.choice(["H", "M", "L"]),
                "anchor_tec_qty": d(round(val * 1.05)),
                "provider_run_id": "FCRUN-2026-05-28",
                "last_updated_at": ts(TODAY), "last_updated_by": "forecast.svc",
                "ttl_epoch": ttl_for(TODAY), "record_type": "forecast",
                "GSI1PK": f"ITEM#{bc}",
                "GSI1SK": f"PERIOD#{ps}#{scope}#{lid}",
            })


# --------------------------------------------------------------------------
# promotions (regular + ACES)
# --------------------------------------------------------------------------
def build_promotions():
    plan = (["COMPLETED"] * 18 + ["ONGOING"] * 12
            + ["UPCOMING_SOON"] * 22 + ["UPCOMING_LATER"] * 8)
    reps = [it for it in ITEMS if not (it[4] and it[4] != it[0])]
    for idx, phase in enumerate(plan):
        rep = reps[idx % len(reps)]
        bc, grp, supply = rep[0], rep[5], rep[6]
        fmt = PROMO_FORMATS[idx % len(PROMO_FORMATS)]
        disp = PROMO_DISPLAY_CODES[idx % len(PROMO_DISPLAY_CODES)]
        ptype = PROMO_TYPES[idx % len(PROMO_TYPES)][0]
        cat = round(random.uniform(5, 28), 2)
        price = round(cat * (1 - random.choice([0.15, 0.2, 0.25, 0.3, 0.33, 0.4, 0.5])), 2)
        start, end = _promo_dates(phase, idx)
        members = ([m[0] for m in ITEMS if m[5] == grp] or [bc])[:3] if grp else [bc]
        stores = _stores_for_format(fmt)
        managing_wh = WH_OF_ITEM.get(bc) if supply == "WH" else None
        pid = f"PROMO-{2001 + idx}"
        agg = _alloc_block(pid, fmt, disp, ptype, members, stores, phase, start)
        trade = round(agg["appr"] * random.choice([0.7, 0.85, 0.95, 1.15, 1.35]))
        _write_promo(pid, "REGULAR_UNIVERSE", fmt, disp, ptype, bc, grp,
                     cat, price, start, end, phase, agg, trade, managing_wh)

    # ---- ACES (secondary: last-minute, price unknown, strength scale) ----
    for j, phase in enumerate(["UPCOMING_SOON", "ONGOING"]):
        rep = reps[(j + 2) % len(reps)]
        bc, grp, supply = rep[0], rep[5], rep[6]
        fmt = PROMO_FORMATS[(j + 1) % len(PROMO_FORMATS)]
        disp = PROMO_DISPLAY_CODES[(j + 3) % len(PROMO_DISPLAY_CODES)]
        start, end = _promo_dates(phase, j)
        stores = _stores_for_format(fmt)
        managing_wh = WH_OF_ITEM.get(bc) if supply == "WH" else None
        pid = f"PROMO-{3001 + j}"
        agg = _alloc_block(pid, fmt, disp, None, [bc], stores, phase, start)
        trade = round(agg["appr"] * random.choice([0.9, 1.2]))
        _write_promo(pid, "ACES", fmt, disp, None, bc, grp, None, None,
                     start, end, phase, agg, trade, managing_wh)
        for cls, mult, sel in [("VERY_DEEP", 1.6, False), ("DEEP", 1.25, True),
                               ("STRONG", 1.0, False), ("MEDIUM", 0.7, False)]:
            put("promotions", {
                "PK": f"PROMO#{pid}", "SK": f"ACES_STRENGTH#{cls}",
                "promo_id": pid, "strength_class": cls,
                "anchor_tec_forecast_qty": d(round(agg["appr"] * mult)),
                "selected_by_user": sel, "record_type": "aces_strength",
            })


PROMO_TYPES = [
    ("Y003", "אחוז הנחה"), ("Y001", "מחיר קבוע"), ("Y004", "הנחה כספית"),
    ("Y007", "מתנה"), ("Y010", "מדיה"), ("Y011", "כפולה"),
]
PROMO_TYPE_HE = dict(PROMO_TYPES)
PROMO_DISPLAY_CODES = [
    "Z000", "Z137", "Z138", "Z141", "Z142", "Z144", "Z160", "Z166", "Z169",
    "Z170", "Z171", "Z173", "Z174", "Z185", "Z186", "Z188", "Z189", "Z190",
    "Z193", "Z206", "Z209", "Z210", "Z219", "Z221", "Z226", "Z230", "Z232",
    "Z238", "Z239", "Z240", "Z241", "Z245", "Z251", "Z301", "Z302",
]
PROMO_FORMATS = ["8", "2", "7", "6", "4", "5"]


def _promo_dates(phase, i):
    if phase == "COMPLETED":
        s = TODAY - dt.timedelta(days=26 - i * 3)
        return s, s + dt.timedelta(days=12)
    if phase == "ONGOING":
        s = TODAY - dt.timedelta(days=3 + (i % 3) * 2)
        return s, TODAY + dt.timedelta(days=8 - (i % 3))
    if phase == "UPCOMING_SOON":
        s = TODAY + dt.timedelta(days=2 + (i % 7) * 2)
        return s, s + dt.timedelta(days=14)
    s = TODAY + dt.timedelta(days=18 + (i % 3) * 4)
    return s, s + dt.timedelta(days=14)


def _stores_for_format(fmt):
    pool = [s for s in STORES if s[2] == fmt] or STORES[:30]
    k = min(len(pool), random.randint(18, 45))
    return random.sample(pool, k)


def _promo_status(phase):
    return {
        "COMPLETED": "DISTRIBUTED", "ONGOING": "DISTRIBUTED",
        "UPCOMING_SOON": "WAITING_DISTRIBUTION", "UPCOMING_LATER": "WAITING_QC",
    }[phase]


def _alloc_block(pid, fmt, disp, ptype, members, stores, phase, start):
    ordering = phase in ("COMPLETED", "ONGOING", "UPCOMING_SOON")
    has_sales = phase in ("COMPLETED", "ONGOING")
    progress = {"COMPLETED": 1.0,
                "ONGOING": round(random.uniform(0.45, 0.7), 2)}.get(phase, 0.0)
    agg = {"orig": 0, "appr": 0, "ord": 0, "sold": 0, "recom": 0,
           "wh_recom": 0, "wh_ord": 0, "stores": set()}
    per_item_recom = {}
    for (sid, sname, sfmt, size, capv) in stores:
        cap = float(capv)
        for mbc in members:
            info = ITEM_BY_BARCODE[mbc]
            mven, msupply = info[3], info[6]
            mwh = WH_OF_ITEM.get(mbc) if msupply == "WH" else None
            orig = round(random.uniform(60, 380) * cap)
            appr = round(orig * random.uniform(0.85, 1.18))
            recom = round(appr * random.uniform(0.9, 1.08))
            ordered = round(recom * random.uniform(0.7, 1.05)) if ordering else 0
            sold = round(appr * random.uniform(0.6, 1.3) * progress) if has_sales else 0
            agg["orig"] += orig
            agg["appr"] += appr
            agg["ord"] += ordered
            agg["sold"] += sold
            agg["recom"] += recom
            agg["stores"].add(sid)
            per_item_recom[mbc] = per_item_recom.get(mbc, 0) + recom
            dept = info[7]
            put("promotions", {
                "PK": f"PROMO#{pid}", "SK": f"ALLOC#STORE#{sid}#ITEM#{mbc}",
                "promo_id": pid, "store_id": sid, "store_name": sname,
                "format_code": fmt, "display_type_code": disp,
                "item_barcode": mbc, "item_desc": info[1],
                "category_code": dept[0], "category_name": dept[1],
                "vendor_id": mven, "supply_method": msupply,
                "managing_warehouse_id": mwh, "promo_type_code": ptype,
                "phase": phase,
                "original_forecast_qty": d(orig),
                "approved_forecast_qty": d(appr),
                "store_recommended_qty": d(recom),
                "store_ordered_qty": d(ordered),
                "sold_qty": d(sold),
                "record_type": "allocation",
                "GSI3PK": f"STORE#{sid}#ITEM#{mbc}",
                "GSI3SK": f"START#{iso(start)}#PROMO#{pid}",
            })
    for mbc in members:
        info = ITEM_BY_BARCODE[mbc]
        if info[6] != "WH":
            continue
        mwh = WH_OF_ITEM.get(mbc, "6000")
        wh_recom = round(per_item_recom.get(mbc, 0) * random.uniform(1.0, 1.15))
        wh_ord = round(wh_recom * random.uniform(0.75, 1.05)) if ordering else 0
        agg["wh_recom"] += wh_recom
        agg["wh_ord"] += wh_ord
        put("promotions", {
            "PK": f"PROMO#{pid}", "SK": f"WHSUP#{mwh}#ITEM#{mbc}",
            "promo_id": pid, "warehouse_id": mwh, "item_barcode": mbc,
            "item_desc": info[1], "vendor_id": info[3],
            "wh_recommended_qty": d(wh_recom), "wh_ordered_qty": d(wh_ord),
            "record_type": "wh_supply",
        })
    return agg


def _write_promo(pid, atype, fmt, disp, ptype, rep_bc, grp, cat, price,
                 start, end, phase, agg, trade, managing_wh):
    disc = round((1 - price / cat) * 100, 1) if (cat and price) else None
    status = _promo_status(phase)
    desc = (f"{ITEM_BY_BARCODE[rep_bc][1]} — {PROMO_TYPE_HE.get(ptype, 'מבצע')}"
            if atype == "REGULAR_UNIVERSE"
            else f"ACES {ITEM_BY_BARCODE[rep_bc][1]}")
    put("promotions", {
        "PK": f"PROMO#{pid}", "SK": "METADATA", "promo_id": pid,
        "activity_type": atype, "format_code": fmt, "display_type_code": disp,
        "promo_type_code": ptype, "is_newspaper": disp == "Z000",
        "loyalty_segment_code": random.choice(["000", "001", "002"]),
        "coupon_required": atype == "ACES",
        "representing_barcode": rep_bc, "item_group_code": grp,
        "description": desc,
        "sap_action_number": f"AKT{random.randint(100000, 999999)}",
        "campaign_code": f"CMP-{random.randint(2000, 2999)}",
        "catalog_price": d(cat) if cat else None,
        "promo_price": d(price) if price is not None else None,
        "discount_pct": d(disc) if disc is not None else None,
        "start_date": iso(start), "end_date": iso(end), "phase": phase,
        "vendor_id": ITEM_BY_BARCODE[rep_bc][3],
        "managing_warehouse_id": managing_wh,
        "trade_agreement_qty": d(trade), "store_count": len(agg["stores"]),
        "original_forecast_total": d(agg["orig"]),
        "approved_forecast_total": d(agg["appr"]),
        "ordered_total": d(agg["ord"]), "sold_total": d(agg["sold"]),
        "store_recommended_total": d(agg["recom"]),
        "wh_recommended_total": d(agg["wh_recom"]),
        "wh_ordered_total": d(agg["wh_ord"]),
        "otif_pct": d(random.randint(82, 99)),
        "availability_pct": d(random.randint(90, 99)),
        "shrink_pct": d(round(random.uniform(1.0, 4.0), 1)),
        "status": status, "wave_strategy": "WAVES", "record_type": "promo",
        "GSI1PK": f"STATUS#{status}", "GSI1SK": f"START#{iso(start)}#PROMO#{pid}",
        "GSI2PK": f"FORMAT#{fmt}", "GSI2SK": f"START#{iso(start)}#PROMO#{pid}",
        "GSI4PK": f"REP_BARCODE#{rep_bc}", "GSI4SK": f"START#{iso(start)}#PROMO#{pid}",
    })


# --------------------------------------------------------------------------
# purchase orders
# --------------------------------------------------------------------------
def build_purchase_orders():
    orders = [
        ("PO-50001", "WH_PURCHASE", "WAREHOUSE", "6000", "WAREHOUSE", "6000",
         "901212", "MRP_AUTO", None, "CONFIRMED",
         ["72838191199", "7290000110011", "7290000220017"]),
        ("PO-50002", "STO", "WAREHOUSE", "6000", "STORE", "0801",
         None, "CENTRAL_PLANNER", "RUN-1002", "IN_TRANSIT",
         ["7290117267004", "7290117267009"]),
        ("PO-50003", "DIRECT", "STORE", "0801", "STORE", "0801",
         "901501", "MANUAL", None, "DELIVERED",
         ["7290000550018", "7290000550025"]),
        ("PO-50004", "WH_PURCHASE", "WAREHOUSE", "6100", "WAREHOUSE", "6100",
         "901455", "PROMO", "PROMO-2001", "SUBMITTED",
         ["7290117267009", "7290000330038"]),
        ("PO-50005", "STO", "WAREHOUSE", "6000", "STORE", "0401",
         None, "CENTRAL_PLANNER", "RUN-1001", "DRAFT",
         ["7290000110011", "7290000220017"]),
        ("PO-50006", "DIRECT", "STORE", "0701", "STORE", "0701",
         "901844", "MRP_AUTO", None, "DELIVERED",
         ["2000000000017", "2000000000024"]),
    ]
    for (pid, ptype, sscope, sid, dscope, did, ven, origin, link,
         status, items) in orders:
        created = ts(TODAY - dt.timedelta(days=random.randint(0, 9)))
        promo = link if link and link.startswith("PROMO") else None
        run = link if link and link.startswith("RUN") else None
        header = {
            "PK": f"PO#{pid}", "SK": "HEADER", "po_id": pid,
            "po_number": pid.replace("PO-", ""), "po_type": ptype,
            "source_location_scope": sscope, "source_location_id": sid,
            "destination_location_scope": dscope, "destination_location_id": did,
            "vendor_id": ven, "origin": origin, "linked_promo_id": promo,
            "linked_run_id": run, "status": status, "created_at": created,
            "expected_delivery_date": iso(TODAY + dt.timedelta(days=3)),
            "delivered_at": ts(TODAY) if status == "DELIVERED" else None,
            "record_type": "header",
            "GSI1PK": f"SOURCE#{sscope}#{sid}", "GSI1SK": f"DATE#{created}#PO#{pid}",
        }
        if ven:
            header["GSI2PK"] = f"VENDOR#{ven}"
            header["GSI2SK"] = f"DATE#{created}#PO#{pid}"
        if promo:
            header["GSI4PK"] = f"PROMO#{promo}"
            header["GSI4SK"] = f"DATE#{created}#PO#{pid}"
        put("purchase_orders", header)
        for i, bc in enumerate(items, 1):
            qty = random.randint(60, 600)
            line = {
                "PK": f"PO#{pid}", "SK": f"LINE#{i:04d}", "po_id": pid,
                "line_no": i, "item_barcode": bc,
                "item_desc": ITEM_BY_BARCODE.get(bc, ("", "?"))[1],
                "qty_base": d(qty), "qty_order_unit": d(round(qty / 12, 1)),
                "source_mrp_line_id": None,
                "unit_cost": d(round(random.uniform(2, 25), 2)),
                "record_type": "line",
                "GSI3PK": f"ITEM#{bc}",
                "GSI3SK": f"DATE#{created}#PO#{pid}#LINE#{i:04d}",
            }
            put("purchase_orders", line)


# --------------------------------------------------------------------------
# cannibalization
# --------------------------------------------------------------------------
def build_cannibalization():
    # tree 1: by-design parallel milk (the X/Y/Z example, total 20000)
    t1 = "TREE-MILK-01"
    created = ts(TODAY - dt.timedelta(days=10))
    put("cannibalization_trees", {
        "PK": f"TREE#{t1}", "SK": "METADATA", "tree_id": t1,
        "tree_type": "USER_PARALLEL_BY_DESIGN", "status": "APPROVED",
        "created_by": "supply.manager", "created_at": created,
        "approved_by": "supply.manager", "approved_at": ts(TODAY - dt.timedelta(days=9)),
        "source_suggestion_id": None,
        "notes": "חלב 3% מ-3 ספקים מקבילים - שמירה על נפח אספקה",
        "record_type": "tree",
        "GSI1PK": "STATUS#APPROVED", "GSI1SK": f"CREATED#{created}#TREE#{t1}",
    })
    milk = [("7290000110011", 50, 10000), ("7290000110028", 10, 6000),
            ("7290000110035", 40, 4000)]
    total = sum(m[2] for m in milk)
    for bc, infl, base in milk:
        adj = round(total * infl / 100)
        put("cannibalization_trees", {
            "PK": f"TREE#{t1}", "SK": f"MEMBER#ITEM#{bc}",
            "tree_id": t1, "item_barcode": bc,
            "item_desc": ITEM_BY_BARCODE[bc][1],
            "vendor_id": ITEM_BY_BARCODE[bc][3],
            "influence_percent": d(infl),
            "baseline_forecast_qty": d(base),
            "adjusted_forecast_qty": d(adj),
            "last_recomputed_at": ts(TODAY), "record_type": "member",
            "GSI2PK": f"ITEM#{bc}", "GSI2SK": f"TREE#{t1}",
        })
    # tree 2: vendor-suggested mistake (snacks overlap), DRAFT, from suggestion
    t2 = "TREE-SNACK-02"
    created2 = ts(TODAY - dt.timedelta(days=2))
    put("cannibalization_trees", {
        "PK": f"TREE#{t2}", "SK": "METADATA", "tree_id": t2,
        "tree_type": "VENDOR_SUGGESTED_MISTAKE", "status": "DRAFT",
        "created_by": "forecast.svc", "created_at": created2,
        "approved_by": None, "approved_at": None,
        "source_suggestion_id": "SUGG-9001",
        "notes": "חטיפים מתחרים - הצעת ספק החיזוי, ממתין לאישור",
        "record_type": "tree",
        "GSI1PK": "STATUS#DRAFT", "GSI1SK": f"CREATED#{created2}#TREE#{t2}",
    })
    snacks = [("7290000440024", 60, 5000), ("7290000440031", 40, 3200)]
    total2 = sum(s[2] for s in snacks)
    for bc, infl, base in snacks:
        adj = round(total2 * infl / 100)
        put("cannibalization_trees", {
            "PK": f"TREE#{t2}", "SK": f"MEMBER#ITEM#{bc}",
            "tree_id": t2, "item_barcode": bc,
            "item_desc": ITEM_BY_BARCODE[bc][1],
            "vendor_id": ITEM_BY_BARCODE[bc][3],
            "influence_percent": d(infl),
            "baseline_forecast_qty": d(base), "adjusted_forecast_qty": d(adj),
            "last_recomputed_at": ts(TODAY), "record_type": "member",
            "GSI2PK": f"ITEM#{bc}", "GSI2SK": f"TREE#{t2}",
        })
    # suggestions
    suggs = [
        ("SUGG-9001", "MERGED_INTO_TREE", ["7290000440024", "7290000440031"], 0.82, t2),
        ("SUGG-9002", "PENDING", ["7290000220017", "7290000220024"], 0.74, None),
        ("SUGG-9003", "PENDING", ["7290000550018", "7290000550025"], 0.91, None),
    ]
    for sid, status, members, conf, tree in suggs:
        sat = ts(TODAY - dt.timedelta(days=random.randint(1, 6)))
        put("cannibalization_suggestions", {
            "PK": f"SUGGESTION#{sid}", "SK": "METADATA", "suggestion_id": sid,
            "provider_run_id": "FCRUN-2026-05-28", "suggested_at": sat,
            "status": status, "member_barcodes": members,
            "member_descs": [ITEM_BY_BARCODE.get(b, ("", "?"))[1] for b in members],
            "confidence": d(conf), "tree_id": tree,
            "record_type": "suggestion",
            "GSI1PK": f"STATUS#{status}",
            "GSI1SK": f"SUGGESTED#{sat}#SUGGESTION#{sid}",
        })


# --------------------------------------------------------------------------
# OOS blocks + trade agreements
# --------------------------------------------------------------------------
def build_oos_and_trade():
    blocks = [
        ("BLK-1", "0701", "7290000440024", "OOS", None),
        ("BLK-2", "0702", "7290000550018", "CENTRAL_PLANNER_MANAGED", None),
        ("BLK-3", "0801", "7290117267004", "CAMPAIGN_PREP", "PROMO-2001"),
        ("BLK-4", "0401", "7290000440017", "CAMPAIGN_PREP", "PROMO-3001"),
    ]
    for bid, sid, bc, reason, promo in blocks:
        bf = iso(TODAY - dt.timedelta(days=2))
        row = {
            "PK": f"STORE#{sid}#ITEM#{bc}", "SK": f"FROM#{bf}#BLOCK#{bid}",
            "block_id": bid, "store_id": sid, "item_barcode": bc,
            "item_desc": ITEM_BY_BARCODE.get(bc, ("", "?"))[1],
            "blocked_from": bf, "blocked_to": iso(TODAY + dt.timedelta(days=12)),
            "reason": reason, "linked_promo_id": promo,
            "blocked_by": "supply.manager", "is_active": True,
            "record_type": "oos_block",
            "GSI1PK": f"ITEM#{bc}", "GSI1SK": f"FROM#{bf}#STORE#{sid}",
        }
        if promo:
            row["GSI2PK"] = f"PROMO#{promo}"
            row["GSI2SK"] = f"STORE#{sid}#ITEM#{bc}"
        put("oos_blocks", row)
    agreements = [
        ("AGR-1", "901455", "ITEM_GROUP", "GRP_NOODLE", 20000, "PROMO-2001"),
        ("AGR-2", "901212", "ITEM_GROUP", "GRP_YOG", 30000, "PROMO-2002"),
        ("AGR-3", "901310", "ITEM", "7290000440017", 15000, "PROMO-3001"),
    ]
    for aid, ven, stype, scope, qty, promo in agreements:
        ps = iso(TODAY)
        pe = iso(TODAY + dt.timedelta(days=30))
        put("trade_agreements", {
            "PK": f"VENDOR#{ven}#SCOPE#{stype}#{scope}",
            "SK": f"PERIOD#{ps}#{pe}#AGREEMENT#{aid}",
            "agreement_id": aid, "vendor_id": ven, "scope_type": stype,
            "scope_id": scope, "agreement_qty_base": d(qty),
            "period_start": ps, "period_end": pe, "linked_promo_id": promo,
            "notes": "הסכם מסחרי לתקופת המבצע", "record_type": "trade_agreement",
            "GSI1PK": f"PROMO#{promo}", "GSI1SK": f"VENDOR#{ven}#{stype}#{scope}",
        })


# --------------------------------------------------------------------------
# KPI snapshots (14 days, 6 KPIs)
# --------------------------------------------------------------------------
def build_kpis():
    defs = [
        ("forecast_accuracy", "% דיוק חיזוי", "Forecast accuracy", 82, 85, "up"),
        ("store_touch", "% נגיעות המלצות סניפים", "Store recommendation touch", 64, 75, "up"),
        ("wh_adoption", "% אימוץ המלצות מחסנים", "WH recommendation adoption", 73, 80, "up"),
        ("availability", "% זמינות", "Availability", 96, 98, "up"),
        ("otif", "% OTIF", "On-time in-full", 89, 92, "up"),
        ("shrink", "% פחת", "Shrink", 2.4, 2.0, "down"),
    ]
    for code, he, en, base, target, direction in defs:
        for back in range(DAYS - 1, -1, -1):
            date = TODAY - dt.timedelta(days=back)
            drift = (DAYS - back) * (0.25 if direction == "up" else -0.05)
            noise = random.uniform(-1.2, 1.2)
            value = round(base + drift + noise, 1)
            unit = "%"
            put("kpi", {
                "PK": f"KPI#{code}", "SK": f"DATE#{iso(date)}",
                "kpi_code": code, "label_he": he, "label_en": en,
                "date": iso(date), "value": d(value), "unit": unit,
                "target": d(target), "direction": direction,
                "record_type": "kpi",
            })


# --------------------------------------------------------------------------
# table name mapping + writer
# --------------------------------------------------------------------------
TABLE_NAME = {
    "items": "cp_items", "item_groups": "cp_item_groups", "formats": "cp_formats",
    "stores": "cp_stores", "warehouses": "cp_warehouses", "vendors": "cp_vendors",
    "display_types": "cp_display_types", "assortment": "cp_assortment",
    "store_planogram": "cp_store_planogram", "wh_9box": "cp_wh_9box",
    "location_stock": "cp_location_stock", "stock_on_the_way": "cp_stock_on_the_way",
    "wh_mrp": "cp_wh_mrp", "store_mrp": "cp_store_mrp",
    "central_planner": "cp_central_planner", "purchase_orders": "cp_purchase_orders",
    "forecast": "cp_forecast", "promotions": "cp_promotions",
    "cannibalization_trees": "cp_cannibalization_trees",
    "cannibalization_suggestions": "cp_cannibalization_suggestions",
    "oos_blocks": "cp_oos_blocks", "trade_agreements": "cp_trade_agreements",
    "kpi": "cp_kpi_snapshots",
}


def add_stores():
    for sid, name, fmt, size, cap in STORES:
        put("stores", base_meta(f"STORE#{sid}", {
            "store_id": sid, "name": name, "format_code": fmt,
            "store_size_class": size, "sale_capability_score": d(cap),
            "is_active": True, "record_type": "store",
            "GSI1PK": f"FORMAT#{fmt}", "GSI1SK": f"STORE#{sid}",
        }))


def build_all():
    build_master()
    add_stores()
    build_assortment()
    build_planogram()
    build_9box()
    build_stock()
    build_wh_mrp()
    build_store_mrp()
    build_central_planner()
    build_forecast()
    build_promotions()
    build_purchase_orders()
    build_cannibalization()
    build_oos_and_trade()
    build_kpis()


def strip_none(item):
    return {k: v for k, v in item.items() if v is not None}


def validate():
    problems = 0
    total = 0
    for logical, rows in BUF.items():
        for r in rows:
            total += 1
            if "PK" not in r or "SK" not in r:
                print(f"  MISSING KEY in {logical}: {r}")
                problems += 1
    return total, problems


def _purge(table):
    with table.batch_writer() as bw:
        kwargs = {"ProjectionExpression": "PK, SK"}
        while True:
            resp = table.scan(**kwargs)
            for it in resp.get("Items", []):
                bw.delete_item(Key={"PK": it["PK"], "SK": it["SK"]})
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek


def write_to_dynamo():
    import boto3
    ddb = boto3.resource("dynamodb")
    for logical, rows in BUF.items():
        name = TABLE_NAME[logical]
        table = ddb.Table(name)
        _purge(table)
        with table.batch_writer(overwrite_by_pkeys=["PK", "SK"]) as bw:
            for r in rows:
                bw.put_item(Item=strip_none(r))
        print(f"  wrote {len(rows):4d} -> {name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    build_all()
    total, problems = validate()
    print(f"Generated {total} items across {len(BUF)} tables.")
    for logical in sorted(BUF):
        print(f"  {TABLE_NAME[logical]:32s} {len(BUF[logical]):5d}")
    if problems:
        print(f"VALIDATION FAILED: {problems} rows missing keys")
        sys.exit(1)

    if args.dry_run:
        print("dry-run: no writes performed.")
        return
    write_to_dynamo()
    print("Seed complete.")


if __name__ == "__main__":
    main()
