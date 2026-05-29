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
function promoPhaseBadge(p) {
  const ph = p._phase || promoPhase(p);
  if (ph === "UPCOMING") { const dd = p._days != null ? p._days : promoDays(p.start_date); return `<span class="badge blue">בעוד ${dd} ימים</span>`; }
  if (ph === "ONGOING") return `<span class="badge green">פעיל</span>`;
  return `<span class="badge gray">הסתיים</span>`;
}
const PROMO_BUCKETS = [
  ["next2w", "2 שבועות הקרובים"], ["ongoing", "פעילים"],
  ["completed", "הסתיימו"], ["all", "הכל"],
];
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

PAGES.promotions = async () => {
  const d = await load("/api/promotions");
  if (!d) return `<div class="empty">אין נתונים</div>`;
  state._promo = d;
  state._promoF = { bucket: "next2w", format: "", display: "", vendor: "", category: "", item: "", ptype: "", wh: "" };
  state._promoX = new Set();
  state._promoOpts = {};
  state._approvedOverride = {};
  return `<div id="promo-root"></div>`;
};
PAGES.promotions.after = () => {
  const root = document.getElementById("promo-root");
  if (!root) return;
  root.addEventListener("change", (e) => {
    const el = e.target.closest("[data-pf]");
    if (el) { state._promoF[el.dataset.pf] = resolvePf(el.dataset.pf, el.value); renderPromo(); }
  });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-bucket]");
    if (b) { state._promoF.bucket = b.dataset.bucket; renderPromo(); return; }
    const o = e.target.closest("[data-open]");
    if (o) { const s = o.dataset.open; s.startsWith("promo:") ? DRILL.promo(s.slice(6)) : openAggPopup(s); return; }
    const t = e.target.closest("[data-toggle]");
    if (t) { state._promoX.has(t.dataset.toggle) ? state._promoX.delete(t.dataset.toggle) : state._promoX.add(t.dataset.toggle); renderPromo(); }
  });
  renderPromo();
};

