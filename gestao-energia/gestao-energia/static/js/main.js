// Estado da Aplicação
let appData = {
    settings: {
        prevReading: 2171,
        startDate: '',
        endDate: '',
        tariff: 0.95
    },
    history: []
};

// Elementos do DOM
const DOM = {
    navButtons: document.querySelectorAll('.nav-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    uploadZone: document.getElementById('upload-zone'),
    cameraInput: document.getElementById('camera-input'),
    uploadPrompt: document.getElementById('upload-prompt'),
    previewContainer: document.getElementById('preview-container'),
    previewImg: document.getElementById('preview-img'),
    btnRemoveImg: document.getElementById('btn-remove-img'),
    loadingOverlay: document.getElementById('loading-overlay'),
    currentReadingInput: document.getElementById('current-reading'),
    btnCalculate: document.getElementById('btn-calculate'),
    resultsCard: document.getElementById('results-card'),
    
    // Resultados
    resultKwhConsumed: document.getElementById('result-kwh-consumed'),
    resultDaysElapsed: document.getElementById('result-days-elapsed'),
    resultDailyAvg: document.getElementById('result-daily-avg'),
    resultProjectedKwh: document.getElementById('result-projected-kwh'),
    resultDaysRemaining: document.getElementById('result-days-remaining'),
    resultEstimatedCost: document.getElementById('result-estimated-cost'),
    
    // Histórico
    historyTable: document.getElementById('history-table'),
    historyEmptyState: document.getElementById('history-empty-state'),
    
    // Configurações
    configPrevReading: document.getElementById('config-prev-reading'),
    configStartDate: document.getElementById('config-start-date'),
    configEndDate: document.getElementById('config-end-date'),
    configTariff: document.getElementById('config-tariff'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    
    // Ações
    btnCloseCycle: document.getElementById('btn-close-cycle'),
    btnExportBackup: document.getElementById('btn-export-backup'),
    importBackupFile: document.getElementById('import-backup-file')
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    initDates();
    loadFromLocalStorage();
    setupNavigation();
    setupUploadZone();
    setupCalculations();
    setupSettings();
    setupBackup();
    renderHistory();
});

// Inicializa datas padrão se estiverem vazias
function initDates() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    appData.settings.startDate = formatDateString(thirtyDaysAgo);
    appData.settings.endDate = formatDateString(today);
}

// Formata data Date para "YYYY-MM-DD"
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Formata data string "YYYY-MM-DD" para exibição "DD/MM/YYYY"
function displayDate(dateStr) {
    if (!dateStr) return '--/--/----';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Carrega dados do LocalStorage
function loadFromLocalStorage() {
    const saved = localStorage.getItem('consumo_ativo_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.settings) appData.settings = { ...appData.settings, ...parsed.settings };
            if (parsed.history) appData.history = parsed.history;
        } catch (e) {
            console.error("Erro ao ler dados do LocalStorage. Usando padrões.", e);
        }
    }
    
    // Sincronizar campos de input da configuração com o estado carregado
    DOM.configPrevReading.value = appData.settings.prevReading;
    DOM.configStartDate.value = appData.settings.startDate;
    DOM.configEndDate.value = appData.settings.endDate;
    DOM.configTariff.value = appData.settings.tariff;
}

// Salva dados no LocalStorage
function saveToLocalStorage() {
    localStorage.setItem('consumo_ativo_data', JSON.stringify(appData));
}

// Navegação entre abas
function setupNavigation() {
    DOM.navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Alterar estado dos botões
            DOM.navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Alterar visibilidade dos painéis
            DOM.tabPanes.forEach(pane => {
                if (pane.id === targetTab) {
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                }
            });
        });
    });
}

// Zona de Captura de Foto/Upload
function setupUploadZone() {
    // Clique na zona abre input de arquivo
    DOM.uploadZone.addEventListener('click', (e) => {
        // Impedir trigger duplo se clicar no botão de remover
        if (e.target.closest('#btn-remove-img')) return;
        DOM.cameraInput.click();
    });
    
    // Quando um arquivo for selecionado
    DOM.cameraInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleSelectedFile(file);
        }
    });
    
    // Remover imagem
    DOM.btnRemoveImg.addEventListener('click', () => {
        resetUploadZone();
    });
}

