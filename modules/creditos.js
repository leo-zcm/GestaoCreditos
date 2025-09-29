// modules/creditos.js (VERSÃO 100% CORRIGIDA E FUNCIONAL)

const CreditosModule = (() => {
    // <<< CORREÇÃO: A variável de filtros é inicializada aqui para manter o estado >>>
    let currentFilters = { status: 'Disponível', date_type: 'created_at' };
    let selectedCredits = new Map();

    const render = async (initialFilters = null) => {
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
                    <select id="filter-seller"></select>
                    <select id="filter-date-type" title="Tipo de Data">
                        <option value="created_at" selected>Data de Criação</option>
                        <option value="abated_at">Data de Abatimento</option>
                    </select>
                    <input type="date" id="filter-date-start" title="Data inicial">
                    <input type="date" id="filter-date-end" title="Data final">
                    <button id="btn-apply-filters" class="btn btn-secondary">Buscar</button>
                </div>
                <div class="table-container">
                    <table id="credits-table">
                        <thead>
                            <tr>
                                <th class="col-select"><input type="checkbox" id="select-all-credits"></th>
                                <th>Data Criação</th>
                                <th>Nº Registro</th>
                                <th>Cód. Cliente</th>
                                <th>Cliente</th>
                                <th>Descrição</th>
                                <th class="col-qtd">Qtd</th>
                                <th>Valor</th>
                                <th class="col-pedido">Ped. Abatido</th>
                                <th class="col-actions">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="credits-list">
                            <!-- Mensagem inicial -->
                            <tr><td colspan="10">Utilize os filtros acima para buscar os créditos.</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="selection-summary" class="selection-summary">
                    <span>Nenhum crédito selecionado.</span>
                    <button id="btn-multi-abate" class="btn btn-success" disabled>Abater Múltiplos</button>
                </div>
            </div>
        `;
    
        const styleId = 'creditos-module-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                #credits-table { font-size: 0.9rem; table-layout: fixed; width: 100%; }
                #credits-table td, #credits-table th { padding: 0.6rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; }
                .col-select { width: 40px; text-align: center; }
                .col-qtd { width: 60px; text-align: center; }
                .col-pedido { width: 120px; } 
                .col-actions { width: 180px; text-align: right; }
                .action-buttons { display: flex; justify-content: flex-end; gap: 0.5rem; }
                .selection-summary { display: flex; justify-content: space-between; align-items: center; padding: 1rem; background-color: var(--light-color); border-top: 1px solid var(--border-color); margin: 1rem -1.5rem -1.5rem -1.5rem; border-radius: 0 0 8px 8px; }
            `;
            document.head.appendChild(style);
        }
    
        // <<< CORREÇÃO: As chamadas async estão todas dentro da função async 'render' >>>
        await populateSellersDropdown();
        setupEventListeners();
        // A busca inicial não é mais automática para melhorar a performance. O usuário clica em "Buscar".
    };

    // <<< CORREÇÃO: Lógica de popular vendedores refeita para garantir unicidade e corrigir o bug do ID 1 >>>
    const populateSellersDropdown = async () => {
        const sellerSelect = document.getElementById('filter-seller');
        sellerSelect.innerHTML = '<option value="">Carregando...</option>';
        try {
            const { data: sellers, error } = await supabase.rpc('get_unique_sellers');
            if (error) throw error;

            // Usamos um Map para garantir que cada nome de vendedor seja único na lista
            const uniqueSellers = new Map();
            sellers.forEach(s => {
                if (s.full_name && !uniqueSellers.has(s.full_name)) {
                    uniqueSellers.set(s.full_name, s.seller_id_erp);
                }
            });

            // Converte o Map para um array, ordena por nome e cria as opções
            const sortedSellers = Array.from(uniqueSellers.entries()).sort((a, b) => a[0].localeCompare(b[0]));

            let options = '<option value="">Todos Vendedores</option>';
            options += '<option value="ZE_CLEUTO">ZE CLEUTO</option>'; // Opção especial

            sortedSellers.forEach(([fullName, sellerId]) => {
                options += `<option value="${sellerId}">${fullName}</option>`;
            });
            
            sellerSelect.innerHTML = options;

        } catch (err) {
            console.error("Erro ao buscar vendedores únicos:", err);
            sellerSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    };

    const loadCredits = async () => {
        App.showLoader();
        const listContainer = document.getElementById('credits-list');
        listContainer.innerHTML = '<tr><td colspan="10">Buscando...</td></tr>';
    
        try {
            const userPermissions = App.userProfile.permissions?.creditos || {};
            const selectStatement = `*, clients_erp(client_name)`;
            let query = supabase.from('credits').select(selectStatement);
    
            // Lógica de permissão de visualização (own vs all)
            if (userPermissions.view === 'own' && App.userProfile.seller_id_erp) {
                const { data: clientCodes, error: clientError } = await supabase
                    .from('clients_erp').select('client_code').eq('id_vendedor', App.userProfile.seller_id_erp);
                if (clientError) throw clientError;
                const codes = clientCodes.map(c => c.client_code);
                if (codes.length === 0) { renderTable([]); return; }
                query = query.in('client_code', codes);
                document.getElementById('filter-seller').disabled = true;
            } else {
                // Lógica de filtro do dropdown de vendedor
                const sellerFilter = currentFilters.seller_id;
                if (sellerFilter === 'ZE_CLEUTO') {
                    const { data: clientCodes, error: clientError } = await supabase
                        .from('clients_erp').select('client_code').neq('id_vendedor', '1');
                    if (clientError) throw clientError;
                    const codes = clientCodes.map(c => c.client_code);
                    if (codes.length === 0) { renderTable([]); return; }
                    query = query.in('client_code', codes);
                } else if (sellerFilter) {
                    const { data: clientCodes, error: clientError } = await supabase
                        .from('clients_erp').select('client_code').eq('id_vendedor', sellerFilter);
                    if (clientError) throw clientError;
                    const codes = clientCodes.map(c => c.client_code);
                    if (codes.length === 0) { renderTable([]); return; }
                    query = query.in('client_code', codes);
                }
            }
    
            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            if (currentFilters.client_code) query = query.ilike('client_code', `%${currentFilters.client_code}%`);
            
            const dateColumn = currentFilters.date_type || 'created_at';
            if (currentFilters.date_start) query = query.gte(dateColumn, currentFilters.date_start);
            if (currentFilters.date_end) query = query.lte(dateColumn, currentFilters.date_end + 'T23:59:59');
    
            let { data: credits, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
    
            if (currentFilters.client_name) {
                credits = credits.filter(c => 
                    c.clients_erp?.client_name && c.clients_erp.client_name.toLowerCase().includes(currentFilters.client_name.toLowerCase())
                );
            }
    
            renderTable(credits);
    
        } catch (error) {
            console.error("Erro ao carregar créditos:", error);
            listContainer.innerHTML = `<tr><td colspan="10" class="error-message">Falha ao carregar dados. Verifique o console.</td></tr>`;
        } finally {
            App.hideLoader();
            updateSelectionSummary();
        }
    };

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
                    <td class="col-select"><input type="checkbox" class="credit-select" data-id="${credit.id}" ${isSelected ? 'checked' : ''}></td>
                    <td>${new Date(credit.created_at).toLocaleDateString()}</td>
                    <td>${credit.n_registro || '---'}</td>
                    <td>${credit.client_code}</td>
                    <td title="${credit.clients_erp?.client_name || ''}">${credit.clients_erp?.client_name || 'N/A'}</td>
                    <td title="${credit.description}">${credit.description}</td>
                    <td class="col-qtd">${credit.quantity || '---'}</td>
                    <td>${credit.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td class="col-pedido">${credit.abatement_order || '---'}</td>
                    <td class="col-actions">
                        ${credit.status === 'Disponível' ? `
                            <div class="action-buttons">
                                <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${credit.id}">Editar</button>
                                <button class="btn btn-success btn-sm" data-action="abater" data-id="${credit.id}">Abater</button>
                            </div>
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
        
        const fetchClientData = async () => {
            const code = clientCodeInput.value;
            if (!code) return;
            const { data: client } = await supabase.from('clients_erp').select('client_name, id_vendedor').eq('client_code', code).single();
            if (client) {
                document.getElementById('clientName').value = client.client_name;
                if (client.id_vendedor) {
                    const { data: seller } = await supabase.from('profiles').select('full_name').eq('seller_id_erp', client.id_vendedor).limit(1).single();
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
            const code = document.getElementById('productCode').value;
            const descriptionInput = document.getElementById('description');
            const quantityInput = document.getElementById('quantity');
            if (!code) {
                descriptionInput.readOnly = false;
                quantityInput.required = false;
                return;
            }
            try {
                const { data: product, error } = await supabase.from('products_erp').select('product_name').eq('product_code', code).single();
                if (error && error.code !== 'PGRST116') { throw error; }
                if (product) {
                    descriptionInput.value = product.product_name;
                    descriptionInput.readOnly = true;
                    quantityInput.required = true;
                } else {
                    descriptionInput.readOnly = false;
                    quantityInput.required = false;
                }
            } catch (err) {
                console.error("Erro ao buscar produto:", err);
                descriptionInput.readOnly = false;
                quantityInput.required = false;
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
                .from('credits').select('*').in('id', creditIds).order('created_at', { ascending: true });
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
                        .update({ ...abatementData, value: remainingAbateValue }).eq('id', credit.id);
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
        document.getElementById('btn-new-credit').addEventListener('click', () => renderCreditModal());
        document.getElementById('btn-apply-filters').addEventListener('click', () => {
            currentFilters = {
                client_code: document.getElementById('filter-client-code').value,
                client_name: document.getElementById('filter-client-name').value,
                status: document.getElementById('filter-status').value,
                seller_id: document.getElementById('filter-seller').value,
                date_type: document.getElementById('filter-date-type').value,
                date_start: document.getElementById('filter-date-start').value,
                date_end: document.getElementById('filter-date-end').value,
            };
            loadCredits();
        });
        document.getElementById('btn-multi-abate').addEventListener('click', () => {
            const ids = Array.from(selectedCredits.keys());
            if (ids.length > 0) renderAbateModal(ids);
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
                if (action === 'abater') renderAbateModal([id]);
            }
            if (target.classList.contains('credit-select')) {
                const id = target.dataset.id;
                if (target.checked) {
                    const { data: credit } = await supabase.from('credits').select('id, value').eq('id', id).single();
                    if (credit) selectedCredits.set(id, credit);
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
                if (creditIds.length > 0) {
                    const { data: credits } = await supabase.from('credits').select('id, value').in('id', creditIds);
                    if (credits) credits.forEach(c => selectedCredits.set(c.id, c));
                }
            }
            checkboxes.forEach(checkbox => checkbox.checked = isChecked);
            updateSelectionSummary();
        });
    };

    return {
        name: 'Créditos',
        render
    };
})();
