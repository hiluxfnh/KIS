// Rapport chauffeur — real-time, status badges, notifications
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
const voyagesCol = db.collection("voyages");

// DOM refs
const driverSelect       = document.getElementById("driverSelect");
const companySelect      = document.getElementById("companySelect");
const statusSelect       = document.getElementById("statusSelect");
const startDate          = document.getElementById("startDate");
const endDate            = document.getElementById("endDate");
const applyFiltersBtn    = document.getElementById("applyFilters");
const exportExcelDriverBtn = document.getElementById("exportExcelDriver");
const exportPDFDriverBtn   = document.getElementById("exportPDFDriver");
const searchDriver       = document.getElementById("searchDriver");
const kTrips             = document.getElementById("kpiTrips");
const kDist              = document.getElementById("kpiDistance");
const kEff               = document.getElementById("kpiEff");
const kCons              = document.getElementById("kpiCons");
const kHours             = document.getElementById("kpiHours");
const kInc               = document.getElementById("kpiIncidents");
const driverTableBody    = document.getElementById("driverTableBody");

let all = [];
const charts = { timeline: null, dests: null, status: null };

const STATUS_LABELS = {
  complet: "Complet", "en-cours": "En cours", retard: "Retard", annule: "Annulé",
};
const STATUS_COLORS = {
  complet: "#28a745", "en-cours": "#ffc107", retard: "#dc3545", annule: "#6c757d",
};
const STATUS_BADGE_CLS = {
  complet: "success", "en-cours": "warning", retard: "danger", annule: "secondary",
};

// --- Utils ---
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

function asDate(val) {
  if (!val) return null;
  try { return val.toDate ? val.toDate() : new Date(val); } catch { return null; }
}

function formatDateFR(date) {
  const d = asDate(date);
  if (!d || isNaN(d)) return "—";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtNumber(n, digits = 0) {
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(num);
  } catch { return digits ? num.toFixed(digits) : String(Math.round(num)); }
}

function calcDurationHours(start, end) {
  const a = asDate(start), b = asDate(end);
  if (!(a && b)) return 0;
  const h = (b - a) / (1000 * 60 * 60);
  return h > 0 && h < 720 ? h : 0;
}

function efficiencyOf(v) {
  const dep = Number(v.carburantDepart ?? 0);
  if (dep <= 0 || !(v.distance > 0)) return null;
  return v.distance / dep;
}

