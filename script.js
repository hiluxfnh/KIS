// Configuration Firebase (à remplacer)
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
const exportExcelBtn = document.getElementById('exportExcel');
const exportPDFBtn = document.getElementById('exportPDF');

// Variables globales
let currentSortField = 'dateDepart';
let isAscending = false;
let allVoyages = [];

// Soumission du formulaire
voyageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const voyage = {
        chauffeur: document.getElementById('chauffeur').value,
        camion: document.getElementById('camion').value,
        dateDepart: new Date(document.getElementById('dateDepart').value),
        dateArrivee: new Date(document.getElementById('dateArrivee').value),
        carburantDepart: parseFloat(document.getElementById('carburantDepart').value),
        carburantRetour: parseFloat(document.getElementById('carburantRetour').value),
        destination: document.getElementById('destination').value,
        commentaire: document.getElementById('commentaire').value,
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
    } catch (error) {
        console.error("Erreur de chargement: ", error);
    }
}

// Rendu du tableau
function renderTable(data) {
    voyagesTable.innerHTML = '';
    
    data.forEach(voyage => {
        const row = document.createElement('tr');
        
        // Formatage des dates
        const formatDate = (date) => {
            if (date && date.toDate) {
                return date.toDate().toLocaleString();
            }
            return date ? new Date(date).toLocaleString() : 'N/A';
        };
        
        row.innerHTML = `
            <td>${voyage.chauffeur}</td>
            <td>${voyage.camion}</td>
            <td>${formatDate(voyage.dateDepart)}</td>
            <td>${formatDate(voyage.dateArrivee)}</td>
            <td>${voyage.carburantDepart}</td>
            <td>${voyage.carburantRetour}</td>
            <td>${voyage.destination}</td>
            <td>${voyage.commentaire || ''}</td>
            <td>
                <button class="btn-edit" data-id="${voyage.id}">Modifier</button>
                <button class="btn-delete" data-id="${voyage.id}">Supprimer</button>
            </td>
        `;
        
        voyagesTable.appendChild(row);
    });

    // Ajout des écouteurs d'événements
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => editVoyage(e.target.dataset.id));
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => deleteVoyage(e.target.dataset.id));
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
        (voyage.commentaire && voyage.commentaire.toLowerCase().includes(searchTerm))
    );
    
    renderTable(filtered);
});

// Tri des données
filterSelect.addEventListener('change', () => {
    currentSortField = filterSelect.value;
    sortData();
});

// Fonction de tri
function sortData() {
    const sorted = [...allVoyages].sort((a, b) => {
        let valA = a[currentSortField];
        let valB = b[currentSortField];
        
        // Pour les dates
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return isAscending ? -1 : 1;
        if (valA > valB) return isAscending ? 1 : -1;
        return 0;
    });
    
    renderTable(sorted);
    isAscending = !isAscending;
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
            document.getElementById('dateDepart').value = formatDateForInput(data.dateDepart);
            document.getElementById('dateArrivee').value = formatDateForInput(data.dateArrivee);
            document.getElementById('carburantDepart').value = data.carburantDepart;
            document.getElementById('carburantRetour').value = data.carburantRetour;
            document.getElementById('destination').value = data.destination;
            document.getElementById('commentaire').value = data.commentaire || '';
            
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
            return {
                Chauffeur: v.chauffeur,
                Camion: v.camion,
                'Date départ': v.dateDepart.toDate().toLocaleString(),
                'Date arrivée': v.dateArrivee.toDate().toLocaleString(),
                'Carburant départ (L)': v.carburantDepart,
                'Carburant retour (L)': v.carburantRetour,
                Destination: v.destination,
                Commentaire: v.commentaire || ''
            };
        });
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Voyages KIS");
        XLSX.writeFile(wb, "voyages_kis.xlsx");
    } catch (error) {
        console.error("Erreur d'export Excel: ", error);
    }
});

// Export PDF
exportPDFBtn.addEventListener('click', async () => {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const snapshot = await voyagesCollection.get();
        
        let y = 20;
        doc.setFontSize(18);
        doc.text("Rapport des Voyages - KIS", 105, 15, null, null, 'center');
        
        doc.setFontSize(12);
        snapshot.docs.forEach((docItem, index) => {
            const v = docItem.data();
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            
            doc.text(`Voyage #${index + 1}`, 14, y);
            doc.text(`Chauffeur: ${v.chauffeur}`, 14, y + 8);
            doc.text(`Camion: ${v.camion}`, 14, y + 16);
            doc.text(`Départ: ${v.dateDepart.toDate().toLocaleString()}`, 14, y + 24);
            doc.text(`Arrivée: ${v.dateArrivee.toDate().toLocaleString()}`, 14, y + 32);
            doc.text(`Carburant: ${v.carburantDepart}L → ${v.carburantRetour}L`, 14, y + 40);
            doc.text(`Destination: ${v.destination}`, 14, y + 48);
            
            if (v.commentaire) {
                const splitComment = doc.splitTextToSize(`Commentaire: ${v.commentaire}`, 180);
                doc.text(splitComment, 14, y + 56);
                y += splitComment.length * 6;
            }
            
            y += 64;
            if (index < snapshot.docs.length - 1) {
                doc.setLineWidth(0.1);
                doc.line(14, y, 196, y);
                y += 10;
            }
        });
        
        doc.save('rapport_voyages_kis.pdf');
    } catch (error) {
        console.error("Erreur d'export PDF: ", error);
    }
});

// Notification
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
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
});

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
    loadInitialData();
    
    // Tri par colonne
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            currentSortField = th.dataset.sort;
            sortData();
        });
    });
});