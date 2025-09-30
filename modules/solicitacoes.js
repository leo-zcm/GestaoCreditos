// modules/solicitacoes.js (VERSÃO COM TOOLTIPS/MODAIS INFORMATIVOS)

const SolicitacoesModule = (() => {
    let currentFilters = { status: 'PENDENTE' };
    // Mapas para armazenar nomes e evitar buscas repetidas no DB
    let clientNamesMap = new Map();
    let productNamesMap = new Map();

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
                                <th>Crédito (Clientes)</th>
                                <th>Produto</th>
                                <th>Valor Total</th>
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
                requester:profiles!requester_id(full_name, seller_id_erp),
                credits:dc_request_credits(*)
            `);

            if (isOwnView) {
                query = query.eq('requester_id', App.userProfile.id);
            } else if (currentFilters.seller_id) {
                query = query.eq('requester.seller_id_erp', currentFilters.seller_id);
            }
            
            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            if (currentFilters.product_code) {
                query = query.eq('debit_product_code', currentFilters.product_code.toUpperCase());
            }
    
            if (currentFilters.client_code) {
                const code = currentFilters.client_code.toUpperCase();
                query = query.or(`debit_client_code.eq.${code},credits.client_code.eq.${code}`, { foreignTable: 'dc_request_credits' });
            }
            
            if (currentFilters.date_start) query = query.gte('created_at', currentFilters.date_start);
            if (currentFilters.date_end) query = query.lte('created_at', currentFilters.date_end + 'T23:59:59');

            let { data: requests, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            
            if (currentFilters.client_code) {
                const searchCode = currentFilters.client_code.toLowerCase();
                requests = requests.filter(req => 
                    req.debit_client_code.toLowerCase().includes(searchCode) || 
                    req.credits.some(c => c.client_code.toLowerCase().includes(searchCode))
                );
            }

            // <<< MELHORIA: BUSCA OTIMIZADA DE NOMES >>>
            if (requests.length > 0) {
                const clientCodes = new Set();
                const productCodes = new Set();
                requests.forEach(req => {
                    clientCodes.add(req.debit_client_code);
                    req.credits.forEach(c => clientCodes.add(c.client_code));
                    productCodes.add(req.debit_product_code);
                });

                const { data: clients } = await supabase.from('clients_erp').select('client_code, client_name').in('client_code', Array.from(clientCodes));
                const { data: products } = await supabase.from('products_erp').select('product_code, product_name').in('product_code', Array.from(productCodes));

                clientNamesMap = new Map(clients.map(c => [c.client_code, c.client_name]));
                productNamesMap = new Map(products.map(p => [p.product_code, p.product_name]));
            }
            // <<< FIM DA MELHORIA >>>

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
            
            let creditCellHtml;
            if (req.credits.length > 1) {
                // Armazena os dados completos dos créditos em um atributo JSON para o modal
                const creditsJson = JSON.stringify(req.credits);
                creditCellHtml = `<span class="clickable-info" data-action="show-multiple-credits" data-credits-json='${creditsJson}'>Múltiplos</span>`;
            } else {
                const clientCode = req.credits[0]?.client_code || 'N/A';
                creditCellHtml = `<span class="clickable-info" data-action="show-client" data-code="${clientCode}">${clientCode}</span>`;
            }

            return `
                <tr>
                    <td>${new Date(req.created_at).toLocaleDateString()}</td>
                    <td>${req.requester?.full_name || 'N/A'}</td>
                    <td><span class="clickable-info" data-action="show-client" data-code="${req.debit_client_code}">${req.debit_client_code}</span></td>
                    <td>${creditCellHtml}</td>
                    <td><span class="clickable-info" data-action="show-product" data-code="${req.debit_product_code}">${req.debit_product_code}</span></td>
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

    const showInfoModal = (action, element) => {
        const modalBody = document.getElementById('modal-body');
        let title = '';
        let content = '';

        if (action === 'show-client') {
            const code = element.dataset.code;
            const name = clientNamesMap.get(code) || 'Nome não encontrado no ERP.';
            title = `Cliente: ${code}`;
            content = `<p>${name}</p>`;
        } 
        else if (action === 'show-product') {
            const code = element.dataset.code;
            const name = productNamesMap.get(code) || 'Produto não encontrado no ERP.';
            title = `Produto: ${code}`;
            content = `<p>${name}</p>`;
        } 
        else if (action === 'show-multiple-credits') {
            const credits = JSON.parse(element.dataset.creditsJson);
            title = 'Créditos Distribuídos';
            content = '<ul>' + credits.map(c => {
                const name = clientNamesMap.get(c.client_code) || 'Nome não encontrado';
                return `<li><strong>${c.client_code}</strong> - ${name} (${c.quantity} un.)</li>`;
            }).join('') + '</ul>';
        }

        modalBody.innerHTML = `<h2>${title}</h2>${content}`;
        document.getElementById('modal-container').classList.add('active');
    };
    
    // ... (O resto do arquivo, a partir de renderRequestModal, permanece idêntico à versão anterior)
    const renderRequestModal = () => {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>Nova Solicitação de Débito/Crédito</h2>
            <form id="request-form">
                <fieldset>
                    <legend>Dados do Débito (Origem)</legend>
                    <div class="form-row">
                        <div class="form-group"><label>Cód. Cliente</label><input type="text" id="debitClientCode" required></div>
                        <div class="form-group"><label>Cód. Produto</label><input type="text" id="debitProductCode" required></div>
                        <div class="form-group"><label>Quantidade Total</label><input type="number" id="debitQuantity" required min="1"></div>
                        <div class="form-group"><label>Valor Total</label><input type="number" step="0.01" id="debitValue" required min="0.01"></div>
                    </div>
                </fieldset>
                <fieldset>
                    <legend>Distribuição de Créditos (Destino)</legend>
                    <div id="credit-entries-container"></div>
                    <div class="credit-summary">
                        <span>Quantidade Restante: <strong id="remaining-qty">--</strong></span>
                        <button type="button" id="btn-add-credit" class="btn btn-secondary btn-sm">Adicionar Crédito</button>
                    </div>
                </fieldset>
                <p id="modal-error" class="error-message"></p>
                <button type="submit" id="btn-submit-request" class="btn btn-primary" disabled>Enviar Solicitação</button>
            </form>
        `;
        
        const form = document.getElementById('request-form');
        const creditContainer = document.getElementById('credit-entries-container');

        const addCreditEntry = () => {
            const entryId = Date.now();
            const entryDiv = document.createElement('div');
            entryDiv.className = 'form-row credit-entry';
            entryDiv.dataset.id = entryId;
            entryDiv.innerHTML = `
                <div class="form-group"><label>Cód. Cliente</label><input type="text" class="credit-client-code" required></div>
                <div class="form-group"><label>Quantidade</label><input type="number" class="credit-quantity" required min="1"></div>
                <div class="form-group"><label>Valor</label><input type="text" class="credit-value" disabled></div>
                <button type="button" class="btn-remove-credit" title="Remover">&times;</button>
            `;
            creditContainer.appendChild(entryDiv);
        };

        const updateCalculationsAndValidation = () => {
            const debitQty = parseInt(document.getElementById('debitQuantity').value) || 0;
            const debitValue = parseFloat(document.getElementById('debitValue').value) || 0;
            const unitPrice = (debitQty > 0 && debitValue > 0) ? debitValue / debitQty : 0;
            
            let totalCreditQty = 0;
            const creditEntries = creditContainer.querySelectorAll('.credit-entry');
            creditEntries.forEach(entry => {
                const creditQtyInput = entry.querySelector('.credit-quantity');
                const creditQty = parseInt(creditQtyInput.value) || 0;
                totalCreditQty += creditQty;
                entry.querySelector('.credit-value').value = (unitPrice * creditQty).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            });

            const remainingQty = debitQty - totalCreditQty;
            document.getElementById('remaining-qty').textContent = remainingQty;

            document.getElementById('btn-add-credit').disabled = remainingQty <= 0;
            document.getElementById('btn-submit-request').disabled = remainingQty !== 0 || debitQty === 0 || creditEntries.length === 0;

            creditEntries.forEach(entry => {
                const creditQtyInput = entry.querySelector('.credit-quantity');
                const currentVal = parseInt(creditQtyInput.value) || 0;
                const maxAllowed = currentVal + remainingQty;
                creditQtyInput.max = maxAllowed;
            });
        };
        
        addCreditEntry();
        form.addEventListener('input', updateCalculationsAndValidation);
        document.getElementById('btn-add-credit').addEventListener('click', addCreditEntry);
        creditContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-credit')) {
                e.target.closest('.credit-entry').remove();
                updateCalculationsAndValidation();
            }
        });

        form.addEventListener('submit', handleRequestSubmit);
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
            };

            const { data: newRequest, error: requestError } = await supabase.from('dc_requests').insert(requestData).select().single();
            if (requestError) throw requestError;

            const unitPrice = requestData.debit_value / requestData.debit_quantity;
            const creditEntries = [];
            form.querySelectorAll('.credit-entry').forEach(entry => {
                const qty = parseInt(entry.querySelector('.credit-quantity').value);
                creditEntries.push({
                    request_id: newRequest.id,
                    client_code: entry.querySelector('.credit-client-code').value.toUpperCase(),
                    quantity: qty,
                    value: unitPrice * qty
                });
            });

            const { error: creditsError } = await supabase.from('dc_request_credits').insert(creditEntries);
            if (creditsError) throw creditsError;

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
            const { data: req, error } = await supabase.from('dc_requests').select('*, credits:dc_request_credits(*)').eq('id', requestId).single();
            if (error) throw error;

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
                <hr>
                <h4>Créditos a serem gerados:</h4>
                <ul>
                    ${req.credits.map(c => `<li><strong>${c.client_code}:</strong> ${c.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${c.quantity} un.)</li>`).join('')}
                </ul>
                <form id="approval-form">
                    <div class="form-group">
                        <label for="erpDebitCode">Código do Lançamento no ERP</label>
                        <input type="text" id="erpDebitCode" required>
                    </div>
                    <p id="modal-error" class="error-message"></p>
                    <button type="submit" class="btn btn-primary">Confirmar Aprovação e Gerar Créditos</button>
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
            const creditsToInsert = request.credits.map(c => ({
                client_code: c.client_code,
                value: c.value,
                description: `Crédito da Solicitação D/C #${request.id.substring(0, 8)}`,
                product_code: request.debit_product_code,
                quantity: c.quantity,
                created_by: App.userProfile.id,
                status: 'Disponível'
            }));

            const { error: creditError } = await supabase.from('credits').insert(creditsToInsert);
            if (creditError) throw new Error(`Falha ao gerar créditos: ${creditError.message}`);

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
            if (button) {
                const action = button.dataset.action;
                const id = button.dataset.id;
                if (action === 'approve') renderApprovalModal(id);
                if (action === 'reject') renderRejectionModal(id);
                return; // Impede que o clique no botão propague para o span
            }

            // <<< MELHORIA: EVENTO PARA OS ITENS CLICÁVEIS >>>
            const infoSpan = e.target.closest('.clickable-info');
            if (infoSpan) {
                const action = infoSpan.dataset.action;
                showInfoModal(action, infoSpan);
            }
        });
    };

    return {
        name: 'Solicitações D/C',
        render,
        renderRequestModal
    };
})();
