// Dashboard analytics for KIS/UTA
// Initializes Firebase, fetches voyages, applies filters, computes KPIs, and renders charts

// --- Firebase init (compat, same project as main app) ---
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
try {
  db.enablePersistence().catch(() => {});
} catch {}

// --- DOM refs ---
const el = (id) => document.getElementById(id);
const dashSearch = el("dashSearch");
const dashTime = el("dashTime");
const dashCompany = el("dashCompany");
const dashStatus = el("dashStatus");

const kpiTotal = el("kpiTotal");
const kpiDist = el("kpiDist");
const kpiAvgEff = el("kpiAvgEff");
const kpiL100 = el("kpiL100");
const kpiInc = el("kpiInc");
const kpiHours = el("kpiHours");

const incidentsList = el("incidentsList");

// Charts refs
const ctxMonthly = el("monthlyTripsChart");
const ctxEfficiency = el("efficiencyChart");
const ctxStatus = el("statusPie");
const ctxTopDest = el("topDestinations");
const ctxDistCompany = el("distanceByCompany");
const ctxWeekday = el("weekdayUsage");
const ctxFuel = el("fuelScatter");

// --- State ---
let allVoyages = [];
let filteredVoyages = [];
const charts = {
  monthly: null,
  efficiency: null,
  status: null,
  topDest: null,
  distCompany: null,
  weekday: null,
  fuel: null,
};

// --- Utils ---
function asDate(val) {
  if (!val) return null;
  try {
    return val.toDate ? val.toDate() : new Date(val);
  } catch {
    return null;
  }
}
function sum(arr, sel = (x) => x) {
  return arr.reduce((acc, x) => acc + (Number(sel(x)) || 0), 0);
}
function fmtNumber(n, digits = 0) {
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(num);
  } catch {
    return digits ? num.toFixed(digits) : String(Math.round(num));
  }
}
function durationHours(from, to) {
  const a = asDate(from);
  const b = asDate(to);
  if (!(a && b)) return 0;
  return (b - a) / (1000 * 60 * 60);
}
function efficiencyOf(v) {
  const fuel = Number(v.carburantDepart ?? 0);
  const dist = Number(v.distance ?? 0);
  if (fuel > 0 && dist > 0) return dist / fuel;
  return null;
}
function l100Of(v) {
  const fuel = Number(v.carburantDepart ?? 0);
  const dist = Number(v.distance ?? 0);
  if (fuel > 0 && dist > 0) return (fuel / dist) * 100;
  return null;
}

