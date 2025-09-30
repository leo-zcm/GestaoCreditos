// modules/solicitacoes.js (MÓDULO COMPLETO E FUNCIONAL)

const SolicitacoesModule = (() => {
    let currentFilters = { status: 'PENDENTE' };

    const STATUS_MAP = {
        'PENDENTE': { text: 'Pendente', class: 'status-pending' },
        'APROVADO': { text: 'Aprovado', class: 'status-confirmed' },
        'REJEITADO': { text: 'Rejeitado', class: 'status-rejected' },
    };

    const render = async (initialFilters = null) => {
        const contentArea = document.getElementById('content-area');
        const userPermissions = App.userProfile.permissions?.solicitacoes || {};
        const isOwnView = userPermissions.view === 'own' && App.userProfile.seller_id_erp;

        let sellerFilterHtml;
        if (isOwnView) {
            sellerFilterHtml = `<input type="text" value="${App.userProfile.full_name}" disabled title="Visualizando apenas suas solicitações.">`;
        } else {
            sellerFilterHtml = `<select id="filter-seller"><option value="">Todos Vendedores</option></select>`;
        }

        contentArea.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>Solicitações de Débito/Crédito</h2>
                    ${userPermissions.create ? '<button id="btn-new-request" class="btn btn-primary">Nova Solicitação</button>' : ''}
                </div>
                <div class="filters">
                    ${sellerFilterHtml}
                    <input type="text" id="filter-client-code" placeholder="Cód. Cliente (Débito/Crédito)">
                    <input type="text" id="filter-product-code" placeholder="Cód. Produto">
                    <select id="filter-status">
                        <option value="PENDENTE">Pendente</option>
                        <option value="APROVADO">Aprovado</option>
                        <option value="REJEITADO">Rejeitado</option>
                        <option value="">Todos</option>
                    </select>
                    <input type="date" id="filter-date-start" title="Data inicial">
                    <input type="date" id="filter-date-end" title="Data final">
                    <button id="btn-apply-filters" class="btn btn-secondary">Buscar</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Solicitante</th>
                                <th>Débito (Cliente)</th>
                                <th>Crédito (Cliente)</th>
                                <th>Produto</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th class="col-actions">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="requests-list"></tbody>
                    </table>
                </div>
            </div>
        `;

        if (!isOwnView) {
            await populateSellersDropdown();
        }
        
        document.getElementById('filter-status').value = currentFilters.status;
        setupEventListeners();
        await loadRequests();
    };

    const populateSellersDropdown = async () => {
        const sellerSelect = document.getElementById('filter-seller');
        if (!sellerSelect) return;
        // Reutiliza a mesma RPC do módulo de créditos
        const { data: sellers, error } = await supabase.rpc('get_unique_sellers');
        if (error) {
            console.error("Erro ao buscar vendedores:", error);
            sellerSelect.innerHTML += '<option value="">Erro ao carregar</option>';
            return;
        }
        const uniqueSellers = new Map(sellers.map(s => [s.full_name, s.seller_id_erp]));
        const sortedSellers = Array.from(uniqueSellers.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        sortedSellers.forEach(([fullName, sellerId]) => {
            sellerSelect.innerHTML += `<option value="${sellerId}">${fullName}</option>`;
        });
    };

    const loadRequests = async () => {
        App.showLoader();
        const listContainer = document.getElementById('requests-list');
        listContainer.innerHTML = '<tr><td colspan="8">Buscando...</td></tr>';

        try {
            const userPermissions = App.userProfile.permissions?.solicitacoes || {};
            const isOwnView = userPermissions.view === 'own' && App.userProfile.seller_id_erp;

            let query = supabase.from('dc_requests').select(`
                *,
                requester:profiles!requester_id(full_name, seller_id_erp)
            `);

            if (isOwnView) {
                query = query.eq('requester_id', App.userProfile.id);
            } else if (currentFilters.seller_id) {
                query = query.eq('requester.seller_id_erp', currentFilters.seller_id);
            }

            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            if (currentFilters.product_code) query = query.or(`debit_product_code.ilike.%${currentFilters.product_code}%,credit_product_code.ilike.%${currentFilters.product_code}%`);
            if (currentFilters.client_code) query = query.or(`debit_client_code.ilike.%${currentFilters.client_code}%,credit_client_code.ilike.%${currentFilters.client_code}%`);
            if (currentFilters.date_start) query = query.gte('created_at', currentFilters.date_start);
            if (currentFilters.date_end) query = query.lte('created_at', currentFilters.date_end + 'T23:59:59');

            const { data: requests, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;

            renderTable(requests);
        } catch (error) {
            console.error("Erro ao carregar solicitações:", error);
            listContainer.innerHTML = `<tr><td colspan="8" class="error-message">Falha ao carregar dados.</td></tr>`;
        } finally {
            App.hideLoader();
        }
    };

    const renderTable = (requests) => {
        const listContainer = document.getElementById('requests-list');
        const canApprove = App.userProfile.permissions?.solicitacoes?.approve;

        if (requests.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="8">Nenhuma solicitação encontrada.</td></tr>';
            return;
        }

        listContainer.innerHTML = requests.map(req => {
            const statusInfo = STATUS_MAP[req.status] || { text: req.status, class: '' };
            const showActions = canApprove && req.status === 'PENDENTE';
            return `
                <tr>
                    <td>${new Date(req.created_at).toLocaleDateString()}</td>
                    <td>${req.requester?.full_name || 'N/A'}</td>
                    <td>${req.debit_client_code}</td>
                    <td>${req.credit_client_code}</td>
                    <td>${req.debit_product_code}</td>
                    <td>${req.debit_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
                    <td class="col-actions">
                        ${showActions ? `
                            <div class="action-buttons">
                                <button class="btn btn-success btn-sm" data-action="approve" data-id="${req.id}">Aprovar</button>
                                <button class="btn btn-danger btn-sm" data-action="reject" data-id="${req.id}">Rejeitar</button>
                            </div>
                        ` : (req.erp_debit_code || req.rejection_reason ? `<small>${req.erp_debit_code || req.rejection_reason}</small>` : '---')}
                    </td>
                </tr>
            `;
        }).join('');
    };
    
    const renderRequestModal = () => {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>Nova Solicitação de Débito/Crédito</h2>
            <form id="request-form">
                <div class="form-row">
                    <fieldset class="form-group">
                        <legend>Dados do Débito (Cliente que pagará)</legend>
                        <label for="debitClientCode">Cód. Cliente</label>
                        <input type="text" id="debitClientCode" required>
                        <label for="debitProductCode">Cód. Produto</label>
                        <input type="text" id="debitProductCode" required>
                        <label for="debitQuantity">Quantidade</label>
                        <input type="number" id="debitQuantity" required>
                        <label for="debitValue">Valor Total do Débito</label>
                        <input type="number" step="0.01" id="debitValue" required>
                    </fieldset>
                    <fieldset class="form-group">
                        <legend>Dados do Crédito (Cliente que receberá)</legend>
                        <label for="creditClientCode">Cód. Cliente</label>
                        <input type="text" id="creditClientCode" required>
                        <label for="creditProductCode">Cód. Produto</label>
                        <input type="text" id="creditProductCode" required>
                        <label for="creditQuantity">Quantidade</label>
                        <input type="number" id="creditQuantity" required>
                        <label for="creditValue">Valor Total do Crédito (Calculado)</label>
                        <input type="number" step="0.01" id="creditValue" disabled>
                    </fieldset>
                </div>
                <p id="modal-error" class="error-message"></p>
                <button type="submit" class="btn btn-primary">Enviar Solicitação</button>
            </form>
        `;

        const debitValue = document.getElementById('debitValue');
        const debitQty = document.getElementById('debitQuantity');
        const creditQty = document.getElementById('creditQuantity');
        const creditValue = document.getElementById('creditValue');

        const updateCreditValue = () => {
            const dVal = parseFloat(debitValue.value);
            const dQty = parseInt(debitQty.value);
            const cQty = parseInt(creditQty.value);
            if (dVal > 0 && dQty > 0 && cQty > 0) {
                const unitPrice = dVal / dQty;
                creditValue.value = (unitPrice * cQty).toFixed(2);
            } else {
                creditValue.value = '';
            }
        };

        [debitValue, debitQty, creditQty].forEach(el => el.addEventListener('input', updateCreditValue));
        document.getElementById('request-form').addEventListener('submit', handleRequestSubmit);
        document.getElementById('modal-container').classList.add('active');
    };

    const handleRequestSubmit = async (e) => {
        e.preventDefault();
        App.showLoader();
        const form = e.target;
        try {
            const requestData = {
                requester_id: App.userProfile.id,
                status: 'PENDENTE',
                debit_client_code: form.debitClientCode.value.toUpperCase(),
                debit_value: parseFloat(form.debitValue.value),
                debit_product_code: form.debitProductCode.value.toUpperCase(),
                debit_quantity: parseInt(form.debitQuantity.value),
                credit_client_code: form.creditClientCode.value.toUpperCase(),
                credit_value: parseFloat(form.creditValue.value),
                credit_product_code: form.creditProductCode.value.toUpperCase(),
                credit_quantity: parseInt(form.creditQuantity.value),
            };

            const { error } = await supabase.from('dc_requests').insert(requestData);
            if (error) throw error;

            document.getElementById('modal-container').classList.remove('active');
            await loadRequests();
        } catch (error) {
            console.error("Erro ao criar solicitação:", error);
            document.getElementById('modal-error').textContent = `Erro: ${error.message}`;
        } finally {
            App.hideLoader();
        }
    };

    const renderApprovalModal = async (requestId) => {
        App.showLoader();
        try {
            const { data: req, error } = await supabase.from('dc_requests').select('*').eq('id', requestId).single();
            if (error) throw error;

            // Busca dados do ERP para facilitar a vida do usuário
            const { data: client } = await supabase.from('clients_erp').select('client_name').eq('client_code', req.debit_client_code).single();
            const { data: product } = await supabase.from('products_erp').select('product_name').eq('product_code', req.debit_product_code).single();

            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = `
                <h2>Aprovar Solicitação #${req.id.substring(0, 8)}</h2>
                <div class="approval-details">
                    <h4>Lançar Débito no ERP:</h4>
                    <p><strong>Cliente:</strong> ${req.debit_client_code} - ${client?.client_name || 'Não encontrado'}</p>
                    <p><strong>Produto:</strong> ${req.debit_product_code} - ${product?.product_name || 'Não encontrado'}</p>
                    <p><strong>Quantidade:</strong> ${req.debit_quantity}</p>
                    <p><strong>Valor:</strong> ${req.debit_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                </div>
                <form id="approval-form">
                    <div class="form-group">
                        <label for="erpDebitCode">Código do Lançamento no ERP</label>
                        <input type="text" id="erpDebitCode" required>
                    </div>
                    <p id="modal-error" class="error-message"></p>
                    <button type="submit" class="btn btn-primary">Confirmar Aprovação e Gerar Crédito</button>
                </form>
            `;
            document.getElementById('approval-form').addEventListener('submit', (e) => {
                e.preventDefault();
                handleApprovalSubmit(req);
            });
            document.getElementById('modal-container').classList.add('active');
        } catch (err) {
            alert('Erro ao carregar dados da solicitação.');
            console.error(err);
        } finally {
            App.hideLoader();
        }
    };

    const handleApprovalSubmit = async (request) => {
        App.showLoader();
        const erpCode = document.getElementById('erpDebitCode').value;
        try {
            // 1. Gerar o crédito
            const creditData = {
                client_code: request.credit_client_code,
                value: request.credit_value,
                description: `Crédito da Solicitação D/C #${request.id.substring(0, 8)}`,
                product_code: request.credit_product_code,
                quantity: request.credit_quantity,
                created_by: App.userProfile.id,
                status: 'Disponível'
            };
            const { error: creditError } = await supabase.from('credits').insert(creditData);
            if (creditError) throw new Error(`Falha ao gerar crédito: ${creditError.message}`);

            // 2. Atualizar a solicitação
            const updateData = {
                status: 'APROVADO',
                processed_by: App.userProfile.id,
                processed_at: new Date().toISOString(),
                erp_debit_code: erpCode
            };
            const { error: requestError } = await supabase.from('dc_requests').update(updateData).eq('id', request.id);
            if (requestError) throw new Error(`Falha ao atualizar solicitação: ${requestError.message}`);

            document.getElementById('modal-container').classList.remove('active');
            await loadRequests();
        } catch (error) {
            console.error("Erro no processo de aprovação:", error);
            document.getElementById('modal-error').textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };
    
    const renderRejectionModal = (requestId) => {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>Rejeitar Solicitação</h2>
            <form id="rejection-form">
                <div class="form-group">
                    <label for="rejectionReason">Motivo da Rejeição</label>
                    <textarea id="rejectionReason" rows="3" required></textarea>
                </div>
                <p id="modal-error" class="error-message"></p>
                <button type="submit" class="btn btn-primary">Confirmar Rejeição</button>
            </form>
        `;
        document.getElementById('rejection-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleRejectionSubmit(requestId);
        });
        document.getElementById('modal-container').classList.add('active');
    };

    const handleRejectionSubmit = async (requestId) => {
        App.showLoader();
        const reason = document.getElementById('rejectionReason').value;
        try {
            const { error } = await supabase.from('dc_requests').update({
                status: 'REJEITADO',
                rejection_reason: reason,
                processed_by: App.userProfile.id,
                processed_at: new Date().toISOString()
            }).eq('id', requestId);
            if (error) throw error;

            document.getElementById('modal-container').classList.remove('active');
            await loadRequests();
        } catch (error) {
            console.error("Erro ao rejeitar:", error);
            document.getElementById('modal-error').textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };

    const setupEventListeners = () => {
        const newRequestBtn = document.getElementById('btn-new-request');
        if (newRequestBtn) {
            newRequestBtn.addEventListener('click', renderRequestModal);
        }

        document.getElementById('btn-apply-filters').addEventListener('click', () => {
            const sellerDropdown = document.getElementById('filter-seller');
            currentFilters.seller_id = sellerDropdown ? sellerDropdown.value : null;
            currentFilters.client_code = document.getElementById('filter-client-code').value;
            currentFilters.product_code = document.getElementById('filter-product-code').value;
            currentFilters.status = document.getElementById('filter-status').value;
            currentFilters.date_start = document.getElementById('filter-date-start').value;
            currentFilters.date_end = document.getElementById('filter-date-end').value;
            loadRequests();
        });

        document.getElementById('requests-list').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            const id = button.dataset.id;
            if (action === 'approve') renderApprovalModal(id);
            if (action === 'reject') renderRejectionModal(id);
        });
    };

    return {
        name: 'Solicitações D/C',
        render
    };
})();
