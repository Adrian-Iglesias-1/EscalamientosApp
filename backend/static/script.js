var failuresData = [];
var fullData = null;
var xolRecords = [];
var currentXolATM = null;
var scriptsFallas = [];
var metricasChart = null;
var metricasChartDias = null;
var metricasChartSector = null;

// ==========================================
// TOAST & MODAL (Bootstrap)
// ==========================================

function showToast(message, type) {
    type = type || 'success';
    var toast = document.getElementById('appToast');
    var icon = document.getElementById('toast-icon');
    var msg = document.getElementById('toast-message');

    toast.className = 'toast align-items-center border-0 shadow';
    if (type === 'success') {
        toast.classList.add('bg-success-custom');
        icon.className = 'bi bi-check-circle-fill';
    } else if (type === 'danger') {
        toast.classList.add('bg-danger-custom');
        icon.className = 'bi bi-exclamation-triangle-fill';
    } else {
        toast.classList.add('bg-warning');
        icon.className = 'bi bi-info-circle-fill';
    }
    msg.textContent = message;

    var bsToast = new bootstrap.Toast(toast, { delay: 4000 });
    bsToast.show();
}

function showConfirm(message, onConfirm, title) {
    title = title || 'Confirmar';
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    var modal = new bootstrap.Modal(document.getElementById('confirmModal'));

    var btn = document.getElementById('confirmBtn');
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.id = 'confirmBtn';
    newBtn.addEventListener('click', function() {
        modal.hide();
        onConfirm();
    });

    modal.show();
}

// ==========================================
// ESTADO Y CARGA DE DATOS
// ==========================================

function toggleFeriadoIndicator() {
    var checked = document.getElementById('mode-feriado').checked;
    var indicator = document.getElementById('feriado-indicator');
    if (checked) {
        indicator.classList.remove('d-none');
    } else {
        indicator.classList.add('d-none');
    }
}

async function updateStatus() {
    try {
        var res = await fetch('/api/status');
        var data = await res.json();
        var badge = document.getElementById('connection-status');
        if (data.excel_connected) {
            badge.textContent = '\u2713 Planilla Conectada';
            badge.className = 'badge bg-success';
        } else {
            badge.textContent = '\u2717 No Encontrada';
            badge.className = 'badge bg-danger';
        }
        document.getElementById('atm-count').textContent = data.n_atms + ' ATMs';
        
        // Show Sunday indicator automatically (separate from holiday checkbox)
        var domingoIndicator = document.getElementById('domingo-indicator');
        if (domingoIndicator) {
            if (data.es_domingo) {
                domingoIndicator.classList.remove('d-none');
            } else {
                domingoIndicator.classList.add('d-none');
            }
        }
    } catch (e) { console.error(e); }
}

async function loadData() {
    try {
        var res = await fetch('/api/load-data');
        var d = await res.json();
        if (d.status === 'success') {
            fullData = d.data;
            console.log('Datos cargados:', Object.keys(fullData.unificado).length, 'ATMs');
        } else {
            console.error('Error cargando datos:', d.message);
        }
    } catch (e) { console.error('Error fetch load-data:', e); }
}

// ==========================================
// TABS PRINCIPALES
// ==========================================

function syncSendPanelVisibility() {
    var spw = document.getElementById('send-panel-wrapper');
    var main = document.querySelector('main.flex-grow-1');
    var fallas = document.getElementById('tab-fallas');
    var show = fallas && fallas.classList.contains('active');
    if (spw) spw.style.display = show ? '' : 'none';
    if (main) main.classList.toggle('main--send-panel-space', show);
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('#mainTabs .nav-link').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('tab-' + tabId).classList.add('active');
    if (typeof event !== 'undefined' && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        var link = document.querySelector('#mainTabs .nav-link[onclick*="' + tabId + '"]');
        if (link) link.classList.add('active');
    }

    syncSendPanelVisibility();

    if (tabId === 'xolusat') {
        loadXolRecords();
    }
    if (tabId === 'metricas') {
        loadMetricas();
    }
}

// ==========================================
// XOLUSAT SUB-TABS
// ==========================================

function showXolTab(subtabId, btn) {
    document.querySelectorAll('.xol-subtab-content').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.nav-tabs .nav-link').forEach(function(b) { b.classList.remove('active'); });
    document.getElementById('xol-tab-' + subtabId).classList.add('active');
    btn.classList.add('active');

    // Ocultar card "Buscar ATM" al ir a Lista
    var searchCard = document.querySelector('#tab-xolusat > .card');
    if (searchCard) {
        searchCard.style.display = (subtabId === 'nuevo') ? '' : 'none';
    }

    if (subtabId === 'lista') {
        loadXolRecords();
    }
}

// ==========================================
// PROCESAR FALLAS
// ==========================================

