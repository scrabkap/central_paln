/* ============================================================
   Central Planner POC — SPA (vanilla JS, no build step)
   ============================================================ */
"use strict";

// API base is the Lambda Function URL, injected at deploy time via config.js
// (window.CP_API). Paths below already include the /api prefix.
const API = (typeof window !== "undefined" && window.CP_API
  ? String(window.CP_API).replace(/\/+$/, "")
  : "");
const state = {
  token: localStorage.getItem("cp_token") || "",
  user: localStorage.getItem("cp_user") || "",
  route: "overview",
  cache: {},
};

/* ---------------- API ---------------- */
async function api(path, opts = {}) {
  const headers = Object.assign(
    { "content-type": "application/json" },
    opts.headers || {}
  );
  if (state.token) headers["authorization"] = "Bearer " + state.token;
  const res = await fetch(API + path, Object.assign({}, opts, { headers }));
  let body = {};
  try { body = await res.json(); } catch (e) { body = { ok: false, error: "bad_response" }; }
  return body;
}

async function load(path) {
  if (state.cache[path]) return state.cache[path];
  const r = await api(path);
  if (r && r.ok) { state.cache[path] = r.data; return r.data; }
  if (r && r.error === "unauthorized") { logout(); }
  return null;
}

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => {
  if (n == null || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return esc(n);
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
};
const money = (n) => (n == null ? "—" : "₪" + num(n));
const pct = (n) => (n == null ? "—" : num(n) + "%");
const sdate = (iso) => {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0].slice(2)}` : esc(iso);
};
const BADGE = {
  ADOPTED: "green", MODIFIED: "blue", PENDING: "amber", REJECTED: "red",
  DISTRIBUTED: "green", WAITING_DISTRIBUTION: "blue", WAITING_QC: "amber", QUEUED_TONIGHT: "violet",
  DELIVERED: "green", IN_TRANSIT: "blue", CONFIRMED: "blue", SUBMITTED: "amber", DRAFT: "gray", CANCELLED: "red",
  APPLIED: "green", CALCULATED: "blue",
  RECEIVED: "green", ORDERED: "blue", PLANNED: "amber",
  APPROVED: "green", RETIRED: "gray", MERGED_INTO_TREE: "blue",
  ACES: "violet", REGULAR_UNIVERSE: "blue",
  DIRECT: "blue", WH: "violet",
  H: "green", M: "amber", L: "gray",
  USER_PARALLEL_BY_DESIGN: "violet", VENDOR_SUGGESTED_MISTAKE: "amber", USER_DEFINED_OTHER: "gray",
};
const STATUS_HE = {
  WAITING_QC: "ממתין לבקרה", WAITING_DISTRIBUTION: "ממתין להפצה", DISTRIBUTED: "הופץ",
  QUEUED_TONIGHT: "יופץ בלילה", ADOPTED: "אומץ", MODIFIED: "שונה", PENDING: "ממתין",
  REJECTED: "נדחה", APPLIED: "הוחל", CALCULATED: "חושב", DRAFT: "טיוטה",
  SUBMITTED: "נשלח", CONFIRMED: "אושר", IN_TRANSIT: "בדרך", DELIVERED: "סופק", CANCELLED: "בוטל",
  ORDERED: "הוזמן", PLANNED: "מתוכנן", RECEIVED: "התקבל",
  ACES: "אסים", REGULAR_UNIVERSE: "פעילות שוטפת",
  USER_PARALLEL_BY_DESIGN: "מקבילי מתוכנן", VENDOR_SUGGESTED_MISTAKE: "הצעת ספק",
};
const badge = (v, label) =>
  v == null ? "—" : `<span class="badge ${BADGE[v] || "gray"}">${esc(label || STATUS_HE[v] || v)}</span>`;

/* ---------------- charts (inline SVG) ---------------- */
function lineChart({ labels, datasets, height = 200 }) {
  const W = 720, H = height, pad = { l: 38, r: 14, t: 14, b: 26 };
  const all = datasets.flatMap((d) => d.data).filter((x) => x != null);
  const max = Math.max(1, ...all), min = Math.min(0, ...all);
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const n = labels.length || 1;
  const xx = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yy = (v) => pad.t + ih - ((v - min) / (max - min || 1)) * ih;
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * ih;
    const val = max - (i / 4) * (max - min);
    g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#1c2949"/>`;
    g += `<text x="6" y="${y + 3}">${num(Math.round(val))}</text>`;
  }
  const step = Math.ceil(n / 8);
  let xl = "";
  labels.forEach((lb, i) => {
    if (i % step === 0 || i === n - 1)
      xl += `<text x="${xx(i)}" y="${H - 8}" text-anchor="middle">${esc(sdate(lb))}</text>`;
  });
  let paths = "";
  datasets.forEach((d) => {
    const pts = d.data.map((v, i) => `${xx(i)},${yy(v || 0)}`);
    const area = `M${pad.l},${yy(min)} L` + pts.join(" L") + ` L${xx(n - 1)},${yy(min)} Z`;
    paths += `<path d="${area}" fill="${d.color}" opacity="0.08"/>`;
    paths += `<polyline points="${pts.join(" ")}" fill="none" stroke="${d.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    d.data.forEach((v, i) => { paths += `<circle cx="${xx(i)}" cy="${yy(v || 0)}" r="2.6" fill="${d.color}"/>`; });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${xl}${paths}</svg>`;
}

function sparkline(data, color = "#6366f1") {
  if (!data || !data.length) return "";
  const W = 200, H = 40, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * (H - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `M0,${H} L` + pts.join(" L") + ` L${W},${H} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area}" fill="${color}" opacity="0.12"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function ring(value, target, color = "#6366f1") {
  const r = 22, c = 2 * Math.PI * r, frac = Math.max(0, Math.min(1, (value || 0) / 100));
  return `<svg class="k-ring" viewBox="0 0 52 52">
    <circle cx="26" cy="26" r="${r}" fill="none" stroke="#1c2949" stroke-width="6"/>
    <circle cx="26" cy="26" r="${r}" fill="none" stroke="${color}" stroke-width="6"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" stroke-linecap="round"
      transform="rotate(-90 26 26)"/>
  </svg>`;
}

function vbars(items, color = "#8b5cf6", height = 180) {
  if (!items.length) return `<div class="empty">אין נתונים</div>`;
  const W = 520, H = height, pad = { l: 10, r: 10, t: 10, b: 38 };
  const max = Math.max(1, ...items.map((i) => i.value));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = Math.min(64, (iw / items.length) * 0.6);
  let bars = "";
  items.forEach((it, i) => {
    const x = pad.l + (i + 0.5) * (iw / items.length) - bw / 2;
    const bh = (it.value / max) * ih;
    const y = pad.t + ih - bh;
    bars += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${it.color || color}"/>`;
    bars += `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" fill="#e8edf7" font-weight="700">${num(it.value)}</text>`;
    bars += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

/* ---------------- components ---------------- */
function kpiCard(k) {
  const trend = (k.trend || []).map((t) => Number(t.value));
  const color = k.code === "shrink" ? "#f59e0b" : "#6366f1";
  const good = k.direction === "down" ? k.delta < 0 : k.delta >= 0;
  const arrow = (k.direction === "down" ? k.delta < 0 : k.delta > 0) ? "▲" : "▼";
  return `<div class="kpi" data-drill="kpi:${esc(k.code)}">
    <div class="k-top">
      <div class="k-label">${esc(k.label_he || k.label_en || k.code)}</div>
      ${ring(Number(k.value), Number(k.target), color)}
    </div>
    <div class="k-val">${num(k.value)}<small>${esc(k.unit || "")}</small></div>
    <div class="k-meta">
      <span class="${good ? "trend-up" : "trend-down"}">${arrow} ${num(Math.abs(k.delta))}</span>
      <span class="k-target">יעד ${num(k.target)}${esc(k.unit || "")}</span>
    </div>
    <div class="k-spark">${sparkline(trend, color)}</div>
  </div>`;
}

function tableHTML(cols, rows, opts = {}) {
  if (!rows || !rows.length) return `<div class="card"><div class="empty">אין רשומות להצגה</div></div>`;
  const head = cols.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => {
    const drill = opts.drill ? ` data-drill="${esc(opts.drill(r))}" class="clickable"` : "";
    const tds = cols.map((c) => {
      const v = c.render ? c.render(r) : esc(r[c.key]);
      return `<td class="${c.num ? "num" : ""}">${v}</td>`;
    }).join("");
    return `<tr${drill}>${tds}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function kv(pairs) {
  return `<div class="kv">` + pairs.filter((p) => p).map((p) =>
    `<div class="kv-item"><div class="kv-k">${esc(p[0])}</div><div class="kv-v">${p[1] == null ? "—" : p[1]}</div></div>`
  ).join("") + `</div>`;
}

function openModal(title, sub, bodyHTML) {
  $("#modal-root").innerHTML = `<div class="modal-back">
    <div class="modal">
      <div class="modal-head">
        <div><h3>${title}</h3>${sub ? `<div class="m-sub">${sub}</div>` : ""}</div>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
    </div>
  </div>`;
}
function closeModal() { $("#modal-root").innerHTML = ""; }

const spinner = `<div class="loader"><div class="spinner"></div></div>`;

function chipsRow(pairs) {
  return `<div class="chips">` + pairs.map((p) =>
    `<div class="chip"><div class="c-val">${p[1]}</div><div class="c-lbl">${esc(p[0])}</div></div>`
  ).join("") + `</div>`;
}
const ADOPT_COLOR = { ADOPTED: "#22c55e", MODIFIED: "#38bdf8", PENDING: "#f59e0b", REJECTED: "#ef4444" };
function adoptionBars(rows) {
  return ["ADOPTED", "MODIFIED", "PENDING", "REJECTED"].map((s) => ({
    label: STATUS_HE[s], color: ADOPT_COLOR[s],
    value: rows.filter((r) => r.adoption_status === s).length,
  }));
}
function chartCard(title, inner) {
  return `<div class="card"><div class="card-head"><h3>${title}</h3></div>${inner}</div>`;
}
const sumBy = (rows, key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);

/* ---------------- pages ---------------- */
const PAGES = {};

PAGES.overview = async () => {
  const d = await load("/api/overview");
  if (!d) return `<div class="empty">לא ניתן לטעון נתונים</div>`;
  const kpis = (d.kpis || []).map(kpiCard).join("");
  const c = d.counts || {};
  const chips = [
    ["מבצעים פעילים", c.active_promotions], ["מבצעי אסים", c.aces_pending],
    ["הזמנות רכש פתוחות", c.open_pos], ["הצעות קניבליזציה", c.pending_suggestions],
    ["חסימות אזל מהמלאי", c.oos_blocks], ["פריטי מחסן (MRP)", c.wh_items],
    ["פריטי סניף (MRP)", c.store_items],
  ].map((x) => `<div class="chip"><div class="c-val">${num(x[1])}</div><div class="c-lbl">${x[0]}</div></div>`).join("");
  const trend = d.mrp_trend || [];
  const lc = lineChart({
    labels: trend.map((t) => t.date),
    datasets: [
      { name: "מחסן", color: "#8b5cf6", data: trend.map((t) => Math.round(t.wh_qty)) },
      { name: "סניף", color: "#22d3ee", data: trend.map((t) => Math.round(t.store_qty)) },
    ],
  });
  const sb = (d.promo_status_breakdown || []).map((s) => ({
    label: STATUS_HE[s.status] || s.status, value: s.count,
    color: { DISTRIBUTED: "#22c55e", WAITING_DISTRIBUTION: "#38bdf8", WAITING_QC: "#f59e0b", QUEUED_TONIGHT: "#8b5cf6" }[s.status] || "#6366f1",
  }));
  return `
    <div class="kpi-grid">${kpis}</div>
    <div class="section chips">${chips}</div>
    <div class="section row cols-2">
      <div class="card">
        <div class="card-head"><h3>המלצות MRP — 14 ימים אחרונים</h3></div>
        ${lc}
        <div class="legend"><span><i style="background:#8b5cf6"></i> מחסן (יח' בסיס)</span><span><i style="background:#22d3ee"></i> סניף (יח' בסיס)</span></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>סטטוס מבצעים</h3></div>
        ${vbars(sb)}
      </div>
    </div>`;
};

PAGES["wh-mrp"] = async () => {
  const rows = await load("/api/wh-mrp") || [];
  const dates = [...new Set(rows.map((r) => r.snapshot_date))].sort().reverse();
  const whs = [...new Set(rows.map((r) => r.warehouse_id))].sort();
  state._whmrp = rows;
  const latest = dates[0];
  const cur = rows.filter((r) => r.snapshot_date === latest);
  const totRecom = cur.reduce((a, r) => a + Number(r.recom_qty_base || 0), 0);
  const adoptRate = cur.length ? Math.round(100 * cur.filter((r) => r.adoption_status === "ADOPTED").length / cur.length) : 0;
  const avgDays = cur.length ? (cur.reduce((a, r) => a + Number(r.current_stock_days || 0), 0) / cur.length).toFixed(1) : 0;
  const chips = `<div class="chips">
    <div class="chip"><div class="c-val">${num(totRecom)}</div><div class="c-lbl">סה"כ כמות מומלצת (${sdate(latest)})</div></div>
    <div class="chip"><div class="c-val">${adoptRate}%</div><div class="c-lbl">אחוז אימוץ</div></div>
    <div class="chip"><div class="c-val">${avgDays}</div><div class="c-lbl">ממוצע ימי מלאי</div></div>
    <div class="chip"><div class="c-val">${cur.length}</div><div class="c-lbl">שורות המלצה</div></div>
  </div>`;
  const whAgg = whs.map((w) => ({
    label: "מחסן " + w, color: "#8b5cf6",
    value: Math.round(sumBy(cur.filter((r) => r.warehouse_id === w), "recom_qty_base")),
  }));
  const charts = `<div class="section row cols-2">
    ${chartCard(`כמות מומלצת לפי מחסן (${sdate(latest)})`, vbars(whAgg))}
    ${chartCard("פילוח אימוץ המלצות", vbars(adoptionBars(cur)))}
  </div>`;
  const filters = `<div class="filters">
    <select class="select" id="f-date">${dates.map((x) => `<option value="${x}">${sdate(x)}</option>`).join("")}</select>
    <select class="select" id="f-wh"><option value="">כל המחסנים</option>${whs.map((x) => `<option value="${x}">מחסן ${x}</option>`).join("")}</select>
    <select class="select" id="f-adopt"><option value="">כל הסטטוסים</option>${["PENDING", "ADOPTED", "MODIFIED", "REJECTED"].map((x) => `<option value="${x}">${STATUS_HE[x]}</option>`).join("")}</select>
    <div class="spacer"></div><span class="count-tag" id="cnt"></span>
  </div>`;
  return `<div class="card-sub" style="margin-bottom:16px">MRP קלאסי — חישוב יומי לפריטים פעילים במגוון בשיטת אספקה 2 (מחסן), מונע מטבלת 9-BOX.</div>
    ${chips}${charts}<div class="section">${filters}<div id="grid"></div></div>`;
};
PAGES["wh-mrp"].after = () => {
  const cols = [
    { key: "item_barcode", label: "פריט", render: (r) => itemCell(r.item_barcode) },
    { key: "warehouse_id", label: "מחסן", render: (r) => "מחסן " + esc(r.warehouse_id) },
    { key: "vendor_id", label: "ספק", render: (r) => vendorName(r.vendor_id) },
    { key: "recom_qty_base", label: "מומלץ (בסיס)", num: true, render: (r) => `<span class="strong">${num(r.recom_qty_base)}</span>` },
    { key: "recom_qty_order_unit", label: "מומלץ (הזמנה)", num: true, render: (r) => num(r.recom_qty_order_unit) },
    { key: "current_stock_days", label: "ימי מלאי", num: true, render: (r) => num(r.current_stock_days) },
    { key: "reorder_point_qty", label: "נק' הזמנה", num: true, render: (r) => num(r.reorder_point_qty) },
    { key: "target_stock_level_qty", label: "מלאי יעד", num: true, render: (r) => num(r.target_stock_level_qty) },
    { key: "adoption_status", label: "אימוץ", render: (r) => badge(r.adoption_status) },
  ];
  const apply = () => {
    const date = $("#f-date").value, wh = $("#f-wh").value, ad = $("#f-adopt").value;
    let rows = state._whmrp.filter((r) => r.snapshot_date === date);
    if (wh) rows = rows.filter((r) => r.warehouse_id === wh);
    if (ad) rows = rows.filter((r) => r.adoption_status === ad);
    rows.sort((a, b) => Number(b.recom_qty_base) - Number(a.recom_qty_base));
    $("#grid").innerHTML = tableHTML(cols, rows, { drill: (r) => `whmrp:${r.warehouse_id}|${r.item_barcode}|${r.snapshot_date}` });
    $("#cnt").textContent = rows.length + " שורות";
  };
  ["f-date", "f-wh", "f-adopt"].forEach((id) => $("#" + id).addEventListener("change", apply));
  apply();
};

PAGES["store-mrp"] = async () => {
  const rows = await load("/api/store-mrp") || [];
  state._storemrp = rows;
  const dates = [...new Set(rows.map((r) => r.snapshot_date))].sort().reverse();
  const stores = [...new Set(rows.map((r) => r.store_id))].sort();
  const latest = dates[0];
  const cur = rows.filter((r) => r.snapshot_date === latest);
  const adoptRate = cur.length ? Math.round(100 * cur.filter((r) => r.adoption_status === "ADOPTED").length / cur.length) : 0;
  const tiles = chipsRow([
    [`סה"כ מומלץ (${sdate(latest)})`, num(Math.round(sumBy(cur, "recom_qty_base")))],
    ["אחוז אימוץ", adoptRate + "%"],
    ["סניפים פעילים", String(new Set(cur.map((r) => r.store_id)).size)],
    ["שורות המלצה", String(cur.length)],
  ]);
  const supAgg = [
    { label: "מחסן", color: "#8b5cf6", value: Math.round(sumBy(cur.filter((r) => r.supply_method === "WH"), "recom_qty_base")) },
    { label: "ישיר", color: "#22d3ee", value: Math.round(sumBy(cur.filter((r) => r.supply_method === "DIRECT"), "recom_qty_base")) },
  ];
  const charts = `<div class="section row cols-2">
    ${chartCard("כמות מומלצת לפי שיטת אספקה", vbars(supAgg))}
    ${chartCard("פילוח אימוץ המלצות", vbars(adoptionBars(cur)))}
  </div>`;
  const filters = `<div class="filters">
    <select class="select" id="f-date">${dates.map((x) => `<option value="${x}">${sdate(x)}</option>`).join("")}</select>
    <select class="select" id="f-store"><option value="">כל הסניפים</option>${stores.map((x) => `<option value="${x}">${esc(storeName(x))}</option>`).join("")}</select>
    <select class="select" id="f-sup"><option value="">כל שיטות האספקה</option><option value="WH">מחסן</option><option value="DIRECT">ישיר</option></select>
    <div class="spacer"></div><span class="count-tag" id="cnt"></span>
  </div>`;
  return `<div class="card-sub" style="margin-bottom:16px">MRP סניף — חישוב לכל יום הזמנה ברמת פריט מוביל. המלצה = מלאי תפעולי + מלאי בדרך − מלאי ביטחון − חיזוי לתקופת הכיסוי.</div>
    ${tiles}${charts}<div class="section">${filters}<div id="grid"></div></div>`;
};
PAGES["store-mrp"].after = () => {
  const cols = [
    { key: "leading_barcode", label: "פריט מוביל", render: (r) => itemCell(r.leading_barcode) },
    { key: "store_id", label: "סניף", render: (r) => esc(storeName(r.store_id)) },
    { key: "supply_method", label: "אספקה", render: (r) => badge(r.supply_method, r.supply_method === "WH" ? "מחסן" : "ישיר") },
    { key: "supply_source_id", label: "מקור", render: (r) => r.supply_method === "WH" ? "מחסן " + esc(r.supply_source_id) : vendorName(r.supply_source_id) },
    { key: "recom_qty_base", label: "מומלץ", num: true, render: (r) => `<span class="strong">${num(r.recom_qty_base)}</span>` },
    { key: "operational_stock_qty", label: "מלאי תפעולי", num: true, render: (r) => num(r.operational_stock_qty) },
    { key: "min_safety_stock_qty", label: "מלאי ביטחון", num: true, render: (r) => num(r.min_safety_stock_qty) },
    { key: "forecast_coverage_qty", label: "חיזוי כיסוי", num: true, render: (r) => num(r.forecast_coverage_qty) },
    { key: "next_delivery_date", label: "אספקה הבאה", render: (r) => sdate(r.next_delivery_date) },
    { key: "adoption_status", label: "אימוץ", render: (r) => badge(r.adoption_status) },
  ];
  const apply = () => {
    const date = $("#f-date").value, st = $("#f-store").value, sup = $("#f-sup").value;
    let rows = state._storemrp.filter((r) => r.snapshot_date === date);
    if (st) rows = rows.filter((r) => r.store_id === st);
    if (sup) rows = rows.filter((r) => r.supply_method === sup);
    rows.sort((a, b) => Number(b.recom_qty_base) - Number(a.recom_qty_base));
    $("#grid").innerHTML = tableHTML(cols, rows, { drill: (r) => `storemrp:${r.store_id}|${r.leading_barcode}|${r.snapshot_date}` });
    $("#cnt").textContent = rows.length + " שורות";
  };
  ["f-date", "f-store", "f-sup"].forEach((id) => $("#" + id).addEventListener("change", apply));
  apply();
};

PAGES["central-planner"] = async () => {
  const d = await load("/api/central-planner");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._cp = d;
  const cols = [
    { key: "run_id", label: "מס' חלוקה", render: (r) => `<span class="strong">${esc(r.run_id)}</span>` },
    { key: "haluka_type", label: "סוג", render: (r) => `<span class="badge gray">${esc(r.haluka_type)}</span>` },
    { key: "description", label: "תיאור", render: (r) => `<span dir="auto">${esc(r.description)}</span>` },
    { key: "start_date", label: "תאריך התחלה", render: (r) => sdate(r.start_date) },
    { key: "coverage_days", label: "ימי כיסוי", num: true },
    { key: "optional_force_qty", label: "דחיפה בכוח", num: true, render: (r) => num(r.optional_force_qty) },
    { key: "linked_promo_id", label: "מבצע מקושר", render: (r) => r.linked_promo_id ? `<span class="badge violet">${esc(r.linked_promo_id)}</span>` : "—" },
    { key: "status", label: "סטטוס", render: (r) => badge(r.status) },
  ];
  const runs = (d.runs || []).slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const allocs = d.allocations || [];
  const tiles = chipsRow([
    ["חלוקות", String(runs.length)],
    ["הוחלו", String(runs.filter((r) => r.status === "APPLIED").length)],
    ["בטיוטה/חישוב", String(runs.filter((r) => r.status !== "APPLIED").length)],
    ['סה"כ כמות סופית', num(Math.round(sumBy(allocs, "final_qty")))],
  ]);
  const runAgg = runs.map((r) => ({
    label: r.run_id.replace("RUN-", "#"), color: "#6366f1",
    value: Math.round(sumBy(allocs.filter((a) => a.run_id === r.run_id), "final_qty")),
  }));
  const forceAgg = runs.map((r) => ({
    label: r.run_id.replace("RUN-", "#"), color: "#8b5cf6",
    value: Math.round(sumBy(allocs.filter((a) => a.run_id === r.run_id), "forced_qty")),
  }));
  const charts = `<div class="section row cols-2">
    ${chartCard("כמות סופית לפי חלוקה", vbars(runAgg))}
    ${chartCard("כמות דחיפה בכוח לפי חלוקה", vbars(forceAgg))}
  </div>`;
  return `<div class="card-sub" style="margin-bottom:16px">חלוקות (Haluka) — יצירת הזמנות לסניפים לאירועים ומצבי אזל. בחר חלוקה לצפייה בהקצאות לכל סניף-פריט כולל דחיפת כמות לפי גודל ויכולת מכר.</div>
    ${tiles}${charts}<div class="section">${tableHTML(cols, runs, { drill: (r) => `run:${r.run_id}` })}</div>`;
};

/* ---------------- promotions (פעילות שוטפת) ---------------- */
const PROMO_NOW = new Date(2026, 4, 29); // 2026-05-29
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const promoNowPlus = (days) => { const d = new Date(PROMO_NOW); d.setDate(d.getDate() + days); return ymd(d); };
function promoPhase(p) {
  const s = new Date(p.start_date), e = new Date(p.end_date);
  if (e < PROMO_NOW) return "COMPLETED";
  if (s <= PROMO_NOW && PROMO_NOW <= e) return "ONGOING";
  return "UPCOMING";
}
const promoDays = (s) => Math.round((new Date(s) - PROMO_NOW) / 86400000);
const promoDisc = (p) => p.discount_pct != null ? Number(p.discount_pct)
  : (p.catalog_price && p.promo_price ? Math.round((1 - p.promo_price / p.catalog_price) * 100) : null);
const sumOf = (arr, k) => arr.reduce((a, x) => a + Number(x[k] || 0), 0);
const avgOf = (arr, k) => arr.length ? Math.round(arr.reduce((a, x) => a + Number(x[k] || 0), 0) / arr.length) : null;
const cap100 = (v) => v == null ? null : Math.min(100, Math.round(v));
// forecast quality as a symmetric accuracy (0-100): 100 = sold equals approved
const fqAcc = (sold, appr) => (sold > 0 && appr > 0) ? Math.max(0, Math.round(100 - Math.abs(sold - appr) / appr * 100)) : null;
const fqTone = (q) => q == null ? "gray" : q >= 90 ? "green" : q >= 75 ? "amber" : "red";
const adoptTone = (q) => q == null ? "gray" : q >= 90 ? "green" : q >= 70 ? "amber" : "red";
const PTYPE_HE = { Y001: "מחיר קבוע", Y003: "אחוז הנחה", Y004: "הנחה כספית", Y007: "מתנה", Y009: "נקודות מועדון", Y010: "מדיה", Y011: "כפולה" };
const LOYALTY_HE = { "000": "כל הלקוחות", "001": "חברי מועדון", "002": "זהב", "003": "פלטינום" };
const ptypeName = (c) => c ? (PTYPE_HE[c] || c) : "—";
function resolvePf(key, text) {
  text = (text || "").trim();
  if (!text) return "";
  const opts = (state._promoOpts && state._promoOpts[key]) || [];
  let o = opts.find((x) => x.text === text);
  if (o) return o.value;
  o = opts.find((x) => String(x.value).toLowerCase() === text.toLowerCase());
  if (o) return o.value;
  const t = text.toLowerCase();
  o = opts.find((x) => x.text.toLowerCase().includes(t) || String(x.value).toLowerCase().includes(t));
  return o ? o.value : "";
}

/* ----- decision state -----
   The trade agreement IS the approved forecast: the SCM owns this value,
   sees its impact vs the original (provider) forecast, and locks it in.
   No in-system approval workflow — coordination with trade is done directly. */
const DEC_HE = { awaiting: "דורש החלטה", locked: "נעול", closed: "הסתיים" };
const STATUS_CHIPS = [["all", "הכל"], ["awaiting", "דורש החלטה"], ["locked", "נעול"], ["ongoing", "פעילים"], ["completed", "הסתיימו"]];
function loadDecisions() {
  try { return JSON.parse(localStorage.getItem("cp_decisions") || "{}"); } catch (e) { return {}; }
}
function saveDecisions() { localStorage.setItem("cp_decisions", JSON.stringify(state._decisions || {})); }
function getDecision(pid) { return (state._decisions || {})[pid] || null; }
function setDecision(pid, dec) {
  state._decisions = state._decisions || {};
  if (dec === null) delete state._decisions[pid]; else state._decisions[pid] = dec;
  saveDecisions();
}
// effective trade-agreement / approved value (an SCM edit can override the seed)
function effectiveTrade(p) {
  const dec = getDecision(p.promo_id);
  if (dec && dec.value != null) return Number(dec.value);
  return Number(p.trade_agreement_qty || 0);
}
function promoDecisionStatus(p) {
  const dec = getDecision(p.promo_id), ph = p._phase || promoPhase(p);
  if (dec && dec.locked) return "locked";
  if (ph === "COMPLETED") return "closed";
  return "awaiting";
}

/* ----- deterministic synthesis (so POC numbers are stable per promo) ----- */
function hashFrac(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const jit = (seed, lo, hi) => lo + (hi - lo) * hashFrac(seed);
const vendorDeliveryRate = (p) => Math.round(jit("dlv#" + p.vendor_id + "#" + p.display_type_code, 0.93, 1.12) * 100) / 100;

/* ----- role-colored number + cells ----- */
const roleNum = (value, role) => `<span dir="ltr" class="role-num ${role}">${num(value)}</span>`;
// gap of `value` vs reference `ref` (e.g. trade agreement vs original forecast)
function gapInfo(value, ref) {
  if (!ref) return null;
  return { frac: (value - ref) / ref, pct: Math.round((value - ref) / ref * 100) };
}
function gapCell(value, ref) {
  const gi = gapInfo(value, ref);
  if (gi === null) return `<span class="mut">—</span>`;
  const mag = Math.min(1, Math.abs(gi.frac));
  const w = Math.max(gi.pct === 0 ? 0 : 6, Math.round(mag * 50));
  let dir = "gap-even";
  if (gi.pct > 0) dir = "gap-over"; else if (gi.pct < 0) dir = "gap-under";
  const txt = (gi.pct > 0 ? "+" : "") + gi.pct + "%";
  return `<span class="gap-cell ${dir}"><span class="gap-bar"><i style="width:${w}%"></i></span><span class="gap-num">${txt}</span></span>`;
}
function lifecyclePill(p) {
  const ph = p._phase || promoPhase(p), st = p.status;
  let cls = "s-draft", lbl = STATUS_HE[st] || st;
  if (ph === "ONGOING") { cls = "s-live"; lbl = "פעיל"; }
  else if (ph === "COMPLETED") { cls = "s-done"; lbl = "הסתיים"; }
  else if (st === "WAITING_QC") { cls = "s-qc"; lbl = "ממתין לבקרה"; }
  else if (st === "WAITING_DISTRIBUTION") { cls = "s-approved"; lbl = "מאושר"; }
  else if (st === "DISTRIBUTED") { cls = "s-dist"; lbl = "הופץ"; }
  return `<span class="lc-pill ${cls}">${esc(lbl)}</span>`;
}
const liveDayN = (p) => Math.max(1, Math.round((PROMO_NOW - new Date(p.start_date)) / 86400000) + 1);
function startsCell(p) {
  const ph = p._phase || promoPhase(p);
  if (ph === "ONGOING") return `<span style="color:var(--role-actual);font-weight:600">פעיל · יום ${liveDayN(p)}</span>`;
  if (ph === "COMPLETED") return `<span class="mut">הסתיים</span>`;
  const dd = p._days != null ? p._days : promoDays(p.start_date);
  return `<span style="${dd <= 7 ? "color:var(--state-warn);font-weight:600" : ""}">בעוד ${dd} ימים</span>`;
}
function decisionPill(p) {
  const st = promoDecisionStatus(p);
  return `<span class="dec-pill ${st}">${DEC_HE[st] || st}</span>`;
}

PAGES.promotions = async () => {
  const d = await load("/api/promotions");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._promo = d;
  state._promoF = state._promoF || { status: "all", format: "", display: "", vendor: "", category: "", item: "", ptype: "", wh: "", startFrom: promoNowPlus(-14), startTo: promoNowPlus(14) };
  state._promoX = new Set();
  state._promoOpts = {};
  state._decisions = loadDecisions();
  return `<div id="promo-root"></div>`;
};
PAGES.promotions.after = () => {
  const root = document.getElementById("promo-root");
  if (!root) return;
  root.addEventListener("change", (e) => {
    const el = e.target.closest("[data-pf]");
    if (el) { state._promoF[el.dataset.pf] = el.dataset.pf === "format" || el.dataset.pf === "vendor" || el.dataset.pf === "display" || el.dataset.pf === "category" || el.dataset.pf === "item" || el.dataset.pf === "ptype" || el.dataset.pf === "wh" ? resolvePf(el.dataset.pf, el.value) : el.value; renderPromo(); }
  });
  root.addEventListener("click", (e) => {
    const tt = e.target.closest("[data-techtoggle]");
    if (tt) { state._promoTech = !state._promoTech; renderPromo(); return; }
    const sf = e.target.closest("[data-status]");
    if (sf) { state._promoF.status = sf.dataset.status; renderPromo(); return; }
    const o = e.target.closest("[data-open]");
    if (o) { const s = o.dataset.open; s.startsWith("promo:") ? navigate("promotions/" + s.slice(6)) : openAggPopup(s); return; }
    const t = e.target.closest("[data-toggle]");
    if (t) { state._promoX.has(t.dataset.toggle) ? state._promoX.delete(t.dataset.toggle) : state._promoX.add(t.dataset.toggle); renderPromo(); }
  });
  renderPromo();
};
function statusFilterOk(p) {
  const f = state._promoF.status, ph = p._phase || promoPhase(p);
  if (!f || f === "all") return true;
  if (f === "awaiting") return promoDecisionStatus(p) === "awaiting";
  if (f === "locked") return promoDecisionStatus(p) === "locked";
  if (f === "ongoing") return ph === "ONGOING";
  if (f === "completed") return ph === "COMPLETED";
  return true;
}
// filters on the campaign START date being inside the [startFrom, startTo] window
function dateFilterOk(p) {
  const F = state._promoF;
  if (F.startFrom && p.start_date < F.startFrom) return false;
  if (F.startTo && p.start_date > F.startTo) return false;
  return true;
}

function promoScope() {
  const d = state._promo, F = state._promoF;
  const promos = (d.promotions || []).filter((p) => p.activity_type === "REGULAR_UNIVERSE")
    .map((p) => ({ ...p, _phase: promoPhase(p), _days: promoDays(p.start_date), _disc: promoDisc(p) }));
  const pmap = {}; promos.forEach((p) => { pmap[p.promo_id] = p; });
  const inScope = (p) => statusFilterOk(p) && dateFilterOk(p);
  const dimOk = (a) => (!F.format || a.format_code === F.format)
    && (!F.display || a.display_type_code === F.display)
    && (!F.vendor || a.vendor_id === F.vendor)
    && (!F.category || a.category_code === F.category)
    && (!F.item || a.item_barcode === F.item)
    && (!F.ptype || a.promo_type_code === F.ptype)
    && (!F.wh || (a.managing_warehouse_id || "") === F.wh);
  // "lines" are per-promo-item aggregates (store rows are loaded on drill)
  const allocs = (d.promo_items || []).filter((a) => { const p = pmap[a.promo_id]; return p && inScope(p) && dimOk(a); });
  const whCat = (w) => { const it = LK.items[w.item_barcode]; return it ? it.dept_lv2_code : null; };
  const whsup = (d.wh_supply || []).filter((w) => {
    const p = pmap[w.promo_id]; if (!p || !inScope(p)) return false;
    return (!F.format || p.format_code === F.format) && (!F.display || p.display_type_code === F.display)
      && (!F.vendor || w.vendor_id === F.vendor) && (!F.category || whCat(w) === F.category)
      && (!F.item || w.item_barcode === F.item)
      && (!F.ptype || p.promo_type_code === F.ptype) && (!F.wh || (w.warehouse_id || "") === F.wh);
  });
  const ids = new Set(allocs.map((a) => a.promo_id));
  return { promos, pmap, allocs, whsup, scoped: promos.filter((p) => ids.has(p.promo_id)) };
}

function groupMap(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
function buildPromoTree(allocs, pmap) {
  const out = [];
  for (const [fcode, fa] of groupMap(allocs, (a) => a.format_code)) {
    const fnode = { id: "F#" + fcode, depth: 0, kind: "format", fmt: fcode, code: fcode, open: "fmt:" + fcode, label: formatName(fcode), allocs: fa, pmap, children: [] };
    for (const [vcode, va] of groupMap(fa, (a) => a.vendor_id)) {
      const vnode = { id: fnode.id + "|V#" + vcode, depth: 1, kind: "vendor", code: vcode, open: "ven:" + fcode + "|" + vcode, label: LK.vendors[vcode] || vcode, allocs: va, pmap, children: [] };
      for (const [dcode, da] of groupMap(va, (a) => a.display_type_code)) {
        const dnode = { id: vnode.id + "|D#" + dcode, depth: 2, kind: "display", code: dcode, open: "disp:" + fcode + "|" + vcode + "|" + dcode, label: displayName(dcode), allocs: da, pmap, children: [] };
        for (const [ccode, ca] of groupMap(da, (a) => a.category_code)) {
          const cnode = { id: dnode.id + "|C#" + ccode, depth: 3, kind: "category", code: ccode, open: "cat:" + fcode + "|" + vcode + "|" + dcode + "|" + ccode, label: (ca[0] && ca[0].category_name) || ccode, allocs: ca, pmap, children: [] };
          for (const [pid, pa] of groupMap(ca, (a) => a.promo_id)) {
            cnode.children.push({ id: "P#" + pid + "@" + cnode.id, depth: 4, kind: "promo", code: pid, open: "promo:" + pid, promo: pmap[pid], label: pmap[pid] ? pmap[pid].description : pid, allocs: pa, pmap });
          }
          dnode.children.push(cnode);
        }
        vnode.children.push(dnode);
      }
      fnode.children.push(vnode);
    }
    out.push(fnode);
  }
  return out;
}
function storeCountOf(pids, pmap) {
  const s = new Set();
  pids.forEach((pid) => { const p = pmap[pid]; if (p && p.store_ids) p.store_ids.forEach((x) => s.add(x)); });
  return s.size;
}
function aggNode(node) {
  return { orig: sumOf(node.allocs || [], "original_forecast_qty") };
}
function nodeHasAwaiting(node) {
  if (node.kind === "promo") return node.promo && promoDecisionStatus(node.promo) === "awaiting" ? 1 : 0;
  return (node.children || []).some(nodeHasAwaiting) ? 1 : 0;
}
function sortPromoTree(nodes) {
  nodes.sort((a, b) => {
    if (a.kind === "promo" && b.kind === "promo") {
      const aw = (promoDecisionStatus(b.promo) === "awaiting") - (promoDecisionStatus(a.promo) === "awaiting");
      if (aw) return aw;
      return new Date(a.promo.start_date) - new Date(b.promo.start_date);
    }
    const aw = nodeHasAwaiting(b) - nodeHasAwaiting(a);
    if (aw) return aw;
    return String(a.label).localeCompare(String(b.label), "he");
  });
  nodes.forEach((n) => { if (n.children) sortPromoTree(n.children); });
}
function nodeTrade(node) {
  if (node.kind === "promo") return effectiveTrade(node.promo);
  return [...new Set(node.allocs.map((a) => a.promo_id))].reduce((s, pid) => s + (node.pmap[pid] ? effectiveTrade(node.pmap[pid]) : 0), 0);
}
const LEVEL_HE = { format: "פורמט", vendor: "ספק", display: "אמצעי תצוגה", category: "היררכיית פריט", promo: "מבצע" };
// RTL: collapsed chevron points left ('<'); rotates to point down when open
const chevronSVG = (open) => `<svg class="tree-chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${open ? -90 : 0}deg)"><path d="M15 6l-6 6 6 6"/></svg>`;
function renderPromoNode(node) {
  const m = aggNode(node);
  const isPromo = node.kind === "promo";
  const exp = !isPromo && state._promoX.has(node.id);
  const provider = m.orig, trade = nodeTrade(node);
  const chevron = isPromo ? `<span class="tree-chev-sp"></span>` : chevronSVG(exp);
  const tag = `<span class="lvl-tag">${LEVEL_HE[node.kind] || ""}</span>`;
  const code = state._promoTech && node.code ? ` <span class="tree-code" dir="ltr">${esc(node.code)}</span>` : "";
  const name = `<span class="tree-name" data-open="${esc(node.open)}">${tag}<span dir="auto" class="${isPromo ? "" : "strong"}">${esc(node.label)}</span>${code}</span>${isPromo ? " " + lifecyclePill(node.promo) : ""}`;
  const rowCls = isPromo ? "leaf clickable" : "agg clickable";
  const rowAttr = isPromo ? `class="${rowCls}"` : `data-toggle="${esc(node.id)}" class="${rowCls}"`;
  const pN = roleNum(provider, isPromo ? "provider" : "muted");
  const tN = trade ? roleNum(trade, isPromo ? "agreement" : "muted") : `<span class="mut">—</span>`;
  let decCell, startCell;
  if (isPromo) {
    decCell = decisionPill(node.promo);
    startCell = startsCell(node.promo);
  } else {
    const awaiting = [...new Set(node.allocs.map((a) => a.promo_id))]
      .filter((pid) => node.pmap[pid] && promoDecisionStatus(node.pmap[pid]) === "awaiting").length;
    decCell = awaiting ? `<span class="dec-count" data-status="awaiting">${awaiting}</span>` : `<span class="mut">—</span>`;
    startCell = `<span class="mut">—</span>`;
  }
  const row = `<tr ${rowAttr}>
    <td style="padding-inline-start:${node.depth * 18 + 12}px">${chevron}${name}</td>
    <td class="num">${pN}</td>
    <td class="num">${tN}</td>
    <td class="num">${gapCell(trade, provider)}</td>
    <td>${decCell}</td>
    <td>${startCell}</td></tr>`;
  return row + (exp ? node.children.map(renderPromoNode).join("") : "");
}

/* aggregate-level popups (format / vendor / display) */
function aggMetrics(allocs, pmap) {
  const pids = new Set(allocs.map((a) => a.promo_id));
  let trade = 0;
  pids.forEach((pid) => { const p = pmap[pid]; if (p) trade += effectiveTrade(p); });
  return {
    storeCount: storeCountOf(pids, pmap), promoCount: pids.size,
    itemCount: new Set(allocs.map((a) => a.item_barcode)).size,
    orig: sumOf(allocs, "original_forecast_qty"), trade,
  };
}
function aggBreakdown(allocs, pmap, keyFn, labelFn, openFn, colTitle) {
  let rows = "";
  for (const [k, arr] of groupMap(allocs, keyFn)) {
    const m = aggMetrics(arr, pmap);
    rows += `<tr class="clickable" data-open="${esc(openFn(k))}">
      <td><span dir="auto">${esc(labelFn(k))}</span></td>
      <td class="num">${roleNum(m.orig, "provider")}</td>
      <td class="num">${m.trade ? roleNum(m.trade, "agreement") : "—"}</td>
      <td class="num">${gapCell(m.trade, m.orig)}</td></tr>`;
  }
  return `<h4>${esc(colTitle)}</h4><div class="table-wrap"><table class="data"><thead><tr><th>${esc(colTitle)}</th><th class="num">חיזוי מקורי</th><th class="num">הסכם מסחרי</th><th class="num">פער מול מקורי</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function openAggPopup(spec) {
  const ci = spec.indexOf(":"); const kind = spec.slice(0, ci), arg = spec.slice(ci + 1);
  const { allocs, pmap } = promoScope();
  let na, title, breakdown = "";
  if (kind === "fmt") {
    na = allocs.filter((a) => a.format_code === arg);
    title = "פורמט · " + formatName(arg);
    breakdown = aggBreakdown(na, pmap, (a) => a.vendor_id, (v) => LK.vendors[v] || v, (v) => "ven:" + arg + "|" + v, "ספקים");
  } else if (kind === "ven") {
    const [f, v] = arg.split("|");
    na = allocs.filter((a) => a.format_code === f && a.vendor_id === v);
    title = "ספק · " + (LK.vendors[v] || v) + " · " + formatName(f);
    breakdown = aggBreakdown(na, pmap, (a) => a.display_type_code, (dd) => displayName(dd), (dd) => "disp:" + f + "|" + v + "|" + dd, "אמצעי תצוגה");
  } else if (kind === "disp") {
    const [f, v, dd] = arg.split("|");
    na = allocs.filter((a) => a.format_code === f && a.vendor_id === v && a.display_type_code === dd);
    title = displayName(dd) + " · " + (LK.vendors[v] || v) + " · " + formatName(f);
    breakdown = aggBreakdown(na, pmap, (a) => a.category_code, (cc) => (na.find((x) => x.category_code === cc) || {}).category_name || cc, (cc) => "cat:" + f + "|" + v + "|" + dd + "|" + cc, "היררכיית פריט");
  } else {
    const [f, v, dd, cc] = arg.split("|");
    na = allocs.filter((a) => a.format_code === f && a.vendor_id === v && a.display_type_code === dd && a.category_code === cc);
    const cname = (na[0] && na[0].category_name) || cc;
    title = cname + " · " + displayName(dd) + " · " + (LK.vendors[v] || v);
    breakdown = aggBreakdown(na, pmap, (a) => a.promo_id, (pid) => pmap[pid] ? pmap[pid].description : pid, (pid) => "promo:" + pid, "מבצעים");
  }
  const m = aggMetrics(na, pmap);
  const maxF = Math.max(m.orig, m.trade, 1);
  const bar = (label, val, color) => `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${label}</span><span class="strong" dir="ltr">${num(val)}</span></div><div class="bar" style="height:10px"><i style="width:${Math.round(val / maxF * 100)}%;background:${color}"></i></div></div>`;
  const body = `<div class="card" style="background:var(--bg-2)">
    ${bar("חיזוי מקורי", m.orig, "var(--role-provider)")}${m.trade ? bar("הסכם מסחרי", m.trade, "var(--role-agreement)") : ""}</div>
    ${breakdown}`;
  openModal(esc(title), `${m.promoCount} מבצעים · ${m.storeCount} סניפים · ${m.itemCount} פריטים`, body);
}

function renderPromo() {
  const root = document.getElementById("promo-root");
  if (!root) return;
  const d = state._promo, F = state._promoF;
  const { allocs, pmap } = promoScope();

  const regAll = (d.promo_items || []).filter((a) => pmap[a.promo_id]);
  const uniq = (arr) => [...new Set(arr)].filter((x) => x != null && x !== "");
  const catName = {}; const itemName = {};
  regAll.forEach((a) => { if (a.category_code) catName[a.category_code] = a.category_name; if (a.item_barcode) itemName[a.item_barcode] = a.item_desc; });
  state._promoOpts = {
    format: uniq(regAll.map((a) => a.format_code)).map((v) => ({ value: v, text: formatName(v) + " · " + v })),
    vendor: uniq(regAll.map((a) => a.vendor_id)).map((v) => ({ value: v, text: (LK.vendors[v] || v) + " · " + v })),
    display: uniq(regAll.map((a) => a.display_type_code)).map((v) => ({ value: v, text: displayName(v) + " · " + v })),
    category: uniq(regAll.map((a) => a.category_code)).map((v) => ({ value: v, text: (catName[v] || v) + " · " + v })),
    item: uniq(regAll.map((a) => a.item_barcode)).map((v) => ({ value: v, text: (itemName[v] || v) + " · " + v })),
    ptype: uniq(regAll.map((a) => a.promo_type_code)).map((v) => ({ value: v, text: ptypeName(v) + " · " + v })),
    wh: uniq(regAll.map((a) => a.managing_warehouse_id)).map((v) => ({ value: v, text: "מחסן " + v })),
  };
  const combo = (key, ph) => {
    const opts = state._promoOpts[key] || [];
    const curOpt = opts.find((o) => o.value === F[key]);
    return `<input class="search" style="min-width:180px" list="dl-${key}" data-pf="${key}" placeholder="${esc(ph)}" value="${esc(curOpt ? curOpt.text : "")}" autocomplete="off" />
      <datalist id="dl-${key}">${opts.map((o) => `<option value="${esc(o.text)}"></option>`).join("")}</datalist>`;
  };
  // ---- KPIs + filter counts: dim + date filtered, across all phases ----
  const dimScoped = (d.promotions || []).filter((p) => p.activity_type === "REGULAR_UNIVERSE")
    .map((p) => ({ ...p, _phase: promoPhase(p), _days: promoDays(p.start_date), _disc: promoDisc(p) }))
    .filter((p) => {
      if (F.format && p.format_code !== F.format) return false;
      if (F.display && p.display_type_code !== F.display) return false;
      if (F.vendor && p.vendor_id !== F.vendor) return false;
      if (F.ptype && p.promo_type_code !== F.ptype) return false;
      if (F.wh && (p.managing_warehouse_id || "") !== F.wh) return false;
      if (!dateFilterOk(p)) return false;
      if (F.item || F.category) {
        const its = (d.promo_items || []).filter((a) => a.promo_id === p.promo_id);
        if (F.item && !its.some((a) => a.item_barcode === F.item)) return false;
        if (F.category && !its.some((a) => a.category_code === F.category)) return false;
      }
      return true;
    });
  const cnt = { all: dimScoped.length,
    awaiting: dimScoped.filter((p) => promoDecisionStatus(p) === "awaiting").length,
    locked: dimScoped.filter((p) => promoDecisionStatus(p) === "locked").length,
    ongoing: dimScoped.filter((p) => p._phase === "ONGOING").length,
    completed: dimScoped.filter((p) => p._phase === "COMPLETED").length };
  const statusChips = `<div class="chip-group">${STATUS_CHIPS.map(([k, lbl]) =>
    `<button class="${F.status === k ? "active" + (k === "awaiting" ? " awaiting" : "") : ""}" data-status="${k}">${lbl} <span class="chip-cnt">${cnt[k]}</span></button>`).join("")}</div>`;

  const tree = buildPromoTree(allocs, pmap);
  sortPromoTree(tree);
  const treeRows = tree.map(renderPromoNode).join("");
  const techOn = !!state._promoTech;
  const codeIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/></svg>`;
  const header = `<tr><th><span class="th-tree">היררכיית מבצע<button class="tech-toggle ${techOn ? "on" : ""}" data-techtoggle title="הצג/הסתר קודים טכניים">${codeIcon}</button></span></th><th class="num">חיזוי מקורי</th><th class="num">הסכם מסחרי</th><th class="num">פער מול מקורי</th><th>החלטה</th><th>מתחיל</th></tr>`;
  const dInput = (key, lbl) => `<label class="date-filt"><span>${esc(lbl)}</span><input type="date" class="select" data-pf="${key}" value="${esc(F[key] || "")}" /></label>`;

  root.innerHTML = `
    <div class="filter-bar section">
      <div class="filters" style="flex-wrap:wrap">${statusChips}</div>
      <div class="filters">
        ${combo("format", "פורמט")}
        ${combo("vendor", "ספק")}
        ${combo("display", "אמצעי תצוגה")}
        ${combo("category", "היררכיה")}
        ${combo("item", "פריט")}
        ${combo("ptype", "סוג מבצע")}
        ${combo("wh", "מחסן")}
      </div>
      <div class="filters" style="align-items:flex-end">
        ${dInput("startFrom", "תחילת מבצע — מתאריך")}
        ${dInput("startTo", "תחילת מבצע — עד תאריך")}
      </div>
    </div>
    <div class="section table-wrap"><table class="data promo-tree"><thead>${header}</thead><tbody>${treeRows || `<tr><td colspan="6"><div class="empty">אין מבצעים בהיקף הנבחר</div></td></tr>`}</tbody></table></div>`;
}

/* ============================================================
   CANNIBALIZATION — supply-chain decision workspace
   ------------------------------------------------------------
   Two living lists:
   · by-design  (USER_PARALLEL_BY_DESIGN): high sellers supplied in
     parallel from several vendors. Volume is preserved — the planner
     only redistributes the share between vendors (e.g. to cover a
     vendor shortage).
   · competing  (VENDOR_SUGGESTED_MISTAKE): items that eat each other.
     The forecast provider raises an alert; the planner reviews, sets
     the cannibalization depth, and plans a gradual phase-out at the
     store-format level (raise an item back if a vendor returns with a
     better buying price).
   Edits live in the session (state._canEdit) and recompute instantly.
   ============================================================ */
const CAN_COLORS = ["#6E8AE0", "#4FB79A", "#CBA15C", "#B07ED8", "#E0876C", "#6CC0CB"];
const CAN_DEFAULT_RATE = 0.15;
const CAN_BYDESIGN = "USER_PARALLEL_BY_DESIGN";
const canStore = () => (state._canEdit = state._canEdit || {});
const canSeeds = () => (state._canSeed = state._canSeed || {});
// deterministic placeholder on-hand stock (no live inventory feed in the POC)
const canStockSeed = (kind, bc, base) =>
  Math.round(base * (kind === "wh" ? 0.18 + 0.22 * hashFrac("whstk#" + bc) : 0.05 + 0.10 * hashFrac("ststk#" + bc)));

function canInitWorking(d) {
  const store = canStore(), seeds = canSeeds();
  const byTree = {};
  (d.members || []).forEach((m) => { (byTree[m.tree_id] = byTree[m.tree_id] || []).push(m); });
  (d.trees || []).forEach((t) => {
    if (store[t.tree_id]) return; // keep this session's edits
    const ms = (byTree[t.tree_id] || []).map((m) => {
      const base = Number(m.baseline_forecast_qty || 0);
      return {
        barcode: m.item_barcode, desc: m.item_desc, vendor_id: m.vendor_id,
        base, influence: Number(m.influence_percent || 0),
        locked: false, whStock: canStockSeed("wh", m.item_barcode, base), storeStock: canStockSeed("st", m.item_barcode, base),
      };
    });
    const w = {
      tree_id: t.tree_id, tree_type: t.tree_type, status: t.status, notes: t.notes,
      created_by: t.created_by, approved_by: t.approved_by, source_suggestion_id: t.source_suggestion_id || null,
      cannibRate: t.tree_type === CAN_BYDESIGN ? 0 : CAN_DEFAULT_RATE, formats: [], members: ms,
    };
    store[t.tree_id] = w;
    seeds[t.tree_id] = JSON.parse(JSON.stringify(w));
  });
  return store;
}

function canCompute(w) {
  const groupBase = w.members.reduce((a, m) => a + Number(m.base || 0), 0);
  const wSum = w.members.reduce((a, m) => a + Number(m.influence || 0), 0) || 1;
  const rate = w.tree_type === CAN_BYDESIGN ? 0 : Math.max(0, Math.min(0.6, Number(w.cannibRate) || 0));
  const groupAdjusted = Math.round(groupBase * (1 - rate));
  let allocated = 0;
  const members = w.members.map((m, i) => {
    const share = (Number(m.influence) || 0) / wSum;
    const adjusted = Math.round(groupAdjusted * share);
    allocated += adjusted;
    return { ...m, i, share, sharePct: share * 100, adjusted,
      delta: adjusted - Number(m.base || 0), color: CAN_COLORS[i % CAN_COLORS.length] };
  });
  const rem = groupAdjusted - allocated; // push rounding remainder onto the largest member
  if (rem !== 0 && members.length) {
    const big = members.reduce((a, b) => (b.adjusted > a.adjusted ? b : a), members[0]);
    big.adjusted += rem; big.delta = big.adjusted - Number(big.base || 0);
  }
  return { ...w, members, groupBase, groupAdjusted, rate, loss: groupBase - groupAdjusted, wSum };
}

function canVendors(w) {
  const out = [];
  w.members.forEach((m) => { const n = LK.vendors[m.vendor_id] || m.vendor_id; if (n && !out.includes(n)) out.push(n); });
  return out.join(" · ");
}
function canSplit(c) {
  return c.members.map((m) =>
    `<span style="width:${m.sharePct}%;background:${m.color}" title="${esc(m.desc)} · ${Math.round(m.sharePct)}%"></span>`).join("");
}
const canDelta = (dv) => `<span style="color:${dv > 0 ? "var(--state-good)" : dv < 0 ? "var(--state-bad)" : "var(--text-mut)"}">${dv > 0 ? "+" : ""}${num(dv)}</span>`;
const canSigned = (n) => (n > 0 ? "+" : "") + num(n);

/* ---- hero flow (RTL Sankey: base on the right → adjusted on the left) ---- */
function canRibbon(rx, rTop, rBot, lx, lTop, lBot) {
  const mid = (rx + lx) / 2;
  return `M ${rx} ${rTop} C ${mid} ${rTop}, ${mid} ${lTop}, ${lx} ${lTop} L ${lx} ${lBot} C ${mid} ${lBot}, ${mid} ${rBot}, ${rx} ${rBot} Z`;
}
function canFlowSVG(c) {
  const W = 760, H = 250, padTop = 56, chartH = 162, barW = 14;
  const rInner = 612, lOuter = 150, lInner = lOuter + barW;
  const scale = chartH / Math.max(c.groupBase, 1);
  const isLoss = c.loss > 0;
  let ry = padTop, ly = padTop;
  const segs = c.members.map((m) => {
    const seg = { m, rTop: ry, rBot: ry + m.base * scale, lTop: ly, lBot: ly + m.adjusted * scale };
    ry += m.base * scale; ly += m.adjusted * scale; return seg;
  });
  const baseBottom = padTop + c.groupBase * scale, adjBottom = padTop + c.groupAdjusted * scale;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="can-flow-svg" preserveAspectRatio="xMidYMid meet">`;
  s += `<defs><linearGradient id="canLossGrad" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#E5556A" stop-opacity=".05"/><stop offset="1" stop-color="#E5556A" stop-opacity=".34"/></linearGradient></defs>`;
  s += `<text x="${rInner + barW / 2}" y="20" class="can-flow-axis" text-anchor="middle">חיזוי בסיס מצרפי</text>`;
  s += `<text x="${rInner + barW / 2}" y="42" class="can-flow-val prov" text-anchor="middle">${num(c.groupBase)}</text>`;
  s += `<text x="${lOuter + barW / 2}" y="20" class="can-flow-axis" text-anchor="middle">חיזוי מתואם</text>`;
  s += `<text x="${lOuter + barW / 2}" y="42" class="can-flow-val appr" text-anchor="middle">${num(c.groupAdjusted)}</text>`;
  if (isLoss) {
    const mid = (rInner + lInner) / 2, ly2 = (adjBottom + baseBottom) / 2 + 4;
    s += `<path d="M ${rInner} ${baseBottom} C ${mid} ${baseBottom}, ${mid} ${adjBottom}, ${lInner} ${adjBottom} L ${lInner} ${baseBottom} Z" fill="url(#canLossGrad)"/>`;
    s += `<text x="${mid}" y="${ly2}" class="can-flow-loss" text-anchor="middle">▼ אובדן קניבליזציה</text>`;
    s += `<text x="${mid}" y="${ly2 + 16}" class="can-flow-lossv" text-anchor="middle">−${num(c.loss)} · ${Math.round(c.rate * 100)}%</text>`;
  }
  segs.forEach((sg) => {
    s += `<path class="can-ribbon" d="${canRibbon(rInner, sg.rTop, sg.rBot, lInner, sg.lTop, sg.lBot)}" fill="${sg.m.color}" fill-opacity=".42"><title>${esc(sg.m.desc)}\nבסיס ${num(sg.m.base)} → מתואם ${num(sg.m.adjusted)} (${canSigned(sg.m.delta)})</title></path>`;
  });
  segs.forEach((sg) => {
    s += `<rect x="${rInner}" y="${sg.rTop}" width="${barW}" height="${Math.max(sg.rBot - sg.rTop, 0)}" fill="${sg.m.color}" rx="2"/>`;
    if (sg.lBot - sg.lTop > 0.5) s += `<rect x="${lOuter}" y="${sg.lTop}" width="${barW}" height="${sg.lBot - sg.lTop}" fill="${sg.m.color}" rx="2"/>`;
  });
  if (isLoss) s += `<rect x="${lOuter}" y="${adjBottom}" width="${barW}" height="${Math.max(baseBottom - adjBottom, 0)}" fill="#E5556A" rx="2"/>`;
  return s + `</svg>`;
}
/* ---- volume balance waterfall (base → loss → adjusted) ---- */
function canWaterfall(c) {
  const W = 300, H = 132, padL = 6, padR = 6, base = 100, bw = 52;
  const slot = (W - padL - padR) / 3, max = Math.max(c.groupBase, 1);
  const h = (v) => (v / max) * 80, cx = (i) => padL + slot * i + slot / 2;
  const baseH = h(c.groupBase), adjH = h(c.groupAdjusted), lossH = baseH - adjH;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="can-wf-svg" preserveAspectRatio="xMidYMid meet">`;
  s += `<rect x="${cx(0) - bw / 2}" y="${base - baseH}" width="${bw}" height="${baseH}" rx="3" fill="var(--role-provider)" fill-opacity=".85"/>`;
  s += `<text x="${cx(0)}" y="${base - baseH - 6}" class="can-wf-num" text-anchor="middle">${num(c.groupBase)}</text>`;
  s += `<text x="${cx(0)}" y="${base + 15}" class="can-wf-lbl" text-anchor="middle">בסיס</text>`;
  if (c.loss > 0) {
    s += `<rect x="${cx(1) - bw / 2}" y="${base - baseH}" width="${bw}" height="${lossH}" rx="3" fill="var(--bad)" fill-opacity=".8"/>`;
    s += `<text x="${cx(1)}" y="${base - baseH - 6}" class="can-wf-num bad" text-anchor="middle">−${num(c.loss)}</text>`;
    s += `<text x="${cx(1)}" y="${base + 15}" class="can-wf-lbl" text-anchor="middle">אובדן</text>`;
    s += `<line x1="${cx(0) + bw / 2}" y1="${base - baseH}" x2="${cx(1) - bw / 2}" y2="${base - baseH}" class="can-wf-conn"/>`;
    s += `<line x1="${cx(1) + bw / 2}" y1="${base - adjH}" x2="${cx(2) - bw / 2}" y2="${base - adjH}" class="can-wf-conn"/>`;
  } else {
    s += `<text x="${cx(1)}" y="${base - 38}" class="can-wf-keep" text-anchor="middle">נפח נשמר</text>`;
    s += `<text x="${cx(1)}" y="${base - 23}" class="can-wf-keep" text-anchor="middle">ללא אובדן</text>`;
    s += `<line x1="${cx(0) + bw / 2}" y1="${base - baseH}" x2="${cx(2) - bw / 2}" y2="${base - adjH}" class="can-wf-conn"/>`;
  }
  s += `<rect x="${cx(2) - bw / 2}" y="${base - adjH}" width="${bw}" height="${adjH}" rx="3" fill="var(--role-approved)" fill-opacity=".9"/>`;
  s += `<text x="${cx(2)}" y="${base - adjH - 6}" class="can-wf-num appr" text-anchor="middle">${num(c.groupAdjusted)}</text>`;
  s += `<text x="${cx(2)}" y="${base + 15}" class="can-wf-lbl" text-anchor="middle">מתואם</text>`;
  s += `<line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" class="can-wf-base"/>`;
  return s + `</svg>`;
}

PAGES.cannibalization = async () => {
  const d = await load("/api/cannibalization");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._can = d;
  canInitWorking(d);
  const all = Object.keys(canStore()).map((id) => canCompute(canStore()[id]));
  const byDesign = all.filter((t) => t.tree_type === CAN_BYDESIGN);
  const competing = all.filter((t) => t.tree_type !== CAN_BYDESIGN);
  const pending = (d.suggestions || []).filter((s) => s.status === "PENDING");
  const totalAdj = all.reduce((a, t) => a + t.groupAdjusted, 0);

  const tiles = chipsRow([
    ["עצי השפעה", String(all.length)],
    ["מקבילי מתוכנן", String(byDesign.length)],
    ["דורש בדיקה", String(competing.length + pending.length)],
    ["חיזוי מתואם מצרפי", num(Math.round(totalAdj))],
  ]);

  const alert = pending.length ? `<div class="alert-band can-alert">
    <p><b>${pending.length}</b> ${pending.length === 1 ? "התראת קניבליזציה חדשה" : "התראות קניבליזציה חדשות"} מספק החיזוי — פריטים שעלולים לכרסם זה בנפח של זה. בדוק כל זוג; אם זו חפיפה אמיתית — קבל את ההתראה ותכנן החלפה הדרגתית ברמת הפורמט.</p></div>` : "";

  const bdRows = byDesign.map((t) => `<tr class="clickable" data-canopen="${esc(t.tree_id)}">
      <td><span dir="auto" class="strong">${esc(t.notes || t.tree_id)}</span><div class="mut" style="font-size:11px">${esc(canVendors(t))}</div></td>
      <td class="num">${t.members.length}</td>
      <td class="num role-num provider">${num(t.groupBase)}</td>
      <td style="min-width:150px"><div class="can-split">${canSplit(t)}</div></td>
      <td>${badge(t.status)}</td>
      <td><span class="badge green">נפח נשמר</span></td>
    </tr>`).join("");
  const bdTable = byDesign.length ? `<div class="table-wrap"><table class="data"><thead><tr>
      <th>עץ — פריטים מקבילים</th><th class="num">פריטים</th><th class="num">נפח כולל</th><th>חלוקת השפעה בין הספקים</th><th>סטטוס</th><th>נפח</th>
    </tr></thead><tbody>${bdRows}</tbody></table></div>` : `<div class="empty">אין עצים מתוכננים.</div>`;

  const compRows = competing.map((t) => `<tr class="clickable" data-canopen="${esc(t.tree_id)}">
      <td><span dir="auto" class="strong">${esc(t.notes || t.tree_id)}</span><div class="mut" style="font-size:11px">${esc(t.members.map((m) => m.desc).join(" ↔ "))}</div></td>
      <td><span dir="auto" style="font-size:12px">${esc(canVendors(t))}</span></td>
      <td class="num role-num provider">${num(t.groupBase)}</td>
      <td class="num strong" style="color:var(--state-bad)">${t.loss > 0 ? "−" + num(t.loss) : "—"}</td>
      <td>${badge(t.status)}</td>
    </tr>`).join("");
  const sgRows = pending.map((s) => `<tr>
      <td><span class="badge amber">התראה חדשה</span></td>
      <td><span dir="auto" class="strong">${esc((s.member_descs || []).join(" ↔ "))}</span><div class="mut" style="font-size:11px">${esc(s.suggestion_id)} · ${sdate(s.suggested_at)}</div></td>
      <td class="num">ביטחון ${pct(Math.round(Number(s.confidence) * 100))}</td>
      <td colspan="2"><button class="btn btn-primary" style="width:auto;padding:6px 14px" data-cansugg="${esc(s.suggestion_id)}">בדוק ותכנן ←</button></td>
    </tr>`).join("");
  const compTable = (competing.length || pending.length) ? `<div class="table-wrap"><table class="data"><thead><tr>
      <th>עץ / התראה</th><th>ספקים מתחרים</th><th class="num">נפח כולל</th><th class="num">נגרע לחפיפה</th><th>סטטוס</th>
    </tr></thead><tbody>${compRows}${sgRows}</tbody></table></div>` : `<div class="empty">אין התראות קניבליזציה פתוחות.</div>`;

  return `<div id="can-root">
    <div class="card-sub" style="margin-bottom:16px">ניהול חיזוי בין פריטים שחיים יחד. <b>מקבילי מתוכנן</b> — רבי-מכר המסופקים במקביל מכמה ספקים: הנפח נשמר ואתה מאזן ביניהם (למשל בעת מחסור אצל ספק). <b>מתחרים</b> — פריטים שמכרסמים זה בזה: ספק החיזוי מתריע, ואתה מחליט ומתכנן החלפה הדרגתית.</div>
    ${tiles}
    ${alert}
    <div class="section card-head"><h3>מקבילי מתוכנן — נפח נשמר, איזון בין הספקים</h3><span class="count-tag">${byDesign.length}</span></div>
    ${bdTable}
    <div class="section card-head"><h3>מתחרים — דורש בדיקה ותכנון החלפה</h3><span class="count-tag">${competing.length + pending.length}</span></div>
    ${compTable}
  </div>`;
};
PAGES.cannibalization.after = () => {
  const root = document.getElementById("can-root"); if (!root) return;
  root.addEventListener("click", (e) => {
    const open = e.target.closest("[data-canopen]"); if (open) { navigate("cannibalization/" + open.dataset.canopen); return; }
    const sg = e.target.closest("[data-cansugg]"); if (sg) { canAcceptSuggestion(sg.dataset.cansugg); }
  });
};

function canAcceptSuggestion(sid) {
  const s = (state._can.suggestions || []).find((x) => x.suggestion_id === sid); if (!s) return;
  const tid = "TREE-" + sid;
  const store = canStore(), seeds = canSeeds();
  if (!store[tid]) {
    const members = (s.member_barcodes || []).map((bc, i) => {
      const it = LK.items[bc];
      const base = Math.round(2500 + 4000 * hashFrac("canbase#" + bc));
      return { barcode: bc, desc: (s.member_descs && s.member_descs[i]) || (it && it.description) || bc,
        vendor_id: it ? it.original_vendor_id : null,
        base, influence: i === 0 ? 55 : 45,
        locked: false, whStock: canStockSeed("wh", bc, base), storeStock: canStockSeed("st", bc, base) };
    });
    const w = { tree_id: tid, tree_type: "VENDOR_SUGGESTED_MISTAKE", status: "DRAFT",
      notes: (s.member_descs || []).join(" ↔ "), created_by: "forecast.svc", approved_by: null,
      source_suggestion_id: sid,
      cannibRate: Math.max(0.08, Math.min(0.4, 1 - Number(s.confidence || 0.85))), formats: [], members };
    store[tid] = w; seeds[tid] = JSON.parse(JSON.stringify(w));
  }
  s.status = "MERGED_INTO_TREE"; s.tree_id = tid;
  navigate("cannibalization/" + tid);
}

async function renderCanEditor(tid, view) {
  if (!state._can) { const d = await load("/api/cannibalization"); if (d) state._can = d; }
  if (state._can) canInitWorking(state._can);
  if (!canStore()[tid]) {
    view.innerHTML = `<div class="empty">העץ ${esc(tid)} לא נמצא — <a class="linkish" data-route="cannibalization" style="cursor:pointer">חזרה לרשימה</a></div>`;
    view.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.route)));
    return;
  }
  state._canTid = tid;
  drawCanEditor(view);
}

function drawCanEditor(view) {
  const w = canStore()[state._canTid], c = canCompute(w);
  const isBD = w.tree_type === CAN_BYDESIGN;
  $("#pt").textContent = w.notes || w.tree_id; $("#pc").textContent = "קניבליזציה";
  const typePill = isBD ? `<span class="dec-pill matched">מקבילי מתוכנן</span>` : `<span class="dec-pill awaiting">קניבליזציה מתחרה</span>`;
  const statusPill = w.status === "APPROVED" ? `<span class="dec-pill accepted">מאושר</span>` : `<span class="dec-pill change_requested">טיוטה</span>`;

  const memRows = c.members.map((m) => `<tr>
    <td><div class="can-mem"><span class="sw" style="background:${m.color}"></span><div><span dir="auto" class="strong">${esc(m.desc)}</span><div class="mut" style="font-size:11px">${esc(LK.vendors[m.vendor_id] || m.vendor_id || "—")} · <span class="num">${esc(m.barcode)}</span></div></div></div></td>
    <td class="num role-num provider">${num(m.base)}</td>
    <td><div class="can-slider-row"><input type="range" min="0" max="100" value="${Math.round(m.influence)}" data-canw="${m.i}"><span class="can-share-val" id="can-share-${m.i}">${Math.round(m.sharePct)}%</span></div></td>
    <td class="num role-num approved" id="can-adj-${m.i}">${num(m.adjusted)}</td>
    <td class="num" id="can-delta-${m.i}">${canDelta(m.delta)}</td>
    <td class="num">${num(m.whStock)}</td>
    <td class="num">${num(m.storeStock)}</td>
    <td style="text-align:center"><button class="can-lock ${m.locked ? "on" : ""}" data-canlock="${m.i}" title="נעילה/פתיחה להזמנה — נשמר על המגוון ברמת הפורמט; אינו משפיע על החיזוי">${m.locked ? "🔒 נעול" : "🔓 פתוח"}</button></td>
  </tr>`).join("");
  const totWh = c.members.reduce((a, m) => a + Number(m.whStock || 0), 0);
  const totStore = c.members.reduce((a, m) => a + Number(m.storeStock || 0), 0);

  const memTable = `<div class="table-wrap"><table class="data can-members"><thead><tr>
      <th>פריט · ספק</th><th class="num">חיזוי בסיס</th><th>השפעה (חלק בקבוצה)</th><th class="num">חיזוי מתואם</th><th class="num">דלתא מול בסיס</th><th class="num">מלאי מחסן</th><th class="num">מלאי סניפים</th><th style="text-align:center">נעול להזמנה</th>
    </tr></thead><tbody>${memRows}</tbody><tfoot><tr>
      <td class="strong">סה"כ</td><td class="num role-num provider">${num(c.groupBase)}</td><td></td>
      <td class="num role-num approved" id="can-group-adj">${num(c.groupAdjusted)}</td>
      <td class="num strong" id="can-group-loss" style="color:var(--state-bad)">${c.loss > 0 ? "−" + num(c.loss) : "—"}</td>
      <td class="num">${num(totWh)}</td><td class="num">${num(totStore)}</td><td></td>
    </tr></tfoot></table></div>`;

  const fmts = (state._master && state._master.formats) || [];
  const fmtChips = fmts.map((f) => `<span class="can-fmt ${w.formats.includes(f.format_code) ? "on" : ""}" data-canfmt="${esc(f.format_code)}">${esc(f.description)}</span>`).join("");
  // right-hand side panel beside the flow: waterfall + (competing) the cannib-depth control / (by-design) a note
  const sidePanel = `<div class="can-side">
    <div class="can-side-card"><div class="can-side-title">מאזן נפח</div><div id="can-wf">${canWaterfall(c)}</div></div>
    ${isBD
      ? `<div class="can-side-card"><div class="can-side-title">נפח אספקה</div><div class="bd-badge" style="margin:0 0 6px">נפח נשמר 100%</div><p class="mut" style="margin:0;font-size:12px;line-height:1.6">עץ מתוכנן — הנפח הכולל נשמר. גרירת ההשפעה מעבירה נפח בין הספקים (למשל לכיסוי מחסור), ללא אובדן.</p></div>`
      : `<div class="can-side-card"><div class="can-side-title">עומק קניבליזציה</div>
          <div class="can-rate-row"><input type="range" min="0" max="50" value="${Math.round(c.rate * 100)}" data-canrate><span class="can-rate-val" id="can-rate-val">${Math.round(c.rate * 100)}%</span></div>
          <div class="mut" style="font-size:11.5px;line-height:1.5">חלק מהביקוש המשותף שנגרע עקב החפיפה. אובדן נוכחי: <b id="can-rate-loss" style="color:var(--state-bad)">−${num(c.loss)}</b>.</div></div>`}
  </div>`;

  const fmtZone = isBD ? "" : `<div class="pd-zone"><div class="pd-zone-title">תכנון החלפה הדרגתית — רמת פורמט</div>
    <div class="can-fmt-zone">
      <p class="mut" style="margin:0;font-size:12.5px;line-height:1.65;flex:1;min-width:240px"><b style="color:var(--text)">הורד</b> את ההשפעה של הפריט שברצונך להוציא — חיזויו יירד ומלאי המחסן/סניפים יתרוקן בהדרגה עד החלפה. אם ספק יחזור עם מחיר טוב יותר — <b style="color:var(--text)">העלה</b> בחזרה. בחר היכן התוכנית חלה:</p>
      <div class="can-fmts">${fmtChips || '<span class="mut">אין פורמטים</span>'}</div>
    </div></div>`;

  const decisions = isBD
    ? `<button class="dec-btn solid" data-cansave>שמירת חלוקה</button>
       <button class="dec-btn outline" data-cantoggle>⇄ סמן כקניבליזציה מתחרה</button>
       <button class="dec-btn outline" data-canreset>↺ אפס</button>`
    : `${w.status === "APPROVED"
        ? `<button class="dec-btn solid" data-cansave>שמירה וחישוב מחדש</button>`
        : `<button class="dec-btn solid" data-canapprove>✓ אישור וחישוב מחדש</button><button class="dec-btn outline" data-cansave>שמירת טיוטה</button>`}
       <button class="dec-btn outline" data-cantoggle>⇄ סמן כמתוכנן</button>
       <button class="dec-btn outline" data-canreset>↺ אפס</button>`;

  view.innerHTML = `<div class="pd-header">
      <span class="pd-back" data-route="cannibalization">← חזרה לרשימת העצים</span>
      <h2><span dir="auto">${esc(w.notes || w.tree_id)}</span> ${typePill} ${statusPill}</h2>
      <div class="pd-meta"><span dir="auto">${esc(canVendors(w))}</span><span class="sep">·</span>${w.members.length} פריטים<span class="sep">·</span><span class="num">${esc(w.tree_id)}</span>${w.source_suggestion_id ? `<span class="sep">·</span>מקור: ${esc(w.source_suggestion_id)}` : ""}</div></div>
    <div class="pd-zone"><div class="pd-zone-title">חלוקת החיזוי — מהבסיס אל הפריטים${isBD ? "" : ", וכמה נגרע בדרך"}</div>
      <div class="can-top-grid">
        <div class="can-flow-host" id="can-flow">${canFlowSVG(c)}</div>
        ${sidePanel}
      </div></div>
    <div class="pd-zone"><div class="card-head" style="margin-bottom:8px"><div><div class="pd-zone-title" style="margin:0">עורך החלוקה</div></div>
        <button class="btn btn-ghost" style="width:auto" data-canequal>⚖ חלוקה שווה</button></div>
      ${memTable}
      <div class="mut" style="font-size:11.5px;margin-top:8px">🔒 נעילה להזמנה נשמרת על המגוון (assortment) ברמת הפורמט — חוסמת הזמנות לפריט אך אינה משפיעה על חישוב החיזוי. מלאי מחסן/סניפים מוצג לסיוע בתכנון ההחלפה.</div></div>
    ${fmtZone}
    <div class="pd-zone"><div class="pd-zone-title">בריאות ההחלטה</div><div class="health-grid ace-health" id="can-health">${canHealth(c)}</div></div>
    <div class="ace-actions">${decisions}<span class="mut" style="font-size:11.5px;align-self:center;flex:1;min-width:200px">בעת אישור — המבצעים המושפעים ו-MRP מחסן/סניף יורצו מחדש באצווה הלילית.</span></div>`;
  attachCanHandlers(view);
}

function canHealth(c) {
  const isBD = c.tree_type === CAN_BYDESIGN;
  const tiles = [
    { q: "נפח בסיס מצרפי", a: num(c.groupBase), cls: "neutral", calc: "סכום חיזויי הבסיס של הפריטים" },
    { q: "חיזוי מתואם מצרפי", a: num(c.groupAdjusted), cls: "good", calc: isBD ? "שווה לבסיס · ללא אובדן" : `בסיס × (1 − ${Math.round(c.rate * 100)}%)` },
    { q: "סך ההשפעות בקבוצה", a: "100%", cls: "good", calc: `מנורמל אוטומטית (קלט: ${Math.round(c.wSum)})` },
    isBD
      ? { q: "נפח נשמר?", a: "כן ✓", cls: "good", calc: "אותו נפח כולל, חלוקה אחרת בלבד" }
      : { q: "נפח שנגרע לחפיפה", a: "−" + num(c.loss), cls: "bad", calc: `${Math.round(c.rate * 100)}% מהבסיס` },
  ];
  return tiles.map((t) => `<div class="health-tile"><div class="ht-q">${t.q}</div><div class="ht-a ${t.cls}">${t.a}</div><div class="ht-calc">${t.calc}</div></div>`).join("");
}

function canRefreshLive(view) {
  const c = canCompute(canStore()[state._canTid]);
  c.members.forEach((m) => {
    const sp = view.querySelector("#can-share-" + m.i); if (sp) sp.textContent = Math.round(m.sharePct) + "%";
    const aj = view.querySelector("#can-adj-" + m.i); if (aj) aj.textContent = num(m.adjusted);
    const dl = view.querySelector("#can-delta-" + m.i); if (dl) dl.innerHTML = canDelta(m.delta);
  });
  const fh = view.querySelector("#can-flow"); if (fh) fh.innerHTML = canFlowSVG(c);
  const wf = view.querySelector("#can-wf"); if (wf) wf.innerHTML = canWaterfall(c);
  const ga = view.querySelector("#can-group-adj"); if (ga) ga.textContent = num(c.groupAdjusted);
  const gl = view.querySelector("#can-group-loss"); if (gl) gl.textContent = c.loss > 0 ? "−" + num(c.loss) : "—";
  const rl = view.querySelector("#can-rate-loss"); if (rl) rl.textContent = "−" + num(c.loss);
  const rv = view.querySelector("#can-rate-val"); if (rv) rv.textContent = Math.round(c.rate * 100) + "%";
  const h = view.querySelector("#can-health"); if (h) h.innerHTML = canHealth(c);
}

function attachCanHandlers(view) {
  const w = () => canStore()[state._canTid];
  view.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.route)));
  view.querySelectorAll("[data-canw]").forEach((el) => el.addEventListener("input", () => {
    w().members[Number(el.dataset.canw)].influence = Number(el.value); canRefreshLive(view);
  }));
  const rate = view.querySelector("[data-canrate]");
  if (rate) rate.addEventListener("input", () => { w().cannibRate = Number(rate.value) / 100; canRefreshLive(view); });
  view.querySelectorAll("[data-canlock]").forEach((el) => el.addEventListener("click", () => {
    const m = w().members[Number(el.dataset.canlock)]; m.locked = !m.locked; // ordering lock only — no effect on the forecast
    el.classList.toggle("on", m.locked); el.textContent = m.locked ? "🔒 נעול" : "🔓 פתוח";
  }));
  view.querySelectorAll("[data-canfmt]").forEach((el) => el.addEventListener("click", () => {
    const f = w().formats, code = el.dataset.canfmt, idx = f.indexOf(code);
    idx >= 0 ? f.splice(idx, 1) : f.push(code); el.classList.toggle("on");
  }));
  const eq = view.querySelector("[data-canequal]");
  if (eq) eq.addEventListener("click", () => { const ms = w().members, v = Math.round(100 / ms.length); ms.forEach((m) => m.influence = v); drawCanEditor(view); });
  const tg = view.querySelector("[data-cantoggle]");
  if (tg) tg.addEventListener("click", () => {
    const t = w();
    if (t.tree_type === CAN_BYDESIGN) { t.tree_type = "VENDOR_SUGGESTED_MISTAKE"; t.cannibRate = t.cannibRate || CAN_DEFAULT_RATE; t.status = "DRAFT"; }
    else { t.tree_type = CAN_BYDESIGN; t.cannibRate = 0; }
    drawCanEditor(view);
  });
  const rs = view.querySelector("[data-canreset]");
  if (rs) rs.addEventListener("click", () => { const seed = canSeeds()[state._canTid]; if (seed) canStore()[state._canTid] = JSON.parse(JSON.stringify(seed)); drawCanEditor(view); });
  const sv = view.querySelector("[data-cansave]");
  if (sv) sv.addEventListener("click", () => canToast(view, "נשמר בפעילות זו (סשן)"));
  const ap = view.querySelector("[data-canapprove]");
  if (ap) ap.addEventListener("click", () => { const t = w(); t.status = "APPROVED"; t.approved_by = state.user || "admin"; navigate("cannibalization"); });
}

