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

// Gestion de la modal pour modifier les camions actifs
const editTrucksBtn = document.getElementById("edit-trucks");
const modal = document.getElementById("edit-modal");
const closeBtn = document.querySelector(".close");
const saveTrucksBtn = document.getElementById("save-trucks");
const trucksInput = document.getElementById("trucks-input");
const activeTrucksSpan = document.getElementById("active-trucks");

// Ouvrir la modal
editTrucksBtn.addEventListener("click", () => {
  trucksInput.value = activeTrucksSpan.textContent;
  modal.style.display = "block";
});

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
  try {
    const user = auth.currentUser;
    await settingsDocRef.set(
      {
        activeTrucks: newValue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: user
          ? getUserProfile(user.email)?.name || user.email
          : "inconnu",
      },
      { merge: true }
    );
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
const statusFilter = document.getElementById("statusFilter");
const openAnalyticsBtn = document.getElementById("openAnalytics");
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
    // Hide trucks edit icon when view-only
    if (editTrucksBtn)
      editTrucksBtn.style.display = canEdit ? "inline" : "none";
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
});

// Soumission du formulaire
voyageForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const voyage = {
    chauffeur: document.getElementById("chauffeur").value.trim(),
    camion: document.getElementById("camion").value.trim(),
    destination: document.getElementById("destination").value.trim(),
    distance: parseFloat(document.getElementById("distance").value),
    dateDepart: new Date(document.getElementById("dateDepart").value),
    clientArrivalTime: new Date(
      document.getElementById("clientArrivalTime").value
    ),
    clientDepartureTime: new Date(
      document.getElementById("clientDepartureTime").value
    ),
    kribiArrivalDate: new Date(
      document.getElementById("kribiArrivalDate").value
    ),
    containerPositioningDate: new Date(
      document.getElementById("containerPositioningDate").value
    ),
    containerPositioningLocation: document
      .getElementById("containerPositioningLocation")
      .value.trim(),
    documentation: document.getElementById("documentation").value.trim(),
    incidents: document.getElementById("incidents").value.trim(),
    carburantDepart: parseFloat(
      document.getElementById("carburantDepart").value
    ),
    carburantRetour: parseFloat(
      document.getElementById("carburantRetour").value
    ),
    statut: document.getElementById("statut").value,
    societe: document.getElementById("company-selector").value,
  };

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

function validateVoyage(v) {
  const errs = [];
  if (!v.chauffeur) errs.push("Nom du chauffeur requis");
  if (!v.camion) errs.push("Immatriculation requise");
  if (isNaN(v.distance) || v.distance < 0) errs.push("Distance invalide");
  if (isNaN(v.carburantDepart) || v.carburantDepart < 0)
    errs.push("Carburant départ invalide");
  if (isNaN(v.carburantRetour) || v.carburantRetour < 0)
    errs.push("Carburant retour invalide");
  if (v.carburantRetour > v.carburantDepart)
    errs.push("Carburant retour > départ");
  const d1 = asDate(v.dateDepart),
    d2 = asDate(v.clientArrivalTime),
    d3 = asDate(v.clientDepartureTime),
    d4 = asDate(v.kribiArrivalDate),
    d5 = asDate(v.containerPositioningDate);
  if (!(d1 && d2 && d3 && d4 && d5))
    errs.push("Toutes les dates sont requises");
  if (d1 && d2 && d1 > d2) errs.push("Arrivée client avant départ");
  if (d2 && d3 && d2 > d3) errs.push("Départ client avant arrivée");
  if (d3 && d4 && d3 > d4) errs.push("Arrivée Kribi avant départ client");
  if (d4 && d5 && d4 > d5) errs.push("Positionnement avant arrivée à Kribi");
  return errs;
}

// Chargement initial des données
// Plus besoin de chargement initial; onSnapshot est la source de vérité

