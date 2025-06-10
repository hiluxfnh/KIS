// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCxxnPeqbmzRy0Ku9gDMzSjSKmjpCRz8gE",
    authDomain: "kis-transport-tracking.firebaseapp.com",
    projectId: "kis-transport-tracking",
    storageBucket: "kis-transport-tracking.firebasestorage.app",
    messagingSenderId: "1061513677800",
    appId: "1:1061513677800:web:0ac8dfa1bf37c3d676b25d"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const voyagesCollection = db.collection("voyages");

// Références DOM
const voyageForm = document.getElementById('voyageForm');
const voyagesTable = document.getElementById('voyagesTable').querySelector('tbody');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const timeFilter = document.getElementById('timeFilter');
const exportExcelBtn = document.getElementById('exportExcel');
const exportPDFBtn = document.getElementById('exportPDF');
const driverReportBtn = document.getElementById('driverReport');
const lastUpdateSpan = document.getElementById('lastUpdate');
const currentYearSpan = document.getElementById('currentYear');
const voyageCountSpan = document.getElementById('voyageCount');
const avgEfficiencySpan = document.getElementById('avgEfficiency');

// Variables globales
let currentSortField = 'dateDepart';
let isAscending = false;
let allVoyages = [];
let driverStats = {};

// Initialisation des dates
function initDates() {
    const now = new Date();
    lastUpdateSpan.textContent = now.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    currentYearSpan.textContent = now.getFullYear();
}

// Soumission du formulaire
voyageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const voyage = {
        chauffeur: document.getElementById('chauffeur').value,
        camion: document.getElementById('camion').value,
        destination: document.getElementById('destination').value,
        distance: parseFloat(document.getElementById('distance').value),
        dateDepart: new Date(document.getElementById('dateDepart').value),
        dateArrivee: new Date(document.getElementById('dateArrivee').value),
        carburantDepart: parseFloat(document.getElementById('carburantDepart').value),
        carburantRetour: parseFloat(document.getElementById('carburantRetour').value),
        commentaire: document.getElementById('commentaire').value,
        incidents: document.getElementById('incidents').value,
        statut: document.getElementById('statut').value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await voyagesCollection.add(voyage);
        voyageForm.reset();
        showNotification('Voyage enregistré avec succès!', 'success');
    } catch (error) {
        console.error("Erreur d'enregistrement: ", error);
        showNotification('Erreur lors de l\'enregistrement', 'error');
    }
});

// Chargement initial des données
async function loadInitialData() {
    try {
        const snapshot = await voyagesCollection.orderBy('createdAt', 'desc').get();
        allVoyages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable(allVoyages);
        calculateStats();
    } catch (error) {
        console.error("Erreur de chargement: ", error);
    }
}

