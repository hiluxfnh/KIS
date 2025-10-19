// Firebase config should match the main app
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

function asDate(val) {
  try {
    return val?.toDate ? val.toDate() : new Date(val);
  } catch {
    return null;
  }
}

async function loadData() {
  const snapshot = await db
    .collection("voyages")
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function computeStats(voyages) {
  const driverMap = new Map();
  const monthCounts = new Map();
  const incidentMap = new Map();

  voyages.forEach((v) => {
    const driver = v.chauffeur || "Inconnu";
    const distance = v.distance || 0;
    const fuelUsed = (v.carburantDepart ?? 0) - (v.carburantRetour ?? 0);
    const eff = fuelUsed > 0 && distance > 0 ? distance / fuelUsed : 0;

    const dm = driverMap.get(driver) || {
      totalDistance: 0,
      totalFuel: 0,
      trips: 0,
    };
    dm.totalDistance += distance;
    if (fuelUsed > 0) dm.totalFuel += fuelUsed;
    dm.trips += 1;
    driverMap.set(driver, dm);

    const d = asDate(v.dateDepart);
    if (d && !isNaN(d)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    }

    if (v.incidents) {
      incidentMap.set(driver, (incidentMap.get(driver) || 0) + 1);
    }
  });

  const driverEfficiency = Array.from(driverMap.entries())
    .map(([name, s]) => ({
      name,
      efficiency:
        s.totalFuel > 0 ? +(s.totalDistance / s.totalFuel).toFixed(2) : 0,
      trips: s.trips,
    }))
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 5);

  const months = Array.from(monthCounts.keys()).sort();
  const monthData = months.map((m) => monthCounts.get(m));

  const incidents = Array.from(incidentMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return { driverEfficiency, months, monthData, incidents };
}

function renderCharts(stats) {
  const effCtx = document.getElementById("efficiencyChart");
  new Chart(effCtx, {
    type: "bar",
    data: {
      labels: stats.driverEfficiency.map((d) => d.name),
      datasets: [
        {
          label: "km/L",
          data: stats.driverEfficiency.map((d) => d.efficiency),
          backgroundColor: "rgba(26,58,108,0.7)",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } },
    },
  });

  const monthCtx = document.getElementById("monthlyTripsChart");
  new Chart(monthCtx, {
    type: "line",
    data: {
      labels: stats.months,
      datasets: [
        {
          label: "Voyages",
          data: stats.monthData,
          borderColor: "rgba(255,107,0,0.9)",
          backgroundColor: "rgba(255,107,0,0.2)",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true, precision: 0 } },
    },
  });

  const list = document.getElementById("incidentsList");
  list.innerHTML = "";
  stats.incidents.forEach(([driver, count]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${driver}</span><strong>${count}</strong>`;
    list.appendChild(li);
  });
}

(async function () {
  try {
    const voyages = await loadData();
    const stats = computeStats(voyages);
    renderCharts(stats);
  } catch (e) {
    console.error("Erreur chargement analytics", e);
    alert("Impossible de charger le tableau de bord.");
  }
})();
