// MMF 2026 - Application Logic

// Constants
const ITEMS_PER_PAGE = 25;

// State Variables
let currentFilteredData = [];
let currentPage = 1;
let selectedCategory = 'all';
let selectedDistance = 'all';
let selectedCity = 'all';
let searchQuery = '';
let selectedRunner = null;
let cachedPdfBytes = null; // Cache DIPLOMAS.pdf bytes to avoid repeated large downloads

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    checkProtocol();
    calculateStats();
    populateCityFilter();
    setupEventListeners();
    
    // Initial display
    applyFilters();
});

// Check if running on local file system (CORS restriction warning)
function checkProtocol() {
    const corsWarning = document.getElementById('cors-warning');
    if (window.location.protocol === 'file:') {
        corsWarning.classList.remove('hidden');
    }
}

// Populate stats dashboard cards
function calculateStats() {
    // 1. Total Finalistas
    // Exists statically in HTML (1,597)
    
    // 2. Best 21K Time & Name
    const timeToSeconds = (t) => {
        if (!t || t === 'N/A') return Infinity;
        const parts = t.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return Infinity;
    };
    
    const runners21k = RUNNERS_DATA.filter(r => r.categoria.includes('21 K') && r.tiempo && r.tiempo !== 'N/A');
    if (runners21k.length > 0) {
        runners21k.sort((a, b) => timeToSeconds(a.tiempo) - timeToSeconds(b.tiempo));
        const top21k = runners21k[0];
        document.getElementById('top-21k-time').textContent = top21k.tiempo;
        document.getElementById('top-21k-name').textContent = top21k.nombre;
    }
    
    // 3. Category count stats to find most popular category
    const catCounts = {};
    RUNNERS_DATA.forEach(r => {
        catCounts[r.categoria] = (catCounts[r.categoria] || 0) + 1;
    });
    
    let maxCat = '';
    let maxCount = 0;
    for (const cat in catCounts) {
        if (catCounts[cat] > maxCount) {
            maxCount = catCounts[cat];
            maxCat = cat;
        }
    }
    
    // Format most popular category nicely (e.g. "5 K ABIERTA" -> "5K Abierta")
    if (maxCat) {
        const formattedCatName = maxCat
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .replace(' K ', 'K '); // e.g. "5K Abierta"
            
        document.getElementById('popular-cat').textContent = formattedCatName;
        document.getElementById('popular-cat-count').textContent = `${maxCount} Corredores`;
    }
}

// Populate the city filter select element
function populateCityFilter() {
    const citySelect = document.getElementById('city-filter');
    const cities = new Set();
    
    RUNNERS_DATA.forEach(r => {
        if (r.ciudad && r.ciudad.trim()) {
            cities.add(r.ciudad.trim());
        }
    });
    
    // Sort cities alphabetically
    const sortedCities = Array.from(cities).sort((a, b) => a.localeCompare(b));
    
    sortedCities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        citySelect.appendChild(option);
    });
}

// Setup all interactive listeners
function setupEventListeners() {
    // Search input field
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search');
    
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        if (searchQuery) {
            clearBtn.style.display = 'block';
        } else {
            clearBtn.style.display = 'none';
        }
        currentPage = 1;
        applyFilters();
    });
    
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearBtn.style.display = 'none';
        currentPage = 1;
        applyFilters();
    });
    
    // City filter dropdown
    document.getElementById('city-filter').addEventListener('change', (e) => {
        selectedCity = e.target.value;
        currentPage = 1;
        applyFilters();
    });
    
    // Distance filter dropdown
    document.getElementById('distance-filter').addEventListener('change', (e) => {
        selectedDistance = e.target.value;
        currentPage = 1;
        applyFilters();
    });
    
    // Category tabs buttons
    const tabContainer = document.getElementById('category-tabs');
    tabContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        
        // Remove active class from previous active tab
        tabContainer.querySelector('.tab-btn.active').classList.remove('active');
        // Add active class to clicked tab
        btn.classList.add('active');
        
        selectedCategory = btn.dataset.category;
        currentPage = 1;
        applyFilters();
    });
    
    // Reset filters empty state button
    document.getElementById('reset-filters-btn').addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearBtn.style.display = 'none';
        document.getElementById('city-filter').value = 'all';
        selectedCity = 'all';
        document.getElementById('distance-filter').value = 'all';
        selectedDistance = 'all';
        
        // Reset category tabs to 'all'
        tabContainer.querySelector('.tab-btn.active').classList.remove('active');
        tabContainer.querySelector('[data-category="all"]').classList.add('active');
        selectedCategory = 'all';
        
        currentPage = 1;
        applyFilters();
    });
    
    // Pagination buttons
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    
    // Modal closing listeners
    const modal = document.getElementById('runner-modal');
    document.getElementById('close-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
    
    // Download diploma action
    document.getElementById('download-diploma-btn').addEventListener('click', downloadDiploma);
}

