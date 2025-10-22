// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCxxnPeqbmzRy0Ku9gDMzSjSKmjpCRz8gE",
  authDomain: "kis-transport-tracking.firebaseapp.com",
  projectId: "kis-transport-tracking",
  storageBucket: "kis-transport-tracking.firebasestorage.app",
  messagingSenderId: "1061513677800",
  appId: "1:1061513677800:web:0ac8dfa1bf37c3d676b25d",
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
// Enable offline persistence (best effort)
firebase
  .firestore()
  .enablePersistence()
  .catch(() => {
    /* ignore */
  });
const voyagesCollection = db.collection("voyages");
// Settings document reference for global app settings (e.g., active trucks)
const settingsDocRef = db.collection("settings").doc("global");

// Loader helpers
const appLoader = document.getElementById("app-loader");
function hideLoader() {
  if (!appLoader) return;
  appLoader.classList.add("hidden");
  appLoader.setAttribute("aria-busy", "false");
  setTimeout(() => {
    if (appLoader) appLoader.style.display = "none";
  }, 320);
}
function showLoader() {
  if (!appLoader) return;
  appLoader.style.display = "flex";
  appLoader.classList.remove("hidden");
  appLoader.setAttribute("aria-busy", "true");
}
let initialVoyagesLoaded = false;
let initialSettingsLoaded = false;
function maybeHideLoader() {
  if (initialVoyagesLoaded && initialSettingsLoaded) hideLoader();
}

// Simple notification helper (non-blocking toast)
function showNotification(message, type = "info") {
  try {
    const containerId = "notification-container";
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      container.style.position = "fixed";
      container.style.top = "16px";
      container.style.right = "16px";
      container.style.zIndex = "9999";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("role", "status");
      document.body.appendChild(container);
    }
    const note = document.createElement("div");
    note.textContent = message;
    note.className = `notification ${type}`;
    note.style.background =
      type === "error"
        ? "#f8d7da"
        : type === "success"
        ? "#d1e7dd"
        : type === "warning"
        ? "#fff3cd"
        : "#e2e3e5";
    note.style.color = "#000";
    note.style.padding = "8px 12px";
    note.style.marginTop = "8px";
    note.style.borderRadius = "6px";
    note.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    container.appendChild(note);
    setTimeout(() => note.remove(), 3000);
  } catch (e) {
    console.log((type || "INFO").toUpperCase() + ": " + message);
  }
}

// Gestion de la modal pour modifier les camions actifs (séparés par société)
const editTrucksBtnKIS = document.getElementById("edit-trucks-kis");
const editTrucksBtnUTA = document.getElementById("edit-trucks-uta");
const modal = document.getElementById("edit-modal");
const closeBtn = document.querySelector(".close");
const saveTrucksBtn = document.getElementById("save-trucks");
const trucksInput = document.getElementById("trucks-input");
const activeTrucksSpanKIS = document.getElementById("active-trucks-kis");
const activeTrucksSpanUTA = document.getElementById("active-trucks-uta");
const editTrucksTitle = document.getElementById("edit-trucks-title");
let currentTrucksCompany = null; // 'KIS' | 'UTA'

// Ouvrir la modal
if (editTrucksBtnKIS) {
  editTrucksBtnKIS.addEventListener("click", () => {
    currentTrucksCompany = "KIS";
    trucksInput.value = (activeTrucksSpanKIS?.textContent || "0").trim();
    if (editTrucksTitle)
      editTrucksTitle.textContent =
        "Modifier le nombre de camions actifs — KIS";
    modal.style.display = "block";
  });
}
if (editTrucksBtnUTA) {
  editTrucksBtnUTA.addEventListener("click", () => {
    currentTrucksCompany = "UTA";
    trucksInput.value = (activeTrucksSpanUTA?.textContent || "0").trim();
    if (editTrucksTitle)
      editTrucksTitle.textContent =
        "Modifier le nombre de camions actifs — UTA";
    modal.style.display = "block";
  });
}

// Fermer la modal
closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
});

// Fermer en cliquant en dehors
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
  }
});

// Sauvegarder la valeur (persist to Firestore)
saveTrucksBtn.addEventListener("click", async () => {
  const newValue = parseInt(trucksInput.value);
  if (isNaN(newValue) || newValue < 0) {
    showNotification("Veuillez entrer un nombre valide", "error");
    return;
  }
  if (!canEdit) {
    showNotification("Accès refusé: lecture seule", "error");
    return;
  }
  if (!currentTrucksCompany) {
    showNotification("Société inconnue pour la mise à jour", "error");
    return;
  }
  try {
    const user = auth.currentUser;
    const payload = {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: user
        ? getUserProfile(user.email)?.name || user.email
        : "inconnu",
    };
    if (currentTrucksCompany === "KIS") payload.activeTrucksKIS = newValue;
    else if (currentTrucksCompany === "UTA") payload.activeTrucksUTA = newValue;
    await settingsDocRef.set(payload, { merge: true });
    // Close modal; UI will be updated by onSnapshot below
    modal.style.display = "none";
    showNotification("Nombre de camions enregistré", "success");
  } catch (e) {
    console.error("Erreur de sauvegarde des camions:", e);
    showNotification("Erreur lors de l'enregistrement", "error");
  }
});

// Références DOM
const voyageForm = document.getElementById("voyageForm");
const voyagesTable = document
  .getElementById("voyagesTable")
  .querySelector("tbody");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const timeFilter = document.getElementById("timeFilter");
const exportExcelBtn = document.getElementById("exportExcel");
const exportPDFBtn = document.getElementById("exportPDF");
const driverReportBtn = document.getElementById("driverReport");
const lastUpdateSpan = document.getElementById("lastUpdate");
const currentYearSpan = document.getElementById("currentYear");
const voyageCountSpan = document.getElementById("voyageCount");
const avgEfficiencySpan = document.getElementById("avgEfficiency");
const submitBtn = document.getElementById("submitBtn");
const companyFilter = document.getElementById("companyFilter");
const societeSelect = document.getElementById("societe");
const statusFilter = document.getElementById("statusFilter");
const incompleteOnly = document.getElementById("incompleteOnly");
const openAnalyticsBtn = document.getElementById("openAnalytics");
const openPreAlertesBtn = document.getElementById("openPreAlertes");
const villeDepartInput = document.getElementById("villeDepart");
const destinationInput = document.getElementById("destination");
const destinationDetailInput = document.getElementById("destinationDetail");
const calcDistanceBtn = document.getElementById("calcDistance");
// Column toggle controls
const togglePerformance = document.getElementById("togglePerformance");
const toggleDocs = document.getElementById("toggleDocs");
const toggleIncidents = document.getElementById("toggleIncidents");
// Auth/UI references
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authModal = document.getElementById("auth-modal");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authLogin = document.getElementById("authLogin");
const authError = document.getElementById("authError");
const userNameSpan = document.getElementById("userName");
const userRoleSpan = document.getElementById("userRole");
// Form toggle controls
const toggleFormBtn = document.getElementById("toggleFormBtn");
const voyageFormWrap = document.getElementById("voyageFormWrap");

// Variables globales
let currentSortField = "dateDepart";
let lastSortField = null;
let isAscending = true;
let allVoyages = [];
let driverStats = {};
let editingId = null;
let canEdit = false; // Simple role flag (also enforced by Firestore rules)

// Whitelist of authorized users with roles and profile
const AUTH_CONFIG = {
  whitelist: {
    "alain@gmail.com": {
      role: "admin",
      name: "TCHIO NGOUMO ALAIN",
      jobTitle: "Agent Logistique",
      phone: "657 60 08 55 / 681 23 33 07",
    },
    // Add more users here, e.g.:
    // , "editor@example.com": { role: "editor", name: "John Doe", jobTitle: "Dispatcher", phone: "+237 ..." }
  },
};

function getUserProfile(email) {
  return AUTH_CONFIG.whitelist[(email || "").toLowerCase()] || null;
}