function canToast(view, msg) {
  const bar = view.querySelector(".ace-actions"); if (!bar) return;
  let el = view.querySelector("#can-toast");
  if (!el) { el = document.createElement("span"); el.id = "can-toast"; el.style.cssText = "align-self:center;color:var(--state-good);font-size:13px;font-weight:600"; bar.appendChild(el); }
  el.textContent = "✓ " + msg;
}

PAGES["purchase-orders"] = async () => {
  const rows = await load("/api/purchase-orders") || [];
  state._po = rows;
  const headers = rows.filter((r) => r.record_type === "header")
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const cols = [
    { key: "po_id", label: "מס' הזמנה", render: (r) => `<span class="strong">${esc(r.po_id)}</span>` },
    { key: "po_type", label: "סוג", render: (r) => `<span class="badge gray">${esc(r.po_type)}</span>` },
    { key: "source_location_id", label: "ממקור", render: (r) => locName(r.source_location_scope, r.source_location_id) },
    { key: "destination_location_id", label: "ליעד", render: (r) => locName(r.destination_location_scope, r.destination_location_id) },
    { key: "vendor_id", label: "ספק", render: (r) => r.vendor_id ? vendorName(r.vendor_id) : "—" },
    { key: "origin", label: "מקור", render: (r) => `<span class="badge blue">${esc(r.origin)}</span>` },
    { key: "expected_delivery_date", label: "אספקה צפויה", render: (r) => sdate(r.expected_delivery_date) },
    { key: "status", label: "סטטוס", render: (r) => badge(r.status) },
  ];
  const openCnt = headers.filter((h) => !["DELIVERED", "CANCELLED"].includes(h.status)).length;
  const tiles = chipsRow([
    ["הזמנות רכש", String(headers.length)],
    ["פתוחות", String(openCnt)],
    ["STO (סניף↔מחסן)", String(headers.filter((h) => h.po_type === "STO").length)],
    ["רכש מחסן", String(headers.filter((h) => h.po_type === "WH_PURCHASE").length)],
  ]);
  const statuses = ["DRAFT", "SUBMITTED", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
  const stColor = { DRAFT: "#6b7da3", SUBMITTED: "#f59e0b", CONFIRMED: "#38bdf8", IN_TRANSIT: "#6366f1", DELIVERED: "#22c55e", CANCELLED: "#ef4444" };
  const stAgg = statuses.map((s) => ({ label: STATUS_HE[s] || s, value: headers.filter((h) => h.status === s).length, color: stColor[s] }))
    .filter((x) => x.value > 0);
  const typeColor = { STO: "#8b5cf6", DIRECT: "#22d3ee", WH_PURCHASE: "#6366f1" };
  const typeAgg = ["STO", "DIRECT", "WH_PURCHASE"].map((t) => ({ label: t, value: headers.filter((h) => h.po_type === t).length, color: typeColor[t] })).filter((x) => x.value > 0);
  const charts = `<div class="section row cols-2">
    ${chartCard("הזמנות לפי סטטוס", vbars(stAgg))}
    ${chartCard("הזמנות לפי סוג", vbars(typeAgg))}
  </div>`;
  return `<div class="card-sub" style="margin-bottom:16px">הזמנות רכש — STO (סניף↔מחסן), DIRECT (סניף↔ספק), WH_PURCHASE (מחסן↔ספק). בחר הזמנה לצפייה בשורות.</div>
    ${tiles}${charts}<div class="section">${tableHTML(cols, headers, { drill: (r) => `po:${r.po_id}` })}</div>`;
};

PAGES.master = async () => {
  const d = await load("/api/master");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._master = d;
  buildLookups(d);
  const tabs = [
    ["items", "פריטים"], ["stores", "סניפים"], ["warehouses", "מחסנים"],
    ["vendors", "ספקים"], ["formats", "פורמטים"], ["item_groups", "מקבצים"],
    ["display_types", "אמצעי תצוגה"], ["assortment", "מגוון"],
  ];
  const sub = tabs.map((t, i) => `<button class="btn ${i === 0 ? "btn-primary" : "btn-ghost"}" data-mtab="${t[0]}" style="width:auto">${t[1]}</button>`).join("");
  return `<div class="filters">${sub}</div><div id="mview"></div>`;
};
PAGES.master.after = () => {
  const d = state._master;
  const render = (tab) => {
    let html = "";
    if (tab === "items") {
      const cols = [
        { key: "barcode", label: "ברקוד" },
        { key: "description", label: "תיאור", render: (r) => `<span dir="auto">${esc(r.description)}</span>` },
        { key: "unit_type", label: "יח'", render: (r) => r.unit_type === "WEIGHABLE" ? "שקיל" : "יחידות" },
        { key: "leading_barcode", label: "פריט מוביל", render: (r) => r.is_partner_in_stock ? `<span class="badge blue">${esc(r.leading_barcode)}</span>` : `<span class="badge gray">עצמאי</span>` },
        { key: "item_group_code", label: "מקבץ", render: (r) => r.item_group_code ? `<span class="badge violet">${esc(r.item_group_code)}</span>` : "—" },
        { key: "original_vendor_id", label: "ספק", render: (r) => vendorName(r.original_vendor_id) },
        { key: "dept_lv2_name", label: "מחלקה", render: (r) => `<span dir="auto">${esc(r.dept_lv2_name)}</span>` },
      ];
      html = tableHTML(cols, d.items, { drill: (r) => `item:${r.barcode}` });
    } else if (tab === "stores") {
      const cols = [
        { key: "store_id", label: "מס'" }, { key: "name", label: "שם", render: (r) => `<span dir="auto">${esc(r.name)}</span>` },
        { key: "format_code", label: "פורמט", render: (r) => esc(formatName(r.format_code)) },
        { key: "store_size_class", label: "גודל", render: (r) => `<span class="badge gray">${esc(r.store_size_class)}</span>` },
        { key: "sale_capability_score", label: "יכולת מכר", num: true, render: (r) => `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div class="bar" style="width:70px"><i style="width:${Number(r.sale_capability_score) * 100}%"></i></div>${num(Number(r.sale_capability_score) * 100)}%</div>` },
      ];
      html = tableHTML(cols, d.stores);
    } else if (tab === "warehouses") {
      html = tableHTML([{ key: "warehouse_id", label: "מס'" }, { key: "name", label: "שם", render: (r) => `<span dir="auto">${esc(r.name)}</span>` }], d.warehouses);
    } else if (tab === "vendors") {
      html = tableHTML([{ key: "vendor_id", label: "מס'" }, { key: "name", label: "שם", render: (r) => `<span dir="auto">${esc(r.name)}</span>` }, { key: "default_lead_time_days", label: "ימי אספקה", num: true }], d.vendors);
    } else if (tab === "formats") {
      html = tableHTML([{ key: "format_code", label: "קוד" }, { key: "description", label: "תיאור", render: (r) => `<span dir="auto">${esc(r.description)}</span>` }], d.formats);
    } else if (tab === "item_groups") {
      html = tableHTML([{ key: "group_code", label: "קוד" }, { key: "description", label: "תיאור", render: (r) => `<span dir="auto">${esc(r.description)}</span>` }, { key: "purpose", label: "מטרה", render: (r) => `<span class="badge violet">${esc(r.purpose)}</span>` }, { key: "member_count", label: "פריטים", num: true }], d.item_groups);
    } else if (tab === "display_types") {
      html = tableHTML([{ key: "code", label: "קוד" }, { key: "description_he", label: "תיאור", render: (r) => `<span dir="auto">${esc(r.description_he)}</span>` }, { key: "description_en", label: "EN" }, { key: "is_sap_standard", label: "תקני SAP", render: (r) => r.is_sap_standard ? badge("ADOPTED", "כן") : "—" }], d.display_types);
    } else if (tab === "assortment") {
      const cols = [
        { key: "parent_scope", label: "היקף", render: (r) => r.parent_scope === "WAREHOUSE" ? "מחסן" : "פורמט" },
        { key: "parent_id", label: "ישות", render: (r) => r.parent_scope === "WAREHOUSE" ? "מחסן " + esc(r.parent_id) : esc(formatName(r.parent_id)) },
        { key: "item_barcode", label: "פריט", render: (r) => itemCell(r.item_barcode) },
        { key: "supply_method", label: "שיטה", render: (r) => badge(r.supply_method, r.supply_method === "WH" ? "מחסן" : "ישיר") },
        { key: "supply_vendor_id", label: "מקור אספקה", render: (r) => r.supply_method === "WH" ? "מחסן " + esc(r.supply_vendor_id) : vendorName(r.supply_vendor_id) },
        { key: "is_blocked_for_order", label: "חסום", render: (r) => r.is_blocked_for_order ? badge("REJECTED", "חסום") : badge("ADOPTED", "פתוח") },
      ];
      html = tableHTML(cols, d.assortment.slice(0, 400));
    }
    $("#mview").innerHTML = html;
  };
  document.querySelectorAll("[data-mtab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-mtab]").forEach((x) => { x.className = "btn btn-ghost"; x.style.width = "auto"; });
    b.className = "btn btn-primary"; b.style.width = "auto";
    render(b.dataset.mtab);
  }));
  render("items");
};