// Apply searches, dropdowns, and tab filters to the master dataset
function applyFilters() {
    currentFilteredData = RUNNERS_DATA.filter(runner => {
        // 1. Text search matching name or bib plate
        if (searchQuery) {
            const matchesName = runner.nombre.toLowerCase().includes(searchQuery);
            const matchesBib = runner.placa.includes(searchQuery);
            if (!matchesName && !matchesBib) return false;
        }
        
        // 2. City filter matching
        if (selectedCity !== 'all' && runner.ciudad !== selectedCity) {
            return false;
        }
        
        // 3. Distance filter matching (5K, 10K, 21K)
        if (selectedDistance !== 'all') {
            const distToken = `${selectedDistance.replace('K', '')} K`; // e.g. "21 K"
            if (!runner.categoria.toUpperCase().includes(distToken)) {
                return false;
            }
        }
        
        // 4. Category tab matching (exact string)
        if (selectedCategory !== 'all' && runner.categoria !== selectedCategory) {
            return false;
        }
        
        return true;
    });
    
    // Update display counts
    const countEl = document.getElementById('results-count');
    countEl.textContent = `Mostrando ${currentFilteredData.length.toLocaleString()} corredores`;
    
    // Show empty state if nothing matches
    const emptyState = document.getElementById('empty-state');
    const tableContainer = document.querySelector('.table-responsive');
    const paginationContainer = document.getElementById('pagination-container');
    
    if (currentFilteredData.length === 0) {
        emptyState.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        paginationContainer.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        paginationContainer.classList.remove('hidden');
    }
    
    renderTable();
}

// Render rankings table rows based on current page
function renderTable() {
    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, currentFilteredData.length);
    const paginatedItems = currentFilteredData.slice(startIndex, endIndex);
    
    paginatedItems.forEach(runner => {
        const tr = document.createElement('tr');
        
        // Custom styling for top 3 positions
        let posBadgeClass = 'pos-badge pos-other';
        if (runner.puesto === 1) posBadgeClass = 'pos-badge pos-1';
        else if (runner.puesto === 2) posBadgeClass = 'pos-badge pos-2';
        else if (runner.puesto === 3) posBadgeClass = 'pos-badge pos-3';
        
        // Custom category classes
        let catClass = 'category-tag';
        if (runner.categoria.includes('21 K')) catClass += ' cat-21k';
        else if (runner.categoria.includes('10 K')) catClass += ' cat-10k';
        else if (runner.categoria.includes('5 K')) catClass += ' cat-5k';
        
        // Render Row HTML
        tr.innerHTML = `
            <td class="col-pos"><span class="${posBadgeClass}">${runner.puesto}</span></td>
            <td class="col-bib"><span class="bib-text">${runner.placa}</span></td>
            <td class="col-name">
                <div class="runner-name">${runner.nombre}</div>
                <div class="runner-city mobile-visible"><i class="fa-solid fa-location-dot"></i> ${runner.ciudad || 'N/A'}</div>
            </td>
            <td class="col-cat"><span class="${catClass}">${runner.categoria}</span></td>
            <td class="col-city">${runner.ciudad || 'N/A'}</td>
            <td class="col-time"><span class="time-text">${runner.tiempo}</span></td>
            <td class="col-pace text-center"><span class="pace-text">${runner.ritmo || 'N/A'}</span></td>
            <td class="col-action text-right">
                <button class="cert-btn" title="Ver Detalles y Diploma" data-placa="${runner.placa}">
                    <i class="fa-solid fa-graduation-cap"></i>
                </button>
            </td>
        `;
        
        // Row clicking action
        tr.addEventListener('click', (e) => {
            // Avoid triggering detail modal if they clicked the diploma action directly (button has its own click event)
            if (!e.target.closest('.cert-btn')) {
                openRunnerDetails(runner);
            }
        });
        
        // Diploma button action
        tr.querySelector('.cert-btn').addEventListener('click', () => {
            openRunnerDetails(runner);
        });
        
        tbody.appendChild(tr);
    });
    
    renderPagination();
}

