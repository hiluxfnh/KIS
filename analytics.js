// Dashboard analytics for KIS/UTA — real-time, with improved charts and UX

const firebaseConfig = {
  apiKey: "AIzaSyCxxnPeqbmzRy0Ku9gDMzSjSKmjpCRz8gE",
  authDomain: "kis-transport-tracking.firebaseapp.com",
  projectId: "kis-transport-tracking",
  storageBucket: "kis-transport-tracking.firebasestorage.app",
  messagingSenderId: "1061513677800",
  appId: "1:1061513677800:web:0ac8dfa1bf37c3d676b25d",
};

try {
  if (!firebase.apps?.length) firebase.initializeApp(firebaseConfig);
} catch {}
const db = firebase.firestore();
try { db.enablePersistence().catch(() => {}); } catch {}

// --- DOM refs ---
const el = (id) => document.getElementById(id);
const dashSearch  = el("dashSearch");
const dashTime    = el("dashTime");
const dashCompany = el("dashCompany");
const dashStatus  = el("dashStatus");
const kpiTotal    = el("kpiTotal");
const kpiDist     = el("kpiDist");
const kpiAvgEff   = el("kpiAvgEff");
const kpiL100     = el("kpiL100");
const kpiInc      = el("kpiInc");
const kpiHours    = el("kpiHours");
const incidentsList = el("incidentsList");

// --- State ---
let allVoyages = [];
let filteredVoyages = [];
const charts = {};

// --- Utils ---
function asDate(val) {
  if (!val) return null;
  try { return val.toDate ? val.toDate() : new Date(val); } catch { return null; }
}
function fmtNumber(n, digits = 0) {
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(num);
  } catch { return digits ? num.toFixed(digits) : String(Math.round(num)); }
}
function durationHours(from, to) {
  const a = asDate(from), b = asDate(to);
  if (!(a && b)) return 0;
  const h = (b - a) / (1000 * 60 * 60);
  return h > 0 && h < 720 ? h : 0; // cap at 30 days to exclude bad data
}
function efficiencyOf(v) {
  const fuel = Number(v.carburantDepart ?? 0);
  const dist = Number(v.distance ?? 0);
  return (fuel > 0 && dist > 0) ? dist / fuel : null;
}
function toTitleCase(s) {
  return (s || "").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

const STATUS_LABELS = {
  complet: "Complet", "en-cours": "En cours", retard: "Retard", annule: "Annulé",
};
const STATUS_COLORS = {
  complet: "#28a745", "en-cours": "#ffc107", retard: "#dc3545", annule: "#6c757d",
};

// Persist/restore filters
function persistFilters() {
  try {
    localStorage.setItem("kis:dash", JSON.stringify({
      search: dashSearch?.value || "",
      time: dashTime?.value || "all",
      company: dashCompany?.value || "all",
      status: dashStatus?.value || "all",
    }));
  } catch {}
}
function restoreFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem("kis:dash") || "{}");
    if (saved.search != null && dashSearch) dashSearch.value = saved.search;
    if (saved.time && dashTime) dashTime.value = saved.time;
    if (saved.company && dashCompany) dashCompany.value = saved.company;
    if (saved.status && dashStatus) dashStatus.value = saved.status;
  } catch {}
}

function getTimeStart(kind) {
  const now = new Date();
  if (kind === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (kind === "week") {
    const d = new Date(now); const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1)); d.setHours(0,0,0,0); return d;
  }
  if (kind === "month")    return new Date(now.getFullYear(), now.getMonth(), 1);
  if (kind === "quarter")  return new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
  if (kind === "year")     return new Date(now.getFullYear(), 0, 1);
  return null;
}