// Persist/restore filters
function persistFilters() {
  try {
    localStorage.setItem(
      "kis:dash",
      JSON.stringify({
        search: dashSearch?.value || "",
        time: dashTime?.value || "all",
        company: dashCompany?.value || "all",
        status: dashStatus?.value || "all",
      })
    );
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
  if (kind === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (kind === "week") {
    const d = new Date(now);
    const day = d.getDay() || 7; // Monday as 1
    d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (kind === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (kind === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1);
  }
  if (kind === "year") {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null; // all
}

function applyFilters() {
  const term = (dashSearch?.value || "").toLowerCase();
  const tStart = getTimeStart(dashTime?.value);
  filteredVoyages = allVoyages.filter((v) => {
    const matchesSearch =
      !term ||
      (v.chauffeur || "").toLowerCase().includes(term) ||
      (v.camion || "").toLowerCase().includes(term) ||
      (v.destination || "").toLowerCase().includes(term) ||
      (v.destinationDetail || "").toLowerCase().includes(term) ||
      (v.client || "").toLowerCase().includes(term) ||
      (v.documentation || "").toLowerCase().includes(term) ||
      (v.containerPositioningLocation || "").toLowerCase().includes(term) ||
      (v.societe || "").toLowerCase().includes(term);

    const companyOk =
      (dashCompany?.value || "all") === "all" ||
      (v.societe || "KIS") === dashCompany.value;
    const statusOk =
      (dashStatus?.value || "all") === "all" || v.statut === dashStatus.value;

    const d = asDate(v.dateDepart);
    const timeOk = !tStart || (d ? d >= tStart : false);

    return matchesSearch && companyOk && statusOk && timeOk;
  });

  updateKPIs();
  updateCharts();
  updateIncidentsList();
}

function updateKPIs() {
  const trips = filteredVoyages.length;
  const totalDist = sum(filteredVoyages, (v) => Number(v.distance || 0));
  const totalFuel = sum(filteredVoyages, (v) => Number(v.carburantDepart || 0));
  const avgEff = totalFuel > 0 ? totalDist / totalFuel : 0;
  const avgL100 = totalDist > 0 ? (totalFuel / totalDist) * 100 : 0;
  const inc = filteredVoyages.reduce(
    (acc, v) => acc + ((v.incidents || "").trim() ? 1 : 0),
    0
  );
  const hours = sum(filteredVoyages, (v) =>
    durationHours(v.dateDepart, v.kribiArrivalDate)
  );

  if (kpiTotal) kpiTotal.textContent = fmtNumber(trips);
  if (kpiDist) kpiDist.textContent = `${fmtNumber(totalDist)} km`;
  if (kpiAvgEff) kpiAvgEff.textContent = `${fmtNumber(avgEff, 2)} km/L`;
  if (kpiL100) kpiL100.textContent = `${fmtNumber(avgL100, 2)} L/100 km`;
  if (kpiInc) kpiInc.textContent = fmtNumber(inc);
  if (kpiHours) kpiHours.textContent = `${fmtNumber(hours, 1)} h`;
}

// Chart helpers
function ensureChart(key, ctx, type, labels, datasets, options = {}) {
  if (!ctx) return null;
  if (!charts[key]) {
    charts[key] = new Chart(ctx, {
      type,
      data: { labels, datasets },
      options,
    });
  } else {
    const c = charts[key];
    c.data.labels = labels;
    c.data.datasets = datasets;
    if (options) c.options = { ...c.options, ...options };
    c.update();
  }
  return charts[key];
}

function updateCharts() {
  // Monthly trips (last 12 months rolling)
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label:
        d.toLocaleDateString("fr-FR", { month: "short" }) +
        " " +
        String(d.getFullYear()).slice(-2),
    });
  }
  const monthCounts = months.map((m) => 0);
  filteredVoyages.forEach((v) => {
    const d = asDate(v.dateDepart);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const idx = months.findIndex((m) => m.key === key);
    if (idx >= 0) monthCounts[idx]++;
  });
  ensureChart(
    "monthly",
    ctxMonthly,
    "line",
    months.map((m) => m.label),
    [
      {
        label: "Voyages",
        data: monthCounts,
        borderColor: "#2c5aa0",
        backgroundColor: "rgba(44,90,160,.15)",
        tension: 0.3,
        fill: true,
      },
    ],
    {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    }
  );

  // Top 5 drivers by efficiency (overall distance/fuel)
  const driverAgg = {};
  filteredVoyages.forEach((v) => {
    const d = v.chauffeur || "Inconnu";
    const fuel = Number(v.carburantDepart || 0);
    const dist = Number(v.distance || 0);
    if (!driverAgg[d]) driverAgg[d] = { dist: 0, fuel: 0 };
    driverAgg[d].dist += dist;
    driverAgg[d].fuel += fuel;
  });
  const driverEff = Object.entries(driverAgg)
    .map(([name, a]) => ({ name, eff: a.fuel > 0 ? a.dist / a.fuel : 0 }))
    .sort((a, b) => b.eff - a.eff)
    .slice(0, 5);
  ensureChart(
    "efficiency",
    ctxEfficiency,
    "bar",
    driverEff.map((x) => x.name),
    [
      {
        label: "km/L",
        data: driverEff.map((x) => Number(x.eff.toFixed(2))),
        backgroundColor: "#1a3a6c",
      },
    ],
    {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    }
  );

  // Status pie
  const statusMap = filteredVoyages.reduce((m, v) => {
    const s = v.statut || "complet";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const statusLabels = Object.keys(statusMap);
  const statusVals = statusLabels.map((k) => statusMap[k]);
  ensureChart(
    "status",
    ctxStatus,
    "doughnut",
    statusLabels,
    [
      {
        data: statusVals,
        backgroundColor: ["#28a745", "#ffc107", "#dc3545", "#6c757d"],
      },
    ],
    { plugins: { legend: { position: "bottom" } } }
  );

  // Top destinations (case-insensitive grouping)
  function toTitle(s) {
    const base = (s || "").toLowerCase();
    return base.replace(/\b\w/g, (m) => m.toUpperCase());
  }
  const destAgg = {};
  filteredVoyages.forEach((v) => {
    const raw = (v.destination || "").trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!destAgg[key]) destAgg[key] = { n: 0, label: toTitle(raw) };
    destAgg[key].n += 1;
  });
  const destArr = Object.values(destAgg)
    .sort((a, b) => b.n - a.n)
    .slice(0, 7);
  ensureChart(
    "topDest",
    ctxTopDest,
    "bar",
    destArr.map((x) => x.label),
    [
      {
        label: "Voyages",
        data: destArr.map((x) => x.n),
        backgroundColor: "#2c5aa0",
      },
    ],
    {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    }
  );

  // Distance by company
  const byComp = filteredVoyages.reduce(
    (m, v) => ({
      ...m,
      [v.societe || "KIS"]:
        (m[v.societe || "KIS"] || 0) + Number(v.distance || 0),
    }),
    {}
  );
  const compLabels = Object.keys(byComp).length
    ? Object.keys(byComp)
    : ["KIS", "UTA"];
  const compVals = compLabels.map((k) => byComp[k] || 0);
  ensureChart(
    "distCompany",
    ctxDistCompany,
    "bar",
    compLabels,
    [
      {
        label: "Distance (km)",
        data: compVals,
        backgroundColor: ["#1a3a6c", "#ff6b00"],
      },
    ],
    {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    }
  );

  // Weekday usage
  const weekdayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const weekdayCounts = new Array(7).fill(0);
  filteredVoyages.forEach((v) => {
    const d = asDate(v.dateDepart);
    if (!d) return;
    weekdayCounts[d.getDay()]++;
  });
  ensureChart(
    "weekday",
    ctxWeekday,
    "bar",
    weekdayNames,
    [{ label: "Voyages", data: weekdayCounts, backgroundColor: "#2c5aa0" }],
    {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    }
  );

  // Fuel vs Distance scatter (x: distance, y: fuel)
  const points = filteredVoyages
    .map((v) => ({
      x: Number(v.distance || 0),
      y: Number(v.carburantDepart || 0),
    }))
    .filter((p) => p.x > 0 && p.y > 0);
  ensureChart(
    "fuel",
    ctxFuel,
    "scatter",
    [],
    [
      {
        label: "Points",
        data: points,
        backgroundColor: "rgba(26,58,108,.6)",
        pointRadius: 3,
      },
    ],
    {
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: "Distance (km)" } },
        y: { title: { display: true, text: "Carburant (L)" } },
      },
    }
  );
}

