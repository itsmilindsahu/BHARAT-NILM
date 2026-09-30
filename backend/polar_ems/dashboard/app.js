// ---------------------------------------------------------------- API client
const API = (() => {
  const base = "";
  async function req(method, path, body, params) {
    let url = base + path;
    if (params) url += "?" + new URLSearchParams(params).toString();
    const opt = { method, headers: {} };
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    const r = await fetch(url, opt);
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${method} ${path} -> ${r.status} ${t}`); }
    return r.json();
  }
  return {
    meta: () => req("GET", "/api/meta"),
    snapshot: (hist) => req("GET", "/api/snapshot", undefined, { hist_hours: hist || 48 }),
    scenario: (scenario, days, seed) => req("POST", "/api/scenario", { scenario, days, seed: seed || 1 }),
    play: () => req("POST", "/api/play"),
    pause: () => req("POST", "/api/pause"),
    step: (n) => req("POST", "/api/step", undefined, { n: n || 1 }),
    speed: (hz) => req("POST", "/api/speed", { hz }),
    fault: (kind, hours, magnitude, target) => req("POST", "/api/fault", { kind, hours, magnitude, target: target || 0 }),
    coldSnap: (hours, delta_c) => req("POST", "/api/cold_snap", { hours, delta_c }),
    override: (gen, mode) => req("POST", "/api/override", { gen, mode }),
    link: (up) => req("POST", "/api/link", { up }),
  };
})();

// -------------------------------------------------------------------- utils
const fmt = {
  kw(x, d = 0) { return (x === null || x === undefined || isNaN(x)) ? "—" : x.toFixed(d); },
  pct(x, d = 0) { return (x === null || x === undefined || isNaN(x)) ? "—" : (x * 100).toFixed(d); },
  time(iso) {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  },
  hm(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  },
  ago(iso) {
    const s = (Date.now() - new Date(iso + "Z").getTime()) / 1000; // sim clock isn't wall clock; treated separately below
    return iso;
  },
  relHours(nowIso, tsIso) {
    const h = (new Date(nowIso) - new Date(tsIso)) / 3600000;
    if (h < 1) return "just now";
    return `${Math.round(h)}h ago`;
  },
  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  },
};

const COLORS = {
  pv: "#E8A33D", wind: "#7FB8D9", load: "#DCE8F2", batt: "#5FBF8F",
  gen: ["#C97B4A", "#8A5A9E"], curtail: "#5C7189", shed: "#E0615C",
  ems: "#5FBF8F", baseline_soc: "#7FB8D9", baseline_diesel: "#E0615C",
  fc_lo_hi: "rgba(127,184,217,0.12)",
};

// --------------------------------------------------------------- app state
let META = null;
let SNAP = null;
let pollTimer = null;
let speedSteps = [0, 1, 4, 12, 24]; // hz options mapped from the slider

function speedFromSlider(v) { return speedSteps[+v] ?? 1; }

// ------------------------------------------------------------- bootstrap
async function boot() {
  META = await API.meta();
  const sel = document.getElementById("scenarioSelect");
  sel.innerHTML = "";
  for (const [key, desc] of Object.entries(META.scenarios)) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = key;
    opt.title = desc;
    sel.appendChild(opt);
  }
  document.getElementById("applyScenario").addEventListener("click", async () => {
    const scenario = sel.value;
    await API.scenario(scenario, null, Math.floor(Math.random() * 1000));
    await refresh();
  });
  document.getElementById("btnPlay").addEventListener("click", async () => {
    if (STATE.playing) { await API.pause(); } else { await API.play(); }
  });
  document.getElementById("btnStep").addEventListener("click", async () => {
    await API.step(1); await refresh();
  });
  const slider = document.getElementById("speedSlider");
  slider.addEventListener("input", async () => {
    const hz = speedFromSlider(slider.value);
    document.getElementById("speedLabel").textContent = hz === 0 ? "paused" : hz + "×";
    await API.speed(hz);
    if (hz === 0) { await API.pause(); } else if (!STATE.playing) { await API.play(); }
  });

  await refresh();
  startPolling();
}

const STATE = window.STATE;

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 1000);
}

async function refresh() {
  try {
    SNAP = await API.snapshot(60);
    STATE.snapshot = SNAP;
    STATE.playing = SNAP.playback.playing;
    render(SNAP);
  } catch (e) {
    console.error(e);
    const dot = document.getElementById("statusDot");
    dot.className = "brand-mark bad";
  }
}

boot();

// ------------------------------------------------------------------ render
function render(snap) {
  renderHeader(snap);
  renderLeftRail(snap);
  renderRightRail(snap);
  renderCenter(snap);
}

function renderHeader(snap) {
  document.getElementById("siteName").textContent = snap.site.name;
  document.getElementById("clock").innerHTML = `<b>${fmt.time(snap.sim.now)}</b> &nbsp;·&nbsp; step ${snap.sim.step}/${snap.sim.total}`;
  const sun = snap.sun;
  const badge = document.getElementById("sunBadge");
  badge.textContent = sun.state === "midnight sun" ? "☀ midnight sun" : sun.state === "polar night" ? "● polar night" : "◐ day/night cycle";

  const dot = document.getElementById("statusDot");
  const hasCritical = snap.alerts.active.some(a => a.severity === "critical");
  const hasWarning = snap.alerts.active.some(a => a.severity === "warning");
  dot.className = "brand-mark" + (hasCritical ? " bad" : hasWarning ? " warn" : "");

  const sel = document.getElementById("scenarioSelect");
  if (sel.value !== snap.scenario) sel.value = snap.scenario;

  const playBtn = document.getElementById("btnPlay");
  playBtn.textContent = STATE.playing ? "❚❚" : "▶";
  playBtn.className = STATE.playing ? "mono primary" : "mono";

  document.getElementById("scenarioBanner").innerHTML =
    `<b>${snap.scenario}</b> — ${snap.description}` +
    (snap.sim.done ? ` <span class="dim2">· scenario complete</span>` : "");
}

// ============================================================= LEFT RAIL
function renderLeftRail(snap) {
  const root = document.getElementById("railLeft");
  root.innerHTML = "";
  const now = snap.now;

  // --- vitals panel ---
  const p1 = fmt.el("div", "panel");
  p1.appendChild(fmt.el("h2", "", "Station vitals"));
  const grid = fmt.el("div", "vitals-grid");
  const renewPct = snap.kpis.ems.renewable_fraction;
  grid.appendChild(vitalCard("Load", now ? now.load.toFixed(0) : "—", "kW"));
  grid.appendChild(vitalCard("Renewable frac.", fmt.pct(renewPct, 0), "%"));
  grid.appendChild(vitalCard("Outside temp", now ? now.temp.toFixed(1) : "—", "°C"));
  grid.appendChild(vitalCard("Wind speed", now ? now.wind_speed.toFixed(1) : "—", "m/s"));
  p1.appendChild(grid);

  const socCard = fmt.el("div", "vital full");
  const socPct = now ? now.soc * 100 : 0;
  socCard.innerHTML = `<div class="lbl">Battery state of charge</div>
    <div class="soc-shell">
      <div class="soc-fill" style="width:${socPct}%"></div>
      <div class="soc-band" style="left:${snap.assets.soc_min * 100}%"></div>
      <div class="soc-band" style="left:${snap.assets.soc_max * 100}%"></div>
      <div class="soc-label">${socPct.toFixed(0)}% &nbsp;·&nbsp; ${(snap.assets.battery_kwh * socPct / 100).toFixed(0)} / ${snap.assets.battery_kwh.toFixed(0)} kWh</div>
    </div>`;
  p1.appendChild(socCard);
  root.appendChild(p1);

  // --- power flow panel ---
  const p2 = fmt.el("div", "panel");
  p2.appendChild(fmt.el("h2", "", "Power flow <span class='h2-right'>this hour</span>"));
  const flow = fmt.el("div", "flow");
  if (now) {
    const maxScale = Math.max(snap.assets.pv_kwp, snap.assets.wind_kw, ...snap.assets.gens.map(g => g.rated_kw), now.load, 40);
    flow.appendChild(flowRow("Solar PV", now.pv, snap.assets.pv_kwp, COLORS.pv));
    flow.appendChild(flowRow("Wind", now.wind, snap.assets.wind_kw, COLORS.wind));
    snap.assets.gens.forEach((g, i) => {
      flow.appendChild(flowRow(g.name, now.gen_kw[i], g.rated_kw, COLORS.gen[i % COLORS.gen.length], !now.gen_on[i]));
    });
    flow.appendChild(flowRow("Battery " + (now.batt_kw >= 0 ? "(discharge)" : "(charge)"), Math.abs(now.batt_kw), snap.assets.battery_kw, COLORS.batt));
    flow.appendChild(flowRow("Load (demand)", now.load, maxScale, COLORS.load, false, true));
    if (now.curtailed > 0.5) flow.appendChild(flowRow("Curtailed", now.curtailed, maxScale, COLORS.curtail));
    if (now.shed > 0.5) flow.appendChild(flowRow("Shed (non-critical)", now.shed, maxScale, COLORS.shed));
  }
  p2.appendChild(flow);
  root.appendChild(p2);

  // --- KPI comparison ---
  const p3 = fmt.el("div", "panel");
  p3.appendChild(fmt.el("h2", "", "Fuel &amp; performance"));
  p3.appendChild(kpiTable(snap.kpis));
  root.appendChild(p3);
}

function vitalCard(label, val, unit) {
  const d = fmt.el("div", "vital");
  d.innerHTML = `<div class="lbl">${label}</div><div class="val num">${val}<small> ${unit}</small></div>`;
  return d;
}

function flowRow(name, kw, cap, color, off, isLoad) {
  const row = fmt.el("div", "flow-row");
  const pct = cap > 0 ? Math.min(100, 100 * Math.abs(kw) / cap) : 0;
  row.innerHTML = `
    <span class="dot" style="background:${off ? 'var(--line2)' : color}"></span>
    <span class="name">${name}${off ? ' <span class="dim2">(off)</span>' : ''}</span>
    <span class="kw num" style="color:${off ? 'var(--text3)' : 'var(--text)'}">${fmt.kw(kw)} kW</span>
    <div class="bar"><i style="width:${pct}%;background:${off ? 'var(--line2)' : color}"></i></div>`;
  return row;
}

function kpiTable(kpis) {
  const wrap = fmt.el("div", "");
  const names = { ems: "EMS (this run)", baseline_soc: "Baseline: SOC-cycle", baseline_diesel: "Baseline: diesel-only" };
  let rows = "";
  for (const key of ["ems", "baseline_soc", "baseline_diesel"]) {
    const v = kpis[key]; if (!v) continue;
    const save = v.ems_fuel_saving_pct; // positive = EMS uses less fuel than this baseline
    const saveCell = save === undefined ? "—" : `<span class="${save >= 0 ? 'save-pos' : 'save-neg'}" title="EMS fuel use vs. this controller (negative = EMS uses more)">${save >= 0 ? '−' : '+'}${Math.abs(save).toFixed(1)}%</span>`;
    rows += `<tr class="${key === 'ems' ? 'hero' : ''}">
      <td>${names[key]}</td>
      <td>${v.fuel_l.toFixed(0)} L</td>
      <td>${v.starts}</td>
      <td>${v.unserved_kwh > 0.05 ? v.unserved_kwh.toFixed(1) : "0"}</td>
      <td>${saveCell}</td>
    </tr>`;
  }
  wrap.innerHTML = `<table class="kpi-table">
    <thead><tr><th>Controller</th><th>Fuel</th><th>Starts</th><th>Uns.</th><th>Δ fuel</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  return wrap;
}

// ============================================================ RIGHT RAIL
function renderRightRail(snap) {
  const root = document.getElementById("railRight");
  // preserve scroll position across re-renders
  const scrollTop = root.scrollTop;
  root.innerHTML = "";

  // --- decision / mode panel ---
  const p0 = fmt.el("div", "panel");
  p0.appendChild(fmt.el("h2", "", "EMS decision"));
  const dec = snap.decision || {};
  const strip = fmt.el("div", "mode-strip");
  strip.appendChild(pill(dec.mode === "online" ? "forecast: online" : "forecast: offline", dec.mode === "online" ? "on" : "warn"));
  strip.appendChild(pill(dec.safe ? "SAFE MODE" : (dec.status || "—"), dec.safe ? "bad" : "good"));
  strip.appendChild(pill(snap.link.up ? "link up" : "link down", snap.link.up ? "good" : "bad"));
  if (dec.solve_s !== null && dec.solve_s !== undefined) strip.appendChild(pill(`solve ${dec.solve_s.toFixed(2)}s`, ""));
  p0.appendChild(strip);
  if (dec.notes && dec.notes.length) {
    const notes = fmt.el("div", "");
    notes.style.marginTop = "8px";
    dec.notes.forEach(n => notes.appendChild(fmt.el("div", "note-line", n)));
    p0.appendChild(notes);
  }
  root.appendChild(p0);

  // --- alerts panel ---
  const p1 = fmt.el("div", "panel");
  p1.appendChild(fmt.el("h2", "", `Active alerts <span class="h2-right">${snap.alerts.active.length}</span>`));
  if (snap.alerts.active.length === 0) {
    p1.appendChild(fmt.el("div", "empty-state", "No active alerts"));
  } else {
    for (const a of snap.alerts.active) {
      const el = fmt.el("div", "alert " + a.severity);
      el.innerHTML = `<div class="head"><span class="chan">${a.channel}</span><span class="age">${fmt.relHours(snap.sim.now, a.first_seen)}</span></div>
        <div class="msg">${a.message}</div>`;
      p1.appendChild(el);
    }
  }
  root.appendChild(p1);

  // --- generator overrides ---
  const p2 = fmt.el("div", "panel");
  p2.appendChild(fmt.el("h2", "", "Generator overrides"));
  const overrides = dec.overrides || {};
  snap.assets.gens.forEach((g, i) => {
    const row = fmt.el("div", "ctl-row");
    const mode = overrides[g.name]; // "on" | "off" | undefined
    row.innerHTML = `<span class="name">${g.name} <span class="dim2">${g.rated_kw.toFixed(0)}kW</span></span>`;
    const seg = fmt.el("div", "seg");
    const bAuto = fmt.el("button", mode ? "" : "on", "Auto");
    const bOn = fmt.el("button", mode === "on" ? "on" : "", "On");
    const bOff = fmt.el("button", mode === "off" ? "on" : "", "Off");
    bAuto.onclick = () => API.override(i, null).then(refresh);
    bOn.onclick = () => API.override(i, "on").then(refresh);
    bOff.onclick = () => API.override(i, "off").then(refresh);
    seg.append(bAuto, bOn, bOff);
    row.appendChild(seg);
    p2.appendChild(row);
  });
  root.appendChild(p2);

  // --- satellite link ---
  const p3 = fmt.el("div", "panel");
  p3.appendChild(fmt.el("h2", "", "Satellite link"));
  const linkRow = fmt.el("div", "ctl-row");
  const sw = fmt.el("div", "switch" + (snap.link.up ? " on" : ""));
  sw.appendChild(fmt.el("i"));
  sw.onclick = () => API.link(!snap.link.up).then(refresh);
  linkRow.innerHTML = `<span class="name">Link ${snap.link.up ? "up" : "down"} <span class="dim2">· NWP age ${snap.link.nwp_age_h ?? "—"}h</span></span>`;
  linkRow.appendChild(sw);
  p3.appendChild(linkRow);
  const outboxRow = fmt.el("div", "note-line", `Outbox: ${snap.link.outbox} queued, ${snap.link.synced} synced`);
  p3.appendChild(outboxRow);
  root.appendChild(p3);

  // --- fault injection ---
  const p4 = fmt.el("div", "panel");
  p4.appendChild(fmt.el("h2", "", "Inject a fault"));
  const fgrid = fmt.el("div", "fault-grid");
  const faultDefs = [
    ["pv_fault", "PV string fault", { hours: 18, magnitude: 0.35 }],
    ["ghi_spike", "Irradiance sensor spike", { hours: 3, magnitude: 3.0 }],
    ["wind_flatline", "Anemometer freeze", { hours: 10, magnitude: 1.0 }],
    ["gen_fuel_leak", "DG1 fuel leak", { hours: 14, magnitude: 1.5, target: 0 }],
  ];
  for (const [kind, label, params] of faultDefs) {
    const b = fmt.el("button", "", label);
    b.onclick = () => API.fault(kind, params.hours, params.magnitude, params.target || 0).then(refresh);
    fgrid.appendChild(b);
  }
  p4.appendChild(fgrid);
  const coldBtn = fmt.el("button", "", "Trigger cold snap (−12°C, 48h)");
  coldBtn.style.marginTop = "8px"; coldBtn.style.width = "100%";
  coldBtn.onclick = () => API.coldSnap(48, -12).then(refresh);
  p4.appendChild(coldBtn);
  root.appendChild(p4);

  root.scrollTop = scrollTop;
}

function pill(text, cls) {
  return fmt.el("span", "pill" + (cls ? " " + cls : ""), text);
}

// =============================================================== CENTER
function renderCenter(snap) {
  const root = document.getElementById("centerCol");
  const scrollTop = root.scrollTop;
  root.innerHTML = "";

  root.appendChild(historyChartPanel(snap));
  root.appendChild(planChartPanel(snap));
  root.appendChild(fuelCompareChartPanel(snap));
  root.appendChild(forecastAccuracyNote(snap));

  root.scrollTop = scrollTop;
}

// ---- generic SVG line/area chart -----------------------------------------
function svgChart({ width = 760, height = 180, series, xLabels, yLabel, bands, stacked }) {
  if (!xLabels || xLabels.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}"></svg>`;
  }
  const padL = 42, padR = 12, padT = 10, padB = 20;
  const w = width - padL - padR, h = height - padT - padB;
  const allVals = [];
  for (const s of series) for (const v of s.values) if (v !== null && !isNaN(v)) allVals.push(v);
  if (bands) for (const b of bands) for (const v of [...b.lo, ...b.hi]) if (v !== null && !isNaN(v)) allVals.push(v);
  let yMax = Math.max(1, ...allVals), yMin = Math.min(0, ...allVals);
  yMax *= 1.12;
  const n = xLabels.length;
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v) => padT + h - ((v - yMin) / (yMax - yMin || 1)) * h;

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none">`;
  // gridlines
  const nGrid = 4;
  for (let g = 0; g <= nGrid; g++) {
    const v = yMin + (g / nGrid) * (yMax - yMin);
    const yy = y(v);
    svg += `<line class="gridline" x1="${padL}" x2="${width - padR}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text x="${padL - 6}" y="${yy + 3}" font-size="9" text-anchor="end">${v.toFixed(0)}</text>`;
  }
  // x labels: sparse
  const step = Math.max(1, Math.round(n / 6));
  for (let i = 0; i < n; i += step) {
    svg += `<text x="${x(i)}" y="${height - 4}" font-size="9" text-anchor="middle">${xLabels[i]}</text>`;
  }
  svg += `<line class="axisline" x1="${padL}" x2="${width - padR}" y1="${padT + h}" y2="${padT + h}"/>`;

  // uncertainty bands (p10-p90)
  if (bands) {
    for (const b of bands) {
      let d = `M ${x(0)} ${y(b.hi[0])}`;
      for (let i = 1; i < n; i++) d += ` L ${x(i)} ${y(b.hi[i])}`;
      for (let i = n - 1; i >= 0; i--) d += ` L ${x(i)} ${y(b.lo[i])}`;
      d += " Z";
      svg += `<path d="${d}" fill="${b.color}" stroke="none"/>`;
    }
  }

  // "now" divider (for plan chart: history vs forecast)
  if (typeof series.nowIndex === "number") {
    const nx = x(series.nowIndex);
    svg += `<line x1="${nx}" x2="${nx}" y1="${padT}" y2="${padT + h}" stroke="var(--line2)" stroke-dasharray="3,3"/>`;
  }

  // stacked area (for generation mix)
  if (stacked) {
    let cum = new Array(n).fill(0);
    for (const s of series) {
      const top = s.values.map((v, i) => cum[i] + (v || 0));
      let d = `M ${x(0)} ${y(cum[0])}`;
      for (let i = 1; i < n; i++) d += ` L ${x(i)} ${y(cum[i])}`;
      for (let i = n - 1; i >= 0; i--) d += ` L ${x(i)} ${y(top[i])}`;
      d += " Z";
      svg += `<path d="${d}" fill="${s.color}" opacity="0.85" stroke="none"/>`;
      cum = top;
    }
  } else {
    for (const s of series) {
      let d = "";
      s.values.forEach((v, i) => { if (v === null || isNaN(v)) return; d += (d ? " L " : "M ") + x(i) + " " + y(v); });
      const dash = s.dashed ? ' stroke-dasharray="4,3"' : "";
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.6}"${dash}/>`;
      if (s.fillBelow) {
        let area = `M ${x(0)} ${y(0)}`;
        s.values.forEach((v, i) => { area += ` L ${x(i)} ${y(v || 0)}`; });
        area += ` L ${x(n - 1)} ${y(0)} Z`;
        svg += `<path d="${area}" fill="${s.color}" opacity="0.12" stroke="none"/>`;
      }
    }
  }
  svg += `</svg>`;
  return svg;
}