// Initialisation des dates
function initDates() {
  // ---------------- Form Toggle (collapse) -----------------
  // Ensure collapsed by default (hidden attribute already present in HTML)
  if (voyageFormWrap) {
    voyageFormWrap.setAttribute("aria-hidden", "true");
  }

  if (toggleFormBtn && voyageFormWrap) {
    toggleFormBtn.addEventListener("click", () => {
      const expanded = toggleFormBtn.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      toggleFormBtn.setAttribute("aria-expanded", String(next));
      // Prepare for animation
      if (next) {
        // expanding
        voyageFormWrap.hidden = false; // unhide to allow animation
        requestAnimationFrame(() => {
          voyageFormWrap.setAttribute("aria-hidden", "false");
        });
      } else {
        // collapsing
        voyageFormWrap.setAttribute("aria-hidden", "true");
        // after transition, hide to remove from a11y tree
        const onEnd = () => {
          voyageFormWrap.hidden = true;
          voyageFormWrap.removeEventListener("transitionend", onEnd);
        };
        voyageFormWrap.addEventListener("transitionend", onEnd);
      }
    });
  }
  const now = new Date();
  lastUpdateSpan.textContent = now.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  currentYearSpan.textContent = now.getFullYear();

  // Restore persisted filters and toggles
  try {
    const saved = JSON.parse(localStorage.getItem("kis:filters") || "{}");
    if (saved.filterSelect) filterSelect.value = saved.filterSelect;
    if (saved.timeFilter) timeFilter.value = saved.timeFilter;
    if (saved.companyFilter) companyFilter.value = saved.companyFilter;
    if (saved.statusFilter) statusFilter.value = saved.statusFilter;
    if (saved.incompleteOnly != null && incompleteOnly)
      incompleteOnly.checked = !!saved.incompleteOnly;
    if (saved.search) searchInput.value = saved.search;
    if (saved.cols) {
      if (togglePerformance)
        togglePerformance.checked = saved.cols.performance !== false;
      if (toggleDocs) toggleDocs.checked = saved.cols.docs !== false;
      if (toggleIncidents)
        toggleIncidents.checked = saved.cols.incidents !== false;
    }
  } catch {}
}

// ---------------- Authentication & Role-based UI -----------------
function updateUIForRole() {
  try {
    const formSection = document.querySelector(".form-section");
    if (formSection) {
      // Completely hide the whole add-voyage section for view-only users
      formSection.style.display = canEdit ? "block" : "none";
    }
    // Hide edit action buttons in the table
    document.querySelectorAll(".btn-edit, .btn-delete").forEach((btn) => {
      btn.style.display = canEdit ? "inline-flex" : "none";
    });
    // Hide trucks edit icons when view-only
    if (editTrucksBtnKIS)
      editTrucksBtnKIS.style.display = canEdit ? "inline" : "none";
    if (editTrucksBtnUTA)
      editTrucksBtnUTA.style.display = canEdit ? "inline" : "none";
    // Toggle visibility of login/logout buttons
    if (loginBtn)
      loginBtn.style.display = auth.currentUser ? "none" : "inline-flex";
    if (logoutBtn)
      logoutBtn.style.display = auth.currentUser ? "inline-flex" : "none";
  } catch (e) {
    /* noop */
  }
}

// Open/Close auth modal
if (loginBtn && authModal) {
  loginBtn.addEventListener("click", () => {
    authError.style.display = "none";
    authError.textContent = "";
    authModal.style.display = "block";
  });
}

const authModalClose = document.querySelector('[data-close="auth-modal"]');
if (authModalClose && authModal) {
  authModalClose.addEventListener("click", () => {
    authModal.style.display = "none";
  });
}

// Basic email/password sign-in
if (authLogin) {
  authLogin.addEventListener("click", async () => {
    try {
      authError.style.display = "none";
      authError.textContent = "";
      const email = (authEmail.value || "").trim();
      const password = authPassword.value || "";
      await auth.signInWithEmailAndPassword(email, password);
      authModal.style.display = "none";
    } catch (e) {
      authError.textContent = e?.message || "Échec de la connexion";
      authError.style.display = "block";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
    } catch {}
  });
}

auth.onAuthStateChanged((user) => {
  const profile = user ? getUserProfile(user.email) : null;
  const role = profile?.role || "viewer";
  canEdit = role === "admin" || role === "editor";
  if (userNameSpan)
    userNameSpan.textContent = profile?.name || user?.email || "Invité";
  if (userRoleSpan)
    userRoleSpan.textContent = canEdit
      ? role === "admin"
        ? "Administrateur"
        : "Éditeur"
      : "Lecture seule";
  updateUIForRole();

  // Offer a one-time cleanup migration to remove legacy 'carburantRetour' fields
  if (canEdit) {
    setTimeout(() => {
      try {
        const done = localStorage.getItem("kis:migrated:removeCarburantRetour");
        if (!done) maybePromptMigrationRemoveCarburantRetour();
      } catch {}
    }, 300);
  }
});

async function maybePromptMigrationRemoveCarburantRetour() {
  const confirmRun = confirm(
    "Nettoyage: supprimer définitivement le champ 'Carburant retour (L)' des voyages existants ?"
  );
  if (!confirmRun) return;
  await migrateRemoveCarburantRetour();
}

async function migrateRemoveCarburantRetour() {
  if (!canEdit) return;
  try {
    showLoader?.();
    const snap = await voyagesCollection.get();
    const db = firebase.firestore();
    const docs = snap.docs.filter((d) =>
      Object.prototype.hasOwnProperty.call(d.data(), "carburantRetour")
    );
    let updated = 0;
    const batchSize = 400;
    let batch = db.batch();
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      batch.update(doc.ref, {
        carburantRetour: firebase.firestore.FieldValue.delete(),
      });
      updated++;
      if (updated % batchSize === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    // Commit remaining
    await batch.commit();
    try {
      localStorage.setItem("kis:migrated:removeCarburantRetour", "1");
    } catch {}
    showNotification(
      `Nettoyage terminé: ${updated} document(s) mis à jour`,
      "success"
    );
  } catch (e) {
    console.error("Migration cleanup error", e);
    showNotification(
      "Erreur lors du nettoyage des anciens champs carburant retour",
      "error"
    );
  } finally {
    hideLoader?.();
  }
}

// Soumission du formulaire
voyageForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const voyage = {
    numeroOrdreTransport: document
      .getElementById("numeroOrdreTransport")
      .value.trim(),
    chauffeur: document.getElementById("chauffeur").value.trim(),
    camion: document.getElementById("camion").value.trim(),
    destination: document.getElementById("destination").value.trim(),
    destinationDetail: (destinationDetailInput?.value || "").trim(),
    villeDepart: (villeDepartInput?.value || "").trim(),
    client: (document.getElementById("client")?.value || "").trim(),
    distance: parseFloat(document.getElementById("distance").value),
    dateDepart: asDate(document.getElementById("dateDepart").value),
    clientArrivalTime: asDate(
      document.getElementById("clientArrivalTime").value
    ),
    clientDepartureTime: asDate(
      document.getElementById("clientDepartureTime").value
    ),
    kribiArrivalDate: asDate(document.getElementById("kribiArrivalDate").value),
    containerPositioningDate: asDate(
      document.getElementById("containerPositioningDate").value
    ),
    containerPositioningLocation: document
      .getElementById("containerPositioningLocation")
      .value.trim(),
    numeroConteneur: (
      document.getElementById("numeroConteneur")?.value || ""
    ).trim(),
    numeroPlomb: (document.getElementById("numeroPlomb")?.value || "").trim(),
    natureMarchandise: (
      document.getElementById("natureMarchandise")?.value || ""
    ).trim(),
    documentation: document.getElementById("documentation").value.trim(),
    incidents: document.getElementById("incidents").value.trim(),
    carburantDepart: parseFloat(
      document.getElementById("carburantDepart").value
    ),
    statut: document.getElementById("statut").value,
    societe: societeSelect?.value || "KIS",
  };

  // Auto-status: if all end-of-journey timestamps are present, mark complete; otherwise, ensure not 'complet'
  const endDatesPresent = !!(
    voyage.clientArrivalTime &&
    voyage.clientDepartureTime &&
    voyage.kribiArrivalDate &&
    voyage.containerPositioningDate
  );
  if (endDatesPresent) {
    if (voyage.statut !== "complet") {
      voyage.statut = "complet";
      showNotification(
        "Statut mis à 'Complet' — fin de voyage détectée",
        "info"
      );
    }
  } else if (voyage.statut === "complet") {
    voyage.statut = "en-cours";
    showNotification(
      "Statut remis à 'En cours' — fin de voyage incomplète",
      "warning"
    );
  }

  const errors = validateVoyage(voyage);
  if (errors.length) {
    showNotification(errors[0], "warning");
    return;
  }

  try {
    if (!canEdit) {
      showNotification("Accès refusé: lecture seule", "error");
      return;
    }
    if (editingId) {
      await voyagesCollection.doc(editingId).update(voyage);
      showNotification("Voyage mis à jour", "success");
    } else {
      await voyagesCollection.add({
        ...voyage,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      showNotification("Voyage enregistré avec succès!", "success");
    }
    voyageForm.reset();
    editingId = null;
    if (submitBtn)
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
  } catch (error) {
    console.error("Erreur d'enregistrement: ", error);
    showNotification("Erreur lors de l'enregistrement", "error");
  }
});

function asDate(val) {
  if (!val) return null;
  try {
    return val.toDate ? val.toDate() : new Date(val);
  } catch {
    return null;
  }
}
// Progressive enhancement: auto distance via Nominatim + OSRM
async function geocodeCity(name) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    name
  )}&limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Geocoding échec");
  const data = await res.json();
  if (!data?.length) throw new Error("Ville introuvable");
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function routeDistanceKm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Itinéraire indisponible");
  const data = await res.json();
  const meters = data?.routes?.[0]?.distance;
  if (!meters) throw new Error("Distance introuvable");
  return Math.round(meters / 1000);
}