/* ---------------- lookups ---------------- */
const LK = { items: {}, vendors: {}, stores: {}, formats: {}, warehouses: {}, display: {} };
function buildLookups(d) {
  (d.items || []).forEach((i) => { LK.items[i.barcode] = i; });
  (d.vendors || []).forEach((v) => { LK.vendors[v.vendor_id] = v.name; });
  (d.stores || []).forEach((s) => { LK.stores[s.store_id] = s.name; });
  (d.formats || []).forEach((f) => { LK.formats[f.format_code] = f.description; });
  (d.warehouses || []).forEach((w) => { LK.warehouses[w.warehouse_id] = w.name; });
  (d.display_types || []).forEach((x) => { LK.display[x.code] = x.description_he; });
}
const displayName = (code) => (code ? (LK.display[code] || code) : "—");
async function ensureMaster() { if (!state._master) { const d = await load("/api/master"); if (d) { state._master = d; buildLookups(d); } } }
const vendorName = (id) => `<span dir="auto">${esc(LK.vendors[id] || id || "—")}</span>`;
const storeName = (id) => LK.stores[id] || ("סניף " + id);
const formatName = (id) => LK.formats[id] || id;
const itemCell = (bc) => { const i = LK.items[bc]; return `<span dir="auto">${esc(i ? i.description : bc)}</span><div class="mut" style="font-size:11px">${esc(bc)}</div>`; };
const locName = (scope, id) => scope === "WAREHOUSE" ? "מחסן " + esc(id) : `<span dir="auto">${esc(storeName(id))}</span>`;