function historyChartPanel(snap) {
  const p = fmt.el("div", "chart-panel");
  p.appendChild(fmt.el("h2", "", `Recent history <span class="h2-right">last ${snap.history.ts.length}h</span>`));
  if (snap.history.ts.length === 0) {
    p.appendChild(fmt.el("div", "empty-state", "Scenario just started — advance the clock to see history"));
    return p;
  }
  const leg = fmt.el("div", "chart-legend");
  [["Load", COLORS.load], ["PV", COLORS.pv], ["Wind", COLORS.wind], ["Battery", COLORS.batt]].forEach(([n, c]) => {
    leg.appendChild(legendItem(n, c));
  });
  p.appendChild(leg);
  const h = snap.history;
  const labels = h.ts.map(t => fmt.hm(t));
  const chart = svgChart({
    series: [
      { values: h.load, color: COLORS.load, width: 2 },
      { values: h.pv, color: COLORS.pv },
      { values: h.wind, color: COLORS.wind },
      { values: h.batt_kw, color: COLORS.batt, dashed: true },
    ],
    xLabels: labels,
  });
  const div = fmt.el("div", "", chart);
  p.appendChild(div);

  // generation mix (stacked) below
  const leg2 = fmt.el("div", "chart-legend");
  leg2.style.marginTop = "10px";
  snap.assets.gens.forEach((g, i) => leg2.appendChild(legendItem(g.name, COLORS.gen[i % COLORS.gen.length])));
  leg2.appendChild(legendItem("Curtailed", COLORS.curtail));
  p.appendChild(leg2);
  const genSeries = snap.assets.gens.map((g, i) => ({ values: h.gen_kw[i], color: COLORS.gen[i % COLORS.gen.length] }));
  genSeries.push({ values: h.curtailed, color: COLORS.curtail });
  const chart2 = svgChart({ series: genSeries, xLabels: labels, stacked: true, height: 120 });
  p.appendChild(fmt.el("div", "", chart2));
  return p;
}