function applyFilters() {
  const term   = (dashSearch?.value || "").toLowerCase();
  const tStart = getTimeStart(dashTime?.value);
  filteredVoyages = allVoyages.filter((v) => {
    const matchSearch =
      !term ||
      (v.chauffeur || "").toLowerCase().includes(term) ||
      (v.camion || "").toLowerCase().includes(term) ||
      (v.destination || "").toLowerCase().includes(term) ||
      (v.destinationDetail || "").toLowerCase().includes(term) ||
      (v.client || "").toLowerCase().includes(term) ||
      (v.documentation || "").toLowerCase().includes(term) ||
      (v.containerPositioningLocation || "").toLowerCase().includes(term) ||
      (v.natureMarchandise || "").toLowerCase().includes(term) ||
      (v.societe || "").toLowerCase().includes(term);
    const compOk   = (dashCompany?.value || "all") === "all" || (v.societe || "KIS") === dashCompany.value;
    const statusOk = (dashStatus?.value || "all") === "all" || v.statut === dashStatus.value;
    const d = asDate(v.dateDepart);
    const timeOk = !tStart || (d ? d >= tStart : false);
    return matchSearch && compOk && statusOk && timeOk;
  });

  updateKPIs();
  updateCharts();
  updateIncidentsList();
}

function updateKPIs() {
  const trips     = filteredVoyages.length;
  const totalDist = filteredVoyages.reduce((a, v) => a + (Number(v.distance) || 0), 0);
  const totalFuel = filteredVoyages.reduce((a, v) => a + (Number(v.carburantDepart) || 0), 0);
  const avgEff    = totalFuel > 0 ? totalDist / totalFuel : 0;
  const avgL100   = totalDist > 0 ? (totalFuel / totalDist) * 100 : 0;
  const inc       = filteredVoyages.filter(v => (v.incidents || "").trim()).length;
  const hours     = filteredVoyages.reduce((a, v) => a + durationHours(v.dateDepart, v.kribiArrivalDate), 0);

  if (kpiTotal)  kpiTotal.textContent  = fmtNumber(trips);
  if (kpiDist)   kpiDist.textContent   = `${fmtNumber(totalDist)} km`;
  if (kpiAvgEff) kpiAvgEff.textContent = avgEff  ? `${fmtNumber(avgEff, 2)} km/L` : "N/A";
  if (kpiL100)   kpiL100.textContent   = avgL100  ? `${fmtNumber(avgL100, 2)} L/100 km` : "N/A";
  if (kpiInc)    kpiInc.textContent    = fmtNumber(inc);
  if (kpiHours)  kpiHours.textContent  = `${fmtNumber(hours, 1)} h`;
}

// Destroy and recreate a chart (simplest way to avoid data/options merge issues)
function makeChart(key, ctx, config) {
  if (!ctx) return null;
  if (charts[key]) { try { charts[key].destroy(); } catch {} }
  charts[key] = new Chart(ctx, config);
  return charts[key];
}

function commonOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend: { display: false }, ...extra.plugins },
    ...extra,
  };
}