// Render dynamic pagination page number items
function renderPagination() {
    const totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
    const paginationContainer = document.getElementById('pagination-container');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageNumbersContainer = document.getElementById('page-numbers');
    
    pageNumbersContainer.innerHTML = '';
    
    // Disable prev/next navigation when on limits
    prevBtn.disabled = (currentPage === 1);
    nextBtn.disabled = (currentPage === totalPages || totalPages === 0);
    
    if (totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    } else {
        paginationContainer.classList.remove('hidden');
    }
    
    // Construct pagination array with ellipsis (e.g. 1, 2, ..., 5, 6, 7, ..., 15)
    let pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
        pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
        // Always include page 1
        pages.push(1);
        
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(totalPages - 1, currentPage + 1);
        
        // Keep active page centered
        if (currentPage <= 2) {
            end = 4;
        } else if (currentPage >= totalPages - 1) {
            start = totalPages - 3;
        }
        
        if (start > 2) {
            pages.push('...');
        }
        
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        
        if (end < totalPages - 1) {
            pages.push('...');
        }
        
        // Always include last page
        pages.push(totalPages);
    }
    
    // Create elements
    pages.forEach(p => {
        if (p === '...') {
            const span = document.createElement('span');
            span.className = 'page-dots';
            span.textContent = '...';
            pageNumbersContainer.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.className = `page-num ${p === currentPage ? 'active' : ''}`;
            btn.textContent = p;
            btn.addEventListener('click', () => {
                currentPage = p;
                renderTable();
                // Scroll main area to table top smoothly
                document.querySelector('.results-table-section').scrollIntoView({ behavior: 'smooth' });
            });
            pageNumbersContainer.appendChild(btn);
        }
    });
}