function promoScope() {
  const d = state._promo, F = state._promoF;
  const promos = (d.promotions || []).filter((p) => p.activity_type === "REGULAR_UNIVERSE")
    .map((p) => ({ ...p, _phase: promoPhase(p), _days: promoDays(p.start_date), _disc: promoDisc(p) }));
  const pmap = {}; promos.forEach((p) => { pmap[p.promo_id] = p; });
  const inBucket = (p) => F.bucket === "all" ? true
    : F.bucket === "next2w" ? (p._phase === "UPCOMING" && p._days <= 14)
    : F.bucket === "ongoing" ? p._phase === "ONGOING"
    : p._phase === "COMPLETED";
  const dimOk = (a) => (!F.format || a.format_code === F.format)
    && (!F.display || a.display_type_code === F.display)
    && (!F.vendor || a.vendor_id === F.vendor)
    && (!F.category || a.category_code === F.category)
    && (!F.item || a.item_barcode === F.item)
    && (!F.ptype || a.promo_type_code === F.ptype)
    && (!F.wh || (a.managing_warehouse_id || "") === F.wh);
  // "lines" are per-promo-item aggregates (store rows are loaded on drill)
  const allocs = (d.promo_items || []).filter((a) => { const p = pmap[a.promo_id]; return p && inBucket(p) && dimOk(a); });
  const whCat = (w) => { const it = LK.items[w.item_barcode]; return it ? it.dept_lv2_code : null; };
  const whsup = (d.wh_supply || []).filter((w) => {
    const p = pmap[w.promo_id]; if (!p || !inBucket(p)) return false;
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
    const fnode = { id: "F#" + fcode, depth: 0, kind: "format", fmt: fcode, open: "fmt:" + fcode, label: formatName(fcode), allocs: fa, pmap, children: [] };
    for (const [vcode, va] of groupMap(fa, (a) => a.vendor_id)) {
      const vnode = { id: fnode.id + "|V#" + vcode, depth: 1, kind: "vendor", open: "ven:" + fcode + "|" + vcode, label: LK.vendors[vcode] || vcode, allocs: va, pmap, children: [] };
      for (const [dcode, da] of groupMap(va, (a) => a.display_type_code)) {
        const dnode = { id: vnode.id + "|D#" + dcode, depth: 2, kind: "display", open: "disp:" + fcode + "|" + vcode + "|" + dcode, label: displayName(dcode), allocs: da, pmap, children: [] };
        for (const [ccode, ca] of groupMap(da, (a) => a.category_code)) {
          const cnode = { id: dnode.id + "|C#" + ccode, depth: 3, kind: "category", open: "cat:" + fcode + "|" + vcode + "|" + dcode + "|" + ccode, label: (ca[0] && ca[0].category_name) || ccode, allocs: ca, pmap, children: [] };
          for (const [pid, pa] of groupMap(ca, (a) => a.promo_id)) {
            cnode.children.push({ id: "P#" + pid + "@" + cnode.id, depth: 4, kind: "promo", open: "promo:" + pid, promo: pmap[pid], label: pmap[pid] ? pmap[pid].description : pid, allocs: pa, pmap });
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
  const a = node.allocs || [];
  const pids = new Set(a.map((x) => x.promo_id));
  let trade = 0;
  if (node.kind === "promo") trade = Number(node.promo && node.promo.trade_agreement_qty || 0);
  else pids.forEach((pid) => { trade += Number(node.pmap[pid] && node.pmap[pid].trade_agreement_qty || 0); });
  let appr = sumOf(a, "approved_forecast_qty");
  if (node.kind === "format" && state._approvedOverride[node.fmt] != null) appr = Number(state._approvedOverride[node.fmt]);
  const ord = sumOf(a, "store_ordered_qty"), sold = sumOf(a, "sold_qty"), recom = sumOf(a, "store_recommended_qty");
  return {
    storeCount: storeCountOf(pids, node.pmap),
    itemCount: new Set(a.map((x) => x.item_barcode)).size,
    orig: sumOf(a, "original_forecast_qty"), appr, ord, sold, recom, trade,
    fq: fqAcc(sold, appr), fqRatio: (sold > 0 && appr > 0) ? sold / appr : null,
    adopt: recom > 0 ? cap100(Math.round(ord / recom * 100)) : null,
  };
}
function tradeWarn(m) {
  const w = [];
  if (m.trade > 0 && m.appr < m.trade) {
    const gap = (m.trade - m.appr) / m.trade;
    w.push(gap > 0.10 ? `<span class="badge red">חלש מול הסכם</span>` : `<span class="badge amber">פער קל מול הסכם</span>`);
  }
  if (m.adopt != null && m.adopt < 70) w.push(`<span class="badge amber">אימוץ נמוך</span>`);
  if (m.fqRatio != null && m.fqRatio < 0.75) w.push(`<span class="badge amber">מכר מתחת לחיזוי</span>`);
  if (m.fqRatio != null && m.fqRatio > 1.25) w.push(`<span class="badge red">מכר מעל לחיזוי</span>`);
  return w;
}
function renderPromoNode(node) {
  const m = aggNode(node);
  const isPromo = node.kind === "promo";
  const exp = !isPromo && state._promoX.has(node.id);
  const warn = tradeWarn(m);
  const override = node.kind === "format" && state._approvedOverride[node.fmt] != null;
  const chevron = isPromo ? `<span style="display:inline-block;width:14px"></span>`
    : `<span style="display:inline-block;width:14px">${exp ? "▾" : "▸"}</span>`;
  const name = `<span data-open="${esc(node.open)}" style="cursor:pointer;text-decoration:underline dotted"><span dir="auto" class="${isPromo ? "" : "strong"}">${esc(node.label)}</span></span>${isPromo ? " " + promoPhaseBadge(node.promo) : ""}`;
  const rowAttr = isPromo ? `class="clickable"` : `data-toggle="${esc(node.id)}" class="clickable"`;
  const row = `<tr ${rowAttr}>
    <td style="padding-inline-start:${node.depth * 18 + 12}px">${chevron} ${name}</td>
    <td class="num">${m.storeCount}</td><td class="num">${m.itemCount}</td><td class="num">${num(m.orig)}</td>
    <td class="num">${num(m.appr)}${override ? ' <span class="badge violet">ידני</span>' : ""}</td>
    <td class="num">${num(m.ord)}</td><td class="num">${m.sold ? num(m.sold) : "—"}</td>
    <td class="num">${m.fq == null ? "—" : `<span class="badge ${fqTone(m.fq)}">${m.fq}%</span>`}</td>
    <td class="num">${m.adopt == null ? "—" : `<span class="badge ${adoptTone(m.adopt)}">${m.adopt}%</span>`}</td>
    <td class="num">${m.trade ? num(m.trade) : "—"}</td>
    <td>${warn.join(" ") || "<span class='mut'>—</span>"}</td></tr>`;
  return row + (exp ? node.children.map(renderPromoNode).join("") : "");
}

/* aggregate-level popups (format / vendor / display) */
function aggMetrics(allocs, pmap, override) {
  const pids = new Set(allocs.map((a) => a.promo_id));
  const apprRolled = sumOf(allocs, "approved_forecast_qty");
  const appr = override != null ? Number(override) : apprRolled;
  const ord = sumOf(allocs, "store_ordered_qty"), sold = sumOf(allocs, "sold_qty"), recom = sumOf(allocs, "store_recommended_qty");
  let trade = 0, disc = 0, otif = 0, avail = 0, shrink = 0, n = 0;
  pids.forEach((pid) => { const p = pmap[pid]; if (p) { trade += Number(p.trade_agreement_qty || 0); disc += Number(p._disc || 0); otif += Number(p.otif_pct || 0); avail += Number(p.availability_pct || 0); shrink += Number(p.shrink_pct || 0); n++; } });
  return {
    storeCount: storeCountOf(pids, pmap), promoCount: pids.size,
    itemCount: new Set(allocs.map((a) => a.item_barcode)).size,
    orig: sumOf(allocs, "original_forecast_qty"), appr, apprRolled, ord, sold, recom, trade,
    fq: fqAcc(sold, appr), fqRatio: (sold > 0 && appr > 0) ? sold / appr : null,
    adopt: recom > 0 ? cap100(Math.round(ord / recom * 100)) : null,
    disc: n ? Math.round(disc / n) : null, cover: trade > 0 ? cap100(Math.round(appr / trade * 100)) : null,
    otif: n ? cap100(Math.round(otif / n)) : null, avail: n ? cap100(Math.round(avail / n)) : null,
    shrink: n ? (shrink / n).toFixed(1) : null,
  };
}
function aggKpiChips(m, adoptW) {
  const chip = (v, l) => `<div class="chip"><div class="c-val">${v}</div><div class="c-lbl">${l}</div></div>`;
  return `<div class="chips">${chip(m.storeCount, "סניפים")}${chip(m.itemCount, "פריטים")}${chip(m.promoCount, "מבצעים")}
    ${chip(m.disc == null ? "—" : m.disc + "%", "% הנחה")}${chip(m.fq == null ? "—" : m.fq + "%", "איכות חיזוי")}
    ${chip(m.adopt == null ? "—" : m.adopt + "%", "אימוץ סניפים")}${chip(adoptW == null ? "—" : cap100(adoptW) + "%", "אימוץ מחסנים")}
    ${chip(m.cover == null ? "—" : m.cover + "%", "כיסוי הסכם")}${chip(m.otif == null ? "—" : m.otif + "%", "OTIF")}
    ${chip(m.avail == null ? "—" : m.avail + "%", "זמינות")}${chip(m.shrink == null ? "—" : m.shrink + "%", "פחת")}</div>`;
}
function aggBreakdown(allocs, pmap, keyFn, labelFn, openFn, colTitle) {
  let rows = "";
  for (const [k, arr] of groupMap(allocs, keyFn)) {
    const m = aggMetrics(arr, pmap, null);
    rows += `<tr class="clickable" data-open="${esc(openFn(k))}">
      <td><span dir="auto">${esc(labelFn(k))}</span></td><td class="num">${m.storeCount}</td><td class="num">${m.itemCount}</td>
      <td class="num">${num(m.orig)}</td><td class="num">${num(m.appr)}</td><td class="num">${num(m.ord)}</td>
      <td class="num">${m.sold ? num(m.sold) : "—"}</td>
      <td class="num">${m.fq == null ? "—" : `<span class="badge ${fqTone(m.fq)}">${m.fq}%</span>`}</td>
      <td class="num">${m.adopt == null ? "—" : `<span class="badge ${adoptTone(m.adopt)}">${m.adopt}%</span>`}</td></tr>`;
  }
  return `<h4>${esc(colTitle)} — לחיצה לפירוט</h4><div class="table-wrap"><table class="data"><thead><tr><th>${esc(colTitle)}</th><th class="num">סניפים</th><th class="num">פריטים</th><th class="num">מקורי</th><th class="num">מאושר</th><th class="num">הוזמן</th><th class="num">נמכר</th><th class="num">איכות</th><th class="num">אימוץ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function openAggPopup(spec) {
  const ci = spec.indexOf(":"); const kind = spec.slice(0, ci), arg = spec.slice(ci + 1);
  const { allocs, whsup, pmap } = promoScope();
  let na, nw, title, fmt = null, breakdown = "";
  if (kind === "fmt") {
    fmt = arg;
    na = allocs.filter((a) => a.format_code === arg);
    nw = whsup.filter((w) => pmap[w.promo_id] && pmap[w.promo_id].format_code === arg);
    title = "פורמט · " + formatName(arg);
    breakdown = aggBreakdown(na, pmap, (a) => a.vendor_id, (v) => LK.vendors[v] || v, (v) => "ven:" + arg + "|" + v, "ספקים");
  } else if (kind === "ven") {
    const [f, v] = arg.split("|");
    na = allocs.filter((a) => a.format_code === f && a.vendor_id === v);
    nw = whsup.filter((w) => w.vendor_id === v && pmap[w.promo_id] && pmap[w.promo_id].format_code === f);
    title = "ספק · " + (LK.vendors[v] || v) + " · " + formatName(f);
    breakdown = aggBreakdown(na, pmap, (a) => a.display_type_code, (dd) => displayName(dd), (dd) => "disp:" + f + "|" + v + "|" + dd, "אמצעי תצוגה");
  } else if (kind === "disp") {
    const [f, v, dd] = arg.split("|");
    na = allocs.filter((a) => a.format_code === f && a.vendor_id === v && a.display_type_code === dd);
    nw = whsup.filter((w) => { const p = pmap[w.promo_id]; return p && p.format_code === f && p.display_type_code === dd && w.vendor_id === v; });
    title = displayName(dd) + " · " + (LK.vendors[v] || v) + " · " + formatName(f);
    breakdown = aggBreakdown(na, pmap, (a) => a.category_code, (cc) => (na.find((x) => x.category_code === cc) || {}).category_name || cc, (cc) => "cat:" + f + "|" + v + "|" + dd + "|" + cc, "היררכיית פריט");
  } else {
    const [f, v, dd, cc] = arg.split("|");
    na = allocs.filter((a) => a.format_code === f && a.vendor_id === v && a.display_type_code === dd && a.category_code === cc);
    nw = whsup.filter((w) => { const p = pmap[w.promo_id], it = LK.items[w.item_barcode]; return p && p.format_code === f && p.display_type_code === dd && w.vendor_id === v && it && it.dept_lv2_code === cc; });
    const cname = (na[0] && na[0].category_name) || cc;
    title = cname + " · " + displayName(dd) + " · " + (LK.vendors[v] || v);
    breakdown = aggBreakdown(na, pmap, (a) => a.promo_id, (pid) => pmap[pid] ? pmap[pid].description : pid, (pid) => "promo:" + pid, "מבצעים");
  }
  const override = fmt != null ? state._approvedOverride[fmt] : null;
  const m = aggMetrics(na, pmap, override);
  const adoptW = sumOf(nw, "wh_recommended_qty") > 0 ? Math.round(sumOf(nw, "wh_ordered_qty") / sumOf(nw, "wh_recommended_qty") * 100) : null;
  const weak = m.trade > 0 && m.appr < m.trade;
  const maxF = Math.max(m.orig, m.appr, m.trade, 1);
  const bar = (label, val, color) => `<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${label}</span><span class="strong">${num(val)}</span></div><div class="bar" style="height:10px"><i style="width:${Math.round(val / maxF * 100)}%;background:${color}"></i></div></div>`;
  let body = "";
  if (fmt != null) {
    const cur = override != null ? override : m.apprRolled;
    body += `<h4>חיזוי מאושר — רמת פורמט</h4><div class="card" style="background:var(--bg-2)">
      <div class="card-sub" style="margin-bottom:8px">מנהל שרשרת האספקה מאשר חיזוי לתקופה ברמת הפורמט בלבד. הערך מזין כיסוי הסכם מסחרי ואיכות חיזוי בכל הרמות שמתחת.</div>
      ${bar("חיזוי מקורי (ספק)", m.orig, "#64748b")}${bar("חיזוי מאושר", m.appr, "#6366f1")}${m.trade ? bar("הסכם מסחרי", m.trade, weak ? "#ef4444" : "#22c55e") : ""}
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <label style="font-size:13px;color:var(--text-dim)">חיזוי מאושר (יח'):</label>
        <input class="search" style="max-width:180px" type="number" min="0" step="100" value="${cur}" data-approved-fmt="${esc(fmt)}" />
        <span class="mut" style="font-size:12px">${override != null ? "נקבע ידנית" : "ברירת מחדל = סכום מאושר מצטבר"}</span>
      </div>
      ${weak ? `<div class="login-error" style="margin-top:10px">⚠ החיזוי המאושר נמוך מההסכם המסחרי — נדרש חיזוק.</div>` : ""}</div>`;
  }
  body += `<h4>מדדים</h4>${aggKpiChips(m, adoptW)}${breakdown}`;
  openModal(esc(title), `${m.promoCount} מבצעים · ${m.storeCount} סניפים`, body);
  if (fmt != null) {
    const inp = document.querySelector("#modal-root [data-approved-fmt]");
    if (inp) inp.addEventListener("change", () => {
      const v = parseFloat(inp.value);
      if (isNaN(v)) delete state._approvedOverride[fmt]; else state._approvedOverride[fmt] = v;
      renderPromo();
      openAggPopup(spec);
    });
  }
}

function renderPromo() {
  const root = document.getElementById("promo-root");
  if (!root) return;
  const d = state._promo, F = state._promoF;
  const { allocs, whsup, scoped, pmap } = promoScope();

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
  const buckets = PROMO_BUCKETS.map(([k, lbl]) => `<button class="btn ${F.bucket === k ? "btn-primary" : "btn-ghost"}" data-bucket="${k}" style="width:auto">${lbl}</button>`).join("");

  let apprT = 0;
  for (const [f, arr] of groupMap(allocs, (a) => a.format_code)) apprT += (state._approvedOverride[f] != null ? Number(state._approvedOverride[f]) : sumOf(arr, "approved_forecast_qty"));
  const ordT = sumOf(allocs, "store_ordered_qty"), soldT = sumOf(allocs, "sold_qty"), recomT = sumOf(allocs, "store_recommended_qty");
  const whRecom = sumOf(whsup, "wh_recommended_qty"), whOrd = sumOf(whsup, "wh_ordered_qty");
  const storeCnt = storeCountOf(new Set(allocs.map((a) => a.promo_id)), pmap);
  const itemCnt = uniq(allocs.map((a) => a.item_barcode)).length;
  const avgDisc = scoped.length ? Math.round(scoped.reduce((a, p) => a + (p._disc || 0), 0) / scoped.length) : 0;
  const fq = fqAcc(soldT, apprT);
  const adoptS = recomT > 0 ? cap100(Math.round(ordT / recomT * 100)) : null;
  const adoptW = whRecom > 0 ? cap100(Math.round(whOrd / whRecom * 100)) : null;
  const atRisk = scoped.filter((p) => Number(p.approved_forecast_total || 0) < Number(p.trade_agreement_qty || 0)).length;
  const otif = cap100(avgOf(scoped, "otif_pct")), avail = cap100(avgOf(scoped, "availability_pct"));
  const shrink = scoped.length ? (scoped.reduce((a, p) => a + Number(p.shrink_pct || 0), 0) / scoped.length).toFixed(1) : null;
  const toneV = { green: "good", amber: "warn", red: "bad", gray: "border", accent: "accent" };
  const kpi = (label, val, tone, sub) => `<div class="kpi"><div style="position:absolute;top:0;inset-inline-start:0;width:4px;height:100%;background:var(--${toneV[tone] || "accent"})"></div><div class="k-label">${label}</div><div class="k-val" style="font-size:24px">${val}</div><div class="k-meta">${sub || ""}</div></div>`;
  const kpis = `<div class="kpi-grid">
    ${kpi("מבצעים בהיקף", String(scoped.length), "accent", `${num(storeCnt)} סניפים · ${num(itemCnt)} פריטים`)}
    ${kpi("% הנחה ממוצע", avgDisc + "%", "accent")}
    ${kpi("איכות חיזוי (דיוק)", fq == null ? "—" : fq + "%", fqTone(fq), fq == null ? "טרם נמכר" : "")}
    ${kpi("% אימוץ סניפים", adoptS == null ? "—" : adoptS + "%", adoptTone(adoptS))}
    ${kpi("% אימוץ מחסנים", adoptW == null ? "—" : adoptW + "%", adoptTone(adoptW))}
    ${kpi("הסכם מסחרי בסיכון", String(atRisk), atRisk ? "red" : "green", "מבצעים חלשים מול הסכם")}
    ${kpi("% OTIF", otif == null ? "—" : otif + "%", "accent")}
    ${kpi("% זמינות", avail == null ? "—" : avail + "%", "accent")}
    ${kpi("% פחת", shrink == null ? "—" : shrink + "%", "accent")}
  </div>`;

  const tree = buildPromoTree(allocs, pmap);
  const treeRows = tree.map(renderPromoNode).join("");
  const header = `<tr><th>פורמט → ספק → אמצעי תצוגה → היררכיה → מבצע</th><th class="num">סניפים</th><th class="num">פריטים</th><th class="num">חיזוי מקורי</th><th class="num">חיזוי מאושר</th><th class="num">הוזמן</th><th class="num">נמכר</th><th class="num">איכות חיזוי</th><th class="num">אימוץ</th><th class="num">הסכם מסחרי</th><th>התראה</th></tr>`;
  const banner = F.bucket === "next2w" ? `<div class="card" style="border-color:${atRisk ? "var(--bad)" : "var(--border)"};margin-bottom:16px"><div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap"><div><div class="c-val" style="font-size:26px">${scoped.length}</div><div class="c-lbl">מבצעים ב-14 הימים הקרובים — לטיפול מיידי</div></div>${atRisk ? `<div style="color:#fca5a5"><div class="c-val" style="font-size:26px">${atRisk}</div><div class="c-lbl">⚠ חלשים מול הסכם מסחרי</div></div>` : ""}<div class="mut" style="flex:1;text-align:end;min-width:200px">אגרגציה: פורמט → ספק → אמצעי תצוגה → היררכיה → מבצע · לחיצה על כל רמה לפירוט ומדדים</div></div></div>` : "";

  root.innerHTML = `
    <div class="card-sub" style="margin-bottom:14px">פעילות שוטפת (יוניברס) — תכנון תפעולי end-to-end: חיזוי מקורי מול מאושר, הזמנה מול המלצה (אימוץ), מכר מול חיזוי, והסכם מסחרי מול חוזק המבצע.</div>
    <div class="filters">${buckets}</div>
    <div class="filters">
      ${combo("format", "פורמט — הקלד קוד/תיאור")}
      ${combo("vendor", "ספק — הקלד קוד/שם")}
      ${combo("display", "אמצעי תצוגה — קוד/תיאור")}
      ${combo("category", "היררכיית פריט")}
      ${combo("item", "פריט — קוד/תיאור")}
      ${combo("ptype", "סוג מבצע")}
      ${combo("wh", "מחסן מנהל")}
    </div>
    ${banner}${kpis}
    <div class="section table-wrap"><table class="data"><thead>${header}</thead><tbody>${treeRows || `<tr><td colspan="11"><div class="empty">אין מבצעים בהיקף הנבחר</div></td></tr>`}</tbody></table></div>`;
}

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
function campaignAnalysis(p) {
  const phase = promoPhase(p);
  const days = Number(p.duration_days) || Math.max(1, Math.round((new Date(p.end_date) - new Date(p.start_date)) / 86400000));
  const base2w = Number(p.baseline_units_2w || 0), baseDaily = base2w / 14;
  const sold = Number(p.sold_total || 0), ordered = Number(p.ordered_total || 0);
  const appr = Number(p.approved_forecast_total || 0), orig = Number(p.original_forecast_total || 0);
  const trade = Number(p.trade_agreement_qty || 0), unitCost = Number(p.unit_cost || 0);
  const promoPrice = Number(p.promo_price || 0), cat = Number(p.catalog_price || promoPrice || 0);
  const campDaily = sold > 0 ? sold / days : null;
  const boost = (baseDaily > 0 && campDaily != null) ? Math.round((campDaily / baseDaily - 1) * 100) : null;
  const revCampaign = (sold > 0 && promoPrice) ? sold * promoPrice : null;
  const revBaseline = (baseDaily > 0 && cat) ? baseDaily * days * cat : null;
  const revUplift = (revCampaign != null && revBaseline != null) ? revCampaign - revBaseline : null;
  const supplied = ordered || trade, consumed = sold || appr;
  const leftover = Math.max(0, supplied - consumed);
  const stockDaysAfter = baseDaily > 0 ? Math.round(leftover / baseDaily) : null;
  const reference = phase === "COMPLETED" ? sold : Math.max(appr, orig);
  const overshoot = Math.max(0, trade - reference);
  const overshootValue = overshoot * unitCost;
  const storageCost = overshootValue * 0.0008 * (stockDaysAfter || 30);
  const shrinkCost = overshootValue * (Number(p.shrink_pct || 2) / 100);
  const transportCost = overshootValue * 0.03;
  const overshootCost = Math.round(storageCost + shrinkCost + transportCost);
  let verdict, vtone;
  if (trade <= 0) { verdict = "אין הסכם מסחרי"; vtone = "gray"; }
  else if (overshoot <= trade * 0.05) { verdict = "ההסכם מכוסה ע\"י הביקוש — משתלם"; vtone = "green"; }
  else if (revUplift != null && overshootCost > Math.max(1, revUplift) * 0.6) { verdict = "ההסכם גבוה מדי — עלות העודף שוחקת את התועלת"; vtone = "red"; }
  else if (overshoot > trade * 0.2) { verdict = "עודף משמעותי מול הביקוש — לשקול הקטנת הסכם"; vtone = "red"; }
  else { verdict = "עודף מנוהל — לעקוב"; vtone = "amber"; }
  return { phase, days, baseDaily, sold, leftover, stockDaysAfter, boost, revCampaign, revBaseline, revUplift, overshoot, storageCost, shrinkCost, transportCost, overshootCost, verdict, vtone };
}

/* promo drill assortment tree: store -> מקבץ leader -> member barcodes
   (standalone items render as a store+item leaf). */
function drillAgg(rows) {
  const o = sumOf(rows, "original_forecast_qty"), a = sumOf(rows, "approved_forecast_qty");
  const r = sumOf(rows, "store_recommended_qty"), ord = sumOf(rows, "store_ordered_qty"), s = sumOf(rows, "sold_qty");
  return { o, a, r, ord, s, fq: fqAcc(s, a), adopt: r > 0 ? cap100(Math.round(ord / r * 100)) : null };
}
function drillRow(depth, toggleId, exp, hasChildren, label, m) {
  const chev = hasChildren ? (exp ? "▾" : "▸") : "";
  const attr = toggleId ? `data-ptree="${esc(toggleId)}" class="clickable"` : "";
  return `<tr ${attr}><td style="padding-inline-start:${depth * 18 + 12}px"><span style="display:inline-block;width:14px">${chev}</span> ${label}</td>
    <td class="num">${num(m.o)}</td><td class="num">${num(m.a)}</td><td class="num">${num(m.r)}</td><td class="num">${num(m.ord)}</td><td class="num">${m.s ? num(m.s) : "—"}</td>
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
  return `<div class="table-wrap"><table class="data"><thead><tr><th>סניף · מקבץ/פריט → ברקודים</th><th class="num">חיזוי מקורי</th><th class="num">חיזוי מאושר</th><th class="num">המלצה</th><th class="num">הוזמן</th><th class="num">נמכר</th><th class="num">איכות</th><th class="num">אימוץ</th></tr></thead><tbody>${html}</tbody></table></div>`;
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
  promo: async (pid) => {
    const d = state._promo; const p0 = (d.promotions || []).find((x) => x.promo_id === pid); if (!p0) return;
    const p = { ...p0, _phase: promoPhase(p0), _days: promoDays(p0.start_date), _disc: promoDisc(p0) };
    openModal(`<span dir="auto">${esc(p.description)}</span>`, `${esc(p.promo_id)} · ${badge(p.status)}`, spinner);
    const det = await promoDetail(pid);
    const allocs = det.allocations || [], whsup = det.wh_supply || [], strength = det.aces_strength || [];
    const orig = Number(p.original_forecast_total || 0), appr = Number(p.approved_forecast_total || 0);
    const ord = Number(p.ordered_total || 0), sold = Number(p.sold_total || 0);
    const recom = Number(p.store_recommended_total || 0);
    const whR = Number(p.wh_recommended_total || 0), whO = Number(p.wh_ordered_total || 0);
    const trade = Number(p.trade_agreement_qty || 0);
    const fq = fqAcc(sold, appr);
    const adoptS = recom > 0 ? cap100(Math.round(ord / recom * 100)) : null;
    const adoptW = whR > 0 ? cap100(Math.round(whO / whR * 100)) : null;
    const cover = trade > 0 ? cap100(Math.round(appr / trade * 100)) : null;
    const gap = trade > 0 ? (trade - appr) / trade : 0;
    const maxF = Math.max(orig, appr, trade, ord, sold, 1);
    const bar = (label, val, color) => `<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${label}</span><span class="strong">${num(val)}</span></div><div class="bar" style="height:10px"><i style="width:${Math.round(val / maxF * 100)}%;background:${color}"></i></div></div>`;
    const repCat = (allocs[0] && allocs[0].category_name) || (LK.items[p.representing_barcode] && LK.items[p.representing_barcode].dept_lv2_name) || "—";
    let body = kv([
      ["סוג פעילות", badge(p.activity_type)], ["שלב", promoPhaseBadge(p)],
      ["פורמט", formatName(p.format_code)], ["אמצעי תצוגה", displayName(p.display_type_code)],
      ["סוג מבצע", ptypeName(p.promo_type_code)], ["ספק", LK.vendors[p.vendor_id] || p.vendor_id],
      ["מועדון / קהל", LOYALTY_HE[p.loyalty_segment_code] || p.loyalty_segment_code || "—"],
      ["היררכיית פריט", `<span dir="auto">${esc(repCat)}</span>`],
      ["מחסן מנהל", p.managing_warehouse_id ? "מחסן " + p.managing_warehouse_id : "ישיר"],
      ["מחיר קטלוגי", p.catalog_price != null ? money(p.catalog_price) : "—"],
      ["מחיר מבצע", p.promo_price != null ? money(p.promo_price) : badge("WAITING_QC", "טרם נקבע")],
      ["% הנחה", p._disc != null ? `<span class="strong">${p._disc}%</span>` : "—"],
      ["תאריכים", sdate(p.start_date) + " — " + sdate(p.end_date)], ["מס' סניפים", num(p.store_count)],
    ]);
    body += `<h4>חיזוי, הזמנה ומכר (סה"כ)</h4><div class="card" style="background:var(--bg-2)">
      ${bar("חיזוי מקורי (ספק)", orig, "#64748b")}
      ${bar("חיזוי מאושר (מנהל שרשרת)", appr, "#6366f1")}
      ${trade ? bar("הסכם מסחרי", trade, (gap > 0.10) ? "#ef4444" : "#22c55e") : ""}
      ${ord ? bar("הוזמן מספק (מצטבר)", ord, "#38bdf8") : ""}
      ${sold ? bar("נמכר בפועל", sold, "#22c55e") : ""}</div>`;
    if (gap > 0.10) body += `<div class="login-error" style="margin-top:12px">⚠ חיזוי מאושר (${num(appr)}) נמוך מההסכם המסחרי (${num(trade)}) ביותר מ-10% — המבצע חלש מדי לכמות ההסכם.</div>`;
    body += `<h4>מדדי ביצוע</h4><div class="chips">
      <div class="chip"><div class="c-val">${fq == null ? "—" : fq + "%"}</div><div class="c-lbl">איכות חיזוי (דיוק)</div></div>
      <div class="chip"><div class="c-val">${adoptS == null ? "—" : adoptS + "%"}</div><div class="c-lbl">אימוץ סניפים</div></div>
      <div class="chip"><div class="c-val">${adoptW == null ? "—" : adoptW + "%"}</div><div class="c-lbl">אימוץ מחסנים</div></div>
      <div class="chip"><div class="c-val">${cover == null ? "—" : cover + "%"}</div><div class="c-lbl">כיסוי הסכם מסחרי</div></div>
      <div class="chip"><div class="c-val">${cap100(Number(p.otif_pct))}%</div><div class="c-lbl">OTIF</div></div>
      <div class="chip"><div class="c-val">${cap100(Number(p.availability_pct))}%</div><div class="c-lbl">זמינות</div></div>
      <div class="chip"><div class="c-val">${num(p.shrink_pct)}%</div><div class="c-lbl">פחת</div></div></div>`;
    const ca = campaignAnalysis(p);
    body += `<h4>ניתוח קמפיין ו-ROI הסכם מסחרי</h4><div class="chips">
      <div class="chip"><div class="c-val">${ca.sold ? num(ca.sold) : "—"}</div><div class="c-lbl">מכר בתקופת הקמפיין</div></div>
      <div class="chip"><div class="c-val">${ca.boost == null ? "—" : (ca.boost > 0 ? "+" : "") + ca.boost + "%"}</div><div class="c-lbl">זינוק מכירות מול שבועיים לפני</div></div>
      <div class="chip"><div class="c-val">${ca.revUplift == null ? "—" : (ca.revUplift >= 0 ? "+" : "") + money(Math.round(ca.revUplift))}</div><div class="c-lbl">תוספת הכנסה מול שבועיים לפני (כולל הנחה)</div></div>
      <div class="chip"><div class="c-val">${ca.stockDaysAfter == null ? "—" : ca.stockDaysAfter}</div><div class="c-lbl">ימי מלאי שנותרו לאחר הקמפיין</div></div>
    </div>
    <div class="card" style="background:var(--bg-2);margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><span class="strong">הערכת עודף הסכם מסחרי</span><span class="badge ${ca.vtone}">${ca.verdict}</span></div>
      <div class="card-sub" style="margin:0 0 10px">${ca.phase === "COMPLETED" ? "בהשוואה למכירות בפועל (רטרו)" : "בהשוואה לחיזוי מאושר/מקורי (לפני/במהלך)"} — עודף הסכם יוצר ימי מלאי, פחת ועלויות הובלה מיותרות.</div>
      <div class="chips">
        <div class="chip"><div class="c-val">${num(ca.overshoot)}</div><div class="c-lbl">עודף יח' מול ${ca.phase === "COMPLETED" ? "מכר" : "חיזוי"}</div></div>
        <div class="chip"><div class="c-val">${money(Math.round(ca.storageCost))}</div><div class="c-lbl">עלות אחסון</div></div>
        <div class="chip"><div class="c-val">${money(Math.round(ca.shrinkCost))}</div><div class="c-lbl">עלות פחת</div></div>
        <div class="chip"><div class="c-val">${money(Math.round(ca.transportCost))}</div><div class="c-lbl">עלות הובלה</div></div>
        <div class="chip"><div class="c-val strong">${money(ca.overshootCost)}</div><div class="c-lbl">עלות עודף כוללת</div></div>
      </div>
    </div>`;
    if (strength.length) {
      const items = strength.slice().sort((a, b) => Number(b.anchor_tec_forecast_qty) - Number(a.anchor_tec_forecast_qty))
        .map((s) => ({ label: { VERY_DEEP: "עמוק מאוד", DEEP: "עמוק", STRONG: "חזק", MEDIUM: "בינוני" }[s.strength_class] || s.strength_class, value: Number(s.anchor_tec_forecast_qty), color: s.selected_by_user ? "#22c55e" : "#6366f1" }));
      body += `<h4>סולם חוזק חיזוי (ACES) — ירוק = נבחר</h4>${vbars(items)}`;
    }
    state._promoDrillAllocs = allocs.slice(0, 600);
    state._promoDrillX = new Set();
    body += `<h4>מגוון סניפי — סניף · מקבץ/פריט → ברקודים (${num(p.store_count)} סניפים)</h4>
      <div class="card-sub" style="margin:-6px 0 8px">כל שורה היא סניף עם מקבץ מוביל או פריט עצמאי; לחיצה על מקבץ פותחת את הברקודים שבו.</div>
      <div id="promo-drill-tree">${renderDrillTree(state._promoDrillAllocs)}</div>`;
    if (whsup.length) {
      const wcols = [
        { key: "warehouse_id", label: "מחסן", render: (r) => "מחסן " + esc(r.warehouse_id) },
        { key: "item_desc", label: "פריט", render: (r) => `<span dir="auto">${esc(r.item_desc)}</span>` },
        { key: "wh_recommended_qty", label: "המלצת מחסן", num: true, render: (r) => num(r.wh_recommended_qty) },
        { key: "wh_ordered_qty", label: "הוזמן מחסן", num: true, render: (r) => num(r.wh_ordered_qty) },
      ];
      body += `<h4>אספקת מחסן (${whsup.length})</h4>` + tableHTML(wcols, whsup);
    }
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
  if (e.target.classList && e.target.classList.contains("modal-back")) { closeModal(); return; }
  const close = e.target.closest("[data-close]");
  if (close) { closeModal(); return; }
  const d = e.target.closest("[data-drill]");
  if (d) { drill(d.dataset.drill); return; }
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