async function processFailures() {
    var text = document.getElementById('pasted-text').value;
    if (!text) return showToast('Pegá datos primero', 'danger');

    // Estado loading
    var lineCount = text.trim().split(/\r?\n/).filter(function(l) { return l.trim(); }).length;
    setProcesarState('loading', 'Procesando ' + lineCount + ' líneas...');

    // Asegurar que fullData esté cargado
    if (!fullData) {
        await loadData();
    }

    try {
        var res = await fetch('/api/process-failures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        var data = await res.json();
        if (data.status === 'success') {
            failuresData = data.failures;
            renderPreview();
            var nAtms = data.failures.filter(function(r){return !r._is_header;}).length;
            metricasStartSession(nAtms);
            showToast(data.failures.length + ' fallas cargadas', 'success');
            var emailInfo = document.getElementById('email-info');
            if (emailInfo) {
                emailInfo.textContent = data.failures.length + ' fallas listas para enviar';
                emailInfo.className = 'has-data';
            }
            // Actualizar resumen
            updateSendSummary();
        } else {
            showToast(data.message, 'danger');
        }
    } catch (e) { 
        showToast('Error al procesar datos', 'danger'); 
    } finally {
        // Restaurar botón
        setProcesarState('active');
    }
}

function renderPreview() {
    var tbody = document.getElementById('preview-tbody') ||
                document.querySelector('#preview-table tbody');
    
    // Limpiar filas de datos (preservar empty-row)
    Array.from(tbody.querySelectorAll('tr:not(#preview-empty-row)')).forEach(function(r) { r.remove(); });
    
    var notFound = [];

    // Filtrar headers - mostrar todos los ATMs (sin límite)
    var dataToShow = failuresData.filter(function(row) {
        return row['_is_header'] !== true;
    });

    var emptyRow = document.getElementById('preview-empty-row');
    if (emptyRow) emptyRow.style.display = dataToShow.length === 0 ? '' : 'none';

    dataToShow.forEach(function(row, i) {
        var idRaw    = row['0'] || '';
        var nombre   = row['_nombre'] || '';
        var custodio = row['_custodio'] || '';
        var found    = row['_found'] === true || row['_found'] === 'true';

        if (!found && idRaw.trim() && idRaw.toLowerCase() !== 'nan') {
            if (notFound.indexOf(idRaw) === -1) notFound.push(idRaw);
        }

        var custLabel = custodio || '—';
        var custClass = custodioClass(custodio);
        var tr = document.createElement('tr');
        tr.className = 'row-animate';
        tr.style.animationDelay = (i * 30) + 'ms';
        tr.innerHTML =
            '<td>' + idRaw + '</td>' +
            '<td>' + nombre + '</td>' +
            '<td><span class="' + custClass + '">' + custLabel + '</span></td>';
        tbody.appendChild(tr);
    });

    // Mostrar sección de no encontrados
    var section = document.getElementById('not-found-section');
    var list    = document.getElementById('not-found-list');
    if (notFound.length > 0) {
        section.style.display = 'block';
        list.innerHTML = '';
        notFound.forEach(function(id) {
            var div = document.createElement('div');
            div.className = 'border rounded p-3 bg-light';
            div.id = 'notfound-' + normalizarId(id);
            var nid = normalizarId(id);
            div.innerHTML =
                '<div class="d-flex align-items-center gap-3 mb-2">' +
                    '<span class="badge bg-danger">' + id + '</span>' +
                    '<span class="text-muted small">No registrado en la planilla</span>' +
                '</div>' +
                '<div class="row g-2">' +
                    '<div class="col-md-4">' +
                        '<input type="text" class="form-control form-control-sm" placeholder="Nombre (Ag. Ejemplo)" id="nf-name-' + nid + '">' +
                    '</div>' +
                    '<div class="col-md-4">' +
                        '<select class="form-select form-select-sm" id="nf-cust-' + nid + '" onchange="toggleNfEmail(\'' + nid + '\')">' +
                            '<option value="SUCURSAL">SUCURSAL</option>' +
                            '<option value="STE Metro">STE Metro</option>' +
                            '<option value="Brinks METRO">Brinks METRO</option>' +
                            '<option value="Brinks NORTE">Brinks NORTE</option>' +
                            '<option value="Brinks ESTE">Brinks ESTE</option>' +
                            '<option value="Brinks SUR">Brinks SUR</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="col-md-2">' +
                        '<input type="text" class="form-control form-control-sm" placeholder="SLA" id="nf-sla-' + nid + '">' +
                    '</div>' +
                    '<div class="col-md-2">' +
                        '<button class="btn btn-success btn-sm w-100" onclick="addNotFoundATM(\'' + id + '\')"><i class="bi bi-plus-circle"></i> Agregar</button>' +
                    '</div>' +
                '</div>' +
                '<div class="row g-2 mt-2" id="nf-email-row-' + nid + '">' +
                    '<div class="col-md-6">' +
                        '<input type="text" class="form-control form-control-sm" placeholder="Email sucursal" id="nf-email-' + nid + '">' +
                    '</div>' +
                    '<div class="col-md-6">' +
                        '<input type="text" class="form-control form-control-sm" placeholder="CC (opcional)" id="nf-cc-' + nid + '">' +
                    '</div>' +
                '</div>';
            list.appendChild(div);
        });
    } else {
        section.style.display = 'none';
    }
}

function normalizarId(id) {
    return (id || '').toUpperCase().replace(/[.\-_\s\/]/g, '');
}

function toggleNfEmail(idNorm) {
    var sel = document.getElementById('nf-cust-' + idNorm);
    var row = document.getElementById('nf-email-row-' + idNorm);
    if (!sel || !row) return;
    row.style.display = (sel.value === 'SUCURSAL') ? '' : 'none';
}

async function addNotFoundATM(idRaw) {
    var idNorm = normalizarId(idRaw);
    var nombre = document.getElementById('nf-name-' + idNorm).value.trim();
    var custodio = document.getElementById('nf-cust-' + idNorm).value;
    var sla = document.getElementById('nf-sla-' + idNorm).value.trim();
    var emailEl = document.getElementById('nf-email-' + idNorm);
    var ccEl = document.getElementById('nf-cc-' + idNorm);
    var email = emailEl ? emailEl.value.trim() : '';
    var cc = ccEl ? ccEl.value.trim() : '';

    if (!nombre) return showToast('Ingrese el nombre del ATM', 'danger');
    if (!sla) return showToast('Ingrese el SLA', 'danger');
    if (custodio === 'SUCURSAL' && !email) {
        return showToast('Ingrese el email de la sucursal', 'danger');
    }

    try {
        var res = await fetch('/api/add-atm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: idRaw, nombre: nombre, sla: sla, custodio: custodio, email: email, cc: cc })
        });
        var data = await res.json();
        if (data.status === 'success') {
            showToast('ATM ' + idRaw + ' agregado correctamente', 'success');
            // Re-procesar fallas para que el backend devuelva el custodio actualizado
            var text = document.getElementById('pasted-text').value;
            if (text) {
                var res2 = await fetch('/api/process-failures', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                var data2 = await res2.json();
                if (data2.status === 'success') {
                    failuresData = data2.failures;
                }
            }
            await loadData();
            renderPreview();
            // Ya no se generan automáticamente al agregar ATM
        } else {
            showToast(data.message || 'Error al guardar', 'danger');
        }
    } catch (e) { showToast('Error al guardar ATM', 'danger'); }
}

function custodioClass(custodio) {
    var c = (custodio || '').toUpperCase();
    if (c.indexOf('BRINKS') !== -1) return 'badge-custodio badge-brinks';
    if (c.indexOf('STE')    !== -1) return 'badge-custodio badge-ste';
    if (c.indexOf('SUCURSAL') !== -1 || c.startsWith('SUC')) return 'badge-custodio badge-sucursal';
    if (custodio && custodio.trim()) return 'badge-custodio badge-otro';
    return 'badge-custodio badge-desconocido';
}

function updateLineCount() {
    var textarea = document.getElementById('pasted-text');
    var counter = document.getElementById('line-count');
    var btn = document.getElementById('btn-procesar');
    
    if (!textarea || !counter) return;
    
    var text = textarea.value.trim();
    var lines = text ? text.split(/\r?\n/).filter(function(l) { return l.trim(); }).length : 0;
    
    counter.textContent = lines + (lines === 1 ? ' línea' : ' líneas');
    counter.classList.toggle('has-lines', lines > 0);
    textarea.classList.toggle('has-lines', lines > 0);
    
    // Animación de cambio
    counter.classList.add('changed');
    setTimeout(function() { counter.classList.remove('changed'); }, 200);
    
    // Habilitar/deshabilitar botón
    if (btn) {
        btn.disabled = lines === 0;
    }
}

// Drag & Drop handlers
function setupDropZone() {
    var dropZone = document.querySelector('.drop-zone');
    var textarea = document.getElementById('pasted-text');
    if (!dropZone || !textarea) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, function() {
            dropZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(function(eventName) {
        dropZone.addEventListener(eventName, function(e) {
            if (eventName === 'dragleave' && e.target !== dropZone) return;
            dropZone.classList.remove('dragover');
        }, false);
    });
    
    dropZone.addEventListener('drop', function(e) {
        // El área es solo para pegar desde Excel (Ctrl+C / Ctrl+V)
        // No se procesan archivos arrastrados
    }, false);
}

function setProcesarState(state, message) {
    var btn = document.getElementById('btn-procesar');
    var icon = document.getElementById('btn-procesar-icon');
    var text = document.getElementById('btn-procesar-text');
    
    if (!btn) return;
    
    switch(state) {
        case 'loading':
            btn.disabled = true;
            icon.className = 'bi bi-arrow-repeat spin me-1';
            text.textContent = message || 'Procesando...';
            break;
        case 'active':
            btn.disabled = false;
            icon.className = 'bi bi-play-fill me-1';
            text.textContent = message || 'Procesar Datos';
            break;
        case 'disabled':
        default:
            btn.disabled = true;
            icon.className = 'bi bi-play-fill me-1';
            text.textContent = message || 'Procesar Datos';
    }
}

function updateSendSummary() {
    var summaryDiv = document.getElementById('send-summary');
    if (!summaryDiv || failuresData.length === 0) {
        if (summaryDiv) summaryDiv.classList.add('d-none');
        return;
    }
    
    var sucursales = 0;
    var terceros = 0;
    
    failuresData.forEach(function(row) {
        var custodio = (row['_custodio'] || '').toUpperCase();
        if (custodio.includes('SUCURSAL') || custodio.startsWith('SUC')) {
            sucursales++;
        } else if (custodio && custodio !== '—') {
            terceros++;
        }
    });
    
    var total = failuresData.length;
    var html = '<span class="stat stat-total">' +
               '<span class="stat-badge">' + total + '</span> ATMs' +
               '</span>';
    
    if (sucursales > 0) {
        html += '<span class="stat stat-suc">' +
                '<span class="stat-badge">' + sucursales + '</span> Sucursales' +
                '</span>';
    }
    if (terceros > 0) {
        html += '<span class="stat stat-ter">' +
                '<span class="stat-badge">' + terceros + '</span> Terceros' +
                '</span>';
    }
    
    summaryDiv.innerHTML = html;
    summaryDiv.classList.remove('d-none');
}

function clearFailures() {
    document.getElementById('pasted-text').value = '';
    failuresData = [];
    scriptsFallas = [];
    metricasResetTimer();
    
    // Restaurar empty state en la tabla
    var tbody = document.getElementById('preview-tbody') ||
                document.querySelector('#preview-table tbody');
    Array.from(tbody.querySelectorAll('tr:not(#preview-empty-row)')).forEach(function(r) { r.remove(); });
    var emptyRow = document.getElementById('preview-empty-row');
    if (emptyRow) emptyRow.style.display = '';

    document.getElementById('scripts-container-fallas').innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-inbox fs-1 d-block mb-2"></i>Cargá fallas en Gestión de Fallas para generar scripts.</div>';
    
    var emailInfo = document.getElementById('email-info');
    if (emailInfo) {
        emailInfo.textContent = 'Cargá fallas para comenzar';
        emailInfo.className = '';
    }
    
    // Ocultar resumen
    var summaryDiv = document.getElementById('send-summary');
    if (summaryDiv) summaryDiv.classList.add('d-none');
    
    document.getElementById('not-found-section').style.display = 'none';
    
    // Resetear contador y botón
    updateLineCount();
    setProcesarState('disabled');
    
    showToast('Datos limpiados', 'success');
}

// ==========================================
// SCRIPTS
// ==========================================

async function loadScripts() {
    if (failuresData.length === 0) return showToast('Cargá fallas primero', 'danger');
    var isFeriado = document.getElementById('mode-feriado').checked;

    // Filtrar el header (filas con _is_header: true)
    var failuresSinHeader = failuresData.filter(function(row) {
        return row['_is_header'] !== true;
    });

    try {
        var res = await fetch('/api/generate-scripts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ failures: failuresSinHeader, is_feriado: isFeriado })
        });
        var data = await res.json();
        if (data.status === 'success') {
            scriptsFallas = data.scripts || [];
            renderScriptsOnlyFallas();
            metricasMarkScripts(scriptsFallas.length);
            showToast(scriptsFallas.length + ' scripts generados', 'success');
            // Cambiar al tab de scripts para mostrar los resultados
            document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
            document.getElementById('tab-scripts').classList.add('active');
            document.querySelectorAll('#mainTabs .nav-link').forEach(function(b) { b.classList.remove('active'); });
            var scriptsLink = document.querySelector('#mainTabs .nav-link[onclick*="scripts"]');
            if (scriptsLink) scriptsLink.classList.add('active');
            syncSendPanelVisibility();
        }
    } catch (e) { 
        console.error(e);
        showToast('Error al generar scripts', 'danger');
    }
}

function renderScriptsOnlyFallas() {
    var container = document.getElementById('scripts-container-fallas');
    container.innerHTML = '';
    
    if (scriptsFallas.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-5">No se generaron scripts de escalamiento.</div>';
        return;
    }
    
    scriptsFallas.forEach(function(s) {
        var div = document.createElement('div');
        div.className = 'script-item';
        var safeComment = s.comentario.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        var destino = extraerDestino(s.comentario);
        var destinoClass = destino === 'Brinks' ? 'bg-warning text-dark' : destino === 'STE' ? 'bg-info' : 'bg-secondary';
        div.innerHTML =
            '<div class="script-header">' +
                '<div><span class="badge bg-dark me-2">TK: ' + s.ticket + '</span><span class="badge ' + destinoClass + '">' + destino + '</span></div>' +
                '<button onclick="copyToClipboard(\'' + safeComment + '\')" class="btn btn-outline-dark btn-sm" title="Copiar"><i class="bi bi-clipboard"></i></button>' +
            '</div>' +
            '<code class="small text-dark">' + s.comentario + '</code>';
        container.appendChild(div);
    });
}

function extraerDestino(comentario) {
    var match = comentario.match(/Se escala a (\S+)/);
    return match ? match[1] : 'N/A';
}

async function exportScriptsToExcel() {
    if (failuresData.length === 0) return showToast('No hay datos para exportar', 'danger');
    var isFeriado = document.getElementById('mode-feriado').checked;

    // Filtrar header igual que sendEmails y loadScripts
    var failuresSinHeader = failuresData.filter(function(row) {
        return row['_is_header'] !== true;
    });

    try {
        var resScripts = await fetch('/api/generate-scripts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ failures: failuresSinHeader, is_feriado: isFeriado })
        });
        var dataScripts = await resScripts.json();
        if (dataScripts.status !== 'success') return showToast('Error generando scripts', 'danger');

        var res = await fetch('/api/export-scripts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scripts: dataScripts.scripts })
        });

        if (res.ok) {
            var blob = await res.blob();
            var url = window.URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'Scripts_Export_' + new Date().getTime() + '.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Excel exportado', 'success');
        } else {
            showToast('Error al exportar', 'danger');
        }
    } catch (e) { showToast('Error de conexión', 'danger'); }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        showToast('Copiado al portapapeles', 'success');
    });
}

