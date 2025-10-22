// Pré-alertes tracking page
// Firebase init
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
  db.enablePersistence?.().catch(() => {});
} catch {}
const preCol = db.collection("prealertes");

// DOM
const el = (id) => document.getElementById(id);
const preForm = el("preForm");
const preSociete = el("preSociete");
const preClient = el("preClient");
const preReference = el("preReference");
const preContainer = el("preContainer");
const preReceived = el("preReceived");
const preDocs = el("preDocs");
const preTake = el("preTake");
const preDelivery = el("preDelivery");
const preStatus = el("preStatus");
const preComments = el("preComments");

const preSearch = el("preSearch");
const preTime = el("preTime");
const preCompany = el("preCompany");
const preStatusFilter = el("preStatusFilter");
const preCount = el("preCount");
const preSummary = el("preSummary");
const preTableBody = document.querySelector("#preTable tbody");
const preExportExcel = el("preExportExcel");
const preExportPDF = el("preExportPDF");
const markDocsReceived = el("markDocsReceived");
const togglePreForm = el("togglePreForm");
const preFormWrap = el("preFormWrap");
const preClientList = document.getElementById("preClientList");
const markDeliveredToday = el("markDeliveredToday");

let all = [];
let filtered = [];
let editingId = null;

function toInputDate(val) {
  const d = asDate(val) || parseInputDate(val);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function asDate(val) {
  if (!val) return null;
  try {
    return val.toDate ? val.toDate() : new Date(val);
  } catch {
    return null;
  }
}
function parseInputDate(val) {
  if (!val) return null;
  // Use local date as midnight
  const d = new Date(val);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysBetween(a, b) {
  const d1 = asDate(a) || parseInputDate(a);
  const d2 = asDate(b) || parseInputDate(b);
  if (!(d1 && d2)) return null;
  const ms = d2 - d1;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
function timeStart(kind) {
  const now = new Date();
  if (kind === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (kind === "week") {
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (kind === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}
function statusBadge(s) {
  const map = {
    transmis: { cls: "secondary", label: "Transmis" },
    "docs-attente": { cls: "warning", label: "Docs en attente" },
    "docs-recues": { cls: "info", label: "Docs reçues" },
    "a-retirer": { cls: "primary", label: "À retirer" },
    "en-livraison": { cls: "primary", label: "En livraison" },
    livre: { cls: "success", label: "Livré" },
    annule: { cls: "danger", label: "Annulé" },
  };
  const it = map[s] || { cls: "secondary", label: s || "—" };
  return `<span class="status-badge ${it.cls}">${it.label}</span>`;
}
function esc(s) {
  return s == null
    ? ""
    : String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function computeDerived(item) {
  const dDelay = daysBetween(item.preReceivedDate, item.docsReceivedDate);
  return { delayDocs: dDelay };
}

function render() {
  // Filters
  const term = (preSearch.value || "").toLowerCase();
  const tStart = timeStart(preTime.value);
  const comp = preCompany.value || "all";
  const stat = preStatusFilter.value || "all";
  filtered = all.filter((x) => {
    const hay = [
      x.client || "",
      x.reference || "",
      x.container || "",
      x.comments || "",
      x.societe || "",
    ]
      .join("\n")
      .toLowerCase();
    const matches = !term || hay.includes(term);
    const compOk = comp === "all" || (x.societe || "KIS") === comp;
    const statOk = stat === "all" || (x.status || "transmis") === stat;
    const d = asDate(x.preReceivedDate);
    const timeOk = !tStart || (d ? d >= tStart : false);
    return matches && compOk && statOk && timeOk;
  });

  // Summary
  const count = filtered.length;
  const docsWaiting = filtered.filter(
    (x) =>
      !x.docsReceivedDate &&
      (x.status === "transmis" || x.status === "docs-attente")
  ).length;
  const delivered = filtered.filter(
    (x) => !!x.deliveryDate || x.status === "livre"
  ).length;
  preCount.textContent = `${count} éléments`;
  preSummary.textContent = `En attente docs: ${docsWaiting} • Livrés: ${delivered}`;

  // Table
  preTableBody.innerHTML = "";
  filtered
    .sort((a, b) => {
      const da = asDate(a.preReceivedDate)?.getTime() || 0;
      const db = asDate(b.preReceivedDate)?.getTime() || 0;
      return db - da;
    })
    .forEach((x) => {
      const tr = document.createElement("tr");
      const d = computeDerived(x);
      tr.innerHTML = `
      <td>${esc(x.client)}</td>
      <td>${esc(x.societe || "KIS")}</td>
      <td>${esc(x.reference || "")}</td>
      <td>${esc(x.container || "")}</td>
      <td>${esc(formatDate(x.preReceivedDate))}</td>
      <td>${esc(formatDate(x.docsReceivedDate) || "")}</td>
      <td>${d.delayDocs == null ? "—" : d.delayDocs}</td>
      <td>${esc(formatDate(x.containerTakenDate) || "")}</td>
      <td>${esc(formatDate(x.deliveryDate) || "")}</td>
      <td>${statusBadge(x.status)}</td>
      <td>${esc(x.comments || "")}</td>
      <td>
        <button class="btn-edit" data-id="${
          x.id
        }"><i class="fas fa-edit"></i> Modifier</button>
        <button class="btn-delete" data-id="${
          x.id
        }"><i class="fas fa-trash"></i> Supprimer</button>
      </td>
    `;
      preTableBody.appendChild(tr);
    });

  // Delegated click for edit buttons
  preTableBody.onclick = (ev) => {
    const btn = ev.target.closest?.("button");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!id) return;
    if (btn.classList.contains("btn-edit")) editPreAlerte(id);
    else if (btn.classList.contains("btn-delete")) deletePreAlerte(id);
  };
}

function formatDate(val) {
  const d = asDate(val) || parseInputDate(val);
  if (!d) return "";
  return d.toLocaleDateString("fr-FR");
}

// Save new pre-alert
preForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = {
    societe: preSociete.value || "KIS",
    client: preClient.value.trim(),
    reference: preReference.value.trim(),
    container: preContainer.value.trim(),
    preReceivedDate: parseInputDate(preReceived.value),
    docsReceivedDate: parseInputDate(preDocs.value),
    containerTakenDate: parseInputDate(preTake.value),
    deliveryDate: parseInputDate(preDelivery.value),
    status: preStatus.value,
    comments: preComments.value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  const err = validatePreAlerte(item);
  if (err) {
    alert(err);
    return;
  }
  try {
    if (editingId) {
      await preCol.doc(editingId).update(item);
      const btn = preForm.querySelector('button[type="submit"]');
      if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
      editingId = null;
    } else {
      await preCol.add(item);
    }
    preForm.reset();
    renderAfterRefetch();
  } catch (err) {
    alert("Erreur enregistrement: " + (err?.message || err));
  }
});

function wire() {
  let t;
  preSearch.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(render, 150);
  });
  [preTime, preCompany, preStatusFilter].forEach(
    (c) => c && c.addEventListener("change", render)
  );
  if (togglePreForm && preFormWrap) {
    // Align with global collapse behavior using aria-hidden
    preFormWrap.setAttribute("aria-hidden", "false");
    togglePreForm.addEventListener("click", () => {
      const expanded = togglePreForm.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      togglePreForm.setAttribute("aria-expanded", String(next));
      preFormWrap.setAttribute("aria-hidden", expanded ? "true" : "false");
    });
  }
  if (preExportExcel) preExportExcel.addEventListener("click", exportExcel);
  if (preExportPDF) preExportPDF.addEventListener("click", exportPDF);
  if (markDocsReceived)
    markDocsReceived.addEventListener("click", () => {
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        preDocs.value = `${yyyy}-${mm}-${dd}`;
        // Auto-status update
        preStatus.value = "docs-recues";
      } catch {}
    });
  if (markDeliveredToday)
    markDeliveredToday.addEventListener("click", () => {
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        preDelivery.value = `${yyyy}-${mm}-${dd}`;
        preStatus.value = "livre";
      } catch {}
    });
}

async function renderAfterRefetch() {
  const snap = await preCol.get();
  all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Populate client suggestions
  try {
    if (preClientList) {
      const clients = Array.from(
        new Set(all.map((x) => (x.client || "").trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b, "fr"));
      preClientList.innerHTML = clients
        .map((c) => `<option value="${c.replace(/"/g, "&quot;")}"></option>`)
        .join("");
    }
  } catch {}
  render();
}

// Excel export (filtered)
function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.setAttribute("data-src", src);
    s.onload = () => res();
    s.onerror = () => rej(new Error("Load failed: " + src));
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
async function exportExcel() {
  try {
    const XLSX = await loadXLSX();
    const rows = filtered.map((x) => {
      const d = computeDerived(x);
      return [
        x.client || "",
        x.societe || "KIS",
        x.reference || "",
        x.container || "",
        formatDate(x.preReceivedDate),
        formatDate(x.docsReceivedDate),
        d.delayDocs == null ? "" : d.delayDocs,
        formatDate(x.containerTakenDate),
        formatDate(x.deliveryDate),
        x.status || "",
        x.comments || "",
      ];
    });
    const header = [
      [
        "Client",
        "Société",
        "Réf/BL",
        "N° Conteneur",
        "Réception pré-alerte",
        "Docs reçues",
        "Délai docs (j)",
        "Retrait port",
        "Livraison",
        "Statut",
        "Commentaires",
      ],
    ];
    const aoa = [...header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pré-alertes");
    XLSX.writeFile(wb, "pre_alertes.xlsx");
  } catch (e) {
    alert("Erreur export Excel: " + (e?.message || e));
  }
}

// Initial load
(async function init() {
  await renderAfterRefetch();
  wire();
  // Prefill today's date for reception for convenience
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    preReceived.value = `${yyyy}-${mm}-${dd}`;
  } catch {}
  // Auto-status suggestions based on dates
  function suggestStatus() {
    try {
      if (preDelivery.value) {
        preStatus.value = "livre";
        return;
      }
      if (preTake.value) {
        preStatus.value = "en-livraison";
        return;
      }
      if (preDocs.value) {
        preStatus.value = "docs-recues";
        return;
      }
      preStatus.value = "transmis";
    } catch {}
  }
  [preDocs, preTake, preDelivery].forEach(
    (ctl) => ctl && ctl.addEventListener("change", suggestStatus)
  );
})();

// ---------------- Validation ----------------
function validatePreAlerte(x) {
  if (!x.client) return "Le client est requis";
  if (!x.preReceivedDate)
    return "La date de réception de la pré-alerte est requise";
  const pr = asDate(x.preReceivedDate) || parseInputDate(x.preReceivedDate);
  const dr = asDate(x.docsReceivedDate) || parseInputDate(x.docsReceivedDate);
  const tk =
    asDate(x.containerTakenDate) || parseInputDate(x.containerTakenDate);
  const dl = asDate(x.deliveryDate) || parseInputDate(x.deliveryDate);
  if (dr && pr && dr < pr)
    return "Les documents ne peuvent pas être reçus avant la pré-alerte";
  if (tk && pr && tk < pr)
    return "Le retrait au port ne peut pas être avant la pré-alerte";
  if (tk && dr && tk < dr)
    return "Le retrait au port ne peut pas être avant la réception des documents";
  if (dl && tk && dl < tk)
    return "La livraison ne peut pas être avant le retrait au port";
  if (dl && pr && dl < pr)
    return "La livraison ne peut pas être avant la pré-alerte";
  return "";
}

// ---------------- Edit/delete like voyages (no modal) ----------------
function editPreAlerte(id) {
  const x = all.find((i) => i.id === id);
  if (!x) return;
  editingId = id;
  preSociete.value = x.societe || "KIS";
  preClient.value = x.client || "";
  preReference.value = x.reference || "";
  preContainer.value = x.container || "";
  preReceived.value = toInputDate(x.preReceivedDate);
  preDocs.value = toInputDate(x.docsReceivedDate);
  preTake.value = toInputDate(x.containerTakenDate);
  preDelivery.value = toInputDate(x.deliveryDate);
  preStatus.value = x.status || "transmis";
  preComments.value = x.comments || "";
  const btn = preForm.querySelector('button[type="submit"]');
  if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Mettre à jour';
  // Ensure form visible and scroll to it
  if (togglePreForm && preFormWrap) {
    togglePreForm.setAttribute("aria-expanded", "true");
    preFormWrap.setAttribute("aria-hidden", "false");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deletePreAlerte(id) {
  if (!confirm("Supprimer cette pré-alerte ?")) return;
  try {
    await preCol.doc(id).delete();
    await renderAfterRefetch();
  } catch (e) {
    alert("Erreur suppression: " + (e?.message || e));
  }
}

// quickMarkDocsReceived removed from row actions; use form-level 'Docs reçues aujourd\'hui'

// ---------------- PDF export ----------------
async function loadJsPDF() {
  await loadScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  );
  await loadScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js"
  );
  return window.jspdf;
}

function periodText() {
  const now = new Date();
  const val = preTime?.value || "all";
  const fmt = (d) =>
    d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  if (val === "today") {
    return `Aujourd'hui (${fmt(now)})`;
  }
  if (val === "week") {
    const start = new Date(now);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
    return `Semaine du ${fmt(start)} au ${fmt(now)}`;
  }
  if (val === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return `Mois du ${fmt(start)} au ${fmt(now)}`;
  }
  return "Toutes les données";
}

async function loadImageAsDataURL(src) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error("image load"));
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function statusDistribution(vs) {
  return vs.reduce((m, v) => {
    const s = v.status || "transmis";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
}

function avgDocsDelay(vs) {
  const arr = vs
    .map((x) => daysBetween(x.preReceivedDate, x.docsReceivedDate))
    .filter((v) => typeof v === "number" && isFinite(v));
  if (!arr.length) return 0;
  const total = arr.reduce((a, b) => a + b, 0);
  return total / arr.length;
}

async function exportPDF() {
  try {
    const { jsPDF } = await loadJsPDF();
    const doc = new jsPDF("p", "mm", "a4");
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 14;
    const secondary = [44, 90, 160];

    const items = filtered;
    const total = items.length;
    const delivered = items.filter(
      (x) => x.deliveryDate || x.status === "livre"
    ).length;
    const docsWaiting = items.filter(
      (x) =>
        !x.docsReceivedDate &&
        (x.status === "transmis" || x.status === "docs-attente")
    ).length;
    const docsRate = total
      ? (items.filter((x) => !!x.docsReceivedDate).length / total) * 100
      : 0;
    const delayAvg = avgDocsDelay(items);
    const dist = statusDistribution(items);

    const kisLogo = await loadImageAsDataURL("img/logo.jpg");
    const utaLogo = await loadImageAsDataURL("img/uta-logo.jpg");

    // Header
    doc.setFillColor(secondary[0], secondary[1], secondary[2]);
    doc.rect(0, 0, width, 22, "F");
    if (kisLogo) doc.addImage(kisLogo, "JPEG", margin, 4, 20, 12);
    if (utaLogo) doc.addImage(utaLogo, "JPEG", width - margin - 20, 4, 20, 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255);
    doc.text("Pré-alertes — Rapport hebdomadaire", width / 2, 14, {
      align: "center",
    });

    // Meta + contact
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40);
    const metaY = 30;
    doc.text(`Période: ${periodText()}`, margin, metaY);
    doc.text(
      `Généré le: ${new Date().toLocaleString("fr-FR")}`,
      margin,
      metaY + 6
    );
    const rightX = width - margin;
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text("Kribi Inland Services & UTA Cameroun SA", rightX, metaY, {
      align: "right",
    });
    doc.text("Responsable: TCHIO NGOUMO ALAIN", rightX, metaY + 5, {
      align: "right",
    });
    doc.text("Fonction: Agent Logistique", rightX, metaY + 10, {
      align: "right",
    });
    doc.text("Tél: 657 60 08 55 / 681 23 33 07", rightX, metaY + 15, {
      align: "right",
    });
    doc.text("Email: alain.tchio@kis-kribi.org", rightX, metaY + 20, {
      align: "right",
    });

    // KPIs
    function kpi(x, y, title, value) {
      doc.setDrawColor(230);
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(x, y, 58, 18, 3, 3, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text(title, x + 6, y + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(value, x + 6, y + 14);
    }
    const kx = margin,
      ky = 56,
      gap = 6;
    kpi(kx, ky, "Total éléments", String(total));
    kpi(kx + 58 + gap, ky, "Docs reçues", `${Math.round(docsRate)}%`);
    kpi(
      kx + (58 + gap) * 2,
      ky,
      "Délai moyen docs",
      `${delayAvg ? delayAvg.toFixed(1) : "0.0"} j`
    );
    kpi(kx, ky + 18 + gap, "Livrés", String(delivered));
    kpi(kx + 58 + gap, ky + 18 + gap, "En attente docs", String(docsWaiting));

    // Status chips
    const chips = [
      { label: `Transmis: ${dist["transmis"] || 0}`, bg: [108, 117, 125] },
      { label: `Docs att.: ${dist["docs-attente"] || 0}`, bg: [255, 193, 7] },
      { label: `Docs reç.: ${dist["docs-recues"] || 0}`, bg: [23, 162, 184] },
      { label: `À retirer: ${dist["a-retirer"] || 0}`, bg: secondary },
      { label: `En livraison: ${dist["en-livraison"] || 0}`, bg: secondary },
      { label: `Livré: ${dist["livre"] || 0}`, bg: [40, 167, 69] },
      { label: `Annulé: ${dist["annule"] || 0}`, bg: [220, 53, 69] },
    ];
    const chipY = ky + 18 + gap + 26;
    let cx = margin;
    const chipGap = 4;
    chips.forEach((c) => {
      const txt = c.label;
      const pad = 3.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const w = doc.getTextWidth(txt) + pad * 2;
      doc.setFillColor(...c.bg);
      doc.roundedRect(cx, chipY - 6, w, 10, 2, 2, "F");
      const tc = c.bg[0] > 200 && c.bg[1] > 200 && c.bg[2] > 200 ? 0 : 255;
      doc.setTextColor(tc);
      doc.text(txt, cx + pad, chipY);
      cx += w + chipGap;
    });

    // Table
    const body = items.map((x) => {
      const d = computeDerived(x);
      return [
        x.client || "",
        x.societe || "KIS",
        x.reference || "",
        x.container || "",
        formatDate(x.preReceivedDate),
        formatDate(x.docsReceivedDate) || "",
        d.delayDocs == null ? "" : d.delayDocs,
        formatDate(x.containerTakenDate) || "",
        formatDate(x.deliveryDate) || "",
        x.status || "",
        (x.comments || "").slice(0, 120),
      ];
    });
    doc.autoTable({
      startY: chipY + 10,
      head: [
        [
          "Client",
          "Société",
          "Réf/BL",
          "N° Conteneur",
          "Réception",
          "Docs reçues",
          "Délai (j)",
          "Retrait",
          "Livraison",
          "Statut",
          "Commentaires",
        ],
      ],
      body,
      theme: "grid",
      headStyles: { fillColor: secondary, fontSize: 9, cellPadding: 2 },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 16 },
        2: { cellWidth: 18 },
        3: { cellWidth: 22 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 14, halign: "right" },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 },
        9: { cellWidth: 18 },
        10: { cellWidth: 40 },
      },
      margin: { left: margin, right: margin },
      tableWidth: "wrap",
    });

    // Footer
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

    doc.save("pre_alertes.pdf");
  } catch (e) {
    alert("Erreur export PDF: " + (e?.message || e));
  }
}