/* ---------------- drilldowns ---------------- */
function drill(spec) {
  const [type, arg] = spec.split(":");
  const fn = DRILL[type];
  if (fn) fn(arg);
}
async function promoDetail(pid) {
  state._promoDetail = state._promoDetail || {};
  if (state._promoDetail[pid]) return state._promoDetail[pid];
  const r = await api("/api/promo?promo_id=" + encodeURIComponent(pid));
  const det = (r && r.ok) ? r.data : { allocations: [], wh_supply: [], aces_strength: [], header: null };
  state._promoDetail[pid] = det;
  return det;
}
// campaign retro / forecast analysis: sales lift, leftover stock days, revenue
// uplift, and whether the trade agreement overshoots demand (storage/shrink/transport cost).
/* promo drill assortment tree: store -> מקבץ leader -> member barcodes
   (standalone items render as a store+item leaf). */
function drillAgg(rows) {
  const o = sumOf(rows, "original_forecast_qty");
  const r = sumOf(rows, "store_recommended_qty"), ord = sumOf(rows, "store_ordered_qty"), s = sumOf(rows, "sold_qty");
  return { o, r, ord, s, fq: fqAcc(s, o), adopt: r > 0 ? cap100(Math.round(ord / r * 100)) : null };
}
function drillRow(depth, toggleId, exp, hasChildren, label, m) {
  const chev = hasChildren ? chevronSVG(exp) : `<span class="tree-chev-sp"></span>`;
  const attr = toggleId ? `data-ptree="${esc(toggleId)}" class="clickable"` : "";
  return `<tr ${attr}><td style="padding-inline-start:${depth * 18 + 12}px">${chev}${label}</td>
    <td class="num">${roleNum(m.o, "provider")}</td><td class="num">${num(m.r)}</td><td class="num">${num(m.ord)}</td><td class="num">${m.s ? num(m.s) : "—"}</td>
    <td class="num">${m.fq == null ? "—" : `<span class="badge ${fqTone(m.fq)}">${m.fq}%</span>`}</td>
    <td class="num">${m.adopt == null ? "—" : `<span class="badge ${adoptTone(m.adopt)}">${m.adopt}%</span>`}</td></tr>`;
}
const itemGroupOf = (bc) => { const it = LK.items[bc]; return it && it.item_group_code ? it.item_group_code : null; };
function renderDrillTree(allocs) {
  const X = state._promoDrillX || new Set();
  const gmap = {}; ((state._master && state._master.item_groups) || []).forEach((g) => { gmap[g.group_code] = g; });
  // one row per (store, מקבץ-leader) or (store, standalone item)
  const buckets = new Map();
  for (const a of allocs) {
    const g = itemGroupOf(a.item_barcode);
    const key = a.store_id + "|" + (g ? "G#" + g : "I#" + a.item_barcode);
    if (!buckets.has(key)) buckets.set(key, { key, sid: a.store_id, sname: a.store_name, group: g, rows: [] });
    buckets.get(key).rows.push(a);
  }
  const ordered = [...buckets.values()].sort((x, y) => String(x.sid).localeCompare(String(y.sid)) || String(x.key).localeCompare(String(y.key)));
  let html = "";
  for (const b of ordered) {
    const store = `<span class="strong" dir="auto">${esc(b.sname || storeName(b.sid))}</span>`;
    if (b.group) {
      const leaderBc = (gmap[b.group] && gmap[b.group].leader_barcode) || b.rows[0].item_barcode;
      const leaderDesc = (LK.items[leaderBc] && LK.items[leaderBc].description) || (gmap[b.group] && gmap[b.group].description) || b.group;
      const id = "B#" + b.key, exp = X.has(id);
      html += drillRow(0, id, exp, true, `${store} · <span class="badge violet">מקבץ</span> <span dir="auto">${esc(leaderDesc)}</span> <span class="mut" style="font-size:11px">(${b.rows.length} ברקודים)</span>`, drillAgg(b.rows));
      if (exp) b.rows.forEach((a) => { html += drillRow(1, null, false, false, `<span dir="auto">${esc(a.item_desc)}</span> <span class="mut" style="font-size:11px">${esc(a.item_barcode)}</span>`, drillAgg([a])); });
    } else {
      const a = b.rows[0];
      html += drillRow(0, null, false, false, `${store} · <span dir="auto">${esc(a.item_desc)}</span> <span class="mut" style="font-size:11px">${esc(a.item_barcode)}</span>`, drillAgg(b.rows));
    }
  }
  return `<div class="table-wrap"><table class="data"><thead><tr><th>סניף · מקבץ/פריט → ברקודים</th><th class="num">חיזוי מקורי</th><th class="num">המלצה</th><th class="num">הוזמן</th><th class="num">נמכר</th><th class="num">איכות</th><th class="num">אימוץ</th></tr></thead><tbody>${html}</tbody></table></div>`;
}