// ==========================================
// ENVIAR CORREOS
// ==========================================

async function sendEmails() {
    if (failuresData.length === 0) return showToast('Cargá fallas primero', 'danger');
    var isFeriado = document.getElementById('mode-feriado').checked;

    // Filtrar el header (filas con _is_header: true)
    var failuresSinHeader = failuresData.filter(function(row) {
        return row['_is_header'] !== true;
    });

    try {
        var res = await fetch('/api/send-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ failures: failuresSinHeader, is_feriado: isFeriado })
        });
        var data = await res.json();
        if (data.status === 'success') {
            var r = data.results;
            metricasMarkCorreos(r.abiertos, r.sucursal, r.custodios);
            var toastParts = ['Correos: ' + r.abiertos + ' abiertos'];
            if (r.sucursal)  toastParts.push(r.sucursal  + ' sucursal');
            if (r.custodios) toastParts.push(r.custodios + ' custodios');
            toastParts.push(r.sin_sla + ' sin SLA', r.sin_contacto + ' sin contacto');
            showToast(toastParts.join(' | '), 'success');
        } else {
            showToast(data.message || 'Error al enviar correos', 'danger');
        }
    } catch (e) { showToast('Error al enviar correos', 'danger'); }
}

// ==========================================
// XOLUSAT
// ==========================================