function updateCharts() {
  const now = new Date();

  // 1. Monthly trips — last 12 months
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: d.toLocaleDateString("fr-FR", { month: "short" }) + " " + String(d.getFullYear()).slice(-2),
    });
  }
  const monthKIS = new Array(12).fill(0);
  const monthUTA = new Array(12).fill(0);
  filteredVoyages.forEach((v) => {
    const d = asDate(v.dateDepart);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const idx = months.findIndex((m) => m.key === key);
    if (idx < 0) return;
    if ((v.societe || "KIS") === "UTA") monthUTA[idx]++;
    else monthKIS[idx]++;
  });
  makeChart("monthly", el("monthlyTripsChart"), {
    type: "bar",
    data: {
      labels: months.map((m) => m.label),
      datasets: [
        { label: "KIS", data: monthKIS, backgroundColor: "#1a3a6c", stack: "s" },
        { label: "UTA", data: monthUTA, backgroundColor: "#ff6b00", stack: "s" },
      ],
    },
    options: commonOptions({
      plugins: { legend: { display: true, position: "top" } },
      scales: { x: { stacked: true }, y: { beginAtZero: true, stacked: true } },
    }),
  });

  // 2. Top 5 drivers by efficiency
  const driverAgg = {};
  filteredVoyages.forEach((v) => {
    const d = (v.chauffeur || "Inconnu").trim();
    if (!driverAgg[d]) driverAgg[d] = { dist: 0, fuel: 0, trips: 0 };
    driverAgg[d].dist  += Number(v.distance || 0);
    driverAgg[d].fuel  += Number(v.carburantDepart || 0);
    driverAgg[d].trips += 1;
  });
  const driverEff = Object.entries(driverAgg)
    .map(([name, a]) => ({ name, eff: a.fuel > 0 ? a.dist / a.fuel : 0 }))
    .sort((a, b) => b.eff - a.eff).slice(0, 5);
  makeChart("efficiency", el("efficiencyChart"), {
    type: "bar",
    data: {
      labels: driverEff.map((x) => x.name),
      datasets: [{ label: "km/L", data: driverEff.map((x) => +x.eff.toFixed(2)), backgroundColor: "#1a3a6c" }],
    },
    options: commonOptions({ indexAxis: "y", scales: { x: { beginAtZero: true } } }),
  });

  // 3. Status doughnut (with French labels)
  const statusMap = filteredVoyages.reduce((m, v) => {
    const s = v.statut || "complet";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const statusKeys = Object.keys(statusMap);
  makeChart("status", el("statusPie"), {
    type: "doughnut",
    data: {
      labels: statusKeys.map((k) => STATUS_LABELS[k] || k),
      datasets: [{ data: statusKeys.map((k) => statusMap[k]), backgroundColor: statusKeys.map((k) => STATUS_COLORS[k] || "#aaa") }],
    },
    options: { ...commonOptions(), plugins: { legend: { display: true, position: "bottom" } } },
  });

  // 4. Top destinations
  const destAgg = {};
  filteredVoyages.forEach((v) => {
    const raw = (v.destination || "").trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!destAgg[key]) destAgg[key] = { n: 0, label: toTitleCase(raw) };
    destAgg[key].n++;
  });
  const destArr = Object.values(destAgg).sort((a, b) => b.n - a.n).slice(0, 7);
  makeChart("topDest", el("topDestinations"), {
    type: "bar",
    data: {
      labels: destArr.map((x) => x.label),
      datasets: [{ label: "Voyages", data: destArr.map((x) => x.n), backgroundColor: "#2c5aa0" }],
    },
    options: commonOptions({ indexAxis: "y", scales: { x: { beginAtZero: true } } }),
  });

  // 5. Distance by company
  const byComp = { KIS: 0, UTA: 0 };
  filteredVoyages.forEach((v) => { byComp[v.societe || "KIS"] = (byComp[v.societe || "KIS"] || 0) + (Number(v.distance) || 0); });
  makeChart("distCompany", el("distanceByCompany"), {
    type: "bar",
    data: {
      labels: ["KIS", "UTA"],
      datasets: [{ label: "km", data: [byComp.KIS, byComp.UTA], backgroundColor: ["#1a3a6c", "#ff6b00"] }],
    },
    options: commonOptions({ scales: { y: { beginAtZero: true } } }),
  });

  // 6. Weekday usage (Mon–Sun order)
  const weekdayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const wdCounts = new Array(7).fill(0);
  filteredVoyages.forEach((v) => {
    const d = asDate(v.dateDepart);
    if (!d) return;
    const jsDay = d.getDay(); // 0=Sun
    const idx = jsDay === 0 ? 6 : jsDay - 1; // remap to Mon=0
    wdCounts[idx]++;
  });
  makeChart("weekday", el("weekdayUsage"), {
    type: "bar",
    data: {
      labels: weekdayNames,
      datasets: [{ label: "Voyages", data: wdCounts, backgroundColor: wdCounts.map((_, i) => (i < 5 ? "#2c5aa0" : "#ff6b00")) }],
    },
    options: commonOptions({ scales: { y: { beginAtZero: true } } }),
  });

  // 7. Fuel vs Distance scatter
  const points = filteredVoyages
    .filter((v) => (v.distance || 0) > 0 && (v.carburantDepart || 0) > 0)
    .map((v) => ({
      x: Number(v.distance),
      y: Number(v.carburantDepart),
      label: v.chauffeur || "",
    }));
  makeChart("fuel", el("fuelScatter"), {
    type: "scatter",
    data: {
      datasets: [{
        label: "Voyages",
        data: points,
        backgroundColor: "rgba(26,58,108,.55)",
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: commonOptions({
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: (ctx) => `${ctx.raw.label || ""}: ${ctx.raw.x} km / ${ctx.raw.y} L` }
      } },
      scales: {
        x: { title: { display: true, text: "Distance (km)" }, beginAtZero: true },
        y: { title: { display: true, text: "Carburant départ (L)" }, beginAtZero: true },
      },
    }),
  });

  // 8. Top clients by trip count — update incidents list area with a table
  const clientAgg = {};
  filteredVoyages.forEach((v) => {
    const c = (v.client || "").trim() || "—";
    clientAgg[c] = (clientAgg[c] || 0) + 1;
  });
  const topClients = Object.entries(clientAgg).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Render as a nice list replacing the "top clients" section
  const clientsListEl = el("clientsList");
  if (clientsListEl) {
    clientsListEl.innerHTML = topClients.map(([name, n]) =>
      `<li><span title="${name}">${name.length > 22 ? name.slice(0, 20) + "…" : name}</span><strong>${n}</strong></li>`
    ).join("") || "<li><span style='color:#aaa'>Aucun données</span><strong>—</strong></li>";
  }
}

