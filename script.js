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
                clientArrivalTime: new Date(document.getElementById('clientArrivalTime').value),
                clientDepartureTime: new Date(document.getElementById('clientDepartureTime').value),
                kribiArrivalDate: new Date(document.getElementById('kribiArrivalDate').value),
                containerPositioningDate: new Date(document.getElementById('containerPositioningDate').value),
                containerPositioningLocation: document.getElementById('containerPositioningLocation').value,
                documentation: document.getElementById('documentation').value,
                incidents: document.getElementById('incidents').value,
                carburantDepart: parseFloat(document.getElementById('carburantDepart').value),
                carburantRetour: parseFloat(document.getElementById('carburantRetour').value),
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
                
                // Formatage des dates
                const formatDate = (date) => {
                    if (!date) return 'N/A';
                    try {
                        const d = date.toDate ? date.toDate() : new Date(date);
                        return d.toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    } catch (e) {
                        return 'N/A';
                    }
                };
                
                row.innerHTML = `
                    <td>${voyage.chauffeur}</td>
                    <td>${voyage.camion}</td>
                    <td>${formatDate(voyage.dateDepart)}</td>
                    <td>${formatDate(voyage.clientArrivalTime)}</td>
                    <td>${formatDate(voyage.clientDepartureTime)}</td>
                    <td>${formatDate(voyage.kribiArrivalDate)}</td>
                    <td>
                        ${formatDate(voyage.containerPositioningDate)}<br>
                        ${voyage.containerPositioningLocation}
                    </td>
                    <td>${voyage.distance} km</td>
                    <td>${voyage.carburantDepart} L</td>
                    <td>${voyage.carburantRetour} L</td>
                    <td class="${getPerformanceClass(efficiency)}">
                        ${getPerformanceIcon(efficiency)} ${efficiency} km/L
                    </td>
                    <td>${voyage.documentation || ''}</td>
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
                
                const durationHours = calculateDurationHours(voyage.dateDepart, voyage.kribiArrivalDate);
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
            if (!start || !end) return 0;
            const startDate = start.toDate ? start.toDate() : new Date(start);
            const endDate = end.toDate ? end.toDate() : new Date(end);
            return (endDate - startDate) / (1000 * 60 * 60);
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
                (voyage.documentation && voyage.documentation.toLowerCase().includes(searchTerm)) ||
                (voyage.containerPositioningLocation && voyage.containerPositioningLocation.toLowerCase().includes(searchTerm))
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
                    document.getElementById('clientArrivalTime').value = formatDateForInput(data.clientArrivalTime);
                    document.getElementById('clientDepartureTime').value = formatDateForInput(data.clientDepartureTime);
                    document.getElementById('kribiArrivalDate').value = formatDateForInput(data.kribiArrivalDate);
                    document.getElementById('containerPositioningDate').value = formatDateForInput(data.containerPositioningDate);
                    document.getElementById('containerPositioningLocation').value = data.containerPositioningLocation || '';
                    document.getElementById('documentation').value = data.documentation || '';
                    document.getElementById('incidents').value = data.incidents || '';
                    document.getElementById('carburantDepart').value = data.carburantDepart;
                    document.getElementById('carburantRetour').value = data.carburantRetour;
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
                    
                    return {
                        Chauffeur: v.chauffeur,
                        Camion: v.camion,
                        'Date départ': v.dateDepart.toDate().toLocaleString('fr-FR'),
                        'Heure arrivée client': v.clientArrivalTime.toDate().toLocaleString('fr-FR'),
                        'Heure départ client': v.clientDepartureTime.toDate().toLocaleString('fr-FR'),
                        'Arrivée Kribi': v.kribiArrivalDate.toDate().toLocaleString('fr-FR'),
                        'Positionnement': `${v.containerPositioningDate.toDate().toLocaleString('fr-FR')} à ${v.containerPositioningLocation}`,
                        'Distance (km)': v.distance || 0,
                        'Carburant départ (L)': v.carburantDepart,
                        'Carburant retour (L)': v.carburantRetour,
                        'Efficacité (km/L)': efficiency,
                        'Documentation': v.documentation || '',
                        'Incidents': v.incidents || '',
                        'Statut': v.statut || 'Complet'
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

        // Export PDF
        exportPDFBtn.addEventListener('click', async () => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('p', 'mm', 'a4');
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 15;
                let yPos = margin;

                // Couleurs de l'entreprise
                const primaryColor = [26, 58, 108]; // #1a3a6c
                const secondaryColor = [44, 90, 160]; // #2c5aa0
                const accentColor = [255, 107, 0]; // #ff6b00

                // En-tête avec texte seulement
                doc.setFontSize(20);
                doc.setFont("helvetica", "bold");
                doc.setTextColor(...primaryColor);
                doc.text('Kribi Inland Services & UTA Cameroun SA', pageWidth / 2, 20, null, null, 'center');
                doc.setFontSize(16);
                doc.text('Rapport des Voyages', pageWidth / 2, 28, null, null, 'center');
                
                // Informations du rapport
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.setFont("helvetica", "normal");
                doc.text(`Généré par: TCHIO NGOUMO ALAIN`, margin, 40);
                doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, margin, 45);
                doc.text(`Nombre de voyages: ${allVoyages.length}`, pageWidth - margin, 40, null, null, 'right');
                doc.text(`Période: ${timeFilter.options[timeFilter.selectedIndex].text}`, pageWidth - margin, 45, null, null, 'right');
                
                // Séparateur
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.5);
                doc.line(margin, 50, pageWidth - margin, 50);
                
                // Section des voyages
                yPos = 60;
                
                // Tableau des voyages
                const headers = [
                    'Chauffeur',
                    'Camion',
                    'Destination',
                    'Départ',
                    'Arrivée client',
                    'Départ client',
                    'Arrivée Kribi',
                    'Positionnement',
                    'Distance',
                    'Efficacité'
                ];
                
                const data = allVoyages.map(voyage => {
                    const fuelUsed = voyage.carburantDepart - voyage.carburantRetour;
                    const efficiency = fuelUsed > 0 ? (voyage.distance / fuelUsed).toFixed(2) : 'N/A';
                    
                    return [
                        voyage.chauffeur,
                        voyage.camion,
                        voyage.destination,
                        formatDateForPDF(voyage.dateDepart),
                        formatDateForPDF(voyage.clientArrivalTime),
                        formatDateForPDF(voyage.clientDepartureTime),
                        formatDateForPDF(voyage.kribiArrivalDate),
                        `${formatDateForPDF(voyage.containerPositioningDate)}\n${voyage.containerPositioningLocation}`,
                        voyage.distance + ' km',
                        efficiency + ' km/L'
                    ];
                });
                
                // Création du tableau
                doc.autoTable({
                    startY: yPos,
                    head: [headers],
                    body: data,
                    theme: 'grid',
                    headStyles: {
                        fillColor: secondaryColor,
                        textColor: 255,
                        fontStyle: 'bold',
                        fontSize: 10
                    },
                    styles: {
                        fontSize: 9,
                        cellPadding: 3,
                        halign: 'center'
                    },
                    columnStyles: {
                        0: {halign: 'left', cellWidth: 20},
                        1: {cellWidth: 20},
                        2: {halign: 'left', cellWidth: 25},
                        3: {cellWidth: 25},
                        4: {cellWidth: 25},
                        5: {cellWidth: 25},
                        6: {cellWidth: 25},
                        7: {halign: 'left', cellWidth: 30},
                        9: {cellWidth: 20}
                    },
                    margin: { left: margin, right: margin },
                    didDrawPage: function(data) {
                        yPos = data.cursor.y + 10;
                    }
                });
                
                // Détails supplémentaires (commentaires et incidents)
                yPos = doc.lastAutoTable.finalY + 10;
                
                allVoyages.forEach((voyage, index) => {
                    if (yPos > pageHeight - 60) {
                        doc.addPage();
                        yPos = margin;
                    }
                    
                    // Header du voyage
                    doc.setFontSize(12);
                    doc.setTextColor(...secondaryColor);
                    doc.setFont("helvetica", "bold");
                    doc.text(`Voyage #${index + 1}: ${voyage.chauffeur} - ${voyage.camion}`, margin, yPos);
                    yPos += 7;
                    
                    // Dates importantes
                    doc.setFontSize(10);
                    doc.setTextColor(0);
                    doc.setFont("helvetica", "normal");
                    doc.text(`Départ: ${formatDateForPDF(voyage.dateDepart)}`, margin, yPos);
                    doc.text(`Arrivée client: ${formatDateForPDF(voyage.clientArrivalTime)}`, margin + 70, yPos);
                    doc.text(`Départ client: ${formatDateForPDF(voyage.clientDepartureTime)}`, margin + 140, yPos);
                    yPos += 6;
                    
                    doc.text(`Arrivée Kribi: ${formatDateForPDF(voyage.kribiArrivalDate)}`, margin, yPos);
                    doc.text(`Positionnement: ${formatDateForPDF(voyage.containerPositioningDate)} à ${voyage.containerPositioningLocation}`, margin, yPos + 6);
                    yPos += 12;
                    
                    // Documentation
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(...primaryColor);
                    doc.text('Documentations (bordereau de livraison):', margin, yPos);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(0);
                    
                    const documentation = voyage.documentation || 'Aucune documentation';
                    const docLines = doc.splitTextToSize(documentation, pageWidth - margin * 2);
                    docLines.forEach(line => {
                        if (yPos > pageHeight - 20) {
                            doc.addPage();
                            yPos = margin;
                        }
                        doc.text(line, margin + 10, yPos + 5);
                        yPos += 7;
                    });
                    
                    yPos += 5;
                    
                    // Incidents
                    doc.setFont("helvetica", "bold");
                    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
                    doc.text('Incidents/Remarques:', margin, yPos);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(0);
                    
                    const incidents = voyage.incidents || 'Aucun incident';
                    const incidentLines = doc.splitTextToSize(incidents, pageWidth - margin * 2);
                    incidentLines.forEach(line => {
                        if (yPos > pageHeight - 20) {
                            doc.addPage();
                            yPos = margin;
                        }
                        doc.text(line, margin + 10, yPos + 5);
                        yPos += 7;
                    });
                    
                    // Séparateur
                    if (index < allVoyages.length - 1) {
                        yPos += 10;
                        doc.setDrawColor(200);
                        doc.setLineWidth(0.2);
                        doc.line(margin, yPos, pageWidth - margin, yPos);
                        yPos += 15;
                    }
                });
                
                // Pied de page
                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    doc.setFontSize(8);
                    doc.setTextColor(100);
                    doc.text(`Page ${i} sur ${pageCount}`, pageWidth - margin, pageHeight - 10, null, null, 'right');
                    doc.text('KIS/UTA - Suivi des transports', margin, pageHeight - 10);
                }
                
                doc.save('rapport_voyages_kis_uta.pdf');
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
                // Gérer les timestamps Firebase
                const d = date.toDate ? date.toDate() : new Date(date);
                
                // Vérifier que c'est une date valide
                if (isNaN(d.getTime())) return 'N/A';
                
                return d.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return 'N/A';
            }
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
            let report = "Rapport des Chauffeurs - KIS/UTA\n\n";
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