async function searchATMXol() {
    var id = document.getElementById('xol-search-id').value;
    var infoContainer = document.getElementById('xol-atm-info');
    if (!id) return;

    try {
        var res = await fetch('/api/xolusat/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        var data = await res.json();

        if (data.status === 'found') {
            currentXolATM = data;
            infoContainer.innerHTML = '<div class="alert alert-success py-2 mb-0 d-flex align-items-center gap-2"><i class="bi bi-check-circle-fill"></i> <strong>' + data.nombre + '</strong> <span class="badge bg-success">' + data.sla + '</span></div>';
            document.getElementById('xol-sla').value = data.sla || '';
            document.getElementById('xol-atm-nombre').value = data.nombre || '';
        } else {
            currentXolATM = null;
            infoContainer.innerHTML = '<div class="alert alert-danger py-2 mb-0 d-flex align-items-center gap-2"><i class="bi bi-exclamation-triangle-fill"></i> ATM no encontrado</div>';
            document.getElementById('xol-sla').value = '';
            document.getElementById('xol-atm-nombre').value = '';
        }
    } catch (e) { console.error(e); }
}

function clearXolSearch() {
    document.getElementById('xol-search-id').value = '';
    document.getElementById('xol-atm-info').innerHTML = '';
    document.getElementById('xol-sla').value = '';
    document.getElementById('xol-atm-nombre').value = '';
    document.getElementById('xol-incident').value = '';
    document.getElementById('xol-detalle').value = '';
    currentXolATM = null;
}

async function registerXol(sendEmail) {
    var incident = document.getElementById('xol-incident').value;
    var estado = document.getElementById('xol-estado').value;
    var subcatSelect = document.getElementById('xol-subcat');
    var subcat = subcatSelect.value;
    if (subcat === 'OTRA') {
        subcat = document.getElementById('xol-subcat-otra').value;
        if (!subcat.trim()) return showToast('Especifique la subcategoría', 'danger');
    }
    var detalle = document.getElementById('xol-detalle').value;
    var atmId = document.getElementById('xol-search-id').value;
    var sla = document.getElementById('xol-sla').value;
    var atmNombre = document.getElementById('xol-atm-nombre').value;

    if (!incident || !atmId) return showToast('Incident e ID ATM son obligatorios', 'danger');

    var custodio = currentXolATM ? currentXolATM.custodio : 'SUCURSAL';

    try {
        var res = await fetch('/api/xolusat/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident: incident, estado: estado, id_atm: atmId,
                subcategoria: subcat, detalle: detalle, sla: sla,
                atm_nombre: atmNombre, custodio: custodio, send_email: sendEmail
            })
        });
        var data = await res.json();
        if (data.status === 'success' || data.status === 'warning') {
            showToast(data.message, 'success');
            loadXolRecords();
        } else {
            showToast(data.message, 'danger');
        }
    } catch (e) { showToast('Error al registrar', 'danger'); }
}

async function loadXolRecords() {
    var estadoFilter = document.getElementById('xol-filter-estado');
    var subcatFilter = document.getElementById('xol-filter-subcat');
    var params = '';
    if (estadoFilter && estadoFilter.value !== 'Todos') {
        params += '?estado=' + encodeURIComponent(estadoFilter.value);
    }
    if (subcatFilter && subcatFilter.value !== 'Todas') {
        params += (params ? '&' : '?') + 'subcategoria=' + encodeURIComponent(subcatFilter.value);
    }

    try {
        var res = await fetch('/api/xolusat/list' + params);
        var data = await res.json();
        if (data.status === 'success') {
            xolRecords = data.records;
            renderXolTable();
            updateIncidentDropdown();
        }
    } catch (e) { console.error(e); }
}

function renderXolTable() {
    var tbody = document.querySelector('#xol-table tbody');
    var emptyState = document.getElementById('xol-empty');
    var tableWrap = document.querySelector('.xol-table-wrap');

    tbody.innerHTML = '';

    if (xolRecords.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (tableWrap) tableWrap.style.display = 'none';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (tableWrap) tableWrap.style.display = 'block';

    xolRecords.forEach(function(r, idx) {
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td><strong>' + (r.incident || '') + '</strong></td>' +
            '<td>' + estadoBadge(r.estado) + '</td>' +
            '<td>' + (r.id_atm || '') + '</td>' +
            '<td>' + (r.subcategoria || '') + '</td>' +
            '<td class="text-truncate" style="max-width:120px;">' + (r.detalle || '') + '</td>' +
            '<td>' + (r.sla || '') + '</td>' +
            '<td>' + (r.atm_nombre || '') + '</td>' +
            '<td class="text-truncate" style="max-width:100px;">' + (r.custodio || '') + '</td>' +
            '<td class="text-muted small">' + (r.fecha_reg || '') + '</td>' +
            '<td class="text-center">' +
                '<button class="btn btn-outline-danger btn-sm py-1 px-2" ' +
                    'onclick="deleteXolRecord(' + idx + ')" title="Eliminar">' +
                    '<i class="bi bi-x-lg"></i>' +
                '</button>' +
            '</td>';
        tbody.appendChild(tr);
    });
}

async function deleteXolRecord(idx) {
    var record = xolRecords[idx];
    if (!record) return;

    try {
        var res = await fetch('/api/xolusat/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incident: record.incident })
        });
        var json = await res.json();
        if (json.status === 'success') {
            xolRecords.splice(idx, 1);
            renderXolTable();
            showToast('Registro eliminado', 'danger');
            updateIncidentDropdown();
        } else {
            showToast(json.message || 'No se pudo eliminar', 'danger');
        }
    } catch (e) {
        showToast('Error de conexión al eliminar', 'danger');
    }
}

function estadoBadge(estado) {
    var map = { 'OPEN': 'bg-success', 'ASSIGNED': 'bg-primary', 'SUSPENDED': 'bg-warning text-dark', 'DISPATCHED': 'bg-info', 'CLOSED': 'bg-secondary' };
    var cls = map[estado] || 'bg-secondary';
    return '<span class="badge ' + cls + '">' + estado + '</span>';
}

function updateIncidentDropdown() {
    var select = document.getElementById('xol-update-incident');
    select.innerHTML = '';
    xolRecords.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.incident;
        opt.text = r.incident + ' - ' + r.id_atm;
        select.appendChild(opt);
    });
}

function toggleSubcatOtra() {
    var select = document.getElementById('xol-subcat');
    var otraInput = document.getElementById('xol-subcat-otra-container');
    otraInput.style.display = select.value === 'OTRA' ? 'block' : 'none';
}

async function updateXolStatus() {
    var incident = document.getElementById('xol-update-incident').value;
    var estado = document.getElementById('xol-update-estado').value;
    if (!incident) return showToast('Seleccione un incidente', 'danger');

    try {
        var res = await fetch('/api/xolusat/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incident: incident, estado: estado })
        });
        var data = await res.json();
        showToast(data.message, 'success');
        loadXolRecords();
    } catch (e) { showToast('Error al actualizar', 'danger'); }
}

function clearXolRecords() {
    showConfirm('¿Eliminar todos los registros XOLUSAT?', async function() {
        try {
            await fetch('/api/xolusat/clear', { method: 'POST' });
            xolRecords = [];
            renderXolTable();
            updateIncidentDropdown();
            showToast('Registros limpiados', 'success');
        } catch (e) { console.error(e); }
    }, 'Limpiar registros');
}

// ==========================================
// RCU UPLOAD
// ==========================================