// Rendu du tableau (version corrigée avec délégation d'événements)
function renderTable(data) {
  voyagesTable.innerHTML = "";

  data.forEach((voyage) => {
    const row = document.createElement("tr");

    // Calcul des métriques de performance
    const fuelUsed =
      (voyage.carburantDepart ?? 0) - (voyage.carburantRetour ?? 0);
    const efficiency =
      fuelUsed > 0 && voyage.distance > 0
        ? (voyage.distance / fuelUsed).toFixed(2)
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

    row.innerHTML = `
            <td>${voyage.chauffeur || ""}</td>
            <td>${voyage.camion || ""}</td>
            <td>${voyage.societe || "KIS"}</td>
            <td>${formatDate(voyage.dateDepart)}</td>
            <td>${formatDate(voyage.clientArrivalTime)}</td>
            <td>${formatDate(voyage.clientDepartureTime)}</td>
            <td>${formatDate(voyage.kribiArrivalDate)}</td>
            <td>
                ${formatDate(voyage.containerPositioningDate)}<br>
                ${voyage.containerPositioningLocation}
            </td>
            <td>${voyage.distance ?? 0} km</td>
            <td>${voyage.carburantDepart ?? 0} L</td>
            <td>${voyage.carburantRetour ?? 0} L</td>
            <td class="${getPerformanceClass(efficiency)}">
                ${getPerformanceIcon(efficiency)} ${efficiency} km/L
            </td>
            <td>${voyage.documentation || ""}</td>
            <td>${voyage.incidents || "Aucun"}</td>
            <td>${getStatusBadge(voyage.statut)}</td>
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

// Calcul des statistiques
function calculateStats() {
  // Comptage des voyages
  voyageCountSpan.textContent = `${allVoyages.length} voyages`;

  // Calcul de l'efficacité moyenne
  let totalEfficiency = 0;
  let count = 0;

  allVoyages.forEach((voyage) => {
    const fuelUsed = voyage.carburantDepart - voyage.carburantRetour;
    if (fuelUsed > 0 && voyage.distance > 0) {
      totalEfficiency += voyage.distance / fuelUsed;
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

    const fuelUsed = voyage.carburantDepart - voyage.carburantRetour;
    if (fuelUsed > 0) {
      driverStats[driver].totalFuelUsed += fuelUsed;
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

// Recherche
searchInput.addEventListener("input", () => {
  const searchTerm = searchInput.value.toLowerCase();

  if (!searchTerm) {
    renderTable(allVoyages);
    return;
  }

  applyFilters();
});

// Filtrage par temps
timeFilter.addEventListener("change", applyFilters);
companyFilter.addEventListener("change", applyFilters);
statusFilter.addEventListener("change", applyFilters);

function applyFilters() {
  const now = new Date();
  const term = (searchInput.value || "").toLowerCase();
  let filtered = allVoyages.filter((v) => {
    const matchesSearch =
      !term ||
      (v.chauffeur || "").toLowerCase().includes(term) ||
      (v.camion || "").toLowerCase().includes(term) ||
      (v.destination || "").toLowerCase().includes(term) ||
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
    const fuelUsedA = a.carburantDepart - a.carburantRetour;
    const fuelUsedB = b.carburantDepart - b.carburantRetour;

    const efficiencyA = fuelUsedA > 0 ? a.distance / fuelUsedA : 0;
    const efficiencyB = fuelUsedB > 0 ? b.distance / fuelUsedB : 0;

    return efficiencyB - efficiencyA;
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
      document.getElementById("documentation").value = data.documentation || "";
      document.getElementById("incidents").value = data.incidents || "";
      document.getElementById("carburantDepart").value = data.carburantDepart;
      document.getElementById("carburantRetour").value = data.carburantRetour;
      document.getElementById("statut").value = data.statut || "complet";
      document.getElementById("company-selector").value = data.societe || "KIS";
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
exportExcelBtn.addEventListener("click", async () => {
  try {
    const snapshot = await voyagesCollection.get();
    const data = snapshot.docs.map((doc) => {
      const v = doc.data();
      const fuelUsed = (v.carburantDepart ?? 0) - (v.carburantRetour ?? 0);
      const efficiency =
        fuelUsed > 0 && v.distance > 0
          ? (v.distance / fuelUsed).toFixed(2)
          : "N/A";

      return {
        Chauffeur: v.chauffeur || "",
        Camion: v.camion || "",
        Société: v.societe || "KIS",
        "Date départ": formatDateForPDF(v.dateDepart),
        "Heure arrivée client": formatDateForPDF(v.clientArrivalTime),
        "Heure départ client": formatDateForPDF(v.clientDepartureTime),
        "Arrivée Kribi": formatDateForPDF(v.kribiArrivalDate),
        Positionnement: `${formatDateForPDF(v.containerPositioningDate)} à ${
          v.containerPositioningLocation || ""
        }`,
        "Distance (km)": v.distance || 0,
        "Carburant départ (L)": v.carburantDepart ?? 0,
        "Carburant retour (L)": v.carburantRetour ?? 0,
        "Efficacité (km/L)": efficiency,
        Documentation: v.documentation || "",
        Incidents: v.incidents || "",
        Statut: v.statut || "complet",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Voyages KIS/UTA");
    XLSX.writeFile(wb, "rapport_voyages_kis_uta.xlsx");
  } catch (error) {
    console.error("Erreur d'export Excel: ", error);
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
      const fuA = (a.carburantDepart ?? 0) - (a.carburantRetour ?? 0);
      const fuB = (b.carburantDepart ?? 0) - (b.carburantRetour ?? 0);
      const eA = fuA > 0 ? (a.distance || 0) / fuA : 0;
      const eB = fuB > 0 ? (b.distance || 0) / fuB : 0;
      return eB - eA;
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
  const fu = (v.carburantDepart ?? 0) - (v.carburantRetour ?? 0);
  return fu > 0 && (v.distance || 0) > 0 ? v.distance / fu : null;
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
exportPDFBtn.addEventListener("click", async () => {
  try {
    const { jsPDF } = window.jspdf;
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
      parseInt(activeTrucksSpan?.textContent || "0", 10) || 0;
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
      const fu = (v.carburantDepart ?? 0) - (v.carburantRetour ?? 0);
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
        const fu = (v.carburantDepart ?? 0) - (v.carburantRetour ?? 0);
        const eff = fu > 0 ? (v.distance || 0) / fu : null;
        return [
          formatDateForPDF(v.dateDepart),
          v.chauffeur || "",
          v.camion || "",
          v.destination || "",
          v.distance || 0,
          fu > 0 ? fu.toFixed(1) : 0,
          eff ? eff.toFixed(2) : "N/A",
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
            "Destination",
            "Distance (km)",
            "Carburant (L)",
            "Efficacité (km/L)",
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
          0: { cellWidth: 26 }, // Départ
          1: { cellWidth: 24 }, // Chauffeur
          2: { cellWidth: 20 }, // Camion
          3: { cellWidth: 32 }, // Destination
          4: { cellWidth: 18, halign: "right" }, // Distance
          5: { cellWidth: 20, halign: "right" }, // Carburant
          6: { cellWidth: 22, halign: "right" }, // Efficacité
          7: { cellWidth: 16, halign: "center" }, // Statut
        },
        // Center the table horizontally and keep within margins
        halign: "center",
        tableWidth: "wrap",
        margin: { left: margin, right: margin, top: 24 },
        willDrawCell: (data) => {
          // Color status chips
          if (data.section === "body" && data.column.index === 7) {
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
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30);
      doc.setFontSize(10);

      let y = 28;
      voyages.forEach((v, i) => {
        const header = `${i + 1}. ${v.chauffeur || ""} — ${v.camion || ""} (${
          v.destination || ""
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
          )} • Positionnement ${formatDateForPDF(
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
        const trucks =
          data && typeof data.activeTrucks === "number" ? data.activeTrucks : 0;
        if (activeTrucksSpan) activeTrucksSpan.textContent = String(trucks);
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