/* ============================================================
   Promotion detail — the decision canvas (routed page)
   ============================================================ */
const nowIso = () => new Date().toISOString();
function addDaysIso(iso, n) { const dt = new Date(iso); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }

function promoModel(p, det) {
  const provider = Number(p.original_forecast_total || 0);
  const value = effectiveTrade(p);            // the trade agreement = approved forecast
  const sold = Number(p.sold_total || 0);
  const deliveryRate = vendorDeliveryRate(p);
  const expectedDemand = Math.round(provider * deliveryRate);
  const phase = p._phase || promoPhase(p);
  let actualProjected = null;
  if (phase === "ONGOING") { const dur = Math.max(1, Number(p.duration_days) || 12); actualProjected = Math.round(sold / Math.max(1, Math.min(liveDayN(p), dur)) * dur); }
  else if (phase === "COMPLETED") actualProjected = sold;
  const whsup = (det && det.wh_supply) || [];
  const whRecom = sumOf(whsup, "wh_recommended_qty") || Number(p.wh_recommended_total || 0);
  const onHand = Math.round(whRecom * jit("oh#" + p.promo_id, 0.7, 1.05));
  const inTransit = Math.round(whRecom * jit("it#" + p.promo_id, 0.4, 0.85));
  const whCovered = value > 0 ? Math.round((onHand + inTransit) / value * 100) : null;
  return { provider, value, sold, deliveryRate, expectedDemand, phase, actualProjected,
    onHand, inTransit, whCovered, hasWh: whsup.length > 0 || Number(p.wh_recommended_total || 0) > 0 };
}
function candidateCost(p, m, qty) {
  const demand = m.expectedDemand;
  const excessUnits = Math.max(0, qty - demand), shortUnits = Math.max(0, demand - qty);
  const unitCost = Number(p.unit_cost || 0), promoPrice = Number(p.promo_price || p.catalog_price || 0);
  const excessVal = excessUnits * unitCost;
  const excessCost = Math.round(excessVal * 0.0008 * 30 + excessVal * (Number(p.shrink_pct || 2) / 100) + excessVal * 0.03);
  return { qty, excessUnits, shortUnits, excessCost, lostSale: Math.round(shortUnits * promoPrice),
    expectedSales: Math.round(Math.min(qty, demand)), revenue: Math.round(Math.min(qty, demand) * promoPrice) };
}