function handleSelectedFile(file) {
    // Exibir preview local provisório
    const reader = new FileReader();
    reader.onload = (e) => {
        DOM.previewImg.src = e.target.result;
        DOM.uploadPrompt.classList.add('hidden');
        DOM.previewContainer.classList.remove('hidden');
        DOM.loadingOverlay.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
    
    // Preparar FormData para envio à API do Flask
    const formData = new FormData();
    formData.append('image', file);
    
    fetch('/api/read', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => { throw new Error(err.error || "Erro de processamento."); });
        }
        return response.json();
    })
    .then(data => {
        DOM.loadingOverlay.classList.add('hidden');
        if (data.success) {
            // Atualizar imagem com as marcações de Visão Computacional geradas pelo OpenCV
            DOM.previewImg.src = data.image_url;
            // Preencher a leitura atual com o valor decodificado
            DOM.currentReadingInput.value = data.reading;
            
            // Auto-calcular
            calculateConsumption();
        } else {
            alert("Erro na leitura: " + data.error);
            resetUploadZone();
        }
    })
    .catch(error => {
        DOM.loadingOverlay.classList.add('hidden');
        alert("Falha na comunicação com o servidor de IA: " + error.message);
        console.error(error);
    });
}

function resetUploadZone() {
    DOM.cameraInput.value = "";
    DOM.previewImg.src = "";
    DOM.previewContainer.classList.add('hidden');
    DOM.uploadPrompt.classList.remove('hidden');
    DOM.currentReadingInput.value = "";
    DOM.resultsCard.classList.add('hidden');
}

// Configuração dos cálculos
function setupCalculations() {
    DOM.btnCalculate.addEventListener('click', () => {
        calculateConsumption();
    });
}

function calculateConsumption() {
    const currentReading = parseInt(DOM.currentReadingInput.value);
    
    if (isNaN(currentReading) || currentReading < 0) {
        alert("Por favor, capture a imagem do medidor ou digite um número válido no campo Leitura Atual.");
        return;
    }
    
    const prevReading = appData.settings.prevReading;
    const tariff = appData.settings.tariff;
    
    if (currentReading < prevReading) {
        alert(`Atenção: A leitura atual (${currentReading} kWh) é menor do que a leitura oficial do início do ciclo (${prevReading} kWh). Verifique se o valor está correto.`);
        return;
    }
    
    // Processamento das datas
    const startDate = new Date(appData.settings.startDate + 'T00:00:00');
    const endDate = new Date(appData.settings.endDate + 'T00:00:00');
    const today = new Date();
    // Zerar horas de hoje para cálculo preciso
    today.setHours(0,0,0,0);
    
    // Diferenças em milissegundos convertidas para dias
    const oneDay = 24 * 60 * 60 * 1000;
    
    // Total de dias programados para o ciclo
    const totalCycleDays = Math.max(1, Math.round(Math.abs((endDate - startDate) / oneDay)));
    
    // Dias decorridos desde o início do ciclo até hoje
    let daysElapsed = Math.round((today - startDate) / oneDay);
    
    // Correções de borda (ex: se o usuário mediu antes de começar ou no mesmo dia)
    if (daysElapsed < 1) daysElapsed = 1;
    
    // Dias restantes
    let daysRemaining = Math.round((endDate - today) / oneDay);
    if (daysRemaining < 0) daysRemaining = 0;
    
    // Cálculos
    const kwhConsumed = currentReading - prevReading;
    const dailyAvg = kwhConsumed / daysElapsed;
    const projectedKwh = kwhConsumed + (dailyAvg * daysRemaining);
    const estimatedCost = projectedKwh * tariff;
    
    // Exibição dos resultados
    DOM.resultKwhConsumed.innerHTML = `${kwhConsumed} <span class="unit">kWh</span>`;
    DOM.resultDaysElapsed.textContent = `${daysElapsed} ${daysElapsed === 1 ? 'dia decorrido' : 'dias decorridos'}`;
    DOM.resultDailyAvg.innerHTML = `${dailyAvg.toFixed(2)} <span class="unit">kWh/dia</span>`;
    
    DOM.resultProjectedKwh.innerHTML = `${Math.round(projectedKwh)} <span class="unit">kWh</span>`;
    DOM.resultDaysRemaining.textContent = `${daysRemaining} ${daysRemaining === 1 ? 'dia restante' : 'dias restantes'} no ciclo`;
    
    DOM.resultEstimatedCost.textContent = `R$ ${estimatedCost.toFixed(2)}`;
    
    // Exibe o card de resultados
    DOM.resultsCard.classList.remove('hidden');
    
    // Rolar suave até o card de resultados em dispositivos móveis
    DOM.resultsCard.scrollIntoView({ behavior: 'smooth' });
}