async function computeDistanceFromCities() {
  const fromName = (villeDepartInput?.value || "").trim();
  const toName = (destinationInput?.value || "").trim();
  if (!fromName || !toName) {
    showNotification(
      "Entrez 'Ville de départ' et 'Destination' pour calculer la distance",
      "warning"
    );
    return;
  }

  // Cache key normalized to lowercase and trimmed
  const key = `${fromName.toLowerCase()}|${toName.toLowerCase()}`;
  try {
    const cached = localStorage.getItem(`route:${key}`);
    if (cached) {
      const km = parseFloat(cached);
      if (!isNaN(km)) {
        const distanceEl = document.getElementById("distance");
        if (distanceEl) distanceEl.value = String(Math.round(km));
        showNotification(
          `Distance récupérée du cache: ${Math.round(km)} km`,
          "info"
        );
        return;
      }
    }
  } catch {}
  try {
    showLoader();
    const from = await geocodeCity(fromName);
    const to = await geocodeCity(toName);
    const km = await routeDistanceKm(from, to);
    const distanceEl = document.getElementById("distance");
    if (distanceEl) distanceEl.value = String(km);
    try {
      localStorage.setItem(`route:${key}`, String(km));
      // Also cache reverse for convenience
      const rkey = `${toName.toLowerCase()}|${fromName.toLowerCase()}`;
      localStorage.setItem(`route:${rkey}`, String(km));
    } catch {}
    showNotification(`Distance estimée: ${km} km`, "success");
  } catch (e) {
    showNotification(e?.message || "Échec du calcul de distance", "error");
  } finally {
    hideLoader();
  }
}

if (calcDistanceBtn) {
  calcDistanceBtn.addEventListener("click", computeDistanceFromCities);
}

// Open driver report page
if (driverReportBtn) {
  driverReportBtn.addEventListener("click", () => {
    window.location.href = "driver-report.html";
  });
}

function validateVoyage(v) {
  const errs = [];
  if (!v.chauffeur) errs.push("Nom du chauffeur requis");
  if (!v.camion) errs.push("Immatriculation requise");
  if (!isNaN(v.distance) && v.distance < 0) errs.push("Distance invalide");
  if (!isNaN(v.carburantDepart) && v.carburantDepart < 0)
    errs.push("Carburant départ invalide");
  // No 'carburant retour' anymore
  const d1 = asDate(v.dateDepart),
    d2 = asDate(v.clientArrivalTime),
    d3 = asDate(v.clientDepartureTime),
    d4 = asDate(v.kribiArrivalDate),
    d5 = asDate(v.containerPositioningDate);
  // Dates can be filled later; only basic chronological checks if both present
  if (d1 && d2 && d1 > d2) errs.push("Arrivée client avant départ");
  if (d2 && d3 && d2 > d3) errs.push("Départ client avant arrivée");
  if (d3 && d4 && d3 > d4) errs.push("Arrivée Kribi avant départ client");
  if (d4 && d5 && d4 > d5) errs.push("Positionnement du TC vide avant arrivée à Kribi");
  return errs;
}

// Chargement initial des données
// Plus besoin de chargement initial; onSnapshot est la source de vérité

