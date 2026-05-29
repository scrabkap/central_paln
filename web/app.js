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
  $("#modal-root").innerHTML = `<div class="modal-back" data-close>
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

PAGES.promotions = async () => {
  const d = await load("/api/promotions");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._promo = d;
  const promos = d.promotions || [];
  const reg = promos.filter((p) => p.activity_type === "REGULAR_UNIVERSE");
  const aces = promos.filter((p) => p.activity_type === "ACES");
  const cols = [
    { key: "promo_id", label: "מבצע", render: (r) => `<span class="strong">${esc(r.promo_id)}</span>` },
    { key: "description", label: "תיאור", render: (r) => `<span dir="auto">${esc(r.description)}</span>` },
    { key: "format_code", label: "פורמט", render: (r) => esc(formatName(r.format_code)) },
    { key: "promo_type_code", label: "סוג מבצע", render: (r) => r.promo_type_code ? `<span class="badge gray">${esc(r.promo_type_code)}</span>` : badge("PENDING", "ללא") },
    { key: "promo_price", label: "מחיר מבצע", num: true, render: (r) => r.promo_price != null ? money(r.promo_price) : badge("WAITING_QC", "טרם נקבע") },
    { key: "trade_agreement_qty", label: "הסכם מסחרי", num: true, render: (r) => num(r.trade_agreement_qty) },
    { key: "start_date", label: "תאריך", render: (r) => `${sdate(r.start_date)}` },
    { key: "wave_strategy", label: "אספקה", render: (r) => `<span class="badge ${r.wave_strategy === "WAVES" ? "violet" : "gray"}">${r.wave_strategy === "WAVES" ? "גלים" : "חד-פעמי"}</span>` },
    { key: "status", label: "סטטוס", render: (r) => badge(r.status) },
  ];
  const tiles = chipsRow([
    ['סה"כ מבצעים', String(promos.length)],
    ["פעילות אסים", String(aces.length)],
    ["פעילות שוטפת", String(reg.length)],
    ["פעילים (טרם הופצו)", String(promos.filter((p) => p.status !== "DISTRIBUTED").length)],
  ]);
  const fmtCount = {};
  promos.forEach((p) => { fmtCount[p.format_code] = (fmtCount[p.format_code] || 0) + 1; });
  const fmtAgg = Object.keys(fmtCount).map((f) => ({ label: formatName(f), value: fmtCount[f], color: "#8b5cf6" }));
  const tradeAgg = promos.slice().sort((a, b) => Number(b.trade_agreement_qty || 0) - Number(a.trade_agreement_qty || 0))
    .map((p) => ({ label: p.promo_id.replace("PROMO-", "#"), value: Number(p.trade_agreement_qty || 0), color: "#22d3ee" }));
  const charts = `<div class="section row cols-2">
    ${chartCard("מבצעים לפי פורמט", vbars(fmtAgg))}
    ${chartCard("כמות הסכם מסחרי לפי מבצע", vbars(tradeAgg))}
  </div>`;
  return `
    <div class="card-sub" style="margin-bottom:16px">פעילויות שוטפות (יוניברס) ופעילויות אסים (ACES). אסים נקבעות ברגע האחרון — מחיר וסוג מבצע מתעדכנים בהמשך; התכנון מתבסס על סולם חוזק חיזוי.</div>
    ${tiles}${charts}
    <div class="section card-head"><h3>פעילות אסים (ACES)</h3><span class="count-tag">${aces.length} מבצעים</span></div>
    ${tableHTML(cols, aces, { drill: (r) => `promo:${r.promo_id}` })}
    <div class="section card-head"><h3>פעילות שוטפת (יוניברס)</h3><span class="count-tag">${reg.length} מבצעים</span></div>
    ${tableHTML(cols, reg, { drill: (r) => `promo:${r.promo_id}` })}`;
};

PAGES.cannibalization = async () => {
  const d = await load("/api/cannibalization");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._can = d;
  const trees = d.trees || [], members = d.members || [];
  const byTree = {};
  members.forEach((m) => { (byTree[m.tree_id] = byTree[m.tree_id] || []).push(m); });
  const cards = trees.map((t) => {
    const ms = (byTree[t.tree_id] || []).slice().sort((a, b) => Number(b.influence_percent) - Number(a.influence_percent));
    const total = ms.reduce((a, m) => a + Number(m.baseline_forecast_qty || 0), 0);
    const rows = ms.map((m) => `<tr>
      <td><span dir="auto">${esc(m.item_desc)}</span><div class="mut" style="font-size:11px">${esc(vendorName(m.vendor_id))}</div></td>
      <td class="num">${num(m.baseline_forecast_qty)}</td>
      <td style="min-width:160px"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${Number(m.influence_percent)}%"></i></div><span class="strong">${num(m.influence_percent)}%</span></div></td>
      <td class="num strong">${num(m.adjusted_forecast_qty)}</td>
    </tr>`).join("");
    return `<div class="card" data-drill="tree:${esc(t.tree_id)}" style="cursor:pointer">
      <div class="card-head">
        <div><h3 dir="auto">${esc(t.notes || t.tree_id)}</h3><div class="card-sub" style="margin:0">${badge(t.tree_type)} ${badge(t.status)} · בסיס כולל ${num(total)}</div></div>
      </div>
      <div class="table-wrap"><table class="data"><thead><tr><th>פריט</th><th class="num">חיזוי בסיס</th><th>השפעה %</th><th class="num">חיזוי מתואם</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  }).join("");
  const sugg = d.suggestions || [];
  const scols = [
    { key: "suggestion_id", label: "הצעה", render: (r) => esc(r.suggestion_id) },
    { key: "member_descs", label: "פריטים", render: (r) => `<span dir="auto">${esc((r.member_descs || []).join(" ↔ "))}</span>` },
    { key: "confidence", label: "ביטחון", num: true, render: (r) => pct(Math.round(Number(r.confidence) * 100)) },
    { key: "status", label: "סטטוס", render: (r) => badge(r.status) },
    { key: "suggested_at", label: "התקבל", render: (r) => sdate(r.suggested_at) },
  ];
  const pending = sugg.filter((s) => s.status === "PENDING").length;
  const adjTotal = members.reduce((a, m) => a + Number(m.adjusted_forecast_qty || 0), 0);
  const tiles = chipsRow([
    ["עצי קניבליזציה", String(trees.length)],
    ["מתוכננים (by design)", String(trees.filter((t) => t.tree_type === "USER_PARALLEL_BY_DESIGN").length)],
    ["הצעות ממתינות", String(pending)],
    ['סה"כ חיזוי מתואם', num(Math.round(adjTotal))],
  ]);
  return `<div class="card-sub" style="margin-bottom:16px">עצי קניבליזציה — מתוכנן (פריטים מקבילים לשמירת נפח, למשל חלב מ-3 ספקים) או הצעת ספק החיזוי (חפיפת מגוון). מנהל שרשרת האספקה קובע את אחוז ההשפעה של כל פריט.</div>
    ${tiles}
    <div class="section row cols-2">${cards}</div>
    <div class="section card-head"><h3>הצעות מספק החיזוי</h3><span class="count-tag">${sugg.length}</span></div>
    ${tableHTML(scols, sugg, { drill: (r) => `sugg:${r.suggestion_id}` })}`;
};

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
const LK = { items: {}, vendors: {}, stores: {}, formats: {}, warehouses: {} };
function buildLookups(d) {
  (d.items || []).forEach((i) => { LK.items[i.barcode] = i; });
  (d.vendors || []).forEach((v) => { LK.vendors[v.vendor_id] = v.name; });
  (d.stores || []).forEach((s) => { LK.stores[s.store_id] = s.name; });
  (d.formats || []).forEach((f) => { LK.formats[f.format_code] = f.description; });
  (d.warehouses || []).forEach((w) => { LK.warehouses[w.warehouse_id] = w.name; });
}
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
  promo: (pid) => {
    const d = state._promo; const p = d.promotions.find((x) => x.promo_id === pid); if (!p) return;
    const allocs = d.allocations.filter((a) => a.promo_id === pid);
    const waves = d.waves.filter((w) => w.promo_id === pid).sort((a, b) => a.wave_no - b.wave_no);
    const strength = d.aces_strength.filter((s) => s.promo_id === pid);
    let body = kv([
      ["סוג פעילות", badge(p.activity_type)], ["פורמט", formatName(p.format_code)],
      ["אמצעי תצוגה", p.display_type_code || "—"], ["סוג מבצע", p.promo_type_code || "—"],
      ["מחיר קטלוגי", p.catalog_price != null ? money(p.catalog_price) : "—"],
      ["מחיר מבצע", p.promo_price != null ? money(p.promo_price) : badge("WAITING_QC", "טרם נקבע (אסים)")],
      ["ברקוד מייצג", esc(p.representing_barcode)], ["מקבץ", p.item_group_code || "—"],
      ["תאריכים", sdate(p.start_date) + " — " + sdate(p.end_date)], ["כמות הסכם מסחרי", num(p.trade_agreement_qty)],
      ["מס' סניפים", num(p.store_count)], ["אסטרטגיית אספקה", p.wave_strategy === "WAVES" ? "גלים" : "חד-פעמי"],
      ["חיזוי מעוגן-טק", p.forecast_anchor_tec_qty != null ? num(p.forecast_anchor_tec_qty) : "לפי סולם חוזק"],
    ]);
    if (strength.length) {
      const items = strength.sort((a, b) => Number(b.anchor_tec_forecast_qty) - Number(a.anchor_tec_forecast_qty))
        .map((s) => ({ label: { VERY_DEEP: "עמוק מאוד", DEEP: "עמוק", STRONG: "חזק", MEDIUM: "בינוני" }[s.strength_class] || s.strength_class, value: Number(s.anchor_tec_forecast_qty), color: s.selected_by_user ? "#22c55e" : "#6366f1" }));
      body += `<h4>סולם חוזק חיזוי (ACES) — ירוק = נבחר ע"י המתכנן</h4>${vbars(items)}`;
    }
    if (waves.length) {
      const wcols = [
        { key: "warehouse_id", label: "מחסן", render: (r) => "מחסן " + esc(r.warehouse_id) },
        { key: "wave_no", label: "גל", num: true },
        { key: "target_qty_base", label: "כמות יעד", num: true },
        { key: "planned_arrival_date", label: "הגעה מתוכננת", render: (r) => sdate(r.planned_arrival_date) },
        { key: "status", label: "סטטוס", render: (r) => badge(r.status) },
      ];
      body += `<h4>גלי אספקה למחסן (${waves.length})</h4>` + tableHTML(wcols, waves);
    }
    const acols = [
      { key: "store_name", label: "סניף", render: (r) => `<span dir="auto">${esc(r.store_name || storeName(r.store_id))}</span>` },
      { key: "item_desc", label: "פריט", render: (r) => `<span dir="auto">${esc(r.item_desc)}</span>` },
      { key: "supply_method", label: "אספקה", render: (r) => badge(r.supply_method, r.supply_method === "WH" ? "מחסן" : "ישיר") },
      { key: "allocated_qty_base", label: "שחולק", num: true },
      { key: "ordered_qty_base", label: "הוזמן", num: true },
      { key: "sold_qty_base", label: "נמכר", num: true },
    ];
    body += `<h4>מגוון סניפי — הקצאה (${allocs.length})</h4>` + tableHTML(acols, allocs);
    openModal(`<span dir="auto">${esc(p.description)}</span>`, `${esc(p.promo_id)} · ${badge(p.status)}`, body);
  },
  tree: (tid) => {
    const d = state._can; const t = d.trees.find((x) => x.tree_id === tid); if (!t) return;
    const ms = d.members.filter((m) => m.tree_id === tid).sort((a, b) => Number(b.influence_percent) - Number(a.influence_percent));
    const total = ms.reduce((a, m) => a + Number(m.baseline_forecast_qty || 0), 0);
    const cols = [
      { key: "item_desc", label: "פריט", render: (r) => `<span dir="auto">${esc(r.item_desc)}</span>` },
      { key: "vendor_id", label: "ספק", render: (r) => vendorName(r.vendor_id) },
      { key: "baseline_forecast_qty", label: "חיזוי בסיס", num: true },
      { key: "influence_percent", label: "השפעה %", num: true, render: (r) => `<span class="strong">${num(r.influence_percent)}%</span>` },
      { key: "adjusted_forecast_qty", label: "חיזוי מתואם", num: true, render: (r) => `<span class="strong">${num(r.adjusted_forecast_qty)}</span>` },
    ];
    openModal(`<span dir="auto">${esc(t.notes || t.tree_id)}</span>`, `${badge(t.tree_type)} ${badge(t.status)}`,
      kv([["סוג עץ", badge(t.tree_type)], ["סטטוס", badge(t.status)], ["נוצר ע\"י", esc(t.created_by)], ["אושר ע\"י", t.approved_by || "—"], ["בסיס כולל", num(total)], ["מקור הצעה", t.source_suggestion_id || "—"]])
      + `<h4>חברי העץ — חלוקת השפעה (סכום = 100%)</h4>` + tableHTML(cols, ms));
  },
  sugg: (sid) => {
    const d = state._can; const s = (d.suggestions || []).find((x) => x.suggestion_id === sid); if (!s) return;
    openModal(`הצעת קניבליזציה ${esc(s.suggestion_id)}`, badge(s.status),
      kv([["ביטחון", pct(Math.round(Number(s.confidence) * 100))], ["ריצת ספק", esc(s.provider_run_id)], ["התקבל", sdate(s.suggested_at)], ["עץ מקושר", s.tree_id || "—"], ["פריטים", `<span dir="auto">${esc((s.member_descs || []).join(" ↔ "))}</span>`]]));
  },
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
    ["promotions", "מבצעים (שוטף + אסים)", "M3 11l18-5v12L3 14zM7 12v6"],
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
  promotions: ["מבצעים", "פעילות שוטפת ופעילות אסים (ACES)"],
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
          <div><h1>Central Planner</h1><div class="sub">מרכז תכנון תפעולי</div></div>
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