function updateIncidentsList() {
  if (!incidentsList) return;
  const byDriver = {};
  filteredVoyages.forEach((v) => {
    if ((v.incidents || "").trim()) {
      const d = v.chauffeur || "Inconnu";
      byDriver[d] = (byDriver[d] || 0) + 1;
    }
  });
  const arr = Object.entries(byDriver)
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  incidentsList.innerHTML = arr
    .map((x) => `<li><span>${x.name}</span><strong>${x.n}</strong></li>`)
    .join("");
}

// --- Data loading ---
async function loadVoyages() {
  const snap = await db.collection("voyages").get();
  allVoyages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// --- Event wiring ---
function wireEvents() {
  let t;
  if (dashSearch)
    dashSearch.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        applyFilters();
        persistFilters();
      }, 200);
    });
  [dashTime, dashCompany, dashStatus].forEach((ctrl) => {
    if (!ctrl) return;
    ctrl.addEventListener("change", () => {
      applyFilters();
      persistFilters();
    });
  });
}

// --- Boot ---
window.addEventListener("DOMContentLoaded", async () => {
  restoreFilters();
  try {
    await loadVoyages();
  } catch (e) {
    // Fail-soft; show a tiny inline notification if available
    try {
      const c = document.createElement("div");
      c.textContent = "Erreur de chargement des données";
      c.style.background = "#f8d7da";
      c.style.color = "#000";
      c.style.padding = "8px 12px";
      c.style.borderRadius = "6px";
      c.style.marginBottom = "10px";
      document.querySelector("main").prepend(c);
      setTimeout(() => c.remove(), 3000);
    } catch {}
  }
  wireEvents();
  applyFilters();
});