function planChartPanel(snap) {
  const p = fmt.el("div", "chart-panel");
  p.appendChild(fmt.el("h2", "", "24-hour dispatch plan <span class=\"h2-right\">forecast + optimizer</span>"));
  if (!snap.plan || !snap.forecast) {
    p.appendChild(fmt.el("div", "empty-state", "No plan available (safe mode or solver error)"));
    return p;
  }
  const fc = snap.forecast, plan = snap.plan;
  const labels = fc.ts.map(t => fmt.hm(t));
  const leg = fmt.el("div", "chart-legend");
  [["Load (forecast)", COLORS.load], ["PV (p10-p90)", COLORS.pv], ["Wind (p10-p90)", COLORS.wind]].forEach(([n, c]) => leg.appendChild(legendItem(n, c)));
  p.appendChild(leg);
  const chart = svgChart({
    series: [
      { values: fc.load_kw, color: COLORS.load, width: 2 },
      { values: fc.pv_kw, color: COLORS.pv },
      { values: fc.wind_kw, color: COLORS.wind },
    ],
    xLabels: labels,
    bands: [
      { lo: fc.pv_kw_lo, hi: fc.pv_kw_hi, color: "rgba(232,163,61,0.15)" },
      { lo: fc.wind_kw_lo, hi: fc.wind_kw_hi, color: "rgba(127,184,217,0.15)" },
    ],
  });
  p.appendChild(fmt.el("div", "", chart));

  const leg2 = fmt.el("div", "chart-legend");
  leg2.style.marginTop = "10px";
  snap.assets.gens.forEach((g, i) => leg2.appendChild(legendItem(g.name + " (planned)", COLORS.gen[i % COLORS.gen.length])));
  leg2.appendChild(legendItem("Battery SOC (right axis, ×1kWh/6)", COLORS.batt));
  p.appendChild(leg2);
  const genSeries = plan.gen_kw.map((row, i) => ({ values: row, color: COLORS.gen[i % COLORS.gen.length] }));
  const socScaled = plan.soc_kwh.slice(0, labels.length).map(v => v / 6); // display SOC on a 0-100-ish scale alongside kW
  genSeries.push({ values: socScaled, color: COLORS.batt, dashed: true, width: 1.4 });
  const chart2 = svgChart({ series: genSeries, xLabels: labels, height: 130 });
  p.appendChild(fmt.el("div", "", chart2));
  return p;
}

