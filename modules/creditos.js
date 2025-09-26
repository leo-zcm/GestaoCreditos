// modules/creditos.js (VERSÃO CORRIGIDA)

const CreditosModule = (() => {
    // Estado do módulo
    let currentFilters = { status: 'Disponível' };
    let selectedCredits = new Map(); // Usamos um Map para fácil acesso e deleção

    // Função principal para renderizar a view do módulo
    const render = async (initialFilters = null) => {
        // Aplica filtros iniciais se vierem do dashboard, por exemplo
        if (initialFilters) {
            currentFilters = { ...currentFilters, ...initialFilters };
        }

        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>Gerenciamento de Créditos</h2>
                    <button id="btn-new-credit" class="btn btn-primary">Adicionar Crédito</button>
                </div>
                <div class="filters">
                    <input type="text" id="filter-client-code" placeholder="Cód. Cliente">
                    <input type="text" id="filter-client-name" placeholder="Nome do Cliente">
                    <select id="filter-status">
                        <option value="Disponível" selected>Disponível</option>
                        <option value="Abatido">Abatido</option>
                    </select>
                    <select id="filter-seller"></select> <!-- Populado dinamicamente -->
                    <input type="date" id="filter-date-start" title="Data inicial">
                    <input type="date" id="filter-date-end" title="Data final">
                    <button id="btn-apply-filters" class="btn btn-secondary">Buscar</button>
                </div>
                <div class="table-container">
                    <table id="credits-table">
                        <thead>
                            <tr>
                                <th><input type="checkbox" id="select-all-credits"></th>
                                <th>Data</th>
                                <th>Nº Registro</th>
                                <th>Cód. Cliente</th>
                                <th>Cliente</th>
                                <th>Descrição</th>
                                <th>Qtd</th>
                                <th>Valor</th>
                                <th>Pedido Abatido</th>
                                <th class="col-actions">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="credits-list"></tbody>
                    </table>
                </div>
                <div id="selection-summary" class="selection-summary">
                    <span>Nenhum crédito selecionado.</span>
                    <button id="btn-multi-abate" class="btn btn-success" disabled>Abater Múltiplos</button>
                </div>
            </div>
        `;

        // Adiciona CSS específico para este módulo
        const styleId = 'creditos-module-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                #credits-table { font-size: 0.9rem; }
                #credits-table td, #credits-table th { padding: 0.6rem; }
                .selection-summary { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    padding: 1rem; 
                    background-color: var(--light-color); 
                    border-top: 1px solid var(--border-color);
                    margin: 1rem -1.5rem -1.5rem -1.5rem; /* Ajusta ao padding do card */
                    border-radius: 0 0 8px 8px;
                }
            `;
            document.head.appendChild(style);
        }

        await populateSellersDropdown();
        setupEventListeners();
        await loadCredits();
    };

    // Popula o dropdown de vendedores
    const populateSellersDropdown = async () => {
        const sellerSelect = document.getElementById('filter-seller');
        const { data: sellers, error } = await supabase
            .from('profiles')
            .select('full_name, seller_id_erp')
            .not('seller_id_erp', 'is', null)
            .order('full_name');

        if (error) {
            console.error("Erro ao buscar vendedores:", error);
            return;
        }

        let options = '<option value="">Todos Vendedores</option>';
        sellers.forEach(s => {
            options += `<option value="${s.seller_id_erp}">${s.full_name}</option>`;
        });
        sellerSelect.innerHTML = options;
    };

    // Carrega os créditos do Supabase com base nos filtros
    const loadCredits = async () => {
        App.showLoader();
        const listContainer = document.getElementById('credits-list');
        listContainer.innerHTML = '<tr><td colspan="10">Buscando...</td></tr>';

        try {
            const userPermissions = App.userProfile.permissions?.creditos || {};
            
            // <<< CORREÇÃO CRÍTICA AQUI >>>
            // Trocamos o `*` por uma lista explícita de colunas da tabela `credits`.
            const selectStatement = `
                id, created_at, n_registro, client_code, product_code, 
                description, quantity, value, notes, status, 
                abatement_order,
                clients_erp(client_name)
            `;
            let query = supabase.from('credits').select(selectStatement);

            // Aplica filtros de texto e status
            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            if (currentFilters.client_code) query = query.ilike('client_code', `%${currentFilters.client_code}%`);
            // O filtro por nome de cliente precisa de uma abordagem diferente, pois é em uma tabela relacionada.
            // Por simplicidade, vamos filtrar no frontend por enquanto, ou usar uma RPC para buscas complexas.
            
            // Aplica filtro de data
            if (currentFilters.date_start) query = query.gte('created_at', currentFilters.date_start);
            if (currentFilters.date_end) query = query.lte('created_at', currentFilters.date_end + 'T23:59:59');

            // Lógica de permissão de visualização
            let sellerErpIdToFilter = currentFilters.seller_id;
            if (userPermissions.view === 'own' && App.userProfile.seller_id_erp) {
                sellerErpIdToFilter = App.userProfile.seller_id_erp;
                document.getElementById('filter-seller').value = sellerErpIdToFilter;
                document.getElementById('filter-seller').disabled = true;
            }

            if (sellerErpIdToFilter) {
                const { data: clientCodes, error: clientError } = await supabase
                    .from('clients_erp')
                    .select('client_code')
                    .eq('id_vendedor', sellerErpIdToFilter);
                
                if (clientError) throw clientError;
                const codes = clientCodes.map(c => c.client_code);
                if (codes.length === 0) { // Se o vendedor não tem clientes, não há o que mostrar
                    renderTable([]);
                    return;
                }
                query = query.in('client_code', codes);
            }

            let { data: credits, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;

            // Filtro de nome do cliente no frontend (solução para a limitação da query)
            if (currentFilters.client_name) {
                credits = credits.filter(c => 
                    c.clients_erp?.client_name.toLowerCase().includes(currentFilters.client_name.toLowerCase())
                );
            }

            renderTable(credits);

        } catch (error) {
            console.error("Erro ao carregar créditos:", error);
            listContainer.innerHTML = `<tr><td colspan="10" class="error-message">Falha ao carregar dados.</td></tr>`;
        } finally {
            App.hideLoader();
            updateSelectionSummary();
        }
    };

    // ... O RESTANTE DO ARQUIVO `creditos.js` PERMANECE IDÊNTICO ...
    // (renderTable, renderCreditModal, handleFormSubmit, renderAbateModal, handleAbateSubmit, updateSelectionSummary, setupEventListeners)
    const renderTable = (credits) => {
        const listContainer = document.getElementById('credits-list');
        if (credits.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="10">Nenhum resultado encontrado.</td></tr>';
            return;
        }

        listContainer.innerHTML = credits.map(credit => {
            const isSelected = selectedCredits.has(credit.id);
            return `
                <tr class="${isSelected ? 'selected' : ''}">
                    <td><input type="checkbox" class="credit-select" data-id="${credit.id}" ${isSelected ? 'checked' : ''}></td>
                    <td>${new Date(credit.created_at).toLocaleDateString()}</td>
                    <td>${credit.n_registro || '---'}</td>
                    <td>${credit.client_code}</td>
                    <td>${credit.clients_erp?.client_name || 'N/A'}</td>
                    <td>${credit.description}</td>
                    <td>${credit.quantity || '---'}</td>
                    <td>${credit.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${credit.abatement_order || '---'}</td>
                    <td class="col-actions">
                        ${credit.status === 'Disponível' ? `
                            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${credit.id}">Editar</button>
                            <button class="btn btn-success btn-sm" data-action="abater" data-id="${credit.id}">Abater</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    };
    const renderCreditModal = async (credit = null) => {
        const isNew = credit === null;
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>${isNew ? 'Adicionar Novo' : 'Editar'} Crédito</h2>
            <form id="credit-form">
                <input type="hidden" id="creditId" value="${credit?.id || ''}">
                <div class="form-group">
                    <label for="nRegistro">Nº de Registro (Opcional)</label>
                    <input type="text" id="nRegistro" value="${credit?.n_registro || ''}">
                </div>
                <div class="form-group">
                    <label for="clientCode">Código do Cliente</label>
                    <input type="text" id="clientCode" value="${credit?.client_code || ''}" required style="text-transform: uppercase;">
                </div>
                <div class="form-group">
                    <label for="clientName">Nome do Cliente</label>
                    <input type="text" id="clientName" value="${credit?.clients_erp?.client_name || ''}" disabled>
                </div>
                 <div class="form-group">
                    <label for="sellerName">Vendedor</label>
                    <input type="text" id="sellerName" disabled>
                </div>
                <div class="form-group">
                    <label for="productCode">Código do Produto (Opcional)</label>
                    <input type="text" id="productCode" value="${credit?.product_code || ''}" style="text-transform: uppercase;">
                </div>
                <div class="form-group">
                    <label for="description">Descrição</label>
                    <input type="text" id="description" value="${credit?.description || ''}" required>
                </div>
                <div class="form-group">
                    <label for="quantity">Quantidade</label>
                    <input type="number" id="quantity" value="${credit?.quantity || ''}">
                </div>
                <div class="form-group">
                    <label for="value">Valor do Crédito</label>
                    <input type="number" id="value" step="0.01" value="${credit?.value || ''}" required>
                </div>
                <div class="form-group">
                    <label for="notes">Observações</label>
                    <textarea id="notes" rows="2">${credit?.notes || ''}</textarea>
                </div>
                <p id="modal-error" class="error-message"></p>
                <button type="submit" class="btn btn-primary">${isNew ? 'Salvar Crédito' : 'Salvar Alterações'}</button>
            </form>
        `;
        const clientCodeInput = document.getElementById('clientCode');
        const productCodeInput = document.getElementById('productCode');
        const descriptionInput = document.getElementById('description');
        const fetchClientData = async () => {
            const code = clientCodeInput.value;
            if (!code) return;
            const { data: client, error } = await supabase.from('clients_erp').select('client_name, id_vendedor').eq('client_code', code).single();
            if (client) {
                document.getElementById('clientName').value = client.client_name;
                if (client.id_vendedor) {
                    const { data: seller } = await supabase.from('profiles').select('full_name').eq('seller_id_erp', client.id_vendedor).single();
                    document.getElementById('sellerName').value = seller ? seller.full_name : 'Vendedor não encontrado';
                } else {
                    document.getElementById('sellerName').value = 'Cliente sem vendedor';
                }
            } else {
                document.getElementById('clientName').value = 'Cliente não encontrado';
                document.getElementById('sellerName').value = '';
            }
        };
        const fetchProductData = async () => {
            const code = productCodeInput.value;
            if (!code) {
                descriptionInput.readOnly = false;
                return;
            }
            const { data: product, error } = await supabase.from('products_erp').select('product_name').eq('product_code', code).single();
            if (product) {
                descriptionInput.value = product.product_name;
                descriptionInput.readOnly = true;
                document.getElementById('quantity').required = true;
            } else {
                descriptionInput.readOnly = false;
                document.getElementById('quantity').required = false;
            }
        };
        clientCodeInput.addEventListener('blur', fetchClientData);
        productCodeInput.addEventListener('blur', fetchProductData);
        if (credit) {
            await fetchClientData();
            await fetchProductData();
        }
        document.getElementById('credit-form').addEventListener('submit', handleFormSubmit);
        document.getElementById('modal-container').classList.add('active');
    };
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        App.showLoader();
        const form = e.target;
        const errorP = document.getElementById('modal-error');
        errorP.textContent = '';
        try {
            const creditId = form.creditId.value;
            const creditData = {
                n_registro: form.nRegistro.value || null,
                client_code: form.clientCode.value.toUpperCase(),
                product_code: form.productCode.value.toUpperCase() || null,
                description: form.description.value,
                quantity: form.quantity.value ? parseInt(form.quantity.value) : null,
                value: parseFloat(form.value.value),
                notes: form.notes.value || null,
            };
            if (creditId) {
                const { error } = await supabase.from('credits').update(creditData).eq('id', creditId);
                if (error) throw error;
            } else {
                creditData.created_by = App.userProfile.id;
                const { error } = await supabase.from('credits').insert(creditData);
                if (error) throw error;
            }
            document.getElementById('modal-container').classList.remove('active');
            await loadCredits();
        } catch (error) {
            console.error("Erro ao salvar crédito:", error);
            errorP.textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };
    const renderAbateModal = async (creditIds) => {
        const isMulti = creditIds.length > 1;
        let totalValue = 0;
        let title = 'Abater Crédito';
        if (isMulti) {
            title = `Abater ${creditIds.length} Créditos`;
            creditIds.forEach(id => totalValue += selectedCredits.get(id).value);
        } else {
            const { data: credit } = await supabase.from('credits').select('value').eq('id', creditIds[0]).single();
            totalValue = credit.value;
        }
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>${title}</h2>
            <form id="abate-form">
                <p>Valor total: <strong>${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
                <div class="form-group">
                    <label for="abatementOrder">Pedido ou Lançamento</label>
                    <input type="text" id="abatementOrder" required>
                </div>
                <div class="form-group">
                    <label for="abateValue">Valor a Abater</label>
                    <input type="number" id="abateValue" step="0.01" value="${totalValue.toFixed(2)}" max="${totalValue.toFixed(2)}" required>
                </div>
                <p id="modal-error" class="error-message"></p>
                <button type="submit" class="btn btn-primary">Confirmar Abatimento</button>
            </form>
        `;
        document.getElementById('abate-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleAbateSubmit(creditIds, totalValue);
        });
        document.getElementById('modal-container').classList.add('active');
    };
    const handleAbateSubmit = async (creditIds, originalTotalValue) => {
        App.showLoader();
        const errorP = document.getElementById('modal-error');
        errorP.textContent = '';
        try {
            const abatementOrder = document.getElementById('abatementOrder').value;
            const abateValue = parseFloat(document.getElementById('abateValue').value);
            if (!abatementOrder || isNaN(abateValue) || abateValue <= 0 || abateValue > originalTotalValue) {
                throw new Error('Dados inválidos. Verifique o pedido e o valor.');
            }
            const { data: creditsToAbate, error: fetchError } = await supabase
                .from('credits')
                .select('*')
                .in('id', creditIds)
                .order('created_at', { ascending: true });
            if (fetchError) throw fetchError;
            let remainingAbateValue = abateValue;
            for (const credit of creditsToAbate) {
                if (remainingAbateValue <= 0) break;
                const abatementData = {
                    status: 'Abatido',
                    abatement_order: abatementOrder,
                    abated_at: new Date().toISOString(),
                    abated_by: App.userProfile.id
                };
                if (remainingAbateValue >= credit.value) {
                    const { error } = await supabase.from('credits').update(abatementData).eq('id', credit.id);
                    if (error) throw error;
                    remainingAbateValue -= credit.value;
                } else {
                    const { error: updateError } = await supabase.from('credits')
                        .update({ ...abatementData, value: remainingAbateValue })
                        .eq('id', credit.id);
                    if (updateError) throw updateError;
                    const newCreditData = { ...credit };
                    delete newCreditData.id;
                    newCreditData.value = credit.value - remainingAbateValue;
                    newCreditData.status = 'Disponível';
                    newCreditData.original_credit_id = credit.id;
                    newCreditData.created_at = new Date().toISOString();
                    const { error: insertError } = await supabase.from('credits').insert(newCreditData);
                    if (insertError) throw insertError;
                    remainingAbateValue = 0;
                }
            }
            document.getElementById('modal-container').classList.remove('active');
            selectedCredits.clear();
            await loadCredits();
        } catch (error) {
            console.error("Erro ao abater crédito(s):", error);
            errorP.textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };
    const updateSelectionSummary = () => {
        const summaryContainer = document.getElementById('selection-summary');
        if (!summaryContainer) return;
        const count = selectedCredits.size;
        const multiAbateBtn = document.getElementById('btn-multi-abate');
        if (count === 0) {
            summaryContainer.querySelector('span').textContent = 'Nenhum crédito selecionado.';
            multiAbateBtn.disabled = true;
        } else {
            let total = 0;
            selectedCredits.forEach(credit => total += credit.value);
            summaryContainer.querySelector('span').textContent = 
                `${count} crédito(s) selecionado(s) | Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
            multiAbateBtn.disabled = false;
        }
    };
    const setupEventListeners = () => {
        const contentArea = document.getElementById('content-area');
        document.getElementById('btn-new-credit').addEventListener('click', () => renderCreditModal());
        document.getElementById('btn-apply-filters').addEventListener('click', () => {
            currentFilters = {
                client_code: document.getElementById('filter-client-code').value,
                client_name: document.getElementById('filter-client-name').value,
                status: document.getElementById('filter-status').value,
                seller_id: document.getElementById('filter-seller').value,
                date_start: document.getElementById('filter-date-start').value,
                date_end: document.getElementById('filter-date-end').value,
            };
            loadCredits();
        });
        document.getElementById('btn-multi-abate').addEventListener('click', () => {
            const ids = Array.from(selectedCredits.keys());
            if (ids.length > 0) {
                renderAbateModal(ids);
            }
        });
        const table = document.getElementById('credits-list');
        table.addEventListener('click', async (e) => {
            const target = e.target;
            if (target.tagName === 'BUTTON') {
                const action = target.dataset.action;
                const id = target.dataset.id;
                if (action === 'edit') {
                    const { data: credit } = await supabase.from('credits').select('*, clients_erp(client_name)').eq('id', id).single();
                    renderCreditModal(credit);
                }
                if (action === 'abater') {
                    renderAbateModal([id]);
                }
            }
            if (target.classList.contains('credit-select')) {
                const id = target.dataset.id;
                if (target.checked) {
                    const { data: credit } = await supabase.from('credits').select('id, value').eq('id', id).single();
                    selectedCredits.set(id, credit);
                } else {
                    selectedCredits.delete(id);
                }
                updateSelectionSummary();
            }
        });
        document.getElementById('select-all-credits').addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            const checkboxes = document.querySelectorAll('.credit-select');
            selectedCredits.clear();
            if (isChecked) {
                const creditIds = Array.from(checkboxes).map(cb => cb.dataset.id);
                const { data: credits } = await supabase.from('credits').select('id, value').in('id', creditIds);
                credits.forEach(c => selectedCredits.set(c.id, c));
            }
            checkboxes.forEach(checkbox => checkbox.checked = isChecked);
            updateSelectionSummary();
        });
    };

    return {
        name: 'Créditos',
        render
    };
})();```

#### **`app.js` (Completo e Corrigido)**

Substitua o conteúdo do seu arquivo por este. A correção está nas funções `_render...Dashboard` para usar IDs únicos.

```javascript
// app.js (VERSÃO COM IDs ÚNICOS NO DASHBOARD)

const App = {
    userProfile: null,
    initialized: false,
    dashboardChannel: null,
    modules: {
        usuarios: UsuariosModule,
        comprovantes: ComprovantesModule,
        creditos: CreditosModule
    },
    moduleConfig: [
        { key: 'comprovantes', name: 'Comprovantes', permissionCheck: (user) => user.permissions?.comprovantes?.view },
        { key: 'creditos', name: 'Créditos', permissionCheck: (user) => user.permissions?.creditos?.view },
        { key: 'solicitacoes', name: 'Solicitações D/C', permissionCheck: (user) => user.permissions?.solicitacoes?.view },
        { key: 'usuarios', name: 'Usuários', permissionCheck: (user) => user.is_admin }
    ],

    // ... init, destroy, renderLayout, buildNavigation, loadModule, navigateToModule ... (sem alterações)
    isInitialized() { return this.initialized; },
    init(userProfile) {
        if (this.initialized) return;
        this.userProfile = userProfile;
        this.initialized = true;
        console.log("Aplicação iniciada com o perfil:", userProfile);
        this.renderLayout();
        this.setupEventListeners();
        this.renderHome();
    },
    destroy() {
        this.unsubscribeFromDashboardChanges();
        this.userProfile = null;
        this.initialized = false;
        console.log("Estado da aplicação limpo.");
    },
    renderLayout() {
        document.getElementById('user-display-name').textContent = this.userProfile.full_name || this.userProfile.username;
        this.buildNavigation();
    },
    buildNavigation() {
        const nav = document.getElementById('main-nav');
        let navHtml = '<ul>';
        navHtml += `<li><a href="#" data-module="home" class="nav-link active">Início</a></li>`;
        this.moduleConfig.forEach(config => {
            if (config.permissionCheck(this.userProfile)) {
                navHtml += `<li><a href="#" data-module="${config.key}" class="nav-link">${config.name}</a></li>`;
            }
        });
        navHtml += '</ul>';
        nav.innerHTML = navHtml;
    },
    async loadModule(moduleName, initialFilters = null) {
        this.unsubscribeFromDashboardChanges();
        this.showLoader();
        try {
            const module = this.modules[moduleName];
            const moduleConf = this.moduleConfig.find(m => m.key === moduleName);
            document.getElementById('header-title').textContent = moduleConf?.name || 'Módulo';
            if (module && typeof module.render === 'function') {
                await module.render(initialFilters);
            } else {
                console.warn(`Módulo "${moduleName}" não implementado ou não encontrado.`);
                document.getElementById('content-area').innerHTML = `<div class="card"><p>O módulo <strong>${moduleConf.name}</strong> está em desenvolvimento.</p></div>`;
            }
        } catch (error) {
            console.error(`Erro ao renderizar o módulo ${moduleName}:`, error);
            document.getElementById('content-area').innerHTML = `<div class="card error-message">Ocorreu um erro grave ao carregar este módulo.</div>`;
        } finally {
            this.hideLoader();
        }
    },
    navigateToModule(moduleName, filters) {
        const navLink = document.querySelector(`#main-nav a[data-module="${moduleName}"]`);
        if (navLink) {
            document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
            navLink.classList.add('active');
            this.loadModule(moduleName, filters);
        }
    },
    async renderHome() {
        this.showLoader();
        document.getElementById('header-title').textContent = 'Início';
        const contentArea = document.getElementById('content-area');
        const userRoles = this.userProfile.roles || [];
        const canManageWidgets = this.userProfile.permissions?.home?.manage_widgets;
        let managementButtonHtml = canManageWidgets 
            ? `<button id="btn-manage-widgets" class="btn btn-secondary">Gerenciar Avisos e Links</button>` 
            : '';
        let dashboardHtml = `
            <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
                <h2>Bem-vindo, ${this.userProfile.full_name}!</h2>
                ${managementButtonHtml}
            </div>`;
        const roleRenderers = {
            'VENDEDOR': this._renderVendedorDashboard,
            'CAIXA': this._renderCaixaDashboard,
            'FINANCEIRO': this._renderFinanceiroDashboard,
            'FATURISTA': this._renderFaturistaDashboard,
            'GARANTIA': this._renderGarantiaDashboard,
        };
        let renderedSections = new Set();
        for (const role of userRoles) {
            if (roleRenderers[role] && !renderedSections.has(role)) {
                dashboardHtml += await roleRenderers[role].call(this);
                renderedSections.add(role);
            }
        }
        if (renderedSections.size === 0 && !canManageWidgets) {
            dashboardHtml += '<div class="card"><p>Você não possui uma função com dashboard definido.</p></div>';
        }
        contentArea.innerHTML = dashboardHtml;
        this.setupHomeEventListeners();
        this.updateDashboardStats();
        this.subscribeToDashboardChanges();
        this.hideLoader();
    },

    // <<< CORREÇÃO DE BOA PRÁTICA AQUI >>>
    // IDs dos inputs de busca foram tornados únicos.
    async _renderVendedorDashboard() {
        const { data: avisos } = await supabase.from('avisos').select('content').eq('is_active', true).gt('expires_at', new Date().toISOString());
        const avisosHtml = avisos && avisos.length > 0 ? `<ul>${avisos.map(a => `<li>${a.content}</li>`).join('')}</ul>` : '<p>Nenhum aviso no momento.</p>';
        return `
            <div class="dashboard-section">
                <div class="dashboard-grid">
                    <div class="card quick-action-card">
                        <h3>Ações Rápidas</h3>
                        <button id="home-add-proof" class="btn btn-primary">Adicionar Comprovante</button>
                        <button class="btn btn-secondary" disabled>Nova Solicitação D/C</button>
                        <button id="home-show-links" class="btn btn-info">Links Úteis</button>
                    </div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="vendedor-client-code">Código do Cliente</label>
                            <input type="text" id="vendedor-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary" disabled>Buscar</button>
                        <div class="search-result"><p>-- Status do cliente --</p></div>
                    </div>
                    <div class="card stat-card is-info" style="cursor: default;"><div id="widget-vendedor-creditos" class="stat-number">--</div><div class="stat-label">Clientes com Crédito</div></div>
                    <div class="card stat-card is-warning" style="cursor: default;"><div id="widget-vendedor-solicitacoes" class="stat-number">--</div><div class="stat-label">Solicitações Pendentes</div></div>
                    <div class="card avisos-card"><h3>Avisos</h3>${avisosHtml}</div>
                </div>
            </div>`;
    },
    _renderCaixaDashboard() { /* ...código inalterado... */ return `<div class="dashboard-section"><h3>Painel do Caixa</h3><div class="dashboard-grid"><div class="card quick-action-card"><button id="home-add-proof" class="btn btn-primary">Inserir Novo Pagamento</button></div><div id="widget-faturado" class="card stat-card is-success" data-status-filter="FATURADO"><div id="widget-faturado-count" class="stat-number">...</div><div class="stat-label">Pagamentos Prontos para Baixa</div></div></div></div>`; },
    _renderFinanceiroDashboard() { /* ...código inalterado... */ return `<div class="dashboard-section"><h3>Painel Financeiro</h3><div class="dashboard-grid"><div id="widget-pending" class="card stat-card is-warning" data-status-filter="AGUARDANDO CONFIRMAÇÃO"><div id="widget-pending-count" class="stat-number">...</div><div class="stat-label">Pagamentos Aguardando Confirmação</div></div></div></div>`; },
    _renderFaturistaDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel do Faturista</h3>
                <div class="dashboard-grid">
                     <div class="card quick-action-card"><button class="btn btn-primary" disabled>Inserir Novo Crédito</button></div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="faturista-client-code">Código do Cliente</label>
                            <input type="text" id="faturista-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary" disabled>Buscar</button>
                    </div>
                    <div id="widget-confirmed" class="card stat-card is-info" data-status-filter="CONFIRMADO"><div id="widget-confirmed-count" class="stat-number">...</div><div class="stat-label">Pagamentos Confirmados para Faturar</div></div>
                </div>
            </div>`;
    },
    _renderGarantiaDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel da Garantia</h3>
                <div class="dashboard-grid">
                    <div class="card quick-action-card"><button class="btn btn-primary" disabled>Inserir Novo Crédito</button></div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="garantia-client-code">Código do Cliente</label>
                            <input type="text" id="garantia-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary" disabled>Buscar</button>
                    </div>
                </div>
            </div>`;
    },

    // ... O restante do arquivo `app.js` permanece idêntico ...
    // (setupHomeEventListeners, renderManagementModal, renderAvisoForm, handleAvisoSubmit, renderLinkForm, handleLinkSubmit, updateDashboardStats, subscribeToDashboardChanges, unsubscribeFromDashboardChanges, setupEventListeners, showLoader, hideLoader)
    setupHomeEventListeners() {
        const contentArea = document.getElementById('content-area');
        const addProofBtn = contentArea.querySelector('#home-add-proof');
        if (addProofBtn) {
            addProofBtn.addEventListener('click', () => {
                this.modules.comprovantes.renderProofModal();
            });
        }
        const showLinksBtn = contentArea.querySelector('#home-show-links');
        if (showLinksBtn) {
            showLinksBtn.addEventListener('click', async () => {
                const { data: links } = await supabase.from('links_uteis').select('*').order('display_order');
                const modalBody = document.getElementById('modal-body');
                if(links && links.length > 0) {
                    modalBody.innerHTML = `<h2>Links Úteis</h2><div id="links-uteis-list">${links.map(l => `<a href="${l.url}" target="_blank">${l.title}</a>`).join('')}</div>`;
                } else {
                    modalBody.innerHTML = `<h2>Links Úteis</h2><p>Nenhum link cadastrado.</p>`;
                }
                document.getElementById('modal-container').classList.add('active');
            });
        }
        contentArea.querySelectorAll('.stat-card[data-status-filter]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.dataset.statusFilter;
                this.navigateToModule('comprovantes', { status: status });
            });
        });
        const manageWidgetsBtn = contentArea.querySelector('#btn-manage-widgets');
        if (manageWidgetsBtn) {
            manageWidgetsBtn.addEventListener('click', () => this.renderManagementModal());
        }
    },
    async renderManagementModal() {
        this.showLoader();
        const modalBody = document.getElementById('modal-body');
        const { data: avisos } = await supabase.from('avisos').select('*').order('created_at', { ascending: false });
        const { data: links } = await supabase.from('links_uteis').select('*').order('display_order');
        modalBody.innerHTML = `
            <h2>Gerenciar Avisos e Links</h2>
            <div class="management-section">
                <h3>Avisos</h3>
                <button class="btn btn-primary btn-sm" data-action="create-aviso">Novo Aviso</button>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Conteúdo</th><th>Expira em</th><th>Ativo</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${avisos.map(a => `
                                <tr data-id="${a.id}">
                                    <td>${a.content.substring(0, 50)}...</td>
                                    <td>${new Date(a.expires_at).toLocaleDateString()}</td>
                                    <td>${a.is_active ? 'Sim' : 'Não'}</td>
                                    <td><button class="btn btn-secondary btn-sm" data-action="edit-aviso">Editar</button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="management-section">
                <h3>Links Úteis</h3>
                <button class="btn btn-primary btn-sm" data-action="create-link">Novo Link</button>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Título</th><th>URL</th><th>Ordem</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${links.map(l => `
                                <tr data-id="${l.id}">
                                    <td>${l.title}</td>
                                    <td>${l.url.substring(0, 30)}...</td>
                                    <td>${l.display_order}</td>
                                    <td><button class="btn btn-secondary btn-sm" data-action="edit-link">Editar</button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        this.hideLoader();
        document.getElementById('modal-container').classList.add('active');
        modalBody.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            if (!action) return;
            const id = e.target.closest('tr')?.dataset.id;
            if (action === 'create-aviso' || action === 'edit-aviso') {
                const aviso = action === 'edit-aviso' ? avisos.find(a => a.id === id) : null;
                this.renderAvisoForm(aviso);
            }
            if (action === 'create-link' || action === 'edit-link') {
                const link = action === 'edit-link' ? links.find(l => l.id === id) : null;
                this.renderLinkForm(link);
            }
        });
    },
    renderAvisoForm(aviso = null) {
        const modalBody = document.getElementById('modal-body');
        const expiresDate = aviso ? new Date(aviso.expires_at).toISOString().split('T')[0] : '';
        modalBody.innerHTML = `
            <h2>${aviso ? 'Editar' : 'Novo'} Aviso</h2>
            <form id="aviso-form">
                <input type="hidden" id="avisoId" value="${aviso?.id || ''}">
                <div class="form-group">
                    <label for="avisoContent">Conteúdo</label>
                    <textarea id="avisoContent" required>${aviso?.content || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="avisoExpires">Data de Expiração</label>
                    <input type="date" id="avisoExpires" value="${expiresDate}" required>
                </div>
                <div class="form-group">
                    <input type="checkbox" id="avisoActive" ${aviso?.is_active ?? true ? 'checked' : ''}>
                    <label for="avisoActive">Ativo</label>
                </div>
                <button type="submit" class="btn btn-primary">Salvar</button>
                <button type="button" class="btn btn-secondary" id="back-to-management">Voltar</button>
            </form>
        `;
        document.getElementById('aviso-form').addEventListener('submit', this.handleAvisoSubmit.bind(this));
        document.getElementById('back-to-management').addEventListener('click', () => this.renderManagementModal());
    },
    async handleAvisoSubmit(e) {
        e.preventDefault();
        this.showLoader();
        const form = e.target;
        const data = {
            content: form.avisoContent.value,
            expires_at: form.avisoExpires.value,
            is_active: form.avisoActive.checked
        };
        const id = form.avisoId.value;
        const { error } = id
            ? await supabase.from('avisos').update(data).eq('id', id)
            : await supabase.from('avisos').insert(data);
        if (error) {
            alert('Erro ao salvar aviso: ' + error.message);
        } else {
            await this.renderManagementModal();
            this.renderHome();
        }
        this.hideLoader();
    },
    renderLinkForm(link = null) {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>${link ? 'Editar' : 'Novo'} Link Útil</h2>
            <form id="link-form">
                <input type="hidden" id="linkId" value="${link?.id || ''}">
                <div class="form-group">
                    <label for="linkTitle">Título</label>
                    <input type="text" id="linkTitle" value="${link?.title || ''}" required>
                </div>
                <div class="form-group">
                    <label for="linkUrl">URL</label>
                    <input type="url" id="linkUrl" value="${link?.url || ''}" required>
                </div>
                <div class="form-group">
                    <label for="linkOrder">Ordem de Exibição</label>
                    <input type="number" id="linkOrder" value="${link?.display_order || 0}" required>
                </div>
                <button type="submit" class="btn btn-primary">Salvar</button>
                <button type="button" class="btn btn-secondary" id="back-to-management">Voltar</button>
            </form>
        `;
        document.getElementById('link-form').addEventListener('submit', this.handleLinkSubmit.bind(this));
        document.getElementById('back-to-management').addEventListener('click', () => this.renderManagementModal());
    },
    async handleLinkSubmit(e) {
        e.preventDefault();
        this.showLoader();
        const form = e.target;
        const data = {
            title: form.linkTitle.value,
            url: form.linkUrl.value,
            display_order: parseInt(form.linkOrder.value)
        };
        const id = form.linkId.value;
        const { error } = id
            ? await supabase.from('links_uteis').update(data).eq('id', id)
            : await supabase.from('links_uteis').insert(data);
        if (error) {
            alert('Erro ao salvar link: ' + error.message);
        } else {
            await this.renderManagementModal();
        }
        this.hideLoader();
    },
    async updateDashboardStats() {
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        if (error) {
            console.error("Erro ao buscar estatísticas do dashboard:", error);
            return;
        }
        if (data) {
            const pendingEl = document.getElementById('widget-pending-count');
            if (pendingEl) pendingEl.textContent = data.pending_proofs;
            const confirmedEl = document.getElementById('widget-confirmed-count');
            if (confirmedEl) confirmedEl.textContent = data.confirmed_proofs;
            const faturadoEl = document.getElementById('widget-faturado-count');
            if (faturadoEl) faturadoEl.textContent = data.faturado_proofs;
        }
    },
    subscribeToDashboardChanges() {
        if (this.dashboardChannel) return;
        const handleDbChange = (payload) => {
            console.log('Mudança no banco de dados detectada:', payload);
            this.updateDashboardStats();
        };
        this.dashboardChannel = supabase
            .channel('dashboard-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proofs' }, handleDbChange)
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Conectado ao canal de realtime do dashboard!');
                }
                if (err) {
                    console.error('Erro na inscrição do canal de realtime:', err);
                }
            });
    },
    unsubscribeFromDashboardChanges() {
        if (this.dashboardChannel) {
            supabase.removeChannel(this.dashboardChannel);
            this.dashboardChannel = null;
            console.log('Desconectado do canal de realtime do dashboard.');
        }
    },
    setupEventListeners() {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menu-toggle');
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
        document.getElementById('main-nav').addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.classList.contains('nav-link')) {
                e.preventDefault();
                document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
                e.target.classList.add('active');
                const moduleName = e.target.dataset.module;
                if (moduleName === 'home') this.renderHome();
                else this.loadModule(moduleName);
            }
        });
        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer || e.target.classList.contains('modal-close-btn')) {
                if (this.modules.comprovantes && typeof this.modules.comprovantes.cleanupModalListeners === 'function') {
                    this.modules.comprovantes.cleanupModalListeners();
                }
                modalContainer.classList.remove('active');
            }
        });
    },
    showLoader() { document.getElementById('loader').classList.add('active'); },
    hideLoader() { document.getElementById('loader').classList.remove('active'); },
};