// Rendu du tableau (version corrigée avec délégation d'événements)
function renderTable(data) {
  voyagesTable.innerHTML = "";

  const escapeHTML = (s) => {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  data.forEach((voyage) => {
    const row = document.createElement("tr");

    // Calcul des métriques de performance (basé seulement sur carburant départ)
    const departFuel =
      typeof voyage.carburantDepart === "number" ? voyage.carburantDepart : 0;
    const efficiency =
      departFuel > 0 && (voyage.distance || 0) > 0
        ? ((voyage.distance || 0) / departFuel).toFixed(2)
        : "N/A";

    // Formatage des dates
    const formatDate = (date) => {
      const d = asDate(date);
      return d && !isNaN(d)
        ? d.toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A";
    };

    const destDisplay = (() => {
      const city = escapeHTML(voyage.destination || "");
      const detail = escapeHTML(voyage.destinationDetail || "");
      return detail ? `${city} - ${detail}` : city;
    })();

    row.innerHTML = `
      <td>${escapeHTML(voyage.chauffeur || "")}</td>
      <td>${escapeHTML(voyage.camion || "")}</td>
  <td>${escapeHTML(voyage.numeroOrdreTransport || "")}</td>
      <td>${escapeHTML(voyage.societe || "KIS")}</td>
      <td>${escapeHTML(voyage.villeDepart || "")}</td>
  <td>${destDisplay}</td>
  <td>${escapeHTML(voyage.client || "")}</td>
  <td>${escapeHTML(voyage.natureMarchandise || "")}</td>
            <td>${formatDate(voyage.dateDepart)}</td>
            <td>${formatDate(voyage.clientArrivalTime)}</td>
            <td>${formatDate(voyage.clientDepartureTime)}</td>
            <td>${formatDate(voyage.kribiArrivalDate)}</td>
            <td>
                ${formatDate(voyage.containerPositioningDate)}<br>
        ${escapeHTML(voyage.containerPositioningLocation)}
            </td>
        <td>${escapeHTML(voyage.numeroConteneur || "")}</td>
        <td>${escapeHTML(voyage.numeroPlomb || "")}</td>
            <td>${voyage.distance ?? 0} km</td>
            <td>${voyage.carburantDepart ?? 0} L</td>
            <td class="${getPerformanceClass(efficiency)}">
                ${getPerformanceIcon(efficiency)} ${efficiency} km/L
            </td>
      <td>${escapeHTML(voyage.documentation || "")}</td>
      <td>${escapeHTML(voyage.incidents || "Aucun")}</td>
            <td>${getStatusBadge(voyage.statut)} ${getIncompleteBadge(
      voyage
    )}</td>
            <td>
                <button class="btn-edit" data-id="${voyage.id}">
                    <i class="fas fa-edit"></i> Modifier
                </button>
                <button class="btn-delete" data-id="${voyage.id}">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            </td>
        `;

    voyagesTable.appendChild(row);
  });

  // Hide or show action buttons based on role
  document.querySelectorAll(".btn-edit, .btn-delete").forEach((btn) => {
    btn.style.display = canEdit ? "inline-flex" : "none";
  });
  // Ensure the table scroll starts at the left edge after render
  const container = document.querySelector(".table-container");
  if (container) container.scrollLeft = 0;

  // Apply column visibility based on toggles (1-based indexes)
  const table = document.getElementById("voyagesTable");
  if (table) {
    const showPerf = togglePerformance?.checked !== false;
    const showDocs = toggleDocs?.checked !== false;
    const showInc = toggleIncidents?.checked !== false;
    const hideShow = (i, show) => {
      table
        .querySelectorAll(`thead th:nth-child(${i}), tbody td:nth-child(${i})`)
        .forEach((cell) => (cell.style.display = show ? "" : "none"));
    };
    // After adding Ville départ, Client, Nature, N° conteneur, N° plomb
    // Performance=18, Documentation=19, Incidents=20
    hideShow(18, showPerf);
    hideShow(19, showDocs);
    hideShow(20, showInc);
  }
}

// Fonction pour les badges de statut
function getStatusBadge(status) {
  switch (status) {
    case "complet":
      return '<span class="status-badge success">Complet</span>';
    case "en-cours":
      return '<span class="status-badge warning">En cours</span>';
    case "retard":
      return '<span class="status-badge danger">Retard</span>';
    case "annule":
      return '<span class="status-badge secondary">Annulé</span>';
    default:
      return status;
  }
}

// Classe de performance
function getPerformanceClass(efficiency) {
  if (efficiency === "N/A") return "";
  const eff = parseFloat(efficiency);
  if (eff > 5) return "performance-good";
  if (eff > 3) return "performance-medium";
  return "performance-bad";
}

// Icône de performance
function getPerformanceIcon(efficiency) {
  if (efficiency === "N/A") return "";
  const eff = parseFloat(efficiency);
  if (eff > 5) return '<i class="fas fa-check-circle"></i>';
  if (eff > 3) return '<i class="fas fa-exclamation-circle"></i>';
  return '<i class="fas fa-times-circle"></i>';
}

function getIncompleteBadge(v) {
  const d2 = asDate(v.clientArrivalTime);
  const d3 = asDate(v.clientDepartureTime);
  const d4 = asDate(v.kribiArrivalDate);
  const d5 = asDate(v.containerPositioningDate);
  const missingEndData = !(d2 && d3 && d4 && d5);
  if (missingEndData && v.statut !== "annule") {
    return '<span class="status-badge warning" style="margin-left:6px">Incomplet</span>';
  }
  return "";
}

// Calcul des statistiques
function calculateStats() {
  // Comptage des voyages
  voyageCountSpan.textContent = `${allVoyages.length} voyages`;

  // Calcul de l'efficacité moyenne
  let totalEfficiency = 0;
  let count = 0;

  allVoyages.forEach((voyage) => {
    const dep =
      typeof voyage.carburantDepart === "number" ? voyage.carburantDepart : 0;
    if (dep > 0 && (voyage.distance || 0) > 0) {
      totalEfficiency += (voyage.distance || 0) / dep;
      count++;
    }
  });

  const avgEff = count > 0 ? (totalEfficiency / count).toFixed(2) : 0;
  avgEfficiencySpan.textContent = `Efficacité: ${avgEff} km/L`;

  // Statistiques par chauffeur
  driverStats = {};
  allVoyages.forEach((voyage) => {
    const driver = voyage.chauffeur;
    if (!driverStats[driver]) {
      driverStats[driver] = {
        count: 0,
        totalDistance: 0,
        totalFuelUsed: 0,
        totalHours: 0,
        incidents: 0,
      };
    }

    driverStats[driver].count++;
    driverStats[driver].totalDistance += voyage.distance || 0;

    const dep =
      typeof voyage.carburantDepart === "number" ? voyage.carburantDepart : 0;
    if (dep > 0) {
      driverStats[driver].totalFuelUsed += dep;
    }

    const durationHours = calculateDurationHours(
      voyage.dateDepart,
      voyage.kribiArrivalDate
    );
    if (durationHours > 0) {
      driverStats[driver].totalHours += durationHours;
    }

    if (voyage.incidents) {
      driverStats[driver].incidents++;
    }
  });
}

// Calcul de la durée en heures
function calculateDurationHours(start, end) {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!(startDate && endDate)) return 0;
  return (endDate - startDate) / (1000 * 60 * 60);
}

// Recherche (debounced)
let __searchDebounce;
searchInput.addEventListener("input", () => {
  if (__searchDebounce) clearTimeout(__searchDebounce);
  __searchDebounce = setTimeout(() => {
    applyFilters();
    persistFilters();
  }, 200);
});

// Filtrage par temps
function persistFilters() {
  try {
    localStorage.setItem(
      "kis:filters",
      JSON.stringify({
        filterSelect: filterSelect.value,
        timeFilter: timeFilter.value,
        companyFilter: companyFilter.value,
        statusFilter: statusFilter.value,
        incompleteOnly: !!incompleteOnly?.checked,
        search: searchInput.value,
        cols: {
          performance: togglePerformance?.checked,
          docs: toggleDocs?.checked,
          incidents: toggleIncidents?.checked,
        },
      })
    );
  } catch {}
}

timeFilter.addEventListener("change", () => {
  applyFilters();
  persistFilters();
});
companyFilter.addEventListener("change", () => {
  applyFilters();
  persistFilters();
});
statusFilter.addEventListener("change", () => {
  applyFilters();
  persistFilters();
});
if (incompleteOnly)
  incompleteOnly.addEventListener("change", () => {
    applyFilters();
    persistFilters();
  });
// Column toggles
if (togglePerformance)
  togglePerformance.addEventListener("change", () => {
    applyFilters();
    persistFilters();
  });
if (toggleDocs)
  toggleDocs.addEventListener("change", () => {
    applyFilters();
    persistFilters();
  });
if (toggleIncidents)
  toggleIncidents.addEventListener("change", () => {
    applyFilters();
    persistFilters();
  });

// Mobile: toggle filters visibility
const toggleFiltersBtn = document.getElementById("toggleFiltersBtn");
const filtersWrap = document.getElementById("filtersWrap");
if (toggleFiltersBtn && filtersWrap) {
  toggleFiltersBtn.addEventListener("click", () => {
    const expanded = toggleFiltersBtn.getAttribute("aria-expanded") === "true";
    toggleFiltersBtn.setAttribute("aria-expanded", (!expanded).toString());
    const hidden = filtersWrap.getAttribute("aria-hidden") === "true";
    filtersWrap.setAttribute("aria-hidden", hidden ? "false" : "true");
  });
  // Ensure filters visible when resizing back to desktop
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      filtersWrap.setAttribute("aria-hidden", "false");
      toggleFiltersBtn.setAttribute("aria-expanded", "true");
    }
  });
}

function applyFilters() {
  const now = new Date();
  const term = (searchInput.value || "").toLowerCase();
  let filtered = allVoyages.filter((v) => {
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
      companyFilter.value === "all" ||
      (v.societe || "KIS") === companyFilter.value;
    const statusOk =
      statusFilter.value === "all" || v.statut === statusFilter.value;

    let timeOk = true;
    const d = asDate(v.dateDepart);
    if (timeFilter.value === "today") {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      timeOk = d ? d >= todayStart : false;
    } else if (timeFilter.value === "week") {
      const weekStart = new Date(now);
      const day = weekStart.getDay() || 7; // Monday as 1
      weekStart.setDate(weekStart.getDate() - (day - 1));
      weekStart.setHours(0, 0, 0, 0);
      timeOk = d ? d >= weekStart : false;
    } else if (timeFilter.value === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      timeOk = d ? d >= monthStart : false;
    }

    // Incomplete-only logic: end-of-journey fields missing
    const d2 = asDate(v.clientArrivalTime);
    const d3 = asDate(v.clientDepartureTime);
    const d4 = asDate(v.kribiArrivalDate);
    const d5 = asDate(v.containerPositioningDate);
    const missingEndData = !(d2 && d3 && d4 && d5);

    const incompleteOk = !incompleteOnly?.checked || missingEndData;

    return matchesSearch && companyOk && statusOk && timeOk && incompleteOk;
  });

  renderTable(filtered);
}