function fuelCompareChartPanel(snap) {
  const p = fmt.el("div", "chart-panel");
  p.appendChild(fmt.el("h2", "", "Cumulative fuel burn <span class=\"h2-right\">EMS vs baselines</span>"));
  const h = snap.history;
  if (h.ts.length === 0) {
    p.appendChild(fmt.el("div", "empty-state", "Scenario just started — advance the clock to compare fuel use"));
    return p;
  }
  const labels = h.ts.map(t => fmt.hm(t));
  const leg = fmt.el("div", "chart-legend");
  [["EMS", COLORS.ems], ["Baseline: SOC-cycle", COLORS.baseline_soc], ["Baseline: diesel-only", COLORS.baseline_diesel]].forEach(([n, c]) => leg.appendChild(legendItem(n, c)));
  p.appendChild(leg);
  const series = [
    { values: h.ems_fuel, color: COLORS.ems, width: 2 },
    { values: h.baseline_soc_fuel, color: COLORS.baseline_soc },
    { values: h.baseline_diesel_fuel, color: COLORS.baseline_diesel },
  ];
  const chart = svgChart({ series, xLabels: labels, height: 150 });
  p.appendChild(fmt.el("div", "", chart));
  return p;
}

function forecastAccuracyNote(snap) {
  const p = fmt.el("div", "chart-panel");
  p.style.borderBottom = "none";
  const derate = snap.derate || {};
  const notes = [];
  if (derate.pv < 0.999) notes.push(`PV forecast derated to ${(derate.pv * 100).toFixed(0)}% — equipment fault active`);
  if (derate.wind < 0.999) notes.push(`Wind forecast derated to ${(derate.wind * 100).toFixed(0)}% — equipment fault active`);
  p.appendChild(fmt.el("h2", "", "Notes"));
  if (notes.length === 0 && (!snap.decision || !snap.decision.notes || !snap.decision.notes.length)) {
    p.appendChild(fmt.el("div", "empty-state", "Nominal operation — no derates or fallbacks active"));
  } else {
    notes.forEach(n => p.appendChild(fmt.el("div", "note-line", n)));
  }
  return p;
}

function legendItem(name, color) {
  const el = fmt.el("span", "leg");
  el.innerHTML = `<i style="background:${color}"></i>${name}`;
  return el;
}