function esc(s) {
  return s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusBadge(s) {
  const cls = STATUS_BADGE_CLS[s] || "secondary";
  const label = STATUS_LABELS[s] || esc(s) || "—";
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function toTitle(s) {
  return (s || "").toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}

// --- Filters ---
function applyFilters() {
  const driver = driverSelect.value || "";
  const comp   = companySelect.value || "all";
  const status = statusSelect.value || "all";
  const from   = startDate.value ? new Date(startDate.value) : null;
  const to     = endDate.value   ? new Date(endDate.value)   : null;
  const term   = (searchDriver?.value || "").toLowerCase();

  const filtered = all.filter((v) => {
    if (driver && (v.chauffeur || "").trim() !== driver) return false;
    if (comp !== "all" && (v.societe || "KIS") !== comp) return false;
    if (status !== "all" && (v.statut || "complet") !== status) return false;
    const d = asDate(v.dateDepart);
    if (from && (!d || d < from)) return false;
    if (to) {
      const tend = new Date(to.getTime());
      tend.setHours(23, 59, 59, 999);
      if (!d || d > tend) return false;
    }
    if (term) {
      const hay = [v.destination, v.destinationDetail, v.client, v.incidents, v.documentation, v.containerPositioningLocation]
        .filter(Boolean).join("\n").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  renderKPIs(filtered);
  renderCharts(filtered);
  renderTable(filtered);
  persistFilters();
  return filtered;
}

// --- KPIs ---
function renderKPIs(vs) {
  const trips     = vs.length;
  const dist      = vs.reduce((a, v) => a + (Number(v.distance) || 0), 0);
  const fuel      = vs.reduce((a, v) => a + (Number(v.carburantDepart ?? 0) || 0), 0);
  const effs      = vs.map(efficiencyOf).filter((x) => x != null);
  const avgEff    = effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : 0;
  const avgL100   = dist > 0 && fuel > 0 ? (fuel / dist) * 100 : 0;
  const hours     = vs.reduce((a, v) => a + calcDurationHours(v.dateDepart, v.kribiArrivalDate), 0);
  const incidents = vs.filter(v => (v.incidents || "").trim()).length;

  if (kTrips) kTrips.textContent = fmtNumber(trips);
  if (kDist)  kDist.textContent  = `${fmtNumber(dist)} km`;
  if (kEff)   kEff.textContent   = avgEff  ? `${fmtNumber(avgEff, 2)} km/L` : "N/A";
  if (kCons)  kCons.textContent  = avgL100 ? `${fmtNumber(avgL100, 2)} L/100 km` : "N/A";
  if (kHours) kHours.textContent = `${fmtNumber(hours, 1)} h`;
  if (kInc)   kInc.textContent   = fmtNumber(incidents);
}

// --- Charts ---
function makeChart(key, ctx, config) {
  if (!ctx) return null;
  if (charts[key]) { try { charts[key].destroy(); } catch {} }
  charts[key] = new Chart(ctx, config);
  return charts[key];
}

function renderCharts(vs) {
  // Distance timeline (per day)
  const perDay = {};
  vs.forEach((v) => {
    const d = asDate(v.dateDepart);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    perDay[key] = (perDay[key] || 0) + (Number(v.distance) || 0);
  });
  const days = Object.keys(perDay).sort();
  makeChart("timeline", document.getElementById("distanceTimeline"), {
    type: "line",
    data: {
      labels: days,
      datasets: [{
        label: "Distance (km)", data: days.map(d => perDay[d]),
        borderColor: "#2c5aa0", backgroundColor: "rgba(44,90,160,0.15)", fill: true, tension: 0.25,
      }],
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  // Top destinations
  const destAgg = {};
  vs.forEach((v) => {
    const dest = v.destinationDetail ? `${v.destination || ""} - ${v.destinationDetail}` : v.destination || "";
    const raw = (dest || "").trim();
    const key = raw.toLowerCase() || "(indéfini)";
    if (!destAgg[key]) destAgg[key] = { n: 0, label: toTitle(raw) || "(Indéfini)" };
    destAgg[key].n++;
  });
  const topDest = Object.values(destAgg).sort((a, b) => b.n - a.n).slice(0, 8);
  makeChart("dests", document.getElementById("topDestinations"), {
    type: "bar",
    data: { labels: topDest.map(x => x.label), datasets: [{ label: "Voyages", data: topDest.map(x => x.n), backgroundColor: "#1a3a6c" }] },
    options: { responsive: true, plugins: { legend: { display: false } }, indexAxis: "y", scales: { x: { beginAtZero: true } } },
  });

  // Status doughnut (French labels)
  const statusMap = vs.reduce((m, v) => { const s = v.statut || "complet"; m[s] = (m[s] || 0) + 1; return m; }, {});
  const statusKeys = Object.keys(statusMap);
  makeChart("status", document.getElementById("statusPie"), {
    type: "doughnut",
    data: {
      labels: statusKeys.map(k => STATUS_LABELS[k] || k),
      datasets: [{ data: statusKeys.map(k => statusMap[k]), backgroundColor: statusKeys.map(k => STATUS_COLORS[k] || "#aaa") }],
    },
    options: { responsive: true, plugins: { legend: { display: true, position: "bottom" } } },
  });
}

// --- Table ---
function renderTable(vs) {
  driverTableBody.innerHTML = "";
  if (!vs.length) {
    driverTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:#aaa"><i class="fas fa-inbox fa-lg"></i><br>Aucun voyage trouvé</td></tr>`;
    return;
  }
  vs.slice().sort((a, b) => (asDate(b.dateDepart)?.getTime() || 0) - (asDate(a.dateDepart)?.getTime() || 0))
    .forEach((v) => {
      const eff  = efficiencyOf(v);
      const dest = v.destinationDetail ? `${v.destination || ""} — ${v.destinationDetail}` : v.destination || "—";
      const incidentHtml = (v.incidents || "").trim()
        ? `<span style="color:#dc3545;font-size:0.85rem">${esc(v.incidents)}</span>`
        : `<span style="color:#28a745;font-size:0.8rem">Aucun</span>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(formatDateFR(v.dateDepart))}</td>
        <td><code style="font-size:0.82rem;background:#f0f4f8;padding:2px 5px;border-radius:4px">${esc(v.camion || "—")}</code></td>
        <td>${esc(v.numeroOrdreTransport || "—")}</td>
        <td>${esc(v.client || "—")}</td>
        <td title="${esc(dest)}">${esc(dest.length > 35 ? dest.slice(0, 33) + "…" : dest)}</td>
        <td style="text-align:right"><strong>${fmtNumber(v.distance || 0)}</strong> <small>km</small></td>
        <td style="text-align:right">${fmtNumber(v.carburantDepart || 0)} <small>L</small></td>
        <td style="text-align:right">${eff != null ? fmtNumber(eff, 2) + " <small>km/L</small>" : "N/A"}</td>
        <td>${statusBadge(v.statut || "complet")}</td>
        <td>${incidentHtml}</td>
      `;
      driverTableBody.appendChild(tr);
    });
}

// --- Driver select population ---
function populateDrivers() {
  const names   = Array.from(new Set(all.map(v => (v.chauffeur || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"));
  const current = driverSelect.value || (() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}").driver || ""; } catch { return ""; }
  })();
  driverSelect.innerHTML =
    `<option value="">Tous les chauffeurs</option>` +
    names.map(n => `<option value="${n.replace(/"/g, "&quot;")}">${n}</option>`).join("");
  if (current && names.includes(current)) driverSelect.value = current;
}

// --- Filter persistence ---
const STORE_KEY = "kis:driver-report:filters";
function persistFilters() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      driver:  driverSelect.value  || "",
      company: companySelect.value || "all",
      status:  statusSelect.value  || "all",
      start:   startDate.value     || "",
      end:     endDate.value       || "",
      search:  searchDriver?.value || "",
    }));
  } catch {}
}
function restoreFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (saved.company) companySelect.value = saved.company;
    if (saved.status)  statusSelect.value  = saved.status;
    if (saved.start)   startDate.value     = saved.start;
    if (saved.end)     endDate.value       = saved.end;
    if (searchDriver && saved.search != null) searchDriver.value = saved.search;
  } catch {}
}

// --- Script lazy loader ---
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.setAttribute("data-src", src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Load failed: " + src));
    document.head.appendChild(s);
  });
}
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  try { await loadScriptOnce("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"); }
  catch { await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"); }
  return window.XLSX;
}
async function loadJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf;
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js");
  return window.jspdf;
}