function decisionRuler(m) {
  const W = 900, H = 124, padX = 46, axisY = 64;
  const vals = [m.provider, m.value]; if (m.actualProjected != null) vals.push(m.actualProjected);
  const max = Math.max(...vals, 1) * 1.1;
  const x = (v) => padX + (v / max) * (W - 2 * padX);
  const lo = Math.min(m.provider, m.value), hi = Math.max(m.provider, m.value);
  const markers = [["#6B8FC9", m.provider, "חיזוי מקורי"], ["#C9A36A", m.value, "הסכם מסחרי"]];
  if (m.actualProjected != null) markers.push(["#9D7BC9", m.actualProjected, "תחזית מכר"]);
  let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">`;
  s += `<defs><pattern id="gapstripe" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="rgba(201,163,106,.14)"/><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(201,163,106,.5)" stroke-width="2"/></pattern></defs>`;
  s += `<rect x="${x(lo)}" y="${axisY - 15}" width="${Math.max(0, x(hi) - x(lo))}" height="30" fill="url(#gapstripe)" rx="3"/>`;
  s += `<line x1="${padX}" y1="${axisY}" x2="${W - padX}" y2="${axisY}" stroke="#3A4258" stroke-width="2"/>`;
  markers.forEach((mk, i) => {
    const px = x(mk[1]), above = i % 2 === 0;
    s += `<line x1="${px}" y1="${axisY - 17}" x2="${px}" y2="${axisY + 17}" stroke="${mk[0]}" stroke-width="3"/>`;
    s += `<circle cx="${px}" cy="${axisY}" r="6" fill="${mk[0]}"/>`;
    s += `<text x="${px}" y="${above ? axisY - 24 : axisY + 34}" text-anchor="middle" fill="${mk[0]}" font-size="16" font-weight="700">${num(mk[1])}</text>`;
  });
  s += `</svg>`;
  const legend = markers.map((mk) => `<span><i style="background:${mk[0]}"></i>${mk[2]}</span>`).join("");
  return `<div class="ruler-wrap">${s}<div class="r-legend">${legend}</div></div>`;
}
function trioCard(role, lblEn, lblHe, value, sub, editable) {
  const color = `var(--role-${role})`;
  return `<div class="trio-card ${editable ? "editable" : ""}"><div class="t-accent" style="background:${color}"></div>
    <div class="t-head"><span class="t-lbl-en">${lblEn}</span>${editable ? `<span class="t-edit">ניתן לעריכה</span>` : ""}</div>
    <div class="t-lbl-he">${lblHe}</div>
    <div class="trio-val" style="color:${color}"><span dir="ltr">${num(value)}</span></div><div class="t-sub">${sub}</div></div>`;
}
function decSub(p) {
  const dec = getDecision(p.promo_id);
  if (dec && dec.locked) return `נעול · ${dec.at ? sdate(dec.at) : ""}${dec.by ? " · " + esc(dec.by) : ""}`;
  if (dec) return `טיוטה · עודכן ${dec.at ? sdate(dec.at) : ""}`;
  return "ברירת מחדל — טרם ננעל";
}
function decisionEdit(p, m) {
  const dec = getDecision(p.promo_id), locked = !!(dec && dec.locked), closed = m.phase === "COMPLETED";
  const gi = gapInfo(m.value, m.provider);
  const impact = gi ? `<b style="color:${gi.pct > 0 ? "var(--role-agreement)" : gi.pct < 0 ? "var(--state-bad)" : "var(--text-dim)"}">${gi.pct > 0 ? "+" : ""}${gi.pct}%</b> מול החיזוי המקורי (<span dir="ltr">${num(m.provider)}</span>)` : "";
  const actions = closed ? `<span class="mut">המבצע הסתיים</span>`
    : locked ? `<span class="lock-badge">● נעול</span><button class="dec-btn outline" data-act="unlock" style="padding:9px 16px">פתח לעריכה</button>`
    : `<button class="dec-btn solid" data-act="lock" style="padding:11px 24px">שמור ונעל</button>`;
  return `<div class="dec-edit">
    <div class="de-row">
      <div><label>חיזוי מאושר — הסכם מסחרי</label><input class="tradeval" id="trade-val" type="number" min="0" step="50" value="${m.value}" ${locked || closed ? "disabled" : ""}></div>
      <div class="de-impact">${impact}</div>
      <div class="de-actions">${actions}</div>
    </div>
    <div class="de-note">תיאום מול מחלקת הסחר מתבצע ישירות. לאחר ההסכמה — עדכן כאן את הערך ונעל אותו.</div>
  </div>`;
}
function healthZone(p, m) {
  const cost = candidateCost(p, m, m.value);
  const gi = gapInfo(m.value, m.provider);
  const t1 = m.expectedDemand >= m.value ? "good" : m.expectedDemand >= m.value * 0.9 ? "warn" : "bad";
  const a1 = t1 === "good" ? "כן — סביר" : t1 === "warn" ? "גבולי" : "לא סביר";
  const calc1 = `הסכם מסחרי ${gi ? (gi.pct > 0 ? "+" : "") + gi.pct + "%" : "—"} מול המקורי; הספק מספק ${Math.round(m.deliveryRate * 100)}% היסטורית → ביקוש צפוי ${num(m.expectedDemand)}.`;
  let t2, a2, calc2;
  if (!m.hasWh) { t2 = "neutral"; a2 = "אספקה ישירה"; calc2 = "אספקה ישירה לסניפים — ללא מחסן מנהל."; }
  else { t2 = m.whCovered == null ? "neutral" : m.whCovered >= 110 ? "good" : m.whCovered >= 95 ? "warn" : "bad";
    a2 = t2 === "good" ? `כן — ${m.whCovered}%` : t2 === "warn" ? `חלקית — ${m.whCovered}%` : `לא — ${m.whCovered}%`;
    calc2 = `מלאי ${num(m.onHand)} + בדרך ${num(m.inTransit)} מול ${num(m.value)} יח'.`; }
  const t3 = cost.excessCost <= 0 ? "good" : cost.excessUnits > m.value * 0.15 ? "bad" : "warn";
  const a3 = cost.excessCost <= 0 ? "₪0 — אין עודף" : money(cost.excessCost);
  const calc3 = `ביקוש צפוי ${num(m.expectedDemand)} מול כמות ${num(m.value)}; עודף ${num(cost.excessUnits)} יח'.`;
  const t4 = cost.lostSale <= 0 ? "good" : cost.shortUnits > m.expectedDemand * 0.1 ? "bad" : "warn";
  const a4 = cost.lostSale <= 0 ? "נמוך" : money(cost.lostSale);
  const calc4 = `חוסר ${num(cost.shortUnits)} יח' מול ביקוש ${num(m.expectedDemand)}.`;
  const tile = (q, a, t, c) => `<div class="health-tile"><div class="ht-q">${q}</div><div class="ht-a ${t}">${a}</div><div class="ht-calc">${c}</div></div>`;
  return `<div class="health-grid">
    ${tile("האם המכירות יגיעו לכמות שנקבעה?", a1, t1, calc1)}
    ${tile("האם המחסן יכול לספק את הכמות?", a2, t2, calc2)}
    ${tile("אם הביקוש נמוך מהכמות — עלות העודף?", a3, t3, calc3)}
    ${tile("אם הביקוש גבוה מהכמות — סיכון החוסר?", a4, t4, calc4)}</div>`;
}
function outcomeTable(p, m) {
  const cols = [["col-match", "הסכם מסחרי (נבחר)", candidateCost(p, m, m.value)],
    ["col-request", "חיזוי מקורי", candidateCost(p, m, m.provider)]];
  const row = (label, fn) => `<tr><td>${label}</td>${cols.map((c) => `<td>${fn(c[2])}</td>`).join("")}</tr>`;
  return `<table class="outcome"><thead><tr><th></th>${cols.map((c) => `<th class="${c[0]}">${c[1]}<div style="font-size:11px;font-weight:600;opacity:.85"><span dir="ltr">${num(c[2].qty)}</span></div></th>`).join("")}</tr></thead><tbody>
    ${row("מכר צפוי", (c) => num(c.expectedSales))}
    ${row("הכנסה צפויה (לאחר הנחה)", (c) => money(c.revenue))}
    ${row("עלות עודף מלאי", (c) => money(c.excessCost))}
    ${row("סיכון אובדן מכירה", (c) => money(c.lostSale))}</tbody></table>`;
}
function historicalComparison(p, m) {
  const vName = LK.vendors[p.vendor_id] || p.vendor_id, dName = displayName(p.display_type_code);
  const mk = (label, seed, base) => {
    const appr = Math.round(base * jit(seed + "a", 0.85, 1.05));
    const deliv = Math.round(jit(seed + "d", 0.92, 1.12) * 100);
    return { label, appr, actual: Math.round(appr * deliv / 100), deliv,
      outcome: deliv >= 105 ? "נמכר, ביקוש גבוה" : deliv >= 98 ? "בריא" : "ביקוש מעורב" };
  };
  const rows = [
    mk("אותו קמפיין אשתקד", "ly#" + p.promo_id, m.value),
    mk(vName + " · " + dName + " · ממוצע 3 מבצעים", "v3#" + p.promo_id, m.value * 0.82),
    mk(dName + " · כל הספקים · 6 מבצעים", "d6#" + p.promo_id, m.value * 0.7),
  ];
  const avgDeliv = Math.round(rows.reduce((a, r) => a + r.deliv, 0) / rows.length), over = avgDeliv >= 100;
  const head = `<div style="font-size:13px;color:var(--text);margin-bottom:12px;line-height:1.6"><span dir="auto" class="strong">${esc(vName)}</span> ${over ? "מספק היסטורית מעל לחיזוי" : "מספק היסטורית מתחת לחיזוי"} ב-<b dir="ltr">${Math.abs(avgDeliv - 100)}%</b> בממוצע.</div>`;
  const body = `<table class="outcome"><thead><tr><th>מבצע עבר</th><th>הסכם</th><th>בפועל</th><th>אספקה %</th><th style="text-align:start">תוצאה</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><span dir="auto">${esc(r.label)}</span></td><td>${num(r.appr)}</td><td>${num(r.actual)}</td><td style="color:${r.deliv >= 100 ? "var(--role-approved)" : "var(--state-warn)"}">${r.deliv}%</td><td style="text-align:start;color:var(--text-dim)">${r.outcome}</td></tr>`).join("")}</tbody></table>`;
  return head + body;
}
function cumChart(labels, forecast, actual, elapsedIdx) {
  const W = 840, H = 210, pad = { l: 46, r: 16, t: 16, b: 30 };
  const max = Math.max(1, ...forecast, ...actual.filter((v) => v != null));
  const n = labels.length, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const xx = (i) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * iw);
  const yy = (v) => pad.t + ih - (v / max) * ih;
  let g = "";
  for (let i = 0; i <= 4; i++) { const y = pad.t + (i / 4) * ih, val = max - (i / 4) * max;
    g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--border-soft)"/><text x="8" y="${y + 3}" fill="var(--text-mut)" font-size="10">${num(Math.round(val))}</text>`; }
  const line = (data, color, w) => { const pts = data.map((v, i) => v == null ? null : `${xx(i)},${yy(v)}`).filter(Boolean);
    return pts.length ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>` : ""; };
  let today = "";
  if (elapsedIdx != null && elapsedIdx >= 0 && elapsedIdx < n) { const px = xx(elapsedIdx);
    today = `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${H - pad.b}" stroke="var(--border-strong)" stroke-dasharray="4 4"/>`; }
  const step = Math.ceil(n / 8); let xl = "";
  labels.forEach((lb, i) => { if (i % step === 0 || i === n - 1) xl += `<text x="${xx(i)}" y="${H - 8}" text-anchor="middle" fill="var(--text-mut)" font-size="10">${esc(sdate(lb))}</text>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${g}${today}${line(forecast, "var(--role-approved)", 2.6)}${line(actual, "var(--role-actual)", 2.6)}${xl}</svg>
    <div class="legend"><span><i style="background:var(--role-approved)"></i> חיזוי מצטבר</span><span><i style="background:var(--role-actual)"></i> מכר מצטבר</span></div>`;
}
function midCampaignBlock(p, m) {
  const dur = Math.max(1, Number(p.duration_days) || 12);
  const elapsed = m.phase === "COMPLETED" ? dur : Math.min(dur, liveDayN(p));
  const labels = [], fc = [], ac = [];
  for (let day = 0; day <= dur; day++) { labels.push(addDaysIso(p.start_date, day)); fc.push(Math.round(m.value * day / dur));
    ac.push(day <= elapsed ? Math.round(m.sold * day / Math.max(1, elapsed)) : null); }
  const soldPct = m.value > 0 ? Math.round(m.sold / m.value * 100) : 0;
  const perfChip = (v, l, u) => `<div class="chip"><div class="c-val">${v == null ? "—" : num(v) + (u || "")}</div><div class="c-lbl">${l}</div></div>`;
  return `<div class="card-sub" style="margin:2px 0 10px">יום ${elapsed} מתוך ${dur} · ${soldPct}% מהחיזוי נמכר</div>
    ${cumChart(labels, fc, ac, elapsed)}
    <div class="chips" style="margin-top:14px">
      ${perfChip(fqAcc(m.sold, m.value), "איכות חיזוי", "%")}
      ${perfChip(cap100(Number(p.otif_pct)), "OTIF", "%")}
      ${perfChip(cap100(Number(p.availability_pct)), "זמינות", "%")}
      ${perfChip(Number(p.shrink_pct), "פחת", "%")}</div>`;
}
function collapse(key, title, bodyHtml) {
  const open = state._pdOpen && state._pdOpen.has(key);
  return `<div class="collapse ${open ? "open" : ""}"><div class="col-head" data-collapse="${key}"><span class="chev">▸</span><h3>${title}</h3></div>${open ? `<div class="col-body">${bodyHtml}</div>` : ""}</div>`;
}
function telemetryZone(p, m, det) {
  const mid = m.phase === "UPCOMING" ? `<div class="empty">הקמפיין טרם החל — נתוני ביצוע יופיעו כאן מהיום הראשון.</div>` : midCampaignBlock(p, m);
  const allocs = (det.allocations || []).slice(0, 600);
  state._promoDrillAllocs = allocs; state._promoDrillX = new Set();
  return collapse("outcome", "תרחישי תוצאה — הסכם מסחרי מול חיזוי מקורי", outcomeTable(p, m))
    + collapse("hist", "השוואה היסטורית", historicalComparison(p, m))
    + collapse("mid", "התקדמות הקמפיין", mid)
    + collapse("store", `התפלגות סניפים (${num(p.store_count)})`, `<div id="promo-drill-tree">${renderDrillTree(allocs)}</div>`);
}
function drawPromoDetail(p, det, view) {
  const m = promoModel(p, det);
  const vName = LK.vendors[p.vendor_id] || p.vendor_id;
  const repCat = (det.allocations && det.allocations[0] && det.allocations[0].category_name)
    || (LK.items[p.representing_barcode] && LK.items[p.representing_barcode].dept_lv2_name) || "—";
  $("#pt").textContent = p.description || p.promo_id;
  $("#pc").textContent = p.promo_id + " · מבצעים";
  const header = `<div class="pd-header">
    <span class="pd-back" data-route="promotions">← חזרה לרשימה</span>
    <h2><span dir="auto">${esc(p.description)}</span></h2>
    <div class="pd-meta"><b>${esc(p.promo_id)}</b><span class="sep">·</span><span dir="auto">${esc(vName)}</span><span class="sep">·</span>${displayName(p.display_type_code)}<span class="sep">·</span><span dir="auto">${esc(repCat)}</span><span class="sep">·</span>${sdate(p.start_date)} → ${sdate(p.end_date)}<span class="sep">·</span><span dir="ltr">${p.promo_price != null ? money(p.promo_price) : "—"}${p._disc != null ? " (" + p._disc + "% הנחה)" : ""}</span><span class="sep">·</span>${num(p.store_count)} סניפים<span class="sep">·</span>${lifecyclePill(p)}<span class="sep">·</span>${startsCell(p)}</div></div>`;
  const duo = `<div class="duo">
    ${trioCard("provider", "חיזוי מקורי", "ספק החיזוי (המכונה)", m.provider, `קצב אספקה היסטורי ${Math.round(m.deliveryRate * 100)}% · ביקוש צפוי ${num(m.expectedDemand)}`, false)}
    ${trioCard("agreement", "הסכם מסחרי", "חיזוי מאושר — נקבע ונעל ע\"י מנהל השרשרת", m.value, decSub(p), true)}</div>`;
  view.innerHTML = header
    + `<div class="pd-zone"><div class="pd-zone-title">אזור החלטה</div>${duo}${decisionRuler(m)}${decisionEdit(p, m)}</div>`
    + `<div class="pd-zone"><div class="pd-zone-title">בריאות ההחלטה</div>${healthZone(p, m)}</div>`
    + `<div class="pd-zone"><div class="pd-zone-title">טלמטריה ופירוט</div>${telemetryZone(p, m, det)}</div>`;
  attachDetailHandlers(p, det, view);
}
function attachDetailHandlers(p, det, view) {
  view.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.route)));
  view.querySelectorAll("[data-collapse]").forEach((el) => el.addEventListener("click", () => {
    const k = el.dataset.collapse; state._pdOpen.has(k) ? state._pdOpen.delete(k) : state._pdOpen.add(k); drawPromoDetail(p, det, view);
  }));
  view.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", () => handleDetailAct(el.dataset.act, p, det, view)));
  const tv = view.querySelector("#trade-val");
  if (tv) tv.addEventListener("change", () => {
    const q = parseFloat(tv.value); if (isNaN(q)) return;
    const dec = getDecision(p.promo_id);
    setDecision(p.promo_id, { value: q, locked: dec ? !!dec.locked : false, at: nowIso(), by: state.user || "admin" });
    drawPromoDetail(p, det, view);
  });
}
function handleDetailAct(act, p, det, view) {
  const by = state.user || "admin";
  if (act === "lock") {
    const q = parseFloat((view.querySelector("#trade-val") || {}).value);
    if (isNaN(q)) { alert("נא להזין כמות תקינה"); return; }
    setDecision(p.promo_id, { value: q, locked: true, at: nowIso(), by });
  } else if (act === "unlock") {
    const dec = getDecision(p.promo_id), v = dec && dec.value != null ? dec.value : Number(p.trade_agreement_qty || 0);
    setDecision(p.promo_id, { value: v, locked: false, at: nowIso(), by });
  } else if (act === "reset") {
    setDecision(p.promo_id, null);
  }
  drawPromoDetail(p, det, view);
}
async function renderPromoDetailPage(pid, view) {
  if (!state._promo) { const d = await load("/api/promotions"); if (d) state._promo = d; }
  state._decisions = loadDecisions();
  const d = state._promo || {};
  const p0 = (d.promotions || []).find((x) => x.promo_id === pid);
  if (!p0) { view.innerHTML = `<div class="empty">מבצע ${esc(pid)} לא נמצא — <a class="linkish" data-route="promotions" style="cursor:pointer">חזרה לרשימה</a></div>`;
    view.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.route))); return; }
  const p = { ...p0, _phase: promoPhase(p0), _days: promoDays(p0.start_date), _disc: promoDisc(p0) };
  state._pdOpen = new Set(p._phase === "UPCOMING" ? ["outcome", "hist"] : ["outcome", "hist", "mid"]);
  view.innerHTML = `<div class="pd-header"><span class="pd-back" data-route="promotions">← חזרה לרשימה</span><h2><span dir="auto">${esc(p.description)}</span></h2><div class="pd-meta">${esc(pid)} · טוען…</div></div>${spinner}`;
  const det = await promoDetail(pid);
  drawPromoDetail(p, det, view);
}

/* ============================================================
   ACES (אסים) — last-minute deep-discount promotions
   Created/edited client-side; price is a planning lever that slides the
   forecast between four strength levels.
   ============================================================ */