function updateIncidentsList() {
  if (!incidentsList) return;
  const byDriver = {};
  filteredVoyages.forEach((v) => {
    if ((v.incidents || "").trim()) {
      const d = (v.chauffeur || "Inconnu").trim();
      byDriver[d] = (byDriver[d] || 0) + 1;
    }
  });
  const arr = Object.entries(byDriver).map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n).slice(0, 10);
  if (!arr.length) {
    incidentsList.innerHTML = "<li><span style='color:#28a745'>Aucun incident</span><strong>0</strong></li>";
    return;
  }
  incidentsList.innerHTML = arr.map((x) =>
    `<li><span title="${x.name}">${x.name.length > 22 ? x.name.slice(0, 20) + "…" : x.name}</span><strong style="color:#dc3545">${x.n}</strong></li>`
  ).join("");
}

// Notifications
function notify(msg, type = "info") {
  let c = document.getElementById("notification-container");
  if (!c) {
    c = document.createElement("div");
    c.id = "notification-container";
    c.setAttribute("aria-live", "polite");
    document.body.appendChild(c);
  }
  const n = document.createElement("div");
  n.className = `notification ${type}`;
  n.textContent = msg;
  n.addEventListener("click", () => n.remove());
  c.appendChild(n);
  const dur = type === "error" ? 5000 : 4000;
  setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, dur);
}

// --- Real-time subscription ---
function subscribe() {
  try {
    db.collection("voyages")
      .orderBy("createdAt", "desc")
      .onSnapshot(
        (snap) => {
          allVoyages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          applyFilters();
        },
        (err) => {
          console.warn("onSnapshot(createdAt) failed, fallback:", err?.code);
          db.collection("voyages").onSnapshot(
            (snap) => { allVoyages = snap.docs.map((d) => ({ id: d.id, ...d.data() })); applyFilters(); },
            (e2) => { console.error("Snapshot failed:", e2); notify("Erreur de chargement des données", "error"); }
          );
        }
      );
  } catch (e) {
    console.error("subscribe() failed:", e);
    notify("Erreur de connexion Firebase", "error");
  }
}

// --- Event wiring ---
function wireEvents() {
  let t;
  if (dashSearch) dashSearch.addEventListener("input", () => {
    clearTimeout(t); t = setTimeout(() => { applyFilters(); persistFilters(); }, 200);
  });
  [dashTime, dashCompany, dashStatus].forEach((ctrl) => {
    if (!ctrl) return;
    ctrl.addEventListener("change", () => { applyFilters(); persistFilters(); });
  });
}

// --- Boot ---
window.addEventListener("DOMContentLoaded", () => {
  restoreFilters();
  wireEvents();
  subscribe();
});
