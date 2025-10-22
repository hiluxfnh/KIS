// Rapport chauffeur
// Firebase Config (same as main app)
const firebaseConfig = {
  apiKey: "AIzaSyCxxnPeqbmzRy0Ku9gDMzSjSKmjpCRz8gE",
  authDomain: "kis-transport-tracking.firebaseapp.com",
  projectId: "kis-transport-tracking",
  storageBucket: "kis-transport-tracking.firebasestorage.app",
  messagingSenderId: "1061513677800",
  appId: "1:1061513677800:web:0ac8dfa1bf37c3d676b25d",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const voyagesCol = db.collection("voyages");

// Elements
const driverSelect = document.getElementById("driverSelect");
const companySelect = document.getElementById("companySelect");
const statusSelect = document.getElementById("statusSelect");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const applyFiltersBtn = document.getElementById("applyFilters");
const exportExcelDriverBtn = document.getElementById("exportExcelDriver");
const exportPDFDriverBtn = document.getElementById("exportPDFDriver");
const searchDriver = document.getElementById("searchDriver");

const kTrips = document.getElementById("kpiTrips");
const kDist = document.getElementById("kpiDistance");
const kEff = document.getElementById("kpiEff");
const kCons = document.getElementById("kpiCons");
const kHours = document.getElementById("kpiHours");
const driverTableBody = document.getElementById("driverTableBody");

let all = [];
let charts = { timeline: null, dests: null, status: null };

function asDate(val) {
  if (!val) return null;
  try {
    return val.toDate ? val.toDate() : new Date(val);
  } catch {
    return null;
  }
}

function formatDateFR(date) {
  const d = asDate(date);
  if (!d || isNaN(d)) return "N/A";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcDurationHours(start, end) {
  const a = asDate(start),
    b = asDate(end);
  if (!(a && b)) return 0;
  return (b - a) / (1000 * 60 * 60);
}

function efficiencyOf(v) {
  const dep = typeof v.carburantDepart === "number" ? v.carburantDepart : null;
  if (dep == null || dep <= 0 || !(v.distance > 0)) return null;
  return v.distance / dep;
}

function byDriver(v, driverName) {
  if (!driverName) return true;
  return (v.chauffeur || "").toLowerCase() === driverName.toLowerCase();
}

function withinDates(v, from, to) {
  const d = asDate(v.dateDepart);
  if (!d) return false;
  if (from && d < from) return false;
  if (to) {
    const tend = new Date(to.getTime());
    tend.setHours(23, 59, 59, 999);
    if (d > tend) return false;
  }
  return true;
}

function applyFilters() {
  const driver = driverSelect.value || "";
  const comp = companySelect.value || "all";
  const status = statusSelect.value || "all";
  const from = startDate.value ? new Date(startDate.value) : null;
  const to = endDate.value ? new Date(endDate.value) : null;
  const term = (searchDriver?.value || "").toLowerCase();

  const filtered = all.filter((v) => {
    if (!byDriver(v, driver)) return false;
    if (comp !== "all" && (v.societe || "KIS") !== comp) return false;
    if (status !== "all" && (v.statut || "complet") !== status) return false;
    if (!withinDates(v, from, to)) return false;
    if (term) {
      const hay = [
        v.destination || "",
        v.destinationDetail || "",
        v.client || "",
        v.incidents || "",
        v.documentation || "",
        v.containerPositioningLocation || "",
      ]
        .join("\n")
        .toLowerCase();
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

function renderKPIs(vs) {
  const trips = vs.length;
  const dist = vs.reduce((acc, v) => acc + (v.distance || 0), 0);
  const effs = vs.map(efficiencyOf).filter((x) => x != null);
  const avgEff = effs.length
    ? effs.reduce((a, b) => a + b, 0) / effs.length
    : 0;
  const totalFuel = vs.reduce(
    (acc, v) => acc + (Number(v.carburantDepart ?? 0) || 0),
    0
  );
  const avgL100 = dist > 0 && totalFuel > 0 ? (totalFuel / dist) * 100 : 0;
  const hours = vs.reduce(
    (acc, v) => acc + calcDurationHours(v.dateDepart, v.kribiArrivalDate),
    0
  );

  kTrips.textContent = String(trips);
  kDist.textContent = `${Math.round(dist)} km`;
  kEff.textContent = avgEff ? `${avgEff.toFixed(2)} km/L` : "N/A";
  kCons.textContent = avgL100 ? `${avgL100.toFixed(2)} L/100 km` : "N/A";
  kHours.textContent = `${hours.toFixed(1)} h`;
}

function renderCharts(vs) {
  // Timeline: distance by date (sum per day)
  const perDay = {};
  vs.forEach((v) => {
    const d = asDate(v.dateDepart);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    perDay[key] = (perDay[key] || 0) + (v.distance || 0);
  });
  const days = Object.keys(perDay).sort();
  const vals = days.map((d) => perDay[d]);

  // Top destinations (case-insensitive grouping)
  function toTitle(s) {
    const base = (s || "").toLowerCase();
    return base.replace(/\b\w/g, (m) => m.toUpperCase());
  }
  const destAgg = {};
  vs.forEach((v) => {
    const dest = v.destinationDetail
      ? `${v.destination || ""} - ${v.destinationDetail}`
      : v.destination || "";
    const raw = (dest || "").trim();
    const key = raw.toLowerCase() || "(indéfini)";
    if (!destAgg[key])
      destAgg[key] = { n: 0, label: toTitle(raw) || "(Indéfini)" };
    destAgg[key].n += 1;
  });
  const topDest = Object.values(destAgg)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const statusCount = vs.reduce((m, v) => {
    m[v.statut || "complet"] = (m[v.statut || "complet"] || 0) + 1;
    return m;
  }, {});
  const statusLabels = Object.keys(statusCount);
  const statusVals = statusLabels.map((k) => statusCount[k]);

  // Draw charts
  if (charts.timeline) charts.timeline.destroy();
  if (charts.dests) charts.dests.destroy();
  if (charts.status) charts.status.destroy();

  charts.timeline = new Chart(document.getElementById("distanceTimeline"), {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: "Distance (km)",
          data: vals,
          borderColor: "#2c5aa0",
          backgroundColor: "rgba(44,90,160,0.15)",
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  charts.dests = new Chart(document.getElementById("topDestinations"), {
    type: "bar",
    data: {
      labels: topDest.map((x) => x.label),
      datasets: [
        {
          label: "Voyages",
          data: topDest.map((x) => x.n),
          backgroundColor: "#1a3a6c",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      indexAxis: "y",
    },
  });

  charts.status = new Chart(document.getElementById("statusPie"), {
    type: "doughnut",
    data: {
      labels: statusLabels,
      datasets: [
        {
          data: statusVals,
          backgroundColor: ["#28a745", "#ffc107", "#dc3545", "#6c757d"],
        },
      ],
    },
    options: { responsive: true },
  });
}

function renderTable(vs) {
  const esc = (s) =>
    s == null
      ? ""
      : String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
  driverTableBody.innerHTML = "";
  vs.sort((a, b) => {
    const da = asDate(a.dateDepart)?.getTime() || 0;
    const db = asDate(b.dateDepart)?.getTime() || 0;
    return db - da;
  }).forEach((v) => {
    const eff = efficiencyOf(v);
    const tr = document.createElement("tr");
    const dest = v.destinationDetail
      ? `${v.destination || ""} - ${v.destinationDetail}`
      : v.destination || "";
    tr.innerHTML = `
      <td>${esc(formatDateFR(v.dateDepart))}</td>
      <td>${esc(v.camion || "")}</td>
      <td>${esc(v.numeroOrdreTransport || "")}</td>
      <td>${esc(v.client || "")}</td>
      <td>${esc(dest)}</td>
      <td>${Number(v.distance || 0)} km</td>
      <td>${Number(v.carburantDepart ?? 0)} L</td>
      <td>${eff != null ? eff.toFixed(2) + " km/L" : "N/A"}</td>
      <td>${esc(v.statut || "complet")}</td>
      <td>${esc(v.incidents || "")}</td>
    `;
    driverTableBody.appendChild(tr);
  });
}

function populateDrivers() {
  const names = Array.from(
    new Set(all.map((v) => (v.chauffeur || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "fr"));
  driverSelect.innerHTML = names
    .map((n) => `<option value="${n.replace(/"/g, "&quot;")}">${n}</option>`)
    .join("");
}

// Persist/restore filters
const STORE_KEY = "kis:driver-report:filters";
function persistFilters() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        driver: driverSelect.value || "",
        company: companySelect.value || "all",
        status: statusSelect.value || "all",
        start: startDate.value || "",
        end: endDate.value || "",
        search: searchDriver?.value || "",
      })
    );
  } catch {}
}
function restoreFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    if (saved.company) companySelect.value = saved.company;
    if (saved.status) statusSelect.value = saved.status;
    if (saved.start) startDate.value = saved.start;
    if (saved.end) endDate.value = saved.end;
    if (searchDriver && saved.search != null) searchDriver.value = saved.search;
    // driver must be set after options are populated
    return saved.driver || "";
  } catch {
    return "";
  }
}

// Excel export (current filtered data)
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.setAttribute("data-src", src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Load failed: " + src));
    document.head.appendChild(s);
  });
}
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  try {
    await loadScriptOnce(
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
    );
  } catch {
    await loadScriptOnce(
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    );
  }
  return window.XLSX;
}

exportExcelDriverBtn.addEventListener("click", async () => {
  try {
    const XLSX = await loadXLSX();
    const rows = applyFilters().map((v) => {
      const dest = v.destinationDetail
        ? `${v.destination || ""} - ${v.destinationDetail}`
        : v.destination || "";
      const dep = typeof v.carburantDepart === "number" ? v.carburantDepart : 0;
      const eff =
        dep > 0 && (v.distance || 0) > 0
          ? ((v.distance || 0) / dep).toFixed(2)
          : "N/A";
      return [
        v.chauffeur || "",
        v.camion || "",
        v.numeroOrdreTransport || "",
        v.client || "",
        dest,
        formatDateFR(v.dateDepart),
        formatDateFR(v.clientArrivalTime),
        formatDateFR(v.clientDepartureTime),
        formatDateFR(v.kribiArrivalDate),
        `${formatDateFR(v.containerPositioningDate)} à ${
          v.containerPositioningLocation || ""
        }`,
        Number(v.distance || 0),
        Number(v.carburantDepart ?? 0),
        eff,
        v.documentation || "",
        v.incidents || "",
        v.statut || "complet",
      ];
    });
    const header = [
      [
        "Chauffeur",
        "Camion",
        "N° ordre",
        "Client",
        "Destination",
        "Départ",
        "Arrivée client",
        "Départ client",
        "Arrivée Kribi",
  "Positionnement du TC vide",
        "Distance",
        "Carburant (L)",
        "Efficacité (km/L)",
        "Documentation",
        "Incidents",
        "Statut",
      ],
    ];
    const meta = [
      [`Chauffeur: ${driverSelect.value}`],
      [
        `Période: ${startDate.value || "toutes"} -> ${
          endDate.value || "toutes"
        }`,
      ],
      [`Société: ${companySelect.value} | Statut: ${statusSelect.value}`],
      [],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...meta, ...header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rapport chauffeur");
    XLSX.writeFile(
      wb,
      `rapport_chauffeur_${(driverSelect.value || "all").replace(
        /\s+/g,
        "_"
      )}.xlsx`
    );
  } catch (e) {
    alert("Erreur export Excel: " + (e?.message || e));
  }
});

// PDF export (focused driver report)
async function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;
  await loadScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  );
  await loadScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js"
  );
  return window.jspdf;
}