const ACE_STR = [
  { cls: "MEDIUM", label: "בינוני", mult: 0.7, disc: 0 },
  { cls: "STRONG", label: "חזק", mult: 1.0, disc: 0.25 },
  { cls: "DEEP", label: "עמוק", mult: 1.25, disc: 0.5 },
  { cls: "VERY_DEEP", label: "עמוק מאוד", mult: 1.6, disc: 0.8 },
];
const ACE_MAX_DISCOUNT = 0.8;
function aceMultForDisc(disc) {
  const p = ACE_STR;
  if (disc <= p[0].disc) return p[0].mult;
  for (let i = 1; i < p.length; i++) {
    if (disc <= p[i].disc) { const a = p[i - 1], b = p[i], t = (disc - a.disc) / (b.disc - a.disc); return a.mult + t * (b.mult - a.mult); }
  }
  return p[p.length - 1].mult;
}
const ACE_STATUS_HE = { draft: "טיוטה", locked: "נעול לתכנון", linked: "מקושר למבצע" };
function loadAces() { try { return JSON.parse(localStorage.getItem("cp_aces") || "[]"); } catch (e) { return []; } }
function saveAces() { localStorage.setItem("cp_aces", JSON.stringify(state._aces || [])); }
function getAce(id) { return (state._aces || []).find((a) => a.id === id) || null; }
function upsertAce(a) { state._aces = state._aces || []; const i = state._aces.findIndex((x) => x.id === a.id); if (i >= 0) state._aces[i] = a; else state._aces.unshift(a); saveAces(); }
function aceStatus(a) { return a.linked_promo_id ? "linked" : a.locked ? "locked" : "draft"; }
const aceItemName = (bc) => (LK.items[bc] && LK.items[bc].description) || bc;
function groupLeader(gc) {
  const g = ((state._master && state._master.item_groups) || []).find((x) => x.group_code === gc);
  if (g && g.leader_barcode) return g.leader_barcode;
  const it = ((state._master && state._master.items) || []).find((i) => i.item_group_code === gc);
  return it ? it.barcode : null;
}
function formatStoreCount(fmt) { return ((state._master && state._master.stores) || []).filter((s) => s.format_code === fmt).length || 30; }
function itemCatalogPrice(bc) {
  if (!bc) return 0;
  const p = ((state._promo && state._promo.promotions) || []).find((x) => x.representing_barcode === bc && x.catalog_price != null);
  if (p) return Number(p.catalog_price);
  return Math.round((6 + 24 * hashFrac("cp#" + bc)) * 10) / 10;
}
function aceBaseQty(a) {
  const key = a.item_barcode || (a.group_code ? groupLeader(a.group_code) : "");
  if (!key || !a.format_code) return 0;
  const per = 70 + 260 * hashFrac("ace#" + key + "#" + (a.display_type_code || ""));
  return Math.round(formatStoreCount(a.format_code) * per / 10) * 10;
}
// price -> discount -> strength multiplier (piecewise across the four levels:
// בינוני 0% · חזק 25% · עמוק 50% · עמוק מאוד 80%)
function aceCompute(a) {
  const bc = a.item_barcode || (a.group_code ? groupLeader(a.group_code) : "");
  const catalog = itemCatalogPrice(bc);
  const minPrice = Math.round(catalog * (1 - ACE_MAX_DISCOUNT) * 10) / 10;
  let price = a.price != null && a.price !== "" ? Number(a.price) : catalog;
  if (catalog > 0) price = Math.max(minPrice, Math.min(catalog, price));
  const disc = catalog > 0 ? (catalog - price) / catalog : 0;
  const mult = aceMultForDisc(disc);
  const base = aceBaseQty(a);
  const strengths = ACE_STR.map((s) => ({ ...s, price: Math.round(catalog * (1 - s.disc) * 10) / 10, qty: Math.round(base * s.mult) }));
  let current = strengths[0];
  strengths.forEach((s) => { if (Math.abs(s.disc - disc) < Math.abs(current.disc - disc)) current = s; });
  return { catalog, minPrice, price, disc, discPct: Math.round(disc * 100), mult, base, qty: Math.round(base * mult), strengths, current };
}
// candidate item/group options for the smart search — relevant to vendor (+ format via assortment)
function aceTargetOptions(a) {
  const m = state._master || {};
  let items = (m.items || []).filter((i) => i.barcode);
  if (a.vendor_id) items = items.filter((i) => i.original_vendor_id === a.vendor_id);
  const assort = m.assortment || [];
  if (a.format_code && assort.length) {
    const inFmt = new Set(assort.filter((x) => x.parent_scope === "FORMAT" && String(x.parent_id) === String(a.format_code)).map((x) => x.item_barcode));
    if (inFmt.size) items = items.filter((i) => inFmt.has(i.barcode));
  }
  const itemOpts = items.slice(0, 600).map((i) => ({ value: "I#" + i.barcode, text: `${i.description} · ${i.barcode}${i.dept_lv2_name ? " · " + i.dept_lv2_name : ""}` }));
  let groups = m.item_groups || [];
  if (a.vendor_id) groups = groups.filter((g) => { const lb = g.leader_barcode || groupLeader(g.group_code); const it = lb ? LK.items[lb] : null; return it ? it.original_vendor_id === a.vendor_id : true; });
  const grpOpts = groups.map((g) => ({ value: "G#" + g.group_code, text: `מקבץ · ${g.description} · ${g.group_code}` }));
  return itemOpts.concat(grpOpts);
}
function resolveAceTarget(a, text) {
  text = (text || "").trim();
  const opts = aceTargetOptions(a);
  let o = opts.find((x) => x.text === text);
  if (!o && text) { const t = text.toLowerCase(); o = opts.find((x) => x.text.toLowerCase().includes(t)); }
  if (!o) { a.item_barcode = ""; a.group_code = ""; return; }
  if (o.value.startsWith("I#")) { a.item_barcode = o.value.slice(2); a.group_code = ""; }
  else { a.group_code = o.value.slice(2); a.item_barcode = ""; }
}
function aceHealth(a, c) {
  const trade = Number(a.trade_agreement || 0);
  const tile = (q, ans, tone, foot) => `<div class="health-tile"><div class="ht-q">${q}</div><div class="ht-a ${tone}">${ans}</div><div class="ht-calc">${foot}</div></div>`;
  let t1;
  if (trade > 0) {
    const gi = gapInfo(c.qty, trade);
    const unitCost = c.catalog * 0.6;
    const excessUnits = Math.max(0, trade - c.qty), shortUnits = Math.max(0, c.qty - trade);
    const excessCost = Math.round(excessUnits * unitCost * (0.0008 * 30 + 0.025 + 0.03));
    const lostSale = Math.round(shortUnits * c.price);
    if (c.qty >= trade) {
      t1 = tile("חיזוי האס מול ההסכם המסחרי", `${gi.pct > 0 ? "+" : ""}${gi.pct}% מעל ההסכם`, gi.pct >= 15 ? "warn" : "good",
        `חיזוי ${num(c.qty)} מול הסכם ${num(trade)}.${shortUnits > 0 ? ` הזמנה לפי ההסכם בלבד תחמיץ מכירות בשווי ${money(lostSale)}.` : ""}`);
    } else {
      t1 = tile("חיזוי האס מול ההסכם המסחרי", `${gi.pct}% מתחת להסכם`, "bad",
        `ההסכם (${num(trade)}) גבוה מהחיזוי (${num(c.qty)}) → עודף מלאי צפוי בעלות ${money(excessCost)}.`);
    }
  } else {
    t1 = tile("חיזוי האס מול ההסכם המסחרי", "לא הוזן הסכם", "neutral", "הזן הסכם מסחרי כדי לראות פערים ועלות עודף/חוסר.");
  }
  const t2 = tile("מיקום מול רמות החוזק", c.current.label,
    c.current.cls === "VERY_DEEP" ? "warn" : "neutral",
    `${c.discPct}% הנחה · חיזוי ${num(c.qty)} יח' (טווח ${num(c.strengths[0].qty)}–${num(c.strengths[3].qty)}).`);
  const deepest = c.strengths[c.strengths.length - 1];
  const t3 = tile("השפעת המחיר על החיזוי", "הורדת מחיר = חיזוי גבוה יותר", "neutral",
    `במחיר הנמוך ביותר (${money(deepest.price)} · 80% הנחה) החיזוי מגיע ל-${num(deepest.qty)} יח'.`);
  return `<div class="health-grid ace-health">${t1}${t2}${t3}</div>`;
}
function aceTargetName(a) {
  if (a.item_barcode) return aceItemName(a.item_barcode);
  if (a.group_code) { const g = ((state._master && state._master.item_groups) || []).find((x) => x.group_code === a.group_code); return "מקבץ · " + (g ? g.description : a.group_code); }
  return "—";
}
function aceMissing(a) {
  const miss = [];
  if (!a.name) miss.push("שם");
  if (!a.format_code) miss.push("פורמט");
  if (!a.vendor_id) miss.push("ספק");
  if (!a.display_type_code) miss.push("אמצעי תצוגה");
  if (!a.item_barcode && !a.group_code) miss.push("פריט/מקבץ");
  if (!a.start_date) miss.push("תאריך התחלה");
  return miss;
}

PAGES.aces = async () => {
  const d = await load("/api/promotions"); if (d) state._promo = d;
  state._aces = loadAces();
  return `<div id="aces-root"></div>`;
};
PAGES.aces.after = () => {
  const root = document.getElementById("aces-root"); if (!root) return;
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-acenew]")) { navigate("aces/new"); return; }
    const op = e.target.closest("[data-aceopen]"); if (op) { navigate("aces/" + op.dataset.aceopen); return; }
  });
  renderAcesList();
};
function renderAcesList() {
  const root = document.getElementById("aces-root"); if (!root) return;
  const aces = state._aces || [];
  const pill = (st) => `<span class="dec-pill ${st === "draft" ? "closed" : st === "linked" ? "change_requested" : "locked"}">${ACE_STATUS_HE[st]}</span>`;
  const rows = aces.map((a) => {
    const c = aceCompute(a), st = aceStatus(a);
    return `<tr class="clickable" data-aceopen="${esc(a.id)}">
      <td><span dir="auto" class="strong">${esc(a.name || "(ללא שם)")}</span></td>
      <td><span dir="auto">${esc(aceTargetName(a))}</span></td>
      <td><span dir="auto">${esc(a.vendor_id ? (LK.vendors[a.vendor_id] || a.vendor_id) : "—")}</span> · ${esc(a.display_type_code ? displayName(a.display_type_code) : "—")}</td>
      <td>${a.start_date ? sdate(a.start_date) : "—"}</td>
      <td><span class="badge gray">${esc(c.current.label)}</span></td>
      <td class="num">${a.item_barcode || a.group_code ? roleNum(c.qty, "agreement") : "—"}</td>
      <td>${pill(st)}</td>
      <td>${a.linked_promo_id ? `<span class="badge violet">${esc(a.linked_promo_id)}</span>` : "—"}</td></tr>`;
  }).join("");
  root.innerHTML = `
    <div class="ace-top">
      <div class="card-sub" style="margin:0">תכנון מבצעי אסים: יצירה, בחירת רמת חוזק, תמחור וקישור למבצע שוטף.</div>
      <button class="btn btn-primary" style="width:auto" data-acenew>+ אס חדש</button>
    </div>
    ${aces.length ? `<div class="section table-wrap"><table class="data"><thead><tr><th>שם האס</th><th>פריט / מקבץ</th><th>ספק · תצוגה</th><th>התחלה</th><th>חוזק</th><th class="num">חיזוי</th><th>סטטוס</th><th>מקושר</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty" style="margin-top:24px">אין אסים עדיין — לחץ "אס חדש" כדי לתכנן את הראשון.</div>`}`;
}