document.getElementById('rcu-upload').addEventListener('change', async function(e) {
    var file = e.target.files[0];
    if (!file) return;

    var statusDiv = document.getElementById('rcu-status');
    var btn = document.getElementById('rcu-btn');

    // Estado: cargando
    statusDiv.style.display = 'block';
    statusDiv.innerHTML =
        '<div class="alert alert-info py-2 mb-0">' +
            '<div class="d-flex align-items-center gap-2">' +
                '<div class="spinner-border spinner-border-sm" role="status"></div>' +
                '<div>' +
                    '<strong>' + file.name + '</strong><br>' +
                    '<small>Procesando...</small>' +
                '</div>' +
            '</div>' +
        '</div>';
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner-border spinner-border-sm me-1"></div> Procesando...';

    var formData = new FormData();
    formData.append('file', file);

    try {
        var res = await fetch('/api/upload-rcu', { method: 'POST', body: formData });
        var data = await res.json();

        if (data.status === 'success' && data.results) {
            var r = data.results;
            var html =
                '<div class="alert alert-success py-2 mb-0">' +
                    '<i class="bi bi-check-circle-fill me-1"></i> <strong>Completado</strong>' +
                    '<div class="mt-1 small">' +
                        '<div><i class="bi bi-arrow-repeat me-1"></i> Actualizados: <strong>' + r.actualizados + '</strong></div>' +
                        '<div><i class="bi bi-plus-circle me-1"></i> Nuevos: <strong>' + r.nuevos + '</strong></div>';
            if (r.eliminados > 0) {
                html += '<div><i class="bi bi-trash3 me-1"></i> Eliminados: <strong>' + r.eliminados + '</strong></div>';
            }
            html += '<div class="text-muted"><i class="bi bi-database me-1"></i> Total ATMs en planilla: <strong>' + r.total_planilla + '</strong></div>' +
                    '</div>' +
                '</div>';
            statusDiv.innerHTML = html;
            showToast('RCU procesado: ' + r.actualizados + ' actualizados, ' + r.nuevos + ' nuevos', 'success');
        } else if (data.status === 'success') {
            statusDiv.innerHTML =
                '<div class="alert alert-success py-2 mb-0">' +
                    '<i class="bi bi-check-circle-fill me-1"></i> ' + (data.message || 'Archivo procesado') +
                '</div>';
            showToast(data.message || 'RCU procesado', 'success');
        } else {
            statusDiv.innerHTML =
                '<div class="alert alert-danger py-2 mb-0">' +
                    '<i class="bi bi-exclamation-triangle-fill me-1"></i> ' + (data.message || 'Error al procesar') +
                '</div>';
            showToast(data.message || 'Error al procesar RCU', 'danger');
        }
        updateStatus();
        loadData();
    } catch (err) {
        statusDiv.innerHTML =
            '<div class="alert alert-danger py-2 mb-0">' +
                '<i class="bi bi-exclamation-triangle-fill me-1"></i> Error de conexión' +
            '</div>';
        showToast('Error al subir archivo', 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-upload me-1"></i> Seleccionar archivo';
        // Limpiar el input para permitir re-subir el mismo archivo
        e.target.value = '';
    }
});

function toggleCollapse(id) {
    var el = document.getElementById(id);
    var icon = document.getElementById(id + '-icon');
    if (el.style.display === 'none') {
        el.style.display = 'block';
        if (icon) icon.className = 'bi bi-chevron-down';
    } else {
        el.style.display = 'none';
        if (icon) icon.className = 'bi bi-chevron-right';
    }
}

// ==========================================
// TAB CONTACTOS
// ==========================================

var contactosData = null;

async function loadContactos() {
    try {
        var res = await fetch('/api/contactos/list');
        var data = await res.json();
        if (data.status === 'success') {
            contactosData = data.data;
            renderTercerosLV();
            renderTercerosFinde();
            renderSucursalFinde();
        } else {
            showToast(data.message || 'Error', 'danger');
        }
    } catch (e) { showToast('Error de conexión', 'danger'); }
}

// ── TERCEROS L-V ──
function renderTercerosLV() {
    var tbody = document.getElementById('contactos-terceros-lv-tbody');
    tbody.innerHTML = '';
    var lista = contactosData.terceros || [];
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin custodios</td></tr>';
        return;
    }
    lista.forEach(function(c) {
        var tr = document.createElement('tr');
        var safe = escAttr(c.custodio);
        tr.innerHTML =
            '<td class="fw-semibold">' + c.custodio + '</td>' +
            '<td><input type="text" class="form-control form-control-sm" value="' + escAttr(c.email) + '" id="ter-lv-' + safe + '-email"></td>' +
            '<td><input type="text" class="form-control form-control-sm" value="' + escAttr(c.cc) + '" id="ter-lv-' + safe + '-cc"></td>' +
            '<td><button onclick="confirmarGuardarTercero(\'' + safe + '\', \'semana\')" class="btn btn-outline-success btn-sm" title="Guardar L-V"><i class="bi bi-check-lg"></i></button></td>';
        tbody.appendChild(tr);
    });
}

// ── TERCEROS FINDE ──
function renderTercerosFinde() {
    var tbody = document.getElementById('contactos-terceros-finde-tbody');
    tbody.innerHTML = '';
    var lista = contactosData.terceros || [];
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin custodios</td></tr>';
        return;
    }
    lista.forEach(function(c) {
        var tr = document.createElement('tr');
        var safe = escAttr(c.custodio);
        tr.innerHTML =
            '<td class="fw-semibold">' + c.custodio + '</td>' +
            '<td><input type="text" class="form-control form-control-sm" value="' + escAttr(c.email_finde) + '" id="ter-finde-' + safe + '-email" placeholder="finde..."></td>' +
            '<td><input type="text" class="form-control form-control-sm" value="' + escAttr(c.cc_finde) + '" id="ter-finde-' + safe + '-cc" placeholder="finde..."></td>' +
            '<td><button onclick="confirmarGuardarTercero(\'' + safe + '\', \'finde\')" class="btn btn-outline-warning btn-sm" title="Guardar Finde"><i class="bi bi-check-lg"></i></button></td>';
        tbody.appendChild(tr);
    });
}

function confirmarGuardarTercero(custodio, solo) {
    var label = solo === 'finde' ? '¿Guardar solo contactos de Finde para ' + custodio + '?'
              : solo === 'semana' ? '¿Guardar solo contactos de L-V para ' + custodio + ' (todos sus ATMs)?'
              : '¿Actualizar todos los contactos de ' + custodio + '?';
    showConfirm(label, function() {
        guardarTercero(custodio, solo);
    }, 'Guardar cambios');
}