// Tri des données
filterSelect.addEventListener("change", () => {
  if (filterSelect.value === "performance") {
    sortByPerformance();
  } else {
    currentSortField = filterSelect.value;
    sortData();
  }
});

// Fonction de tri standard
function sortData() {
  const ascending = currentSortField === lastSortField ? !isAscending : true;
  const sorted = [...allVoyages].sort((a, b) => {
    let valA = a[currentSortField];
    let valB = b[currentSortField];

    // Pour les dates
    const dA = asDate(valA);
    const dB = asDate(valB);
    if (dA || dB) {
      const tA = dA ? dA.getTime() : 0;
      const tB = dB ? dB.getTime() : 0;
      return ascending ? tA - tB : tB - tA;
    }

    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();

    if (valA < valB) return ascending ? -1 : 1;
    if (valA > valB) return ascending ? 1 : -1;
    return 0;
  });

  renderTable(sorted);
  isAscending = ascending;
  lastSortField = currentSortField;
}

// Tri par performance
function sortByPerformance() {
  const sorted = [...allVoyages].sort((a, b) => {
    const ea = efficiencyOf(a) || 0;
    const eb = efficiencyOf(b) || 0;
    return eb - ea;
  });

  renderTable(sorted);
}

// Modification d'un voyage
async function editVoyage(id) {
  try {
    const doc = await voyagesCollection.doc(id).get();
    if (doc.exists) {
      const data = doc.data();

      // Remplir le formulaire
      document.getElementById("chauffeur").value = data.chauffeur;
      document.getElementById("camion").value = data.camion;
      document.getElementById("destination").value = data.destination;
      if (destinationDetailInput)
        destinationDetailInput.value = data.destinationDetail || "";
      if (villeDepartInput) {
        villeDepartInput.value = data.villeDepart || "Kribi";
      }
      const clientEl = document.getElementById("client");
      if (clientEl) clientEl.value = data.client || "";
      document.getElementById("distance").value = data.distance || "";
      document.getElementById("dateDepart").value = formatDateForInput(
        data.dateDepart
      );
      document.getElementById("clientArrivalTime").value = formatDateForInput(
        data.clientArrivalTime
      );
      document.getElementById("clientDepartureTime").value = formatDateForInput(
        data.clientDepartureTime
      );
      document.getElementById("kribiArrivalDate").value = formatDateForInput(
        data.kribiArrivalDate
      );
      document.getElementById("containerPositioningDate").value =
        formatDateForInput(data.containerPositioningDate);
      document.getElementById("containerPositioningLocation").value =
        data.containerPositioningLocation || "";
      const numeroConteneurEl = document.getElementById("numeroConteneur");
      if (numeroConteneurEl)
        numeroConteneurEl.value = data.numeroConteneur || "";
      const numeroPlombEl = document.getElementById("numeroPlomb");
      if (numeroPlombEl) numeroPlombEl.value = data.numeroPlomb || "";
      const natureEl = document.getElementById("natureMarchandise");
      if (natureEl) natureEl.value = data.natureMarchandise || "";
      document.getElementById("documentation").value = data.documentation || "";
      document.getElementById("incidents").value = data.incidents || "";
      document.getElementById("carburantDepart").value = data.carburantDepart;
      // No 'carburant retour' field anymore
      document.getElementById("statut").value = data.statut || "complet";
      if (societeSelect) societeSelect.value = data.societe || "KIS";
      editingId = id;
      if (submitBtn)
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Mettre à jour';
      showNotification("Voyage chargé pour modification", "info");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    console.error("Erreur de modification: ", error);
  }
}

// Formatage de date pour input
function formatDateForInput(date) {
  if (!date) return "";
  const d = date.toDate ? date.toDate() : new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

// Suppression d'un voyage
async function deleteVoyage(id) {
  if (!canEdit) {
    showNotification("Accès refusé: lecture seule", "error");
    return;
  }
  if (confirm("Êtes-vous sûr de vouloir supprimer ce voyage?")) {
    try {
      await voyagesCollection.doc(id).delete();
      showNotification("Voyage supprimé avec succès", "success");
    } catch (error) {
      console.error("Erreur de suppression: ", error);
      showNotification("Erreur lors de la suppression", "error");
    }
  }
}

// Export Excel
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    // If already loaded, resolve immediately
    if (document.querySelector(`script[data-src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.setAttribute("data-src", src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Échec de chargement: ${src}`));
    document.head.appendChild(s);
  });
}

async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  // Try primary CDN, then fallback
  const primary =
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const fallback =
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  try {
    await loadScriptOnce(primary);
  } catch (e) {
    try {
      await loadScriptOnce(fallback);
    } catch (e2) {
      throw e2;
    }
  }
  return window.XLSX;
}