// Open Details Modal and populate data
function openRunnerDetails(runner) {
    selectedRunner = runner;
    
    // Fill basic details
    document.getElementById('modal-bib-badge').textContent = `Placa ${runner.placa}`;
    document.getElementById('modal-runner-name').textContent = runner.nombre;
    document.getElementById('modal-runner-cat').textContent = runner.categoria;
    document.getElementById('modal-time').textContent = runner.tiempo;
    document.getElementById('modal-pace').textContent = runner.ritmo || 'N/A';
    document.getElementById('modal-speed').textContent = runner.vel_prom || 'N/A';
    document.getElementById('modal-city').textContent = runner.ciudad || 'N/A';
    
    // Parse stats_diploma: e.g. "1. /11 974. /1597"
    const statsStr = runner.stats_diploma || "";
    const match = statsStr.match(/(\d+)\.\s*\/(\d+)\s+(\d+)\.\s*\/(\d+)/);
    let posCat = "--", totalCat = "--", posGen = "--", totalGen = "--";
    
    if (match) {
        posCat = `${match[1]}º`;
        totalCat = match[2];
        posGen = `${match[3]}º`;
        totalGen = match[4];
        
        document.getElementById('modal-pos-cat').textContent = `${posCat} de ${totalCat}`;
        document.getElementById('modal-pos-gen').textContent = `${posGen} de ${totalGen}`;
    } else {
        // Fallbacks
        document.getElementById('modal-pos-cat').textContent = `${runner.puesto}º`;
        document.getElementById('modal-pos-gen').textContent = '--';
    }
    
    // Set diploma book info text
    if (runner.pdf_page) {
        document.getElementById('diploma-page-info').textContent = `Página ${runner.pdf_page} de ${1629} del libro de actas`;
        document.getElementById('download-diploma-btn').disabled = false;
    } else {
        document.getElementById('diploma-page-info').textContent = 'Diploma no disponible para este corredor';
        document.getElementById('download-diploma-btn').disabled = true;
    }
    
    // Display difference with leader
    const diffEl = document.getElementById('modal-diff');
    if (runner.dif === '--' || runner.puesto === 1) {
        diffEl.textContent = 'Ganador / Líder';
        diffEl.style.color = 'var(--accent-teal)';
    } else {
        diffEl.textContent = runner.dif;
        diffEl.style.color = 'var(--text-secondary)';
    }
    
    // Calculate performance comparison bar percentage
    // Let's match their average speed compared to category maximum
    const fillBar = document.getElementById('modal-comp-bar');
    
    // Calculate runner's speed float value
    let runnerSpeed = 0;
    if (runner.vel_prom) {
        const speedVal = parseFloat(runner.vel_prom.replace(/[^\d.]/g, ''));
        if (!isNaN(speedVal)) runnerSpeed = speedVal;
    }
    
    // Find category maximum speed
    let catMaxSpeed = 10; // default minimum
    RUNNERS_DATA.forEach(r => {
        if (r.categoria === runner.categoria && r.vel_prom) {
            const speedVal = parseFloat(r.vel_prom.replace(/[^\d.]/g, ''));
            if (!isNaN(speedVal) && speedVal > catMaxSpeed) {
                catMaxSpeed = speedVal;
            }
        }
    });
    
    // Calculate percentage (scale to look good, minimal width 15% for readability)
    let percent = 50;
    if (runnerSpeed > 0 && catMaxSpeed > 0) {
        percent = Math.max(15, Math.min(100, (runnerSpeed / catMaxSpeed) * 100));
    }
    
    // Reset bar width and expand with animation delay
    fillBar.style.width = '0%';
    setTimeout(() => {
        fillBar.style.width = `${percent}%`;
    }, 150);
    
    // Open Modal
    const modal = document.getElementById('runner-modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Disable scroll on body
}

// Close Modal
function closeModal() {
    const modal = document.getElementById('runner-modal');
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Re-enable scroll
}

// Download PDF diploma (slices single page client-side)
async function downloadDiploma() {
    if (!selectedRunner || !selectedRunner.pdf_page) return;
    
    // Safety check for local file system CORS fetch issue
    if (window.location.protocol === 'file:') {
        alert('Error de Seguridad (CORS):\n\nNo se puede descargar el diploma abriendo el archivo HTML directamente en el navegador.\n\nPor favor, ejecuta el archivo "run.bat" de la carpeta para iniciar el servidor local.');
        return;
    }
    
    const downloadBtn = document.getElementById('download-diploma-btn');
    const btnText = downloadBtn.querySelector('.btn-text');
    const spinner = downloadBtn.querySelector('.spinner');
    
    // Show loading spinner state
    downloadBtn.disabled = true;
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    
    try {
        // Fetch the large PDF file arraybuffer if not cached yet
        if (!cachedPdfBytes) {
            const response = await fetch('Diplomas/DIPLOMAS.pdf');
            if (!response.ok) {
                throw new Error('No se pudo descargar el archivo DIPLOMAS.pdf del servidor.');
            }
            cachedPdfBytes = await response.arrayBuffer();
        }
        
        // Process PDF client-side
        const { PDFDocument } = PDFLib;
        const mainPdfDoc = await PDFDocument.load(cachedPdfBytes);
        const singlePageDoc = await PDFDocument.create();
        
        // pdf_page is 1-indexed, convert to 0-indexed for pdf-lib copyPages API
        const pageIdx = selectedRunner.pdf_page - 1;
        
        // Copy the specific page from the master PDF
        const [copiedPage] = await singlePageDoc.copyPages(mainPdfDoc, [pageIdx]);
        singlePageDoc.addPage(copiedPage);
        
        // Save the single-page document as bytes
        const pdfBytes = await singlePageDoc.save();
        
        // Trigger download in browser
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = downloadUrl;
        
        // Format filename cleanly
        const cleanName = selectedRunner.nombre
            .normalize('NFD') // remove spanish accents
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_');
            
        link.download = `Diploma_MMF2026_${cleanName}_Placa_${selectedRunner.placa}.pdf`;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup resources
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
        
    } catch (err) {
        console.error('Error extracting PDF page:', err);
        alert(`Ocurrió un error al procesar el diploma: ${err.message}\n\nAsegúrate de que la carpeta "Diplomas" con el archivo "DIPLOMAS.pdf" esté ubicada en el mismo directorio.`);
    } finally {
        // Reset button state
        downloadBtn.disabled = false;
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}