async function guardarTercero(custodio, solo) {
    var aplica_finde = false;
    var email = '', cc = '', email_finde = '', cc_finde = '';
    var msg = '';

    if (!solo || solo === 'semana') {
        email = document.getElementById('ter-lv-' + custodio + '-email').value.trim();
        cc = document.getElementById('ter-lv-' + custodio + '-cc').value.trim();
        msg = 'L-V actualizado';
    }
    if (!solo || solo === 'finde') {
        email_finde = document.getElementById('ter-finde-' + custodio + '-email').value.trim();
        cc_finde = document.getElementById('ter-finde-' + custodio + '-cc').value.trim();
        aplica_finde = !!(email_finde || cc_finde);
        msg = solo === 'finde' ? 'Finde actualizado' : msg;
    }

    try {
        var res = await fetch('/api/contactos/guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ custodio: custodio, email: email, cc: cc, aplica_finde: aplica_finde, email_finde: email_finde, cc_finde: cc_finde, tipo: 'tercero', solo: solo || '' })
        });
        var data = await res.json();
        if (data.status === 'success') {
            showToast(msg + ' (' + data.cambios + ' cambios)', 'success');
            loadContactos();
        } else {
            showToast(data.message || data.error || 'Error', 'danger');
        }
    } catch (e) { showToast('Error de conexión', 'danger'); }
}
function escAttr(s) { return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

// ── SHUTDOWN ──
async function shutdownServer() {
    showConfirm('Esto cerrara el servidor. Deberas volver a abrir la app.', async function() {
        try {
            await fetch('/api/shutdown', { method: 'POST' });
        } catch (e) {}
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">' +
            '<div style="text-align:center;"><h3>Servidor detenido</h3><p style="color:#64748B;">Podes cerrar esta ventana.</p></div></div>';
    }, 'Cerrar servidor');
}

// ── SUCURSALES ──
var sucFilterTimeout = null;

function filtrarSucursales() {
    var q = (document.getElementById('contactos-suc-search').value || '').toLowerCase().trim();
    var tbody = document.getElementById('contactos-sucursales-tbody');
    var clearBtn = document.getElementById('contactos-suc-clear');
    var countBadge = document.getElementById('contactos-suc-count');
    var countNum = document.getElementById('contactos-suc-num');
    tbody.innerHTML = '';

    // Mostrar/ocultar botón clear
    clearBtn.style.display = q ? 'block' : 'none';

    if (!contactosData) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><i class="bi bi-exclamation-circle fs-3 d-block mb-2 opacity-25"></i>Cargá contactos primero</td></tr>';
        countBadge.classList.add('d-none');
        return;
    }
    var lista = contactosData.sucursales || [];
    if (!q) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><i class="bi bi-search fs-3 d-block mb-2 opacity-25"></i>Buscá una sucursal por ID o nombre</td></tr>';
        countBadge.classList.add('d-none');
        return;
    }
    var filtrados = lista.filter(function(s) {
        return s.id.toLowerCase().includes(q) || s.nombre.toLowerCase().includes(q);
    });
    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><i class="bi bi-emoji-frown fs-3 d-block mb-2 opacity-25"></i>Sin resultados para "<b>' + escHTML(q) + '"</b></td></tr>';
        countBadge.classList.add('d-none');
        return;
    }
    // Mostrar contador
    countNum.textContent = filtrados.length;
    countBadge.classList.remove('d-none');

    filtrados.slice(0, 30).forEach(function(s) {
        var tr = document.createElement('tr');
        tr.className = 'row-animate';
        tr.innerHTML =
            '<td class="fw-semibold" style="font-family:monospace;">' + s.id + '</td>' +
            '<td class="small">' + s.nombre + '</td>' +
            '<td><input type="text" class="form-control form-control-sm" value="' + escAttr(s.email) + '" id="suc-' + escAttr(s.id) + '-email"></td>' +
            '<td><input type="text" class="form-control form-control-sm" value="' + escAttr(s.cc) + '" id="suc-' + escAttr(s.id) + '-cc"></td>' +
            '<td><button onclick="guardarSucursal(\'' + escAttr(s.id) + '\')" class="btn btn-primary btn-sm"><i class="bi bi-check-lg"></i> Guardar</button></td>';
        tbody.appendChild(tr);
    });
}

function escHTML(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function limpiarBusquedaSucursal() {
    document.getElementById('contactos-suc-search').value = '';
    filtrarSucursales();
    document.getElementById('contactos-suc-search').focus();
}

async function guardarSucursal(atmId) {
    var email = document.getElementById('suc-' + atmId + '-email').value.trim();
    var cc = document.getElementById('suc-' + atmId + '-cc').value.trim();
    showConfirm('¿Guardar cambios para ' + atmId + '?', async function() {
        try {
            var res = await fetch('/api/contactos/guardar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ custodio: atmId, email: email, cc: cc, aplica_finde: false, tipo: 'sucursal' })
            });
            var data = await res.json();
            if (data.status === 'success') {
                showToast('Contacto de ' + atmId + ' actualizado', 'success');
                loadContactos();
                filtrarSucursales();
            } else {
                showToast(data.message || data.error || 'Error', 'danger');
            }
        } catch (e) { showToast('Error de conexión', 'danger'); }
    }, 'Guardar sucursal');
}

// ── SUCURSAL FINDE ──
function renderSucursalFinde() {
    var finde = contactosData.sucursal_finde || {};
    document.getElementById('contactos-suc-finde-email').value = finde.email || '';
    document.getElementById('contactos-suc-finde-cc').value = finde.cc || '';
}

async function guardarSucursalFinde() {
    var email = document.getElementById('contactos-suc-finde-email').value.trim();
    var cc = document.getElementById('contactos-suc-finde-cc').value.trim();
    showConfirm('¿Guardar contacto de finde para todas las sucursales?', async function() {
        try {
            var res = await fetch('/api/contactos/guardar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ custodio: 'SUCURSAL', email: email, cc: cc, aplica_finde: true, tipo: 'sucursal_finde' })
            });
            var data = await res.json();
            if (data.status === 'success') {
                showToast('Contacto finde SUCURSAL actualizado', 'success');
            } else {
                showToast(data.message || data.error || 'Error', 'danger');
            }
        } catch (e) { showToast('Error de conexión', 'danger'); }
    }, 'Guardar finde SUCURSAL');
}

// ==========================================
// MÉTRICAS DE SESIÓN / TIMER
// ==========================================

var _met = { activo: false, inicio: null, procesado: null, correos: null, scripts: null, vision: null, n_atms: 0, correos_count: 0, correos_sucursal: 0, correos_terceros: 0, scripts_count: 0 };
var _metTimer = null;

function metricasStartSession(nAtms) {
    metricasResetTimer();
    var now = Date.now();
    _met = { activo: true, inicio: now, procesado: now, correos: null, scripts: null, vision: null, vision_inicio: null, vision_tks: [], n_atms: nAtms, correos_count: 0, correos_sucursal: 0, correos_terceros: 0, scripts_count: 0 };
    _metUpdateTimer();
    _metTimer = setInterval(_metUpdateTimer, 1000);
    var w = document.getElementById('sidebar-met-widget');
    if (w) w.classList.remove('d-none');
    ['sb-correos','sb-envio','sb-vision'].forEach(function(id){
        var el = document.getElementById(id); if (el) el.classList.add('d-none');
    });
}

function metricasResetTimer() {
    if (_metTimer) { clearInterval(_metTimer); _metTimer = null; }
    _met.activo = false;
    var w = document.getElementById('sidebar-met-widget');
    if (w) w.classList.add('d-none');
    var vb = document.getElementById('btn-vision-done');
    if (vb) { vb.style.display = 'none'; vb.className = 'btn btn-outline-success'; vb.innerHTML = '<i class="bi bi-check2-square me-1"></i> Vision ✓'; }
    var el = document.getElementById('session-timer');
    if (el) el.textContent = '00:00';
}

function _metFmtMs(ms) {
    var s = Math.round(ms / 1000);
    var m = Math.floor(s / 60);
    return m > 0 ? m + 'm ' + (s % 60) + 's' : s + 's';
}

function _metFmtSecs(secs) {
    var m = Math.floor(secs / 60);
    return (m < 10 ? '0' : '') + m + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60);
}

function _metUpdateTimer() {
    if (!_met.activo || !_met.inicio) return;
    var now = Date.now();
    var elapsed = Math.floor((now - _met.inicio) / 1000);
    var el = document.getElementById('session-timer');
    if (el) el.textContent = _metFmtSecs(elapsed);

    // Fase envío: mientras correos abiertos y scripts aún no generados
    if (_met.correos && !_met.scripts && _met.correos_count > 0) {
        var faseEl = document.getElementById('sb-envio');
        if (faseEl) faseEl.classList.remove('d-none');
        var faseSecs = Math.floor((now - _met.correos) / 1000);
        var ft = document.getElementById('sb-envio-timer');
        if (ft) ft.textContent = _metFmtSecs(faseSecs);
        var porCorreo = faseSecs > 0 ? Math.round(faseSecs / _met.correos_count) : 0;
        var pc = document.getElementById('sb-por-correo');
        if (pc) pc.textContent = porCorreo > 0 ? '~' + _metFmtMs(porCorreo * 1000) + '/correo' : '—';
    }

    // Fase Vision: timer en curso (vision_inicio set, vision no terminado aún)
    if (_met.vision_inicio && !_met.vision) {
        var sv = document.getElementById('sb-vision');
        if (sv) sv.classList.remove('d-none');
        var svp = document.getElementById('sb-vision-prog');
        if (svp) svp.textContent = 'En Vision...';
        var vSecs = Math.floor((now - _met.vision_inicio) / 1000);
        var vtk = document.getElementById('sb-vision-tk');
        if (vtk) vtk.textContent = _metFmtSecs(vSecs);
    }
}