// --- Excel export ---
exportExcelDriverBtn?.addEventListener("click", async () => {
  try {
    const vs = applyFilters();
    const XLSX = await loadXLSX();
    const rows = vs.map((v) => {
      const dest = v.destinationDetail ? `${v.destination || ""} - ${v.destinationDetail}` : v.destination || "";
      const dep  = Number(v.carburantDepart ?? 0) || 0;
      const eff  = dep > 0 && (v.distance || 0) > 0 ? ((v.distance || 0) / dep).toFixed(2) : "N/A";
      return [
        v.chauffeur || "", v.camion || "", v.numeroOrdreTransport || "", v.client || "", dest,
        formatDateFR(v.dateDepart), formatDateFR(v.clientArrivalTime), formatDateFR(v.clientDepartureTime),
        formatDateFR(v.kribiArrivalDate),
        `${formatDateFR(v.containerPositioningDate)} à ${v.containerPositioningLocation || ""}`,
        Number(v.distance || 0), Number(v.carburantDepart ?? 0), eff,
        v.documentation || "", v.incidents || "", v.statut || "complet",
      ];
    });
    const header = [["Chauffeur","Camion","N° ordre","Client","Destination","Départ","Arrivée client","Départ client","Arrivée Kribi","Positionnement TC vide","Distance","Carburant (L)","Efficacité (km/L)","Documentation","Incidents","Statut"]];
    const driverLabel = driverSelect.value || "Tous";
    const meta = [
      [`Chauffeur: ${driverLabel}`],
      [`Période: ${startDate.value || "toutes"} → ${endDate.value || "toutes"}`],
      [`Société: ${companySelect.value} | Statut: ${statusSelect.value}`],
      [],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...meta, ...header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rapport chauffeur");
    XLSX.writeFile(wb, `rapport_chauffeur_${(driverSelect.value || "tous").replace(/\s+/g, "_")}.xlsx`);
    notify("Export Excel réussi", "success");
  } catch (e) {
    notify("Erreur export Excel: " + (e?.message || e), "error");
  }
});

// --- PDF export ---
exportPDFDriverBtn?.addEventListener("click", async () => {
  try {
    const sel = applyFilters();
    const { jsPDF } = await loadJsPDF();
    const doc    = new jsPDF("p", "mm", "a4");
    const margin = 14;
    const width  = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const primary   = [30, 64, 175]; // #1e40af
    const secondary = [37, 99, 235]; // #2563eb

    async function loadImageAsDataURL(src) {
      try {
        const res = await fetch(src); const blob = await res.blob();
        return await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onerror = () => reject(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(blob); });
      } catch { return null; }
    }
    const kisLogo = await loadImageAsDataURL("img/logo.jpg");
    const utaLogo = await loadImageAsDataURL("img/uta-logo.jpg");

    doc.setFillColor(secondary[0], secondary[1], secondary[2]);
    doc.rect(0, 0, width, 22, "F");
    if (kisLogo) doc.addImage(kisLogo, "JPEG", margin, 5, 20, 12);
    if (utaLogo) doc.addImage(utaLogo, "JPEG", width - margin - 20, 5, 20, 12);

    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text("Rapport chauffeur", margin, 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40);
    const driverLabel = driverSelect.value || "Tous les chauffeurs";
    doc.text(`Chauffeur: ${driverLabel}  |  Société: ${companySelect.value}  |  Statut: ${statusSelect.value}`, margin, 36);
    doc.text(`Période: ${startDate.value || "toutes"} → ${endDate.value || "toutes"}  |  Généré le: ${new Date().toLocaleString("fr-FR")}`, margin, 42);

    const rightX = width - margin;
    doc.setFontSize(9); doc.setTextColor(60);
    doc.text("Kribi Inland Services & UTA Cameroun SA", rightX, 30, { align: "right" });
    doc.text("Responsable: TCHIO NGOUMO ALAIN",         rightX, 35, { align: "right" });
    doc.text("Fonction: Agent Logistique",               rightX, 40, { align: "right" });
    doc.text("Tél: 657 60 08 55 / 681 23 33 07",        rightX, 45, { align: "right" });
    doc.text("Email: alain.tchio@kis-kribi.org",         rightX, 50, { align: "right" });

    const trips  = sel.length;
    const dist   = sel.reduce((a, v) => a + (v.distance || 0), 0);
    const fuel   = sel.reduce((a, v) => a + (Number(v.carburantDepart ?? 0) || 0), 0);
    const effs   = sel.map(efficiencyOf).filter(Boolean);
    const avgEff = effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : 0;
    const l100   = dist > 0 && fuel > 0 ? (fuel / dist) * 100 : 0;

    function kpi(x, y, title, val) {
      doc.setDrawColor(230); doc.setFillColor(248, 249, 250);
      doc.roundedRect(x, y, 58, 18, 3, 3, "F");
      doc.setFontSize(8.5); doc.setTextColor(90); doc.setFont("helvetica", "normal");
      doc.text(title, x + 6, y + 7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(30);
      doc.text(val, x + 6, y + 14);
    }
    const kx = margin, ky = 58, gap = 6;
    kpi(kx, ky, "Total voyages", String(trips));
    kpi(kx + 58 + gap, ky, "Distance totale", `${Math.round(dist)} km`);
    kpi(kx + (58 + gap) * 2, ky, "Efficacité moyenne", avgEff ? `${avgEff.toFixed(2)} km/L` : "N/A");
    kpi(kx, ky + 18 + gap, "Consommation moy.", l100 ? `${l100.toFixed(2)} L/100 km` : "N/A");

    const body = sel.map((v) => {
      const dest = v.destinationDetail ? `${v.destination || ""} - ${v.destinationDetail}` : v.destination || "";
      const dep  = Number(v.carburantDepart ?? 0) || 0;
      const eff  = dep > 0 && (v.distance || 0) > 0 ? ((v.distance || 0) / dep).toFixed(2) : "N/A";
      return [formatDateFR(v.dateDepart), v.camion || "", v.numeroOrdreTransport || "", v.client || "", dest, Number(v.distance || 0), dep, eff, STATUS_LABELS[v.statut] || v.statut || "Complet"];
    });
    doc.autoTable({
      startY: ky + 18 + gap + 22,
      head: [["Départ","Camion","N° ordre","Client","Destination","Distance","Carburant (L)","Perf. (km/L)","Statut"]],
      body,
      theme: "grid",
      headStyles: { fillColor: secondary, fontSize: 9, cellPadding: 2 },
      styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 24 }, 1: { cellWidth: 20 }, 2: { cellWidth: 18 }, 3: { cellWidth: 26 },
        4: { cellWidth: 40 }, 5: { cellWidth: 16, halign: "right" }, 6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 20, halign: "right" }, 8: { cellWidth: 18, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });

    try {
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`KIS & UTA — ${new Date().toLocaleDateString("fr-FR")} — Page ${i}/${pageCount}`, width / 2, height - 6, { align: "center" });
      }
    } catch {}
    doc.save(`rapport_chauffeur_${(driverSelect.value || "tous").replace(/\s+/g, "_")}.pdf`);
    notify("Export PDF réussi", "success");
  } catch (e) {
    notify("Erreur export PDF: " + (e?.message || e), "error");
  }
});