exportPDFDriverBtn.addEventListener("click", async () => {
  try {
    const sel = applyFilters();
    const { jsPDF } = await loadJsPDF();
    const doc = new jsPDF("p", "mm", "a4");
    const margin = 14;
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const primary = [26, 58, 108];
    const secondary = [44, 90, 160];

    // Load logos
    async function loadImageAsDataURL(src) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onerror = () => reject(new Error("image load error"));
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    }
    const kisLogo = await loadImageAsDataURL("img/logo.jpg");
    const utaLogo = await loadImageAsDataURL("img/uta-logo.jpg");

    // Header band with logos
    doc.setFillColor(secondary[0], secondary[1], secondary[2]);
    doc.rect(0, 0, width, 22, "F");
    if (kisLogo) doc.addImage(kisLogo, "JPEG", margin, 5, 20, 12);
    if (utaLogo) doc.addImage(utaLogo, "JPEG", width - margin - 20, 5, 20, 12);

    // Title and meta under header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text("Rapport chauffeur", margin, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const meta1 = `Chauffeur: ${driverSelect.value || "—"}  |  Société: ${
      companySelect.value
    }  |  Statut: ${statusSelect.value}`;
    const meta2 = `Période: ${startDate.value || "toutes"} -> ${
      endDate.value || "toutes"
    }  |  Généré le: ${new Date().toLocaleString("fr-FR")}`;
    doc.text(meta1, margin, 36);
    doc.text(meta2, margin, 42);

    // Alain contact block (organization + contact)
    const contactY = 30;
    const rightX = width - margin;
    doc.setFontSize(9);
    doc.setTextColor(60);
    const org = "Kribi Inland Services & UTA Cameroun SA";
    const resp = "Responsable: TCHIO NGOUMO ALAIN";
    const role = "Fonction: Agent Logistique";
    const phone = "Tél: 657 60 08 55 / 681 23 33 07";
    const mail = "Email: alain.tchio@kis-kribi.org";
    doc.text(org, rightX, contactY, { align: "right" });
    doc.text(resp, rightX, contactY + 5, { align: "right" });
    doc.text(role, rightX, contactY + 10, { align: "right" });
    doc.text(phone, rightX, contactY + 15, { align: "right" });
    doc.text(mail, rightX, contactY + 20, { align: "right" });

    // KPIs
    const trips = sel.length;
    const dist = sel.reduce((a, v) => a + (v.distance || 0), 0);
    const fuel = sel.reduce(
      (a, v) => a + (Number(v.carburantDepart ?? 0) || 0),
      0
    );
    const effs = sel.map(efficiencyOf).filter((x) => x);
    const avgEff = effs.length
      ? effs.reduce((a, b) => a + b, 0) / effs.length
      : 0;
    const l100 = dist > 0 && fuel > 0 ? (fuel / dist) * 100 : 0;

    function kpi(x, y, title, val) {
      doc.setDrawColor(230);
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(x, y, 58, 18, 3, 3, "F");
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text(title, x + 6, y + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(val, x + 6, y + 14);
      doc.setFont("helvetica", "normal");
    }
    const kx = margin,
      ky = 50,
      gap = 6;
    kpi(kx, ky, "Total voyages", String(trips));
    kpi(kx + 58 + gap, ky, "Distance totale", `${Math.round(dist)} km`);
    kpi(
      kx + (58 + gap) * 2,
      ky,
      "Efficacité moyenne",
      avgEff ? `${avgEff.toFixed(2)} km/L` : "N/A"
    );
    kpi(
      kx,
      ky + 18 + gap,
      "Consommation moy.",
      l100 ? `${l100.toFixed(2)} L/100 km` : "N/A"
    );

    // Table
    const body = sel.map((v) => {
      const dest = v.destinationDetail
        ? `${v.destination || ""} - ${v.destinationDetail}`
        : v.destination || "";
      const dep = Number(v.carburantDepart ?? 0) || 0;
      const eff =
        dep > 0 && (v.distance || 0) > 0
          ? ((v.distance || 0) / dep).toFixed(2)
          : "N/A";
      return [
        formatDateFR(v.dateDepart),
        v.camion || "",
        v.numeroOrdreTransport || "",
        v.client || "",
        dest,
        Number(v.distance || 0),
        dep,
        eff,
        v.statut || "complet",
      ];
    });
    doc.autoTable({
      startY: ky + 18 + gap + 22,
      head: [
        [
          "Départ",
          "Camion",
          "N° ordre",
          "Client",
          "Destination",
          "Distance",
          "Carburant (L)",
          "Perf. (km/L)",
          "Statut",
        ],
      ],
      body,
      theme: "grid",
      headStyles: { fillColor: secondary, fontSize: 9, cellPadding: 2 },
      styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 20 },
        2: { cellWidth: 18 },
        3: { cellWidth: 26 },
        4: { cellWidth: 40 },
        5: { cellWidth: 16, halign: "right" },
        6: { cellWidth: 20, halign: "right" },
        7: { cellWidth: 20, halign: "right" },
        8: { cellWidth: 18, halign: "center" },
      },
      margin: { left: margin, right: margin },
    });

    // Footer with page numbers
    try {
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120);
        const text = `KIS & UTA — ${new Date().toLocaleDateString(
          "fr-FR"
        )} — Page ${i}/${pageCount}`;
        doc.text(text, width / 2, height - 6, { align: "center" });
      }
    } catch {}
    doc.save(
      `rapport_chauffeur_${(driverSelect.value || "all").replace(
        /\s+/g,
        "_"
      )}.pdf`
    );
  } catch (e) {
    alert("Erreur export PDF: " + (e?.message || e));
  }
});

// Initial load
(async function init() {
  try {
    const snap = await voyagesCol.get();
    all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Populate drivers and restore filters
    populateDrivers();
    const savedDriver = restoreFilters();
    if (savedDriver) driverSelect.value = savedDriver;
    // If none saved, default to most frequent driver
    if (!driverSelect.value) {
      const counts = all.reduce((m, v) => {
        const k = (v.chauffeur || "").trim();
        if (!k) return m;
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {});
      const best =
        Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      if (best) driverSelect.value = best;
    }
    applyFilters();

    // Wire interactions
    if (applyFiltersBtn)
      applyFiltersBtn.addEventListener("click", (e) => {
        e.preventDefault?.();
        applyFilters();
      });
    if (driverSelect) driverSelect.addEventListener("change", applyFilters);
    if (companySelect) companySelect.addEventListener("change", applyFilters);
    if (statusSelect) statusSelect.addEventListener("change", applyFilters);
    if (startDate) startDate.addEventListener("change", applyFilters);
    if (endDate) endDate.addEventListener("change", applyFilters);
    if (searchDriver)
      searchDriver.addEventListener("input", () => {
        // debounce lite
        clearTimeout(window.__drvTimer);
        window.__drvTimer = setTimeout(applyFilters, 200);
      });
  } catch (e) {
    console.error("Chargement échoué", e);
  }
})();