function _metUpdateEtapas() {
    var el = document.getElementById('met-etapas');
    if (!el) return;
    var parts = ['<span style="color:#54b948;">✓ Datos</span>'];
    if (_met.correos) parts.push('<span style="color:#0D6EFD;">✓ Correos</span>');
    if (_met.scripts) parts.push('<span style="color:#FD7E14;">✓ Scripts</span>');
    if (_met.vision)  parts.push('<span style="color:#6F42C1;font-weight:600;">✓ Vision</span>');
    el.innerHTML = parts.join('<span class="mx-1 text-muted">›</span>');
}

function metricasMarkCorreos(count, sucursal, custodios) {
    if (!_met.activo) return;
    _met.correos = Date.now();
    _met.correos_count = count;
    _met.correos_sucursal = sucursal || 0;
    _met.correos_terceros = custodios || 0;
    _metUpdateEtapas();

    // Sidebar: mostrar sección correos
    var sc = document.getElementById('sb-correos');
    if (sc) sc.classList.remove('d-none');
    var st = document.getElementById('sb-correos-total');
    if (st) st.textContent = count + ' correo' + (count !== 1 ? 's' : '');
    var sd = document.getElementById('sb-correos-desglose');
    if (sd) {
        var parts = [];
        if (sucursal)  parts.push(sucursal  + ' sucursal');
        if (custodios) parts.push(custodios + ' custodios');
        sd.textContent = parts.join(' · ');
    }

    var vb = document.getElementById('btn-vision-done');
    if (vb) vb.style.display = '';
}

function metricasMarkScripts(count) {
    if (!_met.activo) return;
    _met.scripts = Date.now();
    _met.vision_inicio = _met.scripts;
    _met.scripts_count = count;
    _metUpdateEtapas();
    var vb = document.getElementById('btn-vision-done');
    if (vb) vb.style.display = '';
}

function markTkVisionDone(btn) {
    var now = Date.now();
    if (_met.vision_tks.length === 0) {
        _met.vision_inicio = now;
    }
    _met.vision_tks.push(now);
    btn.setAttribute('data-tk-vision', 'done');
    btn.className = 'btn btn-success btn-sm';
    btn.innerHTML = '<i class="bi bi-check2-all"></i>';
    btn.disabled = true;

    var total = document.querySelectorAll('[data-tk-vision]').length;
    var done  = document.querySelectorAll('[data-tk-vision="done"]').length;
    var prog  = document.getElementById('vision-tk-progress');
    if (prog) prog.textContent = done + '/' + total + ' documentados';

    // Sidebar vision
    var sv = document.getElementById('sb-vision');
    if (sv) sv.classList.remove('d-none');
    var svp = document.getElementById('sb-vision-prog');
    if (svp) svp.textContent = done + ' / ' + total + ' TKs';

    if (done >= total && total > 0) markVisionDone();
}

function markVisionDone() {
    if (!_met.activo) { showToast('No hay sesión activa', 'warning'); return; }
    _met.vision = Date.now();
    if (!_met.vision_inicio) _met.vision_inicio = _met.scripts || _met.correos || _met.procesado;
    _metUpdateEtapas();

    // Sidebar: mostrar resultado Vision
    var visionMs = _met.vision - _met.vision_inicio;
    var svp = document.getElementById('sb-vision-prog');
    if (svp) svp.textContent = '✓ ' + _met.n_atms + ' TKs';
    var vtk = document.getElementById('sb-vision-tk');
    if (vtk && _met.n_atms > 0) vtk.textContent = '~' + _metFmtMs(visionMs / _met.n_atms) + '/TK';

    var vb = document.getElementById('btn-vision-done');
    if (vb) { vb.className = 'btn btn-success'; vb.innerHTML = '<i class="bi bi-check2-all me-1"></i> Vision ✓'; }
    _metGuardarSesion();
}

function formatMs(ms) {
    if (!ms && ms !== 0) return '—';
    var s = Math.round(ms / 1000);
    if (s < 1) return '<1s';
    var m = Math.floor(s / 60);
    s = s % 60;
    return m > 0 ? m + 'm ' + (s > 0 ? s + 's' : '') : s + 's';
}

async function _metGuardarSesion() {
    _met.activo = false;
    if (_metTimer) { clearInterval(_metTimer); _metTimer = null; }

    var t = _met;
    var d = {};
    var prev = t.procesado || t.inicio;
    if (t.correos) { d.correos_ms = t.correos - prev; prev = t.correos; }
    if (t.scripts) { d.scripts_ms = t.scripts - prev; prev = t.scripts; }
    var visionRef = t.vision_inicio || prev;
    if (t.vision)  { d.vision_ms  = t.vision - visionRef; }
    var lastStep = t.vision || t.scripts || t.correos || t.procesado;
    if (lastStep && t.inicio) d.total_ms = lastStep - t.inicio;
    if (d.vision_ms && t.n_atms > 0) {
        d.vision_por_tk_ms = Math.round(d.vision_ms / t.n_atms);
        d.vision_tks_count = t.n_atms;
    }
    if (t.n_atms > 0) {
        if (d.correos_ms) d.correos_por_atm_ms = Math.round(d.correos_ms / t.n_atms);
        if (d.scripts_ms) d.scripts_por_atm_ms = Math.round(d.scripts_ms / t.n_atms);
        if (d.total_ms)   d.total_por_atm_ms   = Math.round(d.total_ms   / t.n_atms);
    }

    var now = new Date();
    var dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    var sesion = {
        fecha: now.toISOString().split('T')[0],
        hora: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
        dia_semana: dias[now.getDay()],
        n_atms: t.n_atms,
        correos_enviados: t.correos_count,
        correos_sucursal: t.correos_sucursal,
        correos_terceros: t.correos_terceros,
        scripts_generados: t.scripts_count,
        duraciones: d
    };

    try {
        await fetch('/api/metricas/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sesion)
        });
        showToast('Sesión guardada — total: ' + formatMs(d.total_ms), 'success');
    } catch (e) { console.error('Error guardando sesión', e); }
}

async function loadMetricas() {
    try {
        var res = await fetch('/api/metricas/historial');
        var data = await res.json();
        if (data.status === 'success') renderMetricas(data.sesiones);
    } catch (e) { console.error('Error cargando métricas', e); }
}