exportExcelBtn.addEventListener("click", async () => {
  try {
    showNotification("Génération Excel…", "info");
    const XLSX = await loadXLSX();

    // Use current filtered view rather than refetching from Firestore
    const voyages = computeFilteredVoyages();
    const rows = voyages.map((v) => {
      const destCombined = v.destinationDetail
        ? `${v.destination || ""} - ${v.destinationDetail}`
        : v.destination || "";
      const depart =
        typeof v.carburantDepart === "number" ? v.carburantDepart : 0;
      const efficiency =
        depart > 0 && (v.distance || 0) > 0
          ? ((v.distance || 0) / depart).toFixed(2)
          : "N/A";
      return [
        v.numeroOrdreTransport || "",
        v.chauffeur || "",
        v.camion || "",
        v.societe || "KIS",
        v.villeDepart || "",
        destCombined,
        formatDateForPDF(v.dateDepart),
        formatDateForPDF(v.clientArrivalTime),
        formatDateForPDF(v.clientDepartureTime),
        formatDateForPDF(v.kribiArrivalDate),
        `${formatDateForPDF(v.containerPositioningDate)} à ${
          v.containerPositioningLocation || ""
        }`,
        Number(v.distance || 0),
        Number(v.carburantDepart ?? 0),
        efficiency,
        (v.documentation || "").trim(),
        (v.incidents || "").trim(),
        v.statut || "complet",
      ];
    });

    const header = [
      [
        "N° ordre",
        "Chauffeur",
        "Camion",
        "Société",
        "Ville de départ",
        "Destination",
        "Date départ",
        "Heure arrivée client",
        "Heure départ client",
        "Arrivée Kribi",
  "Positionnement du TC vide",
        "Distance",
        "Carburant départ (L)",
        "Efficacité (km/L)",
        "Documentation",
        "Incidents",
        "Statut",
      ],
    ];
    const context = [
      [`Période: ${periodText()}`],
      [`Généré le: ${new Date().toLocaleString("fr-FR")}`],
      [],
    ];
    const aoa = [...context, ...header, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    // Sheet names must not contain : \ / ? * [ ] and must be <= 31 chars
    XLSX.utils.book_append_sheet(wb, ws, "Voyages KIS-UTA");

    if (XLSX.writeFile) {
      XLSX.writeFile(wb, "rapport_voyages_kis_uta.xlsx");
    } else {
      // Fallback: binary string -> blob -> download
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rapport_voyages_kis_uta.xlsx";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    }

    showNotification("Export Excel généré", "success");
  } catch (error) {
    console.error("Erreur d'export Excel: ", error);
    showNotification(
      "Erreur d'export Excel: " + (error?.message || String(error)),
      "error"
    );
  }
});

// Export PDF (legacy) removed and replaced by a professional report below

// Formatage de date pour PDF
function formatDateForPDF(date) {
  const d = asDate(date);
  if (!d || isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------- Helpers for PDF Export -----------------
function computeFilteredVoyages() {
  const now = new Date();
  const term = (searchInput.value || "").toLowerCase();
  let filtered = allVoyages.filter((v) => {
    const matchesSearch =
      !term ||
      (v.chauffeur || "").toLowerCase().includes(term) ||
      (v.camion || "").toLowerCase().includes(term) ||
      (v.destination || "").toLowerCase().includes(term) ||
      (v.destinationDetail || "").toLowerCase().includes(term) ||
      (v.natureMarchandise || "").toLowerCase().includes(term) ||
      (v.numeroConteneur || "").toLowerCase().includes(term) ||
      (v.numeroPlomb || "").toLowerCase().includes(term) ||
      (v.documentation || "").toLowerCase().includes(term) ||
      (v.containerPositioningLocation || "").toLowerCase().includes(term) ||
      (v.societe || "").toLowerCase().includes(term);

    const companyOk =
      companyFilter.value === "all" ||
      (v.societe || "KIS") === companyFilter.value;
    const statusOk =
      statusFilter.value === "all" || v.statut === statusFilter.value;

    let timeOk = true;
    const d = asDate(v.dateDepart);
    if (timeFilter.value === "today") {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      timeOk = d ? d >= todayStart : false;
    } else if (timeFilter.value === "week") {
      const weekStart = new Date(now);
      const day = weekStart.getDay() || 7; // Monday as 1
      weekStart.setDate(weekStart.getDate() - (day - 1));
      weekStart.setHours(0, 0, 0, 0);
      timeOk = d ? d >= weekStart : false;
    } else if (timeFilter.value === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      timeOk = d ? d >= monthStart : false;
    }

    return matchesSearch && companyOk && statusOk && timeOk;
  });

  // Sort by current sort
  const field = filterSelect.value;
  if (field === "performance") {
    filtered.sort((a, b) => {
      const ea = efficiencyOf(a) || 0;
      const eb = efficiencyOf(b) || 0;
      return eb - ea;
    });
  } else {
    filtered.sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      const da = asDate(va);
      const dbt = asDate(vb);
      if (da || dbt) return (dbt?.getTime() || 0) - (da?.getTime() || 0);
      if ((va || "") < (vb || "")) return -1;
      if ((va || "") > (vb || "")) return 1;
      return 0;
    });
  }
  return filtered;
}

function sum(arr, sel) {
  return arr.reduce((acc, x) => acc + (sel(x) || 0), 0);
}
function formatNumber(n) {
  try {
    return new Intl.NumberFormat("fr-FR").format(n);
  } catch {
    return String(n);
  }
}
function efficiencyOf(v) {
  const depart =
    typeof v.carburantDepart === "number" ? v.carburantDepart : null;
  if (depart == null || depart <= 0 || !(v.distance > 0)) return null;
  // With only depart available, treat depart as fuel used for the trip
  return v.distance / depart;
}
function statusCounts(vs) {
  return vs.reduce((m, v) => {
    m[v.statut || "complet"] = (m[v.statut || "complet"] || 0) + 1;
    return m;
  }, {});
}
function groupByCompany(vs) {
  return vs.reduce((m, v) => {
    const k = v.societe || "KIS";
    (m[k] || (m[k] = [])).push(v);
    return m;
  }, {});
}

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

// Return a human-readable period string based on current UI filters
function periodText() {
  try {
    const now = new Date();
    const val = timeFilter?.value || "all";
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
  } catch {
    return "Période inconnue";
  }
}

// Add a centered page footer with page numbers and date
function addFooter(doc) {
  try {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      const text = `KIS & UTA — ${new Date().toLocaleDateString(
        "fr-FR"
      )} — Page ${i}/${pageCount}`;
      doc.text(text, width / 2, height - 6, { align: "center" });
    }
  } catch (e) {
    // fail-soft
  }
}

// Export PDF (professional multi-section report)
async function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf;
  await import(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  );
  await import(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js"
  );
  return window.jspdf;
}