async function navigate(route) {
  if (!PAGES[route]) route = "overview";
  state.route = route;
  location.hash = "#/" + route;
  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.route === route));
  const [t, c] = TITLES[route] || [route, ""];
  $("#pt").textContent = t; $("#pc").textContent = c;
  const view = $("#view");
  view.innerHTML = spinner;
  await ensureMaster();
  if (!state.token) return; // token was invalidated during load -> login shown
  try {
    const html = await PAGES[route]();
    view.innerHTML = html;
    if (PAGES[route].after) PAGES[route].after();
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
  const close = e.target.closest("[data-close]");
  if (close) { closeModal(); return; }
  const d = e.target.closest("[data-drill]");
  if (d) { drill(d.dataset.drill); return; }
  const nav = e.target.closest(".nav-item");
  if (nav) { navigate(nav.dataset.route); return; }
  if (e.target.closest("#logout")) { logout(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
window.addEventListener("hashchange", () => {
  if (!state.token) return;
  const r = (location.hash || "").replace("#/", "");
  if (r && r !== state.route && PAGES[r]) navigate(r);
});

/* ---------------- boot ---------------- */
async function boot() {
  renderShell();
  const r = (location.hash || "").replace("#/", "") || "overview";
  await navigate(PAGES[r] ? r : "overview");
}

(async function init() {
  if (state.token) {
    const h = await api("/api/health");
    if (h && h.ok) { boot(); return; }
  }
  renderLogin();
})();