function renderMetricas(sesiones) {
    var hoy = new Date().toISOString().split('T')[0];
    document.getElementById('met-card-hoy').textContent    = sesiones.filter(function(s){ return s.fecha === hoy; }).length;
    document.getElementById('met-card-total').textContent  = sesiones.length;

    var conTotal = sesiones.filter(function(s){ return s.duraciones && s.duraciones.total_ms; });
    if (conTotal.length > 0) {
        var avgTotal  = conTotal.reduce(function(sum,s){ return sum + s.duraciones.total_ms; }, 0) / conTotal.length;
        var bestTotal = Math.min.apply(null, conTotal.map(function(s){ return s.duraciones.total_ms; }));
        document.getElementById('met-card-promedio').textContent = formatMs(avgTotal);
        document.getElementById('met-card-mejor').textContent    = formatMs(bestTotal);
    } else {
        document.getElementById('met-card-promedio').textContent = '—';
        document.getElementById('met-card-mejor').textContent    = '—';
    }

    function avgPerUnit(key) {
        var vals = sesiones.filter(function(s){ return s.duraciones && s.duraciones[key]; })
                           .map(function(s){ return s.duraciones[key]; });
        return vals.length ? Math.round(vals.reduce(function(a,b){return a+b;},0) / vals.length) : 0;
    }
    var avgVisionTk  = avgPerUnit('vision_por_tk_ms');
    var avgEnvioAtm  = avgPerUnit('scripts_por_atm_ms');
    var avgTotalAtm  = avgPerUnit('total_por_atm_ms');
    var elVTk = document.getElementById('met-card-vision-tk');
    if (elVTk) elVTk.textContent = avgVisionTk ? formatMs(avgVisionTk) : '—';
    var elEAm = document.getElementById('met-card-envio-atm');
    if (elEAm) elEAm.textContent = avgEnvioAtm ? formatMs(avgEnvioAtm) : '—';
    var elTAm = document.getElementById('met-card-total-atm');
    if (elTAm) elTAm.textContent = avgTotalAtm ? formatMs(avgTotalAtm) : '—';

    // Gráfico 1: tiempo promedio por etapa normalizado por ATM/TK
    if (metricasChart) { metricasChart.destroy(); metricasChart = null; }
    var canvas = document.getElementById('metricas-chart');
    if (canvas) {
        var chartData = [
            Math.round(avgPerUnit('correos_por_atm_ms') / 1000),
            Math.round(avgPerUnit('scripts_por_atm_ms') / 1000),
            Math.round(avgPerUnit('vision_por_tk_ms')   / 1000)
        ];
        metricasChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Correos/ATM', 'Envío emails/ATM', 'Vision/TK'],
                datasets: [{
                    label: 'Segundos por ticket',
                    data: chartData,
                    backgroundColor: ['rgba(13,110,253,0.75)', 'rgba(253,126,20,0.75)', 'rgba(111,66,193,0.75)'],
                    borderColor:     ['#0D6EFD', '#FD7E14', '#6F42C1'],
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function(ctx){ return formatMs(ctx.raw * 1000) + ' por ticket'; } } }
                },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Seg/ticket' } } }
            }
        });
    }

    // Gráfico 2: correos por sector (dona acumulada)
    if (metricasChartSector) { metricasChartSector.destroy(); metricasChartSector = null; }
    var canvasSector = document.getElementById('metricas-chart-sector');
    if (canvasSector) {
        var totalSuc  = sesiones.reduce(function(s,x){ return s + (x.correos_sucursal||0); }, 0);
        var totalTerc = sesiones.reduce(function(s,x){ return s + (x.correos_terceros||0); }, 0);
        metricasChartSector = new Chart(canvasSector.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Sucursal', 'Custodios'],
                datasets: [{
                    data: [totalSuc, totalTerc],
                    backgroundColor: ['rgba(13,110,253,0.8)', 'rgba(253,126,20,0.8)'],
                    borderColor: ['#0D6EFD', '#FD7E14'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } },
                    tooltip: { callbacks: { label: function(ctx){ return ctx.label + ': ' + ctx.raw + ' correos'; } } }
                },
                cutout: '60%'
            }
        });
        var elST = document.getElementById('met-sector-totals');
        if (elST) elST.innerHTML =
            '<span style="color:#0D6EFD;"><strong>' + totalSuc  + '</strong> Sucursal</span>' +
            '<span style="color:#FD7E14;"><strong>' + totalTerc + '</strong> Custodios</span>';
    }

    // Gráfico 3: sesiones por día (últimos 7 días)
    if (metricasChartDias) { metricasChartDias.destroy(); metricasChartDias = null; }
    var canvas2 = document.getElementById('metricas-chart-dias');
    if (canvas2) {
        var last7 = [];
        for (var i = 6; i >= 0; i--) {
            var d = new Date(); d.setDate(d.getDate() - i);
            last7.push(d.toISOString().split('T')[0]);
        }
        var counts = {};
        last7.forEach(function(day){ counts[day] = 0; });
        sesiones.forEach(function(s){ if (counts.hasOwnProperty(s.fecha)) counts[s.fecha]++; });

        metricasChartDias = new Chart(canvas2.getContext('2d'), {
            type: 'line',
            data: {
                labels: last7.map(function(d){ return d.slice(5); }),
                datasets: [{
                    label: 'Sesiones',
                    data: last7.map(function(d){ return counts[d]; }),
                    borderColor: '#54b948',
                    backgroundColor: 'rgba(84,185,72,0.12)',
                    tension: 0.35,
                    fill: true,
                    pointRadius: 5,
                    pointBackgroundColor: '#54b948'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // Tabla de últimas sesiones
    var tbody = document.getElementById('metricas-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (sesiones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-5"><i class="bi bi-inbox fs-2 d-block mb-2 opacity-50"></i>Sin sesiones registradas aún</td></tr>';
        return;
    }
    sesiones.slice(-20).reverse().forEach(function(s) {
        var d = s.duraciones || {};
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td class="small text-muted">' + (s.fecha || '') + '</td>' +
            '<td class="small">' + (s.hora || '') + '</td>' +
            '<td class="text-center fw-bold">' + (s.n_atms || 0) + '</td>' +
            '<td class="text-center">' + (s.correos_sucursal || 0) + '</td>' +
            '<td class="text-center">' + (s.correos_terceros || 0) + '</td>' +
            '<td class="small" style="color:#0D6EFD;">' + (d.correos_por_atm_ms ? formatMs(d.correos_por_atm_ms) + '<span class="text-muted">/ATM</span>' : formatMs(d.correos_ms)) + '</td>' +
            '<td class="small" style="color:#FD7E14;">' + (d.scripts_por_atm_ms ? formatMs(d.scripts_por_atm_ms) + '<span class="text-muted">/ATM</span>' : formatMs(d.scripts_ms)) + '</td>' +
            '<td class="small" style="color:#6F42C1;">' + (d.vision_por_tk_ms ? formatMs(d.vision_por_tk_ms) + '/TK' : '—') + '</td>' +
            '<td class="small fw-bold">' + (d.total_por_atm_ms ? formatMs(d.total_por_atm_ms) + '<span class="text-muted">/ATM</span>' : formatMs(d.total_ms)) + '</td>';
        tbody.appendChild(tr);
    });
}

// ==========================================
// PDF REPORT
// ==========================================

function generarReportePDF() {
    var el = document.getElementById('print-fecha');
    if (el) {
        var now = new Date();
        el.textContent = 'Generado el ' + now.toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) + ' a las ' + now.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
    }
    window.print();
}

// ==========================================
// INIT
// ==========================================

updateStatus();
loadData();
loadContactos();
setInterval(updateStatus, 30000);

// ─── Fix DPI/Escala: ajusta padding-top del layout según la altura real del navbar ─────
function fixNavbarPadding() {
    var navbar = document.querySelector('.navbar.fixed-top');
    var layout = document.getElementById('main-layout');
    if (navbar && layout) {
        var h = navbar.getBoundingClientRect().height;
        layout.style.paddingTop = Math.ceil(h) + 'px';
    }
}

// Setup drag & drop zone
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setupDropZone();
        syncSendPanelVisibility();
        fixNavbarPadding();
    });
} else {
    setupDropZone();
    fixNavbarPadding();
}

// Re-ajusta si cambia el tamaño de ventana (conexión a monitor externo, etc.)
window.addEventListener('resize', fixNavbarPadding);