exportPDFBtn.addEventListener("click", async () => {
  try {
    const { jsPDF } = await loadJsPDF();
    const doc = new jsPDF("p", "mm", "a4");
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 14;
    const primary = [26, 58, 108]; // #1a3a6c
    const secondary = [44, 90, 160]; // #2c5aa0
    const accent = [255, 107, 0]; // #ff6b00 (UTA color)

    const voyages = computeFilteredVoyages();
    const totalTrips = voyages.length;
    const totalDistance = sum(voyages, (v) => v.distance || 0);
    const effVals = voyages.map(efficiencyOf).filter((x) => x);
    const avgEff = effVals.length
      ? effVals.reduce((a, b) => a + b, 0) / effVals.length
      : 0;
    const incidentCount = voyages.reduce(
      (acc, v) => acc + ((v.incidents || "").trim() ? 1 : 0),
      0
    );
    const activeTrucks =
      (parseInt(activeTrucksSpanKIS?.textContent || "0", 10) || 0) +
      (parseInt(activeTrucksSpanUTA?.textContent || "0", 10) || 0);
    const stats = statusCounts(voyages);

    const kisLogo = await loadImageAsDataURL("img/logo.jpg");
    const utaLogo = await loadImageAsDataURL("img/uta-logo.jpg");

    // 1) Cover page
    // Header band
    doc.setFillColor(secondary[0], secondary[1], secondary[2]);
    doc.rect(0, 0, width, 30, "F");

    // Logos
    let logoY = 8;
    if (kisLogo) doc.addImage(kisLogo, "JPEG", margin, logoY, 24, 14);
    if (utaLogo)
      doc.addImage(utaLogo, "JPEG", width - margin - 24, logoY, 24, 14);

    // Title
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Rapport des Transports", width / 2, 50, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text("Kribi Inland Services & UTA Cameroun SA", width / 2, 58, {
      align: "center",
    });

    // Meta
    const metaY = 75;
    doc.setTextColor(30);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString("fr-FR")}`, margin, metaY);
    doc.text(`Période: ${periodText()}`, margin, metaY + 6);
    const author = userNameSpan?.textContent || "Utilisateur";
    const role = userRoleSpan?.textContent || "";
    doc.text(`Généré par: ${author} • ${role}`, margin, metaY + 12);

    // Summary panel (organized grid)
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primary[0], primary[1], primary[2]);
    const sumTitleY = metaY + 18;
    doc.setFontSize(12);
    doc.text("Résumé", margin, sumTitleY);

    // Panel
    const panelY = sumTitleY + 4;
    const numCols = 3;
    const colGap = 8;
    const cardH = 24;
    const cardW = (width - margin * 2 - (numCols - 1) * colGap) / numCols;
    const rowGap = 8;
    const innerPad = 10;
    const chipsH = 14;
    const panelH = innerPad + cardH * 2 + rowGap + chipsH + innerPad;
    doc.setDrawColor(225);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(
      margin - 1.5,
      panelY,
      width - 2 * margin + 3,
      panelH,
      4,
      4,
      "F"
    );

    // Local number formatter for cover (no grouping to avoid PDF spacing issues)
    const formatPlainNumber = (n, decimals = 0) => {
      try {
        const val = Number(n);
        if (!isFinite(val)) return decimals ? Number(0).toFixed(decimals) : "0";
        return new Intl.NumberFormat("fr-FR", {
          useGrouping: false,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(val);
      } catch {
        return decimals
          ? Number(n || 0).toFixed(decimals)
          : String(Math.round(n || 0));
      }
    };

    function drawKpi(x, y, title, value, color) {
      doc.setDrawColor(240);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardW, cardH, 3, 3, "F");
      // Accent bar
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x, y, 3.5, cardH, 3, 3, "F");
      // Text
      doc.setTextColor(120);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(title, x + 7.5, y + 8);
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(String(value), x + 7.5, y + 16);
    }

    function drawChip(x, y, label, bg) {
      const padX = 3.5;
      const padY = 2.2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const w = doc.getTextWidth(label) + padX * 2;
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.roundedRect(x, y - 5.5, w, 9.5, 2, 2, "F");
      const textColor = bg[0] > 200 && bg[1] > 200 && bg[2] > 200 ? 0 : 255;
      doc.setTextColor(textColor);
      doc.text(label, x + padX, y + 1.2);
      return w;
    }

    const gridY = panelY + innerPad;
    const row1Y = gridY;
    const row2Y = row1Y + cardH + rowGap;
    const colX = (i) => margin + i * (cardW + colGap);

    // Row 1
    drawKpi(
      colX(0),
      row1Y,
      "Total voyages",
      formatPlainNumber(totalTrips, 0),
      secondary
    );
    drawKpi(
      colX(1),
      row1Y,
      "Distance totale",
      `${formatPlainNumber(totalDistance, 0)} km`,
      secondary
    );
    drawKpi(
      colX(2),
      row1Y,
      "Efficacité moyenne",
      avgEff ? `${formatPlainNumber(avgEff, 2)} km/L` : "N/A",
      secondary
    );

    // Row 2 (incidents removed; add average distance)
    drawKpi(colX(0), row2Y, "Camions actifs", String(activeTrucks), secondary);
    const avgDistance = totalTrips ? totalDistance / totalTrips : 0;
    drawKpi(
      colX(1),
      row2Y,
      "Distance moyenne/voyage",
      `${formatPlainNumber(avgDistance, 0)} km`,
      secondary
    );
    // Third KPI: Consommation moyenne (L/100 km)
    const totalFuelUsed = voyages.reduce((acc, v) => {
      const fu = Number(v.carburantDepart ?? 0);
      return fu > 0 ? acc + fu : acc;
    }, 0);
    const avgConsLPer100 =
      totalDistance > 0 && totalFuelUsed > 0
        ? (totalFuelUsed / totalDistance) * 100
        : 0;
    drawKpi(
      colX(2),
      row2Y,
      "Consommation moyenne (L/100 km)",
      `${formatPlainNumber(avgConsLPer100, 2)} L/100 km`,
      secondary
    );

    // Status chips under grid
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80);
    // Centered status chips under grid
    const captionY = row2Y + cardH + 6;
    doc.text("Répartition des statuts:", margin, captionY);
    const padXForChip = 3.5; // must match drawChip padding
    const chipGap = 6;
    const chipLabels = [
      { label: `Complet: ${stats["complet"] || 0}`, bg: [40, 167, 69] },
      { label: `En cours: ${stats["en-cours"] || 0}`, bg: [255, 193, 7] },
      { label: `Retard: ${stats["retard"] || 0}`, bg: [220, 53, 69] },
      { label: `Annulé: ${stats["annule"] || 0}`, bg: [108, 117, 125] },
    ];
    const chipsTotalWidth =
      chipLabels.reduce(
        (sum, c) => sum + doc.getTextWidth(c.label) + padXForChip * 2,
        0
      ) +
      chipGap * (chipLabels.length - 1);
    let chipX = Math.max(margin + 2, (width - chipsTotalWidth) / 2);
    const chipY = row2Y + cardH + 12;
    chipLabels.forEach((c) => {
      const w = drawChip(chipX, chipY, c.label, c.bg);
      chipX += w + chipGap;
    });

    // Watermark if filters/search active
    const filtersActive =
      timeFilter?.value !== "all" ||
      statusFilter?.value !== "all" ||
      companyFilter?.value !== "all" ||
      (searchInput?.value || "").trim() !== "";
    if (filtersActive) {
      doc.setTextColor(230);
      doc.setFontSize(42);
      doc.text("FILTRÉ", width / 2, height / 2, { angle: 45, align: "center" });
      doc.setTextColor(20);
    }

    // 2) Per-company tables
    const grouped = groupByCompany(voyages);
    const companies = Object.keys(grouped);
    if (companies.length) doc.addPage();

    for (let idx = 0; idx < companies.length; idx++) {
      const comp = companies[idx];
      const rows = grouped[comp];
      const color = comp === "UTA" ? accent : secondary;

      // Section header
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(0, 0, width, 18, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`${comp} — ${rows.length} voyages`, margin, 12);

      // Build table
      const tableBody = rows.map((v) => {
        const fu = Number(v.carburantDepart ?? 0);
        const destCombined = v.destinationDetail
          ? `${v.destination || ""} - ${v.destinationDetail}`
          : v.destination || "";
        return [
          formatDateForPDF(v.dateDepart),
          v.chauffeur || "",
          v.camion || "",
          v.numeroOrdreTransport || "",
          v.client || "",
          destCombined,
          v.natureMarchandise || "",
          v.distance || 0,
          fu > 0 ? fu.toFixed(1) : 0,
          v.statut || "complet",
        ];
      });

      doc.autoTable({
        startY: 24,
        head: [
          [
            "Départ",
            "Chauffeur",
            "Camion",
            "N° ordre",
            "Client",
            "Destination",
            "Marchandises",
            "Distance",
            "Carburant (L)",
            "Statut",
          ],
        ],
        body: tableBody,
        theme: "grid",
        headStyles: {
          fillColor: color,
          fontStyle: "bold",
          fontSize: 9,
          cellPadding: 2,
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: "middle",
          overflow: "linebreak",
          lineWidth: 0.1,
        },
        columnStyles: {
          0: { cellWidth: 22 }, // Départ
          1: { cellWidth: 20 }, // Chauffeur
          2: { cellWidth: 16 }, // Camion
          3: { cellWidth: 18 }, // N° ordre
          4: { cellWidth: 24 }, // Client
          5: { cellWidth: 28 }, // Destination
          6: { cellWidth: 26 }, // Marchandises
          7: { cellWidth: 15, halign: "right" }, // Distance
          8: { cellWidth: 16, halign: "right" }, // Carburant
          9: { cellWidth: 16, halign: "center" }, // Statut
        },
        // Center the table horizontally and keep within margins
        halign: "center",
        tableWidth: "wrap",
        margin: { left: margin, right: margin, top: 24 },
        willDrawCell: (data) => {
          // Color status chips in last column
          if (data.section === "body" && data.column.index === 9) {
            const s = String(data.cell.raw);
            let bg = [230, 230, 230];
            if (s === "complet") bg = [40, 167, 69];
            else if (s === "en-cours") bg = [255, 193, 7];
            else if (s === "retard") bg = [220, 53, 69];
            else if (s === "annule") bg = [108, 117, 125];
            doc.setFillColor(...bg);
            const { x, y, width: w, height: h } = data.cell;
            doc.roundedRect(x + 1, y + 1.2, w - 2, h - 2.4, 2, 2, "F");
            doc.setTextColor(bg[0] > 200 ? 0 : 255);
          }
        },
      });

      // Add a new page between companies, except after last
      if (idx < companies.length - 1) doc.addPage();
    }

    // 3) Annex: details and incidents
    if (voyages.length) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primary[0], primary[1], primary[2]);
      doc.setFontSize(14);
      doc.text("Annexes — Détails & Incidents", margin, 20);
      // Quick table for Villes to fit on page width
      try {
        const annexRows = voyages.map((v, i) => [
          i + 1,
          v.villeDepart || "",
          v.destinationDetail
            ? `${v.destination || ""} - ${v.destinationDetail}`
            : v.destination || "",
          v.distance || 0,
        ]);
        doc.autoTable({
          startY: 26,
          head: [["#", "Ville départ", "Destination", "Distance"]],
          body: annexRows,
          theme: "grid",
          headStyles: {
            fillColor: [230, 230, 230],
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: 1.5,
          },
          styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
          columnStyles: {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 40 },
            2: { cellWidth: 60 },
            3: { cellWidth: 16, halign: "right" },
          },
          halign: "center",
          tableWidth: "wrap",
          margin: { left: margin, right: margin },
        });
      } catch {}

      // Additional annex: Marchandises & Conteneurs (compact)
      try {
        const yStart = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 26) + 6;
        const cargoRows = voyages.map((v, i) => [
          i + 1,
          v.natureMarchandise || "",
          v.numeroConteneur || "",
          v.numeroPlomb || "",
        ]);
        // Title
        doc.setTextColor(primary[0], primary[1], primary[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Annexe — Marchandises & Conteneurs", margin, yStart);
        doc.autoTable({
          startY: yStart + 4,
          head: [["#", "Nature marchandise", "N° conteneur", "N° plomb"]],
          body: cargoRows,
          theme: "grid",
          headStyles: {
            fillColor: [230, 230, 230],
            fontStyle: "bold",
            fontSize: 8,
            cellPadding: 1.5,
          },
          styles: { fontSize: 7.2, cellPadding: 1.5, overflow: "linebreak" },
          columnStyles: {
            0: { cellWidth: 8, halign: "center" },
            1: { cellWidth: 70 },
            2: { cellWidth: 30 },
            3: { cellWidth: 24 },
          },
          halign: "center",
          tableWidth: "wrap",
          margin: { left: margin, right: margin },
        });
      } catch {}
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
      doc.setFontSize(10);

      let y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : 28;
      voyages.forEach((v, i) => {
        const header = `${i + 1}. ${v.chauffeur || ""} — ${v.camion || ""} (${
          v.destinationDetail
            ? `${v.destination || ""} - ${v.destinationDetail}`
            : v.destination || ""
        })`;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40);
        if (y > height - 30) {
          doc.addPage();
          y = margin;
        }
        doc.text(header, margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60);
        const lines1 = doc.splitTextToSize(
          `Dates: Départ ${formatDateForPDF(
            v.dateDepart
          )} • Arrivée client ${formatDateForPDF(
            v.clientArrivalTime
          )} • Départ client ${formatDateForPDF(
            v.clientDepartureTime
          )} • Arrivée Kribi ${formatDateForPDF(
            v.kribiArrivalDate
          )} • Positionnement du TC vide ${formatDateForPDF(
            v.containerPositioningDate
          )} à ${v.containerPositioningLocation || ""}`,
          width - margin * 2
        );
        lines1.forEach((ln) => {
          if (y > height - 20) {
            doc.addPage();
            y = margin;
          }
          doc.text(ln, margin, y);
          y += 5;
        });
        const docu = v.documentation || "Aucune documentation";
        const inc = v.incidents || "Aucun incident";
        const lines2 = doc.splitTextToSize(
          `Documentation: ${docu}`,
          width - margin * 2
        );
        lines2.forEach((ln) => {
          if (y > height - 20) {
            doc.addPage();
            y = margin;
          }
          doc.text(ln, margin, y);
          y += 5;
        });
        const lines3 = doc.splitTextToSize(
          `Incidents: ${inc}`,
          width - margin * 2
        );
        lines3.forEach((ln) => {
          if (y > height - 20) {
            doc.addPage();
            y = margin;
          }
          doc.text(ln, margin, y);
          y += 5;
        });
        y += 4;
        doc.setDrawColor(230);
        doc.line(margin, y, width - margin, y);
        y += 6;
      });
    }

    // Signature blocks page
    if (voyages.length) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Signatures", margin, 24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const sy = 40;
      doc.text("Préparé par:", margin, sy);
      doc.text("Approuvé par:", width / 2 + 10, sy);
      doc.setDrawColor(170);
      doc.line(margin, sy + 18, width / 2 - 20, sy + 18);
      doc.line(width / 2 + 10, sy + 18, width - margin, sy + 18);
      doc.text(
        `Date: ${new Date().toLocaleDateString("fr-FR")}`,
        margin,
        sy + 26
      );
    }

    // Footer on all pages
    addFooter(doc);

    doc.save("rapport_voyages_kis_uta.pdf");
    showNotification("PDF généré avec succès", "success");
  } catch (error) {
    console.error("Erreur d'export PDF:", error);
    showNotification(
      "Erreur lors de la génération du PDF: " + error.message,
      "error"
    );
  }
});

// ---------------- Subscriptions and bootstrapping -----------------

function subscribeSettings() {
  try {
    settingsDocRef.onSnapshot(
      (doc) => {
        const data = doc.exists ? doc.data() : null;
        // Support legacy single field activeTrucks and new per-company fields
        const kis =
          (data && typeof data.activeTrucksKIS === "number"
            ? data.activeTrucksKIS
            : typeof data?.activeTrucks === "number"
            ? data.activeTrucks
            : 0) || 0;
        const uta =
          (data && typeof data.activeTrucksUTA === "number"
            ? data.activeTrucksUTA
            : 0) || 0;
        if (activeTrucksSpanKIS) activeTrucksSpanKIS.textContent = String(kis);
        if (activeTrucksSpanUTA) activeTrucksSpanUTA.textContent = String(uta);
        if (!initialSettingsLoaded) {
          initialSettingsLoaded = true;
          maybeHideLoader();
        }
      },
      (err) => {
        console.error("Erreur chargement paramètres:", err);
        if (!initialSettingsLoaded) {
          initialSettingsLoaded = true;
          maybeHideLoader();
        }
      }
    );
  } catch (e) {
    console.error("subscribeSettings() échec:", e);
    if (!initialSettingsLoaded) {
      initialSettingsLoaded = true;
      maybeHideLoader();
    }
  }
}

function subscribeVoyages() {
  const handleSnapshot = (snapshot) => {
    try {
      allVoyages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Render and stats via existing helpers
      applyFilters();
      calculateStats();
      // Update last update date
      if (lastUpdateSpan) {
        const now = new Date();
        lastUpdateSpan.textContent = now.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }
    } finally {
      if (!initialVoyagesLoaded) {
        initialVoyagesLoaded = true;
        maybeHideLoader();
      }
    }
  };

  // Primary: order by createdAt desc
  try {
    voyagesCollection
      .orderBy("createdAt", "desc")
      .onSnapshot(handleSnapshot, (err) => {
        console.warn(
          "orderBy(createdAt) indisponible, fallback:",
          err?.code || err
        );
        // Fallback without orderBy
        voyagesCollection.onSnapshot(handleSnapshot, (e2) => {
          console.error("Erreur onSnapshot voyages:", e2);
          if (!initialVoyagesLoaded) {
            initialVoyagesLoaded = true;
            maybeHideLoader();
          }
        });
      });
  } catch (e) {
    console.warn("onSnapshot primary query failed, fallback:", e);
    voyagesCollection.onSnapshot(handleSnapshot, (e2) => {
      console.error("Erreur onSnapshot voyages:", e2);
      if (!initialVoyagesLoaded) {
        initialVoyagesLoaded = true;
        maybeHideLoader();
      }
    });
  }
}

// Delegated actions for edit/delete in table
if (voyagesTable) {
  voyagesTable.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains("btn-edit")) {
      if (id) editVoyage(id);
    } else if (btn.classList.contains("btn-delete")) {
      if (id) deleteVoyage(id);
    }
  });
}

// Analytics button
if (openAnalyticsBtn) {
  openAnalyticsBtn.addEventListener("click", () => {
    try {
      window.location.href = "analytics.html";
    } catch {
      /* ignore */
    }
  });
}

// Open pre-alertes tracking page
if (openPreAlertesBtn) {
  openPreAlertesBtn.addEventListener("click", () => {
    try {
      window.location.href = "pre-alertes.html";
    } catch {
      /* ignore */
    }
  });
}

// Safety: hide loader after 6s even if snapshots fail
setTimeout(() => {
  if (!(initialVoyagesLoaded && initialSettingsLoaded)) {
    hideLoader();
  }
}, 6000);

// Start
initDates();
subscribeSettings();
subscribeVoyages();