// --- Event wiring ---
function wireEvents() {
  if (applyFiltersBtn) applyFiltersBtn.addEventListener("click", (e) => { e.preventDefault?.(); applyFilters(); });
  if (driverSelect)    driverSelect.addEventListener("change", applyFilters);
  if (companySelect)   companySelect.addEventListener("change", applyFilters);
  if (statusSelect)    statusSelect.addEventListener("change", applyFilters);
  if (startDate)       startDate.addEventListener("change", applyFilters);
  if (endDate)         endDate.addEventListener("change", applyFilters);
  if (searchDriver)    searchDriver.addEventListener("input", () => {
    clearTimeout(window.__drvTimer);
    window.__drvTimer = setTimeout(applyFilters, 200);
  });
}

// --- Real-time subscription ---
function subscribe() {
  try {
    voyagesCol.orderBy("createdAt", "desc").onSnapshot(
      (snap) => {
        all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        populateDrivers();
        applyFilters();
      },
      (err) => {
        console.warn("onSnapshot(createdAt) failed, fallback:", err?.code);
        voyagesCol.onSnapshot(
          (snap) => { all = snap.docs.map(d => ({ id: d.id, ...d.data() })); populateDrivers(); applyFilters(); },
          (e2)  => { console.error("Snapshot error:", e2); notify("Erreur de chargement des données", "error"); }
        );
      }
    );
  } catch (e) {
    console.error("subscribe() failed:", e);
    notify("Erreur de connexion Firebase", "error");
  }
}

// --- Boot ---
window.addEventListener("DOMContentLoaded", () => {
  restoreFilters();
  wireEvents();
  subscribe();
  document.getElementById("footerYear") && (document.getElementById("footerYear").textContent = new Date().getFullYear());
});