async function renderAceEditor(id, view) {
  if (!state._promo) { const d = await load("/api/promotions"); if (d) state._promo = d; }
  state._aces = loadAces();
  let a;
  if (id === "new") {
    a = { id: "ACE-" + Date.now().toString(36), name: "", format_code: "", vendor_id: "", display_type_code: "",
      target: "item", item_barcode: "", group_code: "", start_date: promoNowPlus(1), end_date: "",
      trade_agreement: "", price: null, locked: false, linked_promo_id: "", by: state.user || "admin" };
    state._aceIsNew = true;
  } else {
    a = getAce(id);
    if (!a) { view.innerHTML = `<div class="empty">אס ${esc(id)} לא נמצא — <a class="linkish" data-route="aces" style="cursor:pointer">חזרה לרשימה</a></div>`;
      view.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.route))); return; }
    state._aceIsNew = false;
  }
  state._aceDraft = JSON.parse(JSON.stringify(a));
  drawAceEditor(view);
}
function aceField(label, must, inner) {
  return `<label class="fld"><span>${label}${must ? ` <i>*</i>` : ""}</span>${inner}</label>`;
}
function aceSelect(key, val, options) {
  return `<select class="select" data-acef="${key}"><option value="">—</option>${options.map(([v, t]) => `<option value="${esc(v)}" ${val === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
}
function linkCandidates(a) {
  if (!a.item_barcode || !a.start_date) return [];
  return ((state._promo && state._promo.promotions) || [])
    .filter((p) => p.activity_type === "REGULAR_UNIVERSE" && p.representing_barcode === a.item_barcode)
    .filter((p) => Math.abs((new Date(p.start_date) - new Date(a.start_date)) / 86400000) <= 10)
    .sort((x, y) => Math.abs(new Date(x.start_date) - new Date(a.start_date)) - Math.abs(new Date(y.start_date) - new Date(a.start_date)));
}
function drawAceEditor(view) {
  const a = state._aceDraft, c = aceCompute(a), st = aceStatus(a), m = state._master || {};
  $("#pt").textContent = a.name || "אס חדש"; $("#pc").textContent = "אסים (ACES)";
  const stPill = `<span class="dec-pill ${st === "draft" ? "closed" : st === "linked" ? "change_requested" : "locked"}">${ACE_STATUS_HE[st]}</span>`;
  const fmtOpts = (m.formats || []).map((f) => [f.format_code, formatName(f.format_code)]);
  const venOpts = (m.vendors || []).map((v) => [v.vendor_id, v.name]);
  const dispOpts = (m.display_types || []).map((x) => [x.code, x.description_he]);
  const tgtOpts = aceTargetOptions(a);
  const curTgt = a.item_barcode ? ((tgtOpts.find((o) => o.value === "I#" + a.item_barcode) || {}).text || "")
    : a.group_code ? ((tgtOpts.find((o) => o.value === "G#" + a.group_code) || {}).text || "") : "";
  const targetField = `<input class="select" list="dl-acetgt" data-acesearch value="${esc(curTgt)}" placeholder="חפש פריט/מקבץ — תיאור, ברקוד או היררכיה" autocomplete="off">
    <datalist id="dl-acetgt">${tgtOpts.map((o) => `<option value="${esc(o.text)}"></option>`).join("")}</datalist>`;
  const form = `<div class="ace-form">
    ${aceField("שם האס", true, `<input class="select" data-acef="name" value="${esc(a.name || "")}" placeholder="שם תיאורי למבצע האס">`)}
    ${aceField("פורמט", true, aceSelect("format_code", a.format_code, fmtOpts))}
    ${aceField("ספק", true, aceSelect("vendor_id", a.vendor_id, venOpts))}
    ${aceField("אמצעי תצוגה", true, aceSelect("display_type_code", a.display_type_code, dispOpts))}
    ${aceField("פריט / מקבץ", true, targetField)}
    ${aceField("תאריך התחלה", true, `<input class="select" type="date" data-acef="start_date" value="${esc(a.start_date || "")}">`)}
    ${aceField("תאריך סיום (רשות)", false, `<input class="select" type="date" data-acef="end_date" value="${esc(a.end_date || "")}">`)}
    ${aceField("הסכם מסחרי (רשות)", false, `<input class="select" type="number" min="0" step="50" data-acef="trade_agreement" value="${esc(a.trade_agreement || "")}" placeholder="כמות מחויבת">`)}
  </div>`;

  const hasTarget = !!(a.item_barcode || a.group_code) && !!a.format_code;
  const viz = hasTarget ? aceStrengthViz(a, c) : `<div class="empty">בחר ספק, פריט/מקבץ ופורמט כדי לתכנן חוזק ותמחור.</div>`;
  const history = hasTarget ? aceHistory(a, c) : "";
  const linkBlock = aceLinkSection(a, c);
  const miss = aceMissing(a);

  view.innerHTML = `<div class="pd-header">
      <span class="pd-back" data-route="aces">← חזרה לרשימת האסים</span>
      <h2><span dir="auto">${esc(a.name || "אס חדש")}</span> ${stPill}</h2>
      <div class="pd-meta">${a.item_barcode || a.group_code ? `<span dir="auto">${esc(aceTargetName(a))}</span>` : "טרם הוגדר פריט"}${a.start_date ? `<span class="sep">·</span>${sdate(a.start_date)}${a.end_date ? " → " + sdate(a.end_date) : ""}` : ""}</div></div>
    <div class="pd-zone"><div class="pd-zone-title">פרטי האס</div>${form}</div>
    <div class="pd-zone"><div class="pd-zone-title">חוזק ותמחור</div>${viz}</div>
    ${hasTarget ? `<div class="pd-zone"><div class="pd-zone-title">בריאות ההחלטה</div><div id="ace-health">${aceHealth(a, c)}</div></div>` : ""}
    ${history ? `<div class="pd-zone"><div class="pd-zone-title">מבצעי עבר על הפריט</div>${history}</div>` : ""}
    <div class="pd-zone"><div class="pd-zone-title">קישור למבצע שוטף</div>${linkBlock}</div>
    <div class="ace-actions">
      <button class="dec-btn solid" data-acesave>שמירת טיוטה</button>
      <button class="dec-btn solid" data-acelock ${miss.length ? "disabled title='חסר: " + esc(miss.join(", ")) + "'" : ""}>נעילה לתכנון</button>
      ${!state._aceIsNew ? `<button class="dec-btn outline" data-acedelete style="border-color:var(--state-bad);color:var(--state-bad)">מחיקה</button>` : ""}
      ${miss.length ? `<span class="mut" style="align-self:center">חסר למילוי: ${esc(miss.join(", "))}</span>` : ""}
    </div>`;
  attachAceHandlers(view);
}
function aceStrengthViz(a, c) {
  const btns = c.strengths.slice().reverse().map((s) =>
    `<button class="str-btn ${c.current.cls === s.cls ? "active" : ""}" data-acestr="${s.cls}">
      <div class="s-lbl">${s.label}</div><div class="s-qty" dir="ltr">${num(s.qty)}</div><div class="s-price" dir="ltr">${money(s.price)}</div></button>`).join("");
  const trade = Number(a.trade_agreement || 0);
  const vsTrade = trade > 0 ? `<span class="${c.qty >= trade ? "" : "mut"}" style="color:${c.qty >= trade ? "var(--role-approved)" : "var(--state-bad)"}">${c.qty >= trade ? "מעל" : "מתחת"} להסכם (${num(trade)})</span>` : "";
  return `<div class="ace-viz">
    <div class="ace-qty-big">חיזוי במחיר הנבחר: <span dir="ltr" class="role-num agreement" style="font-size:30px">${num(c.qty)}</span> <span class="mut" style="font-size:14px">יח'</span> ${vsTrade}</div>
    <div class="str-grid">${btns}</div>
    <div class="price-row">
      <label>מחיר אס — ברירת מחדל = מחיר קטלוג (<span dir="ltr">${money(c.catalog)}</span>). הזזה משמאל מעמיקה את ההנחה ומגדילה את החיזוי.</label>
      <input type="range" id="ace-price" min="${c.minPrice}" max="${c.catalog}" step="0.1" value="${c.price}">
      <div class="price-readout"><b dir="ltr" id="ace-price-val">${money(c.price)}</b> · <span id="ace-disc-val">${c.discPct}% הנחה</span> · רמה: <span class="badge gray" id="ace-str-val">${c.current.label}</span></div>
    </div></div>`;
}
function aceHistory(a, c) {
  const bc = a.item_barcode || (a.group_code ? groupLeader(a.group_code) : "");
  const vName = a.vendor_id ? (LK.vendors[a.vendor_id] || a.vendor_id) : "";
  const today = ymd(PROMO_NOW);
  const real = ((state._promo && state._promo.promotions) || []).filter((p) => p.representing_barcode === bc && (p.start_date || "") < today)
    .sort((x, y) => (y.start_date || "").localeCompare(x.start_date || "")).slice(0, 4)
    .map((p) => ({ label: p.description, when: p.start_date, disc: p._disc != null ? p._disc : promoDisc(p), appr: Number(p.original_forecast_total || 0), sold: Number(p.sold_total || 0) }));
  const rows = (real.length ? real : ACE_STR.map((s, i) => ({ label: "מבצע עבר " + (i + 1), when: promoNowPlus(-30 - i * 20), disc: [15, 25, 33, 40][i], appr: Math.round(c.base * s.mult), sold: Math.round(c.base * s.mult * jit("h" + bc + i, 0.85, 1.1)) })))
    .map((r) => `<tr><td><span dir="auto">${esc(r.label)}</span></td><td>${r.when ? sdate(r.when) : "—"}</td><td>${r.disc != null ? r.disc + "%" : "—"}</td><td class="num">${num(r.appr)}</td><td class="num">${r.sold ? num(r.sold) : "—"}</td></tr>`).join("");
  return `<div class="card-sub" style="margin:0 0 8px">${vName ? esc(vName) + " · " : ""}היסטוריה לפריט — עוזר לכייל את עומק ההנחה והחיזוי.</div>
    <div class="table-wrap"><table class="data"><thead><tr><th>מבצע</th><th>תאריך</th><th>% הנחה</th><th class="num">חיזוי/בסיס</th><th class="num">נמכר</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function aceLinkSection(a, c) {
  if (a.linked_promo_id) {
    const p = ((state._promo && state._promo.promotions) || []).find((x) => x.promo_id === a.linked_promo_id);
    if (!p) return `<div class="mut">המבצע המקושר לא נמצא. <a class="linkish" data-aceunlink style="cursor:pointer">בטל קישור</a></div>`;
    const realAppr = Number(p.original_forecast_total || 0), realTrade = effectiveTrade(p);
    const gi = gapInfo(c.qty, realTrade);
    return `<div class="ace-link-cmp">
      <div class="card-sub" style="margin:0 0 10px">מקושר ל-<b>${esc(p.promo_id)}</b> — <span dir="auto">${esc(p.description)}</span> · ${sdate(p.start_date)} <a class="linkish" data-aceunlink style="cursor:pointer;margin-inline-start:8px">בטל קישור</a></div>
      <table class="outcome"><thead><tr><th></th><th class="col-match">אס (חיזוי)</th><th class="col-request">מבצע שוטף</th></tr></thead><tbody>
        <tr><td>חיזוי מקורי</td><td>${num(c.qty)}</td><td>${num(realAppr)}</td></tr>
        <tr><td>הסכם מסחרי</td><td>${a.trade_agreement ? num(a.trade_agreement) : "—"}</td><td>${num(realTrade)}</td></tr>
      </tbody></table>
      <div style="margin-top:10px;font-size:13px">פער חיזוי האס מול ההסכם של המבצע: <b style="color:${gi && gi.pct >= 0 ? "var(--role-agreement)" : "var(--state-bad)"}">${gi ? (gi.pct > 0 ? "+" : "") + gi.pct + "%" : "—"}</b> — ${gi && gi.pct >= 0 ? "האס תומך/מחזק את המבצע." : "האס נמוך מהמבצע — לשקול העמקת הנחה."}</div></div>`;
  }
  const cands = linkCandidates(a);
  return `<div class="card-sub" style="margin:0 0 8px">מבצע נוצר לרוב יום לפני תחילתו בחנויות. קשר את האס למבצע שוטף לאותו פריט הסמוך לתאריך שבחרת.</div>
    ${cands.length ? aceSelect("linked_promo_id", "", cands.map((p) => [p.promo_id, p.description + " · " + sdate(p.start_date)]))
      : `<div class="mut">${a.item_barcode ? "אין מבצעים שוטפים סמוכים לתאריך לאותו פריט." : "בחר פריט ותאריך כדי לראות מבצעים לקישור."}</div>`}`;
}
function attachAceHandlers(view) {
  view.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.route)));
  view.querySelectorAll("[data-acef]").forEach((el) => el.addEventListener("change", () => {
    const k = el.dataset.acef; state._aceDraft[k] = el.value;
    if (k === "vendor_id" || k === "format_code") { state._aceDraft.item_barcode = ""; state._aceDraft.group_code = ""; }
    if (k === "linked_promo_id" && el.value) state._aceDraft.linked_promo_id = el.value;
    drawAceEditor(view);
  }));
  const search = view.querySelector("[data-acesearch]");
  if (search) search.addEventListener("change", () => { resolveAceTarget(state._aceDraft, search.value); drawAceEditor(view); });
  view.querySelectorAll("[data-acestr]").forEach((el) => el.addEventListener("click", () => {
    const s = aceCompute(state._aceDraft).strengths.find((x) => x.cls === el.dataset.acestr);
    if (s) { state._aceDraft.price = s.price; drawAceEditor(view); }
  }));
  const range = view.querySelector("#ace-price");
  if (range) range.addEventListener("input", () => {
    state._aceDraft.price = parseFloat(range.value);
    const c = aceCompute(state._aceDraft);
    const set = (sel, html) => { const n = view.querySelector(sel); if (n) n.innerHTML = html; };
    set("#ace-price-val", money(c.price)); set("#ace-disc-val", c.discPct + "% הנחה"); set("#ace-str-val", c.current.label);
    const big = view.querySelector(".ace-qty-big .role-num"); if (big) big.textContent = num(c.qty);
    view.querySelectorAll(".str-btn").forEach((b) => b.classList.toggle("active", b.dataset.acestr === c.current.cls));
    const health = view.querySelector("#ace-health"); if (health) health.innerHTML = aceHealth(state._aceDraft, c);
  });
  const unlink = view.querySelector("[data-aceunlink]");
  if (unlink) unlink.addEventListener("click", () => { state._aceDraft.linked_promo_id = ""; drawAceEditor(view); });
  const save = view.querySelector("[data-acesave]");
  if (save) save.addEventListener("click", () => {
    if (!state._aceDraft.name) { alert("נא להזין שם לאס"); return; }
    upsertAce(state._aceDraft); navigate("aces");
  });
  const lock = view.querySelector("[data-acelock]");
  if (lock) lock.addEventListener("click", () => {
    const miss = aceMissing(state._aceDraft);
    if (miss.length) { alert("חסר למילוי: " + miss.join(", ")); return; }
    state._aceDraft.locked = true; upsertAce(state._aceDraft); navigate("aces");
  });
  const del = view.querySelector("[data-acedelete]");
  if (del) del.addEventListener("click", () => {
    if (!confirm("למחוק את האס לצמיתות?")) return;
    state._aces = (state._aces || []).filter((x) => x.id !== state._aceDraft.id); saveAces(); navigate("aces");
  });
}

const DRILL = {
  kpi: (code) => {
    const d = state.cache["/api/overview"]; if (!d) return;
    const k = (d.kpis || []).find((x) => x.code === code); if (!k) return;
    const color = code === "shrink" ? "#f59e0b" : "#6366f1";
    const lc = lineChart({ labels: (k.trend || []).map((t) => t.date), datasets: [{ name: k.label_he, color, data: (k.trend || []).map((t) => Number(t.value)) }], height: 220 });
    openModal(esc(k.label_he), esc(k.label_en) + " · " + pct(k.value) + " (יעד " + pct(k.target) + ")", lc);
  },
  whmrp: (arg) => {
    const [wh, bc, date] = arg.split("|");
    const r = (state._whmrp || []).find((x) => x.warehouse_id === wh && x.item_barcode === bc && x.snapshot_date === date); if (!r) return;
    openModal(itemCellPlain(bc), `מחסן ${esc(wh)} · ${sdate(date)} · ${badge(r.adoption_status)}`,
      kv([
        ["ספק", LK.vendors[r.vendor_id] || r.vendor_id], ["כמות מומלצת (בסיס)", `<span class="strong">${num(r.recom_qty_base)}</span>`],
        ["כמות מומלצת (הזמנה)", num(r.recom_qty_order_unit)], ["ימי מלאי נוכחיים", num(r.current_stock_days)],
        ["נקודת הזמנה מחדש", num(r.reorder_point_qty)], ["רמת מלאי יעד", num(r.target_stock_level_qty)],
        ["הזמנות לקוחות (SD)", num(r.sd_orders_qty)], ["הזמנות סניפים (STO)", num(r.sto_orders_qty)],
        ["חיזוי לכיסוי", num(r.forecast_coverage_qty)], ["מלאי בדרך", num(r.stock_on_the_way_qty)],
        ["ימי אספקה", num(r.lead_time_days)], ["חותמת ריצה", esc(r.run_timestamp)],
      ]) + `<h4>נוסחת MRP קלאסי</h4><div class="card" style="background:var(--bg-2)">מומלץ ≈ מלאי יעד − (מלאי + מלאי בדרך) + מקדם הזמנות סניפים<br><span class="mut">מונע מסיווג 9-BOX: מהירות מכירה × דיוק חיזוי × זמן אספקת ספק</span></div>`);
  },
  storemrp: (arg) => {
    const [st, bc, date] = arg.split("|");
    const r = (state._storemrp || []).find((x) => x.store_id === st && x.leading_barcode === bc && x.snapshot_date === date); if (!r) return;
    openModal(itemCellPlain(bc), `${esc(storeName(st))} · ${sdate(date)} · ${badge(r.adoption_status)}`,
      kv([
        ["שיטת אספקה", r.supply_method === "WH" ? "מחסן" : "ישיר"], ["מקור אספקה", r.supply_method === "WH" ? "מחסן " + esc(r.supply_source_id) : (LK.vendors[r.supply_source_id] || r.supply_source_id)],
        ["מלאי תפעולי", num(r.operational_stock_qty)], ["מלאי ביטחון", num(r.min_safety_stock_qty)],
        ["מלאי בדרך", num(r.stock_on_the_way_qty)], ["חיזוי לכיסוי", num(r.forecast_coverage_qty)],
        ["אספקה הבאה", sdate(r.next_delivery_date)], ["ימי אספקה", num(r.lead_time_days)],
        ["כמות מומלצת", `<span class="strong">${num(r.recom_qty_base)}</span>`],
      ]) + `<h4>חישוב</h4><div class="card" style="background:var(--bg-2)">${num(r.operational_stock_qty)} (תפעולי) + ${num(r.stock_on_the_way_qty)} (בדרך) − ${num(r.min_safety_stock_qty)} (ביטחון) − ${num(r.forecast_coverage_qty)} (חיזוי) ⟶ מומלץ <span class="strong">${num(r.recom_qty_base)}</span></div>`);
  },
  run: (rid) => {
    const d = state._cp; const run = d.runs.find((r) => r.run_id === rid); if (!run) return;
    const allocs = d.allocations.filter((a) => a.run_id === rid);
    const cols = [
      { key: "store_name", label: "סניף", render: (r) => `<span dir="auto">${esc(r.store_name || storeName(r.store_id))}</span>` },
      { key: "item_desc", label: "פריט", render: (r) => `<span dir="auto">${esc(r.item_desc)}</span>` },
      { key: "store_size_class", label: "גודל", render: (r) => `<span class="badge gray">${esc(r.store_size_class)}</span>` },
      { key: "sale_capability_score", label: "יכולת מכר", num: true, render: (r) => pct(Math.round(Number(r.sale_capability_score) * 100)) },
      { key: "recom_qty_base", label: "המלצה", num: true },
      { key: "forced_qty", label: "דחיפה", num: true, render: (r) => Number(r.forced_qty) ? `<span class="badge violet">+${num(r.forced_qty)}</span>` : "—" },
      { key: "final_qty", label: "סופי", num: true, render: (r) => `<span class="strong">${num(r.final_qty)}</span>` },
    ];
    openModal(`חלוקה ${esc(run.run_id)}`, `<span dir="auto">${esc(run.description)}</span> · ${badge(run.status)}`,
      kv([
        ["סוג", run.haluka_type], ["תאריך התחלה", sdate(run.start_date)], ["ימי כיסוי", run.coverage_days],
        ["כמות דחיפה בכוח", num(run.optional_force_qty)], ["מבצע מקושר", run.linked_promo_id || "—"],
        ["נוצר ע\"י", esc(run.created_by)], ["מס' סניפים", (run.store_filter || []).length], ["מס' פריטים", (run.item_filter || []).length],
      ]) + `<h4>הקצאות לסניף-פריט (${allocs.length})</h4>` + tableHTML(cols, allocs));
  },
  promo: (pid) => { closeModal(); navigate("promotions/" + pid); },
  po: (pid) => {
    const rows = state._po; const h = rows.find((r) => r.po_id === pid && r.record_type === "header"); if (!h) return;
    const lines = rows.filter((r) => r.po_id === pid && r.record_type === "line").sort((a, b) => a.line_no - b.line_no);
    const cols = [
      { key: "line_no", label: "#", num: true },
      { key: "item_desc", label: "פריט", render: (r) => `<span dir="auto">${esc(r.item_desc)}</span><div class="mut" style="font-size:11px">${esc(r.item_barcode)}</div>` },
      { key: "qty_base", label: "כמות (בסיס)", num: true },
      { key: "qty_order_unit", label: "כמות (הזמנה)", num: true },
      { key: "unit_cost", label: "עלות ליח'", num: true, render: (r) => money(r.unit_cost) },
    ];
    openModal(`הזמנת רכש ${esc(h.po_id)}`, `${esc(h.po_type)} · ${badge(h.status)}`,
      kv([
        ["מקור", locNamePlain(h.source_location_scope, h.source_location_id)], ["יעד", locNamePlain(h.destination_location_scope, h.destination_location_id)],
        ["ספק", h.vendor_id ? (LK.vendors[h.vendor_id] || h.vendor_id) : "—"], ["מקור יצירה", h.origin],
        ["מבצע מקושר", h.linked_promo_id || "—"], ["חלוקה מקושרת", h.linked_run_id || "—"],
        ["נוצר", esc(h.created_at)], ["אספקה צפויה", sdate(h.expected_delivery_date)],
      ]) + `<h4>שורות הזמנה (${lines.length})</h4>` + tableHTML(cols, lines));
  },
  item: (bc) => {
    const i = LK.items[bc]; if (!i) return;
    openModal(`<span dir="auto">${esc(i.description)}</span>`, esc(i.barcode),
      kv([
        ["ברקוד", esc(i.barcode)], ["סוג יחידה", i.unit_type === "WEIGHABLE" ? "שקיל" : "יחידות"],
        ["יח' בסיס", esc(i.base_uom)], ["יח' הזמנה", esc(i.order_uom)],
        ["שותף במלאי", i.is_partner_in_stock ? badge("ADOPTED", "כן → " + esc(i.leading_barcode)) : badge("gray", "עצמאי")],
        ["מקבץ", i.item_group_code || "—"], ["ספק מקורי", LK.vendors[i.original_vendor_id] || i.original_vendor_id],
        ["שיטת אספקה", i.default_supply_method === "WH" ? "מחסן" : "ישיר"], ["מחלקה", `<span dir="auto">${esc(i.dept_lv2_name)}</span>`],
      ]));
  },
};
const itemCellPlain = (bc) => { const i = LK.items[bc]; return esc(i ? i.description : bc); };
const locNamePlain = (scope, id) => scope === "WAREHOUSE" ? "מחסן " + id : (LK.stores[id] || id);

/* ---------------- shell + nav ---------------- */
const NAV = [
  ["תפעול", [
    ["overview", "סקירה כללית", "M3 13h2l2-5 3 9 2-7 2 3h3"],
    ["wh-mrp", "MRP מחסן", "M4 7h16M4 12h16M4 17h10"],
    ["store-mrp", "MRP סניף", "M4 7h16M4 12h16M4 17h10"],
    ["central-planner", "חלוקות (Haluka)", "M4 5h16v4H4zM4 13h7v6H4zM14 13h6v6h-6z"],
  ]],
  ["מבצעים ותכנון", [
    ["promotions", "מבצעים שוטפים", "M3 11l18-5v12L3 14zM7 12v6"],
    ["aces", "אסים (ACES)", "M13 2L3 14h7l-1 8 10-12h-7z"],
    ["cannibalization", "קניבליזציה", "M6 3v6a6 6 0 0012 0V3M12 15v6"],
    ["purchase-orders", "הזמנות רכש", "M6 6h15l-2 9H8zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z"],
    ["master", "נתוני אב", "M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"],
  ]],
];
const TITLES = {
  overview: ["סקירה כללית", "מדדי KPI ותמונת מצב תפעולית"],
  "wh-mrp": ["MRP מחסן", "המלצות הזמנה קלאסיות מבוססות 9-BOX"],
  "store-mrp": ["MRP סניף", "המלצות הזמנה ברמת פריט מוביל"],
  "central-planner": ["חלוקות (Haluka)", "הזמנות מרוכזות לסניפים ודחיפת מלאי"],
  promotions: ["מבצעים שוטפים", "תכנון מבצעי יוניברס"],
  aces: ["אסים (ACES)", "תכנון מבצעי אסים — חוזק, תמחור וקישור"],
  cannibalization: ["קניבליזציה", "עצי השפעה בין פריטים מתחרים"],
  "purchase-orders": ["הזמנות רכש", "STO / DIRECT / WH_PURCHASE"],
  master: ["נתוני אב", "פריטים, סניפים, ספקים, מגוון ועוד"],
};

function icon(path) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function renderShell() {
  const nav = NAV.map(([sec, items]) => `
    <div class="nav-section">${sec}</div>
    ${items.map(([route, label, ic]) => `<a class="nav-item" data-route="${route}">${icon(ic)}<span>${label}</span></a>`).join("")}
  `).join("");
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo">${logoSVG()}</div>
          <div class="brand-text"><h1>Central Planner</h1><div class="sub">מרכז תכנון תפעולי</div></div>
          <button class="sidebar-toggle" id="sidebar-toggle" title="כווץ/הרחב תפריט">⇤</button>
        </div>
        ${nav}
        <div class="nav-spacer"></div>
        <div class="user-box">
          <div class="avatar">${esc((state.user || "A").charAt(0).toUpperCase())}</div>
          <div style="flex:1"><div class="nm">${esc(state.user || "admin")}</div><div class="rl">מנהל שרשרת אספקה</div></div>
          <button class="modal-close" id="logout" title="התנתק">⏻</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div class="page-title"><h2 id="pt"></h2><div class="crumb" id="pc"></div></div>
          <div class="topbar-actions">
            <span class="pill"><span class="dot"></span> מחובר ל-DynamoDB</span>
            <span class="pill">28/05/2026</span>
          </div>
        </div>
        <div class="content" id="view">${spinner}</div>
      </main>
    </div>`;
}

function logoSVG() {
  return `<svg viewBox="0 0 100 100" width="26" height="26"><path d="M22 70 L42 44 L56 58 L78 28" stroke="white" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="78" cy="28" r="7" fill="white"/></svg>`;
}

async function navigate(token) {
  token = token || "overview";
  const slash = token.indexOf("/");
  const base = slash >= 0 ? token.slice(0, slash) : token;
  const sub = slash >= 0 ? token.slice(slash + 1) : "";
  const validBase = PAGES[base] ? base : "overview";
  const canonical = validBase === base ? token : validBase;
  state.route = validBase;
  state.currentToken = canonical;
  location.hash = "#/" + canonical;
  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.route === validBase));
  const [t, c] = TITLES[validBase] || [validBase, ""];
  $("#pt").textContent = t; $("#pc").textContent = c;
  const view = $("#view");
  view.innerHTML = spinner;
  await ensureMaster();
  if (!state.token) return; // token was invalidated during load -> login shown
  try {
    if (validBase === "promotions" && sub) {
      await renderPromoDetailPage(sub, view);
      return;
    }
    if (validBase === "aces" && sub) {
      await renderAceEditor(sub, view);
      return;
    }
    if (validBase === "cannibalization" && sub) {
      await renderCanEditor(sub, view);
      return;
    }
    const html = await PAGES[validBase]();
    view.innerHTML = html;
    if (PAGES[validBase].after) PAGES[validBase].after();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty">שגיאה בטעינת העמוד: ${esc(e.message)}</div>`;
  }
}

/* ---------------- login ---------------- */
function renderLogin(err) {
  document.getElementById("app").innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <div class="brand">
          <div class="brand-logo">${logoSVG()}</div>
          <div><h1>Central Planner</h1><div class="sub">מרכז תכנון תפעולי לקמעונאות</div></div>
        </div>
        <div class="login-title">התחברות</div>
        <div class="login-desc">מערכת POC לתכנון מרכזי — MRP, מבצעים, חלוקות וקניבליזציה</div>
        ${err ? `<div class="login-error">${esc(err)}</div>` : ""}
        <div class="field"><label>שם משתמש</label><input id="u" autocomplete="username" value="admin" /></div>
        <div class="field"><label>סיסמה</label><input id="p" type="password" autocomplete="current-password" placeholder="••••••••" /></div>
        <button class="btn btn-primary" type="submit" id="login-btn">כניסה למערכת</button>
        <div class="login-hint">POC · נתוני דמו · CloudFront + Lambda + DynamoDB</div>
      </form>
    </div>`;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn"); btn.textContent = "מתחבר..."; btn.disabled = true;
    const r = await api("/api/login", { method: "POST", body: JSON.stringify({ username: $("#u").value, password: $("#p").value }) });
    if (r && r.ok) {
      state.token = r.token; state.user = r.user;
      localStorage.setItem("cp_token", r.token); localStorage.setItem("cp_user", r.user);
      boot();
    } else {
      renderLogin("שם משתמש או סיסמה שגויים");
    }
  });
}

function logout() {
  state.token = ""; state.user = ""; state.cache = {};
  localStorage.removeItem("cp_token"); localStorage.removeItem("cp_user");
  renderLogin();
}

/* ---------------- global events ---------------- */
document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("modal-back")) { closeModal(); return; }
  const close = e.target.closest("[data-close]");
  if (close) { closeModal(); return; }
  const d = e.target.closest("[data-drill]");
  if (d) { drill(d.dataset.drill); return; }
  const pt = e.target.closest("[data-ptree]");
  if (pt && document.querySelector("#promo-drill-tree")) {
    const id = pt.dataset.ptree;
    state._promoDrillX.has(id) ? state._promoDrillX.delete(id) : state._promoDrillX.add(id);
    const c = document.querySelector("#promo-drill-tree");
    if (c) c.innerHTML = renderDrillTree(state._promoDrillAllocs);
    return;
  }
  if (e.target.closest("#sidebar-toggle")) {
    document.querySelector(".shell").classList.toggle("nav-collapsed"); return;
  }
  const nav = e.target.closest(".nav-item");
  if (nav) { navigate(nav.dataset.route); return; }
  if (e.target.closest("#logout")) { logout(); }
});
// breakdown links inside popups (format/vendor/display drill-through)
(function () {
  const mr = document.getElementById("modal-root");
  if (mr) mr.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return;
    const o = e.target.closest("[data-open]");
    if (o) { const s = o.dataset.open; s.startsWith("promo:") ? DRILL.promo(s.slice(6)) : openAggPopup(s); return; }
    const pt = e.target.closest("[data-ptree]");
    if (pt) {
      const id = pt.dataset.ptree;
      state._promoDrillX.has(id) ? state._promoDrillX.delete(id) : state._promoDrillX.add(id);
      const c = document.querySelector("#promo-drill-tree");
      if (c) c.innerHTML = renderDrillTree(state._promoDrillAllocs);
    }
  });
})();
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
window.addEventListener("hashchange", () => {
  if (!state.token) return;
  const tok = (location.hash || "").replace("#/", "");
  if (tok && tok !== state.currentToken) navigate(tok);
});

/* ---------------- boot ---------------- */
async function boot() {
  renderShell();
  const tok = (location.hash || "").replace("#/", "") || "overview";
  await navigate(tok);
}

(async function init() {
  if (state.token) {
    const h = await api("/api/health");
    if (h && h.ok) { boot(); return; }
  }
  renderLogin();
})();