// Configurações do Ciclo
function setupSettings() {
    DOM.btnSaveSettings.addEventListener('click', () => {
        const prevReading = parseInt(DOM.configPrevReading.value);
        const startDate = DOM.configStartDate.value;
        const endDate = DOM.configEndDate.value;
        const tariff = parseFloat(DOM.configTariff.value);
        
        if (isNaN(prevReading) || !startDate || !endDate || isNaN(tariff)) {
            alert("Por favor, preencha todos os campos corretamente.");
            return;
        }
        
        appData.settings = {
            prevReading,
            startDate,
            endDate,
            tariff
        };
        
        saveToLocalStorage();
        alert("Configurações salvas com sucesso!");
        
        // Se houver leitura digitada no Dashboard, recalcula com os novos dados de configs
        if (DOM.currentReadingInput.value) {
            calculateConsumption();
        }
    });
    
    // Fechar Ciclo / Virar Mês
    DOM.btnCloseCycle.addEventListener('click', () => {
        const currentReading = parseInt(DOM.currentReadingInput.value);
        
        if (isNaN(currentReading)) {
            alert("É necessário ter uma leitura atual calculada no Dashboard para fechar o ciclo de faturamento.");
            return;
        }
        
        const prevReading = appData.settings.prevReading;
        if (currentReading < prevReading) {
            alert("A leitura atual não pode ser menor do que a inicial.");
            return;
        }
        
        const confirmClose = confirm(`Deseja realmente FECHAR este ciclo?\n\nIsso salvará a leitura de ${currentReading} kWh no histórico de faturas e iniciará um novo ciclo a partir de hoje.`);
        
        if (confirmClose) {
            const consumed = currentReading - prevReading;
            const cost = consumed * appData.settings.tariff;
            
            // Registrar no histórico
            const newRecord = {
                id: Date.now(),
                startDate: appData.settings.startDate,
                endDate: appData.settings.endDate,
                prevReading: prevReading,
                currentReading: currentReading,
                kwh: consumed,
                tariff: appData.settings.tariff,
                cost: cost
            };
            
            appData.history.unshift(newRecord); // Adicionar no início do histórico
            
            // Configurar o novo ciclo
            const today = new Date();
            const nextMonth = new Date();
            nextMonth.setDate(today.getDate() + 30);
            
            appData.settings.prevReading = currentReading; // A leitura final vira a inicial
            appData.settings.startDate = formatDateString(today); // Inicia hoje
            appData.settings.endDate = formatDateString(nextMonth); // Encerra em 30 dias
            
            saveToLocalStorage();
            
            // Sincronizar UI
            DOM.configPrevReading.value = appData.settings.prevReading;
            DOM.configStartDate.value = appData.settings.startDate;
            DOM.configEndDate.value = appData.settings.endDate;
            
            renderHistory();
            resetUploadZone();
            
            alert("Ciclo encerrado com sucesso! Os dados foram salvos no Histórico e as configurações de um novo período foram criadas.");
            
            // Direciona o usuário para a aba de histórico para ver o resultado
            document.querySelector('[data-tab="history"]').click();
        }
    });
}

// Renderiza a lista de histórico
function renderHistory() {
    const tbody = DOM.historyTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (appData.history.length === 0) {
        DOM.historyTable.classList.add('hidden');
        DOM.historyEmptyState.classList.remove('hidden');
        return;
    }
    
    DOM.historyTable.classList.remove('hidden');
    DOM.historyEmptyState.classList.add('hidden');
    
    appData.history.forEach(record => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${displayDate(record.startDate)} a ${displayDate(record.endDate)}</td>
            <td>${record.prevReading} kWh</td>
            <td>${record.currentReading} kWh</td>
            <td class="highlight-cyan font-bold">${record.kwh} kWh</td>
            <td>R$ ${record.tariff.toFixed(3)}</td>
            <td class="highlight-green font-bold">R$ ${record.cost.toFixed(2)}</td>
            <td>
                <button class="btn-delete" onclick="deleteHistoryRecord(${record.id})">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Deleta registro do histórico (chamado globalmente)
window.deleteHistoryRecord = function(id) {
    if (confirm("Tem certeza que deseja excluir este registro do histórico permanentemente?")) {
        appData.history = appData.history.filter(item => item.id !== id);
        saveToLocalStorage();
        renderHistory();
    }
};

// Funções de Backup e Restauração
function setupBackup() {
    // Exportar
    DOM.btnExportBackup.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href",     dataStr);
        
        const todayStr = formatDateString(new Date());
        downloadAnchor.setAttribute("download", `backup_consumo_ativo_${todayStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
    
    // Importar
    DOM.importBackupFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                
                // Validação básica do arquivo importado
                if (parsed.settings && parsed.history) {
                    appData = parsed;
                    saveToLocalStorage();
                    
                    // Sincronizar inputs
                    DOM.configPrevReading.value = appData.settings.prevReading;
                    DOM.configStartDate.value = appData.settings.startDate;
                    DOM.configEndDate.value = appData.settings.endDate;
                    DOM.configTariff.value = appData.settings.tariff;
                    
                    renderHistory();
                    resetUploadZone();
                    
                    alert("Backup restaurado com sucesso!");
                } else {
                    alert("Arquivo de backup inválido. Chaves settings ou history não encontradas.");
                }
            } catch (err) {
                alert("Erro ao ler o arquivo JSON de backup: " + err.message);
            }
        };
        reader.readAsText(file);
    });
}