// Rendu du tableau
function renderTable(data) {
    voyagesTable.innerHTML = '';
    
    data.forEach(voyage => {
        const row = document.createElement('tr');
        
        // Calcul des métriques de performance
        const fuelUsed = voyage.carburantDepart - voyage.carburantRetour;
        const efficiency = fuelUsed > 0 ? (voyage.distance / fuelUsed).toFixed(2) : 'N/A';
        const durationHours = calculateDurationHours(voyage.dateDepart, voyage.dateArrivee);
        const avgSpeed = durationHours > 0 ? (voyage.distance / durationHours).toFixed(1) : 'N/A';
        
        // Formatage des dates
        const formatDate = (date) => {
            if (date && date.toDate) {
                return date.toDate().toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            return date ? new Date(date).toLocaleString('fr-FR') : 'N/A';
        };
        
        row.innerHTML = `
            <td>${voyage.chauffeur}</td>
            <td>${voyage.camion}</td>
            <td>${formatDate(voyage.dateDepart)}</td>
            <td>${formatDate(voyage.dateArrivee)}</td>
            <td>${voyage.distance} km</td>
            <td>${voyage.carburantDepart} L</td>
            <td>${voyage.carburantRetour} L</td>
            <td class="${getPerformanceClass(efficiency)}">
                ${getPerformanceIcon(efficiency)} ${efficiency} km/L
            </td>
            <td>${voyage.destination}</td>
            <td>${efficiency} km/L</td>
            <td>${avgSpeed} km/h</td>
            <td>${voyage.commentaire || ''}</td>
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

    // Ajout des écouteurs d'événements
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => editVoyage(e.currentTarget.dataset.id));
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => deleteVoyage(e.currentTarget.dataset.id));
    });
}

// Calcul de la durée en heures
function calculateDurationHours(start, end) {
    if (!start || !end) return 0;
    const startDate = start.toDate ? start.toDate() : new Date(start);
    const endDate = end.toDate ? end.toDate() : new Date(end);
    return (endDate - startDate) / (1000 * 60 * 60);
}

// Classe de performance
function getPerformanceClass(efficiency) {
    if (efficiency === 'N/A') return '';
    const eff = parseFloat(efficiency);
    if (eff > 5) return 'performance-good';
    if (eff > 3) return 'performance-medium';
    return 'performance-bad';
}

// Icône de performance
function getPerformanceIcon(efficiency) {
    if (efficiency === 'N/A') return '';
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
    
    allVoyages.forEach(voyage => {
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
    allVoyages.forEach(voyage => {
        const driver = voyage.chauffeur;
        if (!driverStats[driver]) {
            driverStats[driver] = {
                count: 0,
                totalDistance: 0,
                totalFuelUsed: 0,
                totalHours: 0,
                incidents: 0
            };
        }
        
        driverStats[driver].count++;
        driverStats[driver].totalDistance += voyage.distance || 0;
        
        const fuelUsed = voyage.carburantDepart - voyage.carburantRetour;
        if (fuelUsed > 0) {
            driverStats[driver].totalFuelUsed += fuelUsed;
        }
        
        const durationHours = calculateDurationHours(voyage.dateDepart, voyage.dateArrivee);
        if (durationHours > 0) {
            driverStats[driver].totalHours += durationHours;
        }
        
        if (voyage.incidents) {
            driverStats[driver].incidents++;
        }
    });
}

// Recherche
searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase();
    
    if (!searchTerm) {
        renderTable(allVoyages);
        return;
    }
    
    const filtered = allVoyages.filter(voyage => 
        voyage.chauffeur.toLowerCase().includes(searchTerm) ||
        voyage.camion.toLowerCase().includes(searchTerm) ||
        voyage.destination.toLowerCase().includes(searchTerm) ||
        (voyage.commentaire && voyage.commentaire.toLowerCase().includes(searchTerm)) ||
        (voyage.incidents && voyage.incidents.toLowerCase().includes(searchTerm))
    );
    
    renderTable(filtered);
});

// Filtrage par temps
timeFilter.addEventListener('change', () => {
    const now = new Date();
    let filtered = [...allVoyages];
    
    switch(timeFilter.value) {
        case 'today':
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            filtered = filtered.filter(v => 
                v.dateDepart.toDate() >= todayStart
            );
            break;
            
        case 'week':
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            filtered = filtered.filter(v => 
                v.dateDepart.toDate() >= weekStart
            );
            break;
            
        case 'month':
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            filtered = filtered.filter(v => 
                v.dateDepart.toDate() >= monthStart
            );
            break;
    }
    
    renderTable(filtered);
});

// Tri des données
filterSelect.addEventListener('change', () => {
    if (filterSelect.value === 'performance') {
        sortByPerformance();
    } else {
        currentSortField = filterSelect.value;
        sortData();
    }
});

// Fonction de tri standard
function sortData() {
    const sorted = [...allVoyages].sort((a, b) => {
        let valA = a[currentSortField];
        let valB = b[currentSortField];
        
        // Pour les dates
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();
        if (valA.toDate) valA = valA.toDate().getTime();
        if (valB.toDate) valB = valB.toDate().getTime();
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return isAscending ? -1 : 1;
        if (valA > valB) return isAscending ? 1 : -1;
        return 0;
    });
    
    renderTable(sorted);
    isAscending = !isAscending;
}

// Tri par performance
function sortByPerformance() {
    const sorted = [...allVoyages].sort((a, b) => {
        const fuelUsedA = a.carburantDepart - a.carburantRetour;
        const fuelUsedB = b.carburantDepart - b.carburantRetour;
        
        const efficiencyA = fuelUsedA > 0 ? (a.distance / fuelUsedA) : 0;
        const efficiencyB = fuelUsedB > 0 ? (b.distance / fuelUsedB) : 0;
        
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
            document.getElementById('chauffeur').value = data.chauffeur;
            document.getElementById('camion').value = data.camion;
            document.getElementById('destination').value = data.destination;
            document.getElementById('distance').value = data.distance || '';
            document.getElementById('dateDepart').value = formatDateForInput(data.dateDepart);
            document.getElementById('dateArrivee').value = formatDateForInput(data.dateArrivee);
            document.getElementById('carburantDepart').value = data.carburantDepart;
            document.getElementById('carburantRetour').value = data.carburantRetour;
            document.getElementById('commentaire').value = data.commentaire || '';
            document.getElementById('incidents').value = data.incidents || '';
            document.getElementById('statut').value = data.statut || 'complet';
            
            // Supprimer l'entrée existante
            await voyagesCollection.doc(id).delete();
            showNotification('Voyage chargé pour modification', 'info');
        }
    } catch (error) {
        console.error("Erreur de modification: ", error);
    }
}

// Formatage de date pour input
function formatDateForInput(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}

// Suppression d'un voyage
async function deleteVoyage(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce voyage?')) {
        try {
            await voyagesCollection.doc(id).delete();
            showNotification('Voyage supprimé avec succès', 'success');
        } catch (error) {
            console.error("Erreur de suppression: ", error);
            showNotification('Erreur lors de la suppression', 'error');
        }
    }
}

// Export Excel
exportExcelBtn.addEventListener('click', async () => {
    try {
        const snapshot = await voyagesCollection.get();
        const data = snapshot.docs.map(doc => {
            const v = doc.data();
            const fuelUsed = v.carburantDepart - v.carburantRetour;
            const efficiency = fuelUsed > 0 ? (v.distance / fuelUsed).toFixed(2) : 'N/A';
            const durationHours = calculateDurationHours(v.dateDepart, v.dateArrivee);
            const avgSpeed = durationHours > 0 ? (v.distance / durationHours).toFixed(1) : 'N/A';
            
            return {
                Chauffeur: v.chauffeur,
                Camion: v.camion,
                'Date départ': v.dateDepart.toDate().toLocaleString('fr-FR'),
                'Date arrivée': v.dateArrivee.toDate().toLocaleString('fr-FR'),
                'Distance (km)': v.distance || 0,
                'Carburant départ (L)': v.carburantDepart,
                'Carburant retour (L)': v.carburantRetour,
                'Efficacité (km/L)': efficiency,
                'Vitesse moyenne (km/h)': avgSpeed,
                Destination: v.destination,
                Commentaire: v.commentaire || '',
                Incidents: v.incidents || '',
                Statut: v.statut || 'complet'
            };
        });
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Voyages KIS");
        XLSX.writeFile(wb, "rapport_voyages_kis.xlsx");
    } catch (error) {
        console.error("Erreur d'export Excel: ", error);
    }
});

// Export PDF sophistiqué
// Export PDF corrigé
exportPDFBtn.addEventListener('click', async () => {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        // En-tête avec texte seulement (plus fiable que le logo)
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text('Kribbi Inland Services', 105, 20, null, null, 'center');
        doc.setFontSize(16);
        doc.text('Rapport des Voyages', 105, 28, null, null, 'center');
        
        // Informations du rapport
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré par: TCHIO NGOUMO ALAIN`, 15, 40);
        doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 15, 45);
        doc.text(`Nombre de voyages: ${allVoyages.length}`, 170, 40, null, null, 'right');
        
        // Séparateur
        doc.setDrawColor(200);
        doc.setLineWidth(0.3);
        doc.line(15, 50, 195, 50);
        
        // Données du tableau
        const headers = [
            'Chauffeur',
            'Camion',
            'Départ',
            'Arrivée',
            'Distance',
            'Carb. Départ',
            'Carb. Retour',
            'Efficacité',
            'Destination'
        ];
        
        const data = allVoyages.map(voyage => {
            const fuelUsed = voyage.carburantDepart - voyage.carburantRetour;
            const efficiency = fuelUsed > 0 ? (voyage.distance / fuelUsed).toFixed(2) : 'N/A';
            
            return [
                voyage.chauffeur,
                voyage.camion,
                formatDateForPDF(voyage.dateDepart),
                formatDateForPDF(voyage.dateArrivee),
                voyage.distance + ' km',
                voyage.carburantDepart + ' L',
                voyage.carburantRetour + ' L',
                efficiency + ' km/L',
                voyage.destination
            ];
        });
        
        // Création du tableau
        doc.autoTable({
            startY: 55,
            head: [headers],
            body: data,
            theme: 'grid',
            headStyles: {
                fillColor: [26, 58, 108],
                textColor: 255,
                fontStyle: 'bold'
            },
            styles: {
                fontSize: 9,
                cellPadding: 2,
                halign: 'center'
            },
            columnStyles: {
                0: {halign: 'left'},
                8: {halign: 'left'}
            },
            margin: { left: 15, right: 15 }
        });
        
        // Pied de page
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Page ${i} sur ${pageCount}`, 195, 287, null, null, 'right');
            doc.text('KIS - Suivi des transports', 15, 287);
        }
        
        doc.save('rapport_voyages_kis.pdf');
        showNotification('PDF généré avec succès', 'success');
    } catch (error) {
        console.error("Erreur d'export PDF: ", error);
        showNotification('Erreur lors de la génération du PDF: ' + error.message, 'error');
    }
});

// Formatage de date pour PDF
function formatDateForPDF(date) {
    if (!date) return 'N/A';
    try {
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        console.error("Erreur de formatage de date", e);
        return 'N/A';
    }
}

// Conversion image en base64
function getBase64Image(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
    });
}

// Rapport chauffeur
driverReportBtn.addEventListener('click', () => {
    if (Object.keys(driverStats).length === 0) {
        showNotification('Aucune donnée chauffeur disponible', 'warning');
        return;
    }
    
    // Trier les chauffeurs par efficacité
    const drivers = Object.keys(driverStats)
        .map(driver => ({
            name: driver,
            efficiency: driverStats[driver].totalFuelUsed > 0 ? 
                (driverStats[driver].totalDistance / driverStats[driver].totalFuelUsed).toFixed(2) : 0,
            distance: driverStats[driver].totalDistance,
            trips: driverStats[driver].count,
            incidents: driverStats[driver].incidents
        }))
        .sort((a, b) => b.efficiency - a.efficiency);
    
    // Créer le rapport
    let report = "Rapport des Chauffeurs - KIS\n\n";
    report += "Classement par efficacité carburant\n\n";
    
    drivers.forEach((driver, index) => {
        report += `${index + 1}. ${driver.name}\n`;
        report += `   Voyages: ${driver.trips}\n`;
        report += `   Distance totale: ${driver.distance} km\n`;
        report += `   Efficacité: ${driver.efficiency} km/L\n`;
        report += `   Incidents: ${driver.incidents}\n\n`;
    });
    
    // Afficher dans une nouvelle fenêtre
    const win = window.open('', '_blank');
    win.document.write(`<pre>${report}</pre>`);
});

// Notification
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}-circle"></i> ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Écouteur temps réel
voyagesCollection.orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allVoyages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTable(allVoyages);
    calculateStats();
});

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
    initDates();
    loadInitialData();
    
    // Tri par colonne
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            currentSortField = th.dataset.sort;
            sortData();
        });
    });
    
    // Initialiser les filtres
    timeFilter.value = 'all';
    filterSelect.value = 'dateDepart';
});