// modules/comprovantes.js (VERSÃO FINAL E CORRIGIDA)

const ComprovantesModule = (() => {
    const STATUS_MAP = {
        'AGUARDANDO CONFIRMAÇÃO': { text: 'Pendente', class: 'status-pending' },
        'CONFIRMADO': { text: 'Confirmado', class: 'status-confirmed' },
        'FATURADO': { text: 'Faturado', class: 'status-invoiced' },
        'CRÉDITO': { text: 'Crédito Gerado', class: 'status-credit' },
        'BAIXADO': { text: 'Baixado', class: 'status-cleared' },
    };

    let currentFilters = {
        client_code: '',
        client_name: '',
        start_date: '',
        end_date: '',
        status: 'CONFIRMADO',
    };
    let fileToUpload = null;

    const loadProofs = async () => {
        App.showLoader();
        const listContainer = document.getElementById('proofs-list');
        if (!listContainer) { App.hideLoader(); return; }
        listContainer.innerHTML = '<tr><td colspan="7">Buscando...</td></tr>';

        try {
            let query = supabase
                .from('proofs')
                .select(`
                    id, created_at, client_code, value, status, proof_url, faturado_pedido_code, client_name_manual,
                    clients_erp ( client_name ),
                    payment_types ( name, color )
                `)
                .order('created_at', { ascending: false });

            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            if (currentFilters.client_code) query = query.eq('client_code', currentFilters.client_code.toUpperCase());
            if (currentFilters.client_name) query = query.ilike('clients_erp.client_name', `%${currentFilters.client_name}%`);

            const { data: proofs, error } = await query;
            if (error) throw error;
            renderTable(proofs);
        } catch (error) {
            console.error("Erro ao carregar comprovantes:", error);
            listContainer.innerHTML = `<tr><td colspan="7" class="error-message">Falha ao carregar dados.</td></tr>`;
        } finally {
            App.hideLoader();
        }
    };

    const renderTable = (proofs) => {
        const listContainer = document.getElementById('proofs-list');
        if (proofs.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="7">Nenhum resultado encontrado.</td></tr>';
            return;
        }

        listContainer.innerHTML = proofs.map(proof => {
            const statusInfo = STATUS_MAP[proof.status] || { text: proof.status, class: '' };
            const paymentColor = proof.payment_types?.color || 'grey';
            const userPermissions = App.userProfile.permissions?.comprovantes || {};
            const clientName = proof.clients_erp?.client_name || proof.client_name_manual || '---';

            // ==================================================================
            // CORREÇÃO 1: LÓGICA DE EXIBIÇÃO DE BOTÕES CORRIGIDA
            // Implementa as regras exatas de visibilidade para cada status.
            // ==================================================================
            let actions = { view: !!proof.proof_url, edit: false, confirm: false, faturar: false, baixar: false, credit: false };

            switch (proof.status) {
                case 'AGUARDANDO CONFIRMAÇÃO':
                    actions.edit = userPermissions.edit;
                    actions.confirm = userPermissions.confirm;
                    break;
                case 'CONFIRMADO':
                    actions.faturar = userPermissions.faturar;
                    actions.baixar = userPermissions.baixar;
                    actions.credit = userPermissions.gerar_credito;
                    break;
                case 'FATURADO':
                    actions.baixar = userPermissions.baixar;
                    break;
                case 'BAIXADO':
                    // Apenas o botão "Ver" é exibido, já configurado em 'actions.view'
                    break;
            }

            return `
                <tr style="border-left: 4px solid ${paymentColor};">
                    <td>${new Date(proof.created_at).toLocaleDateString()}</td>
                    <td>${proof.client_code || 'N/A'}</td>
                    <td>${clientName}</td>
                    <td>${proof.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
                    <td>${proof.faturado_pedido_code || '---'}</td>
                    <td>
                        <div class="action-buttons">
                            ${actions.view ? `<a href="${proof.proof_url}" target="_blank" class="btn btn-secondary btn-sm">Ver</a>` : ''}
                            ${actions.edit ? `<button class="btn btn-secondary btn-sm" data-action="edit" data-id="${proof.id}">Editar</button>` : ''}
                            ${actions.confirm ? `<button class="btn btn-success btn-sm" data-action="confirm" data-id="${proof.id}">Confirmar</button>` : ''}
                            ${actions.faturar ? `<button class="btn btn-primary btn-sm" data-action="faturar" data-id="${proof.id}">Faturar</button>` : ''}
                            ${actions.baixar ? `<button class="btn btn-secondary btn-sm" data-action="baixar" data-id="${proof.id}">Baixar</button>` : ''}
                            ${actions.credit ? `<button class="btn btn-warning btn-sm" data-action="credit" data-id="${proof.id}">Gerar Crédito</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    };

    const handleTableClick = async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'edit') {
            const { data: proofToEdit, error } = await supabase.from('proofs').select('*, clients_erp(client_name)').eq('id', id).single();
            if (proofToEdit) renderProofModal(proofToEdit);
            else console.error("Erro ao buscar comprovante para edição:", error);
        } else if (action === 'confirm') {
            if (confirm('Deseja confirmar este pagamento?')) await updateProofStatus(id, 'CONFIRMADO');
        } else if (action === 'faturar') {
            renderFaturarModal(id);
        } else if (action === 'baixar') {
            if (confirm('Deseja baixar este pagamento?')) await updateProofStatus(id, 'BAIXADO');
        } else if (action === 'credit') {
            alert('Funcionalidade "Gerar Crédito" será implementada no próximo módulo.');
        }
    };

    const updateProofStatus = async (id, newStatus) => {
        App.showLoader();
        try {
            const { error } = await supabase.from('proofs').update({ status: newStatus, updated_at: new Date() }).eq('id', id);
            if (error) throw error;
            await loadProofs();
        } catch (error) {
            console.error(`Erro ao atualizar status para ${newStatus}:`, error);
            alert('Falha ao atualizar o status.');
            App.hideLoader();
        }
    };

    const renderProofModal = async (proof = null) => {
        fileToUpload = null;
        const isNew = proof === null;
        App.showLoader();

        try {
            const { data: paymentTypes, error } = await supabase.from('payment_types').select('*');
            if (error) throw error;

            const paymentTypesHtml = paymentTypes.map(pt => `
                <div class="payment-type-radio">
                    <input type="radio" id="pt-${pt.id}" name="payment_type" value="${pt.id}" ${proof?.payment_type_id === pt.id ? 'checked' : ''} required>
                    <label for="pt-${pt.id}">${pt.name}</label>
                </div>
            `).join('');

            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = `
                <h2>${isNew ? 'Novo Pagamento' : 'Editar Pagamento'}</h2>
                <form id="proof-form">
                    <input type="hidden" id="proofId" value="${proof?.id || ''}">
                    <div class="form-group">
                        <label for="clientCode">Código do Cliente</label>
                        <input type="text" id="clientCode" value="${proof?.client_code || ''}" style="text-transform: uppercase;">
                    </div>
                    <div class="form-group">
                        <label for="clientName">Nome do Cliente</label>
                        <input type="text" id="clientName" value="${proof?.clients_erp?.client_name || proof?.client_name_manual || ''}" ${proof?.client_code ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label for="value">Valor</label>
                        <input type="number" id="value" step="0.01" value="${proof?.value || ''}" required>
                    </div>
                    <fieldset>
                        <legend>Tipo de Pagamento</legend>
                        <div class="payment-types-container">${paymentTypesHtml}</div>
                    </fieldset>
                    <div class="form-group">
                        <label>Comprovante</label>
                        <div id="file-drop-area" class="file-drop-area">
                            <p><strong>Cole (Ctrl+V)</strong> uma imagem aqui, ou <strong>clique para selecionar</strong> um arquivo (imagem ou PDF).</p>
                        </div>
                        <input type="file" id="file-input" accept="image/*,application/pdf" style="display: none;">
                        <div id="file-preview">
                            ${proof?.proof_url ? `<a href="${proof.proof_url}" target="_blank">Ver comprovante atual</a>` : ''}
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="accountNote">Conta Creditada (se não houver comprovante)</label>
                        <textarea id="accountNote" rows="2">${proof?.account_note || ''}</textarea>
                    </div>
                    <p id="modal-error" class="error-message"></p>
                    <button type="submit" class="btn btn-primary">${isNew ? 'Salvar Pagamento' : 'Salvar Alterações'}</button>
                </form>
            `;

            const clientCodeInput = document.getElementById('clientCode');
            const clientNameInput = document.getElementById('clientName');
            
            const fetchClientName = async () => {
                const code = clientCodeInput.value.toUpperCase();
                clientCodeInput.value = code;
                if (!code) {
                    clientNameInput.value = '';
                    clientNameInput.disabled = false;
                    return;
                }
                const { data, error } = await supabase.from('clients_erp').select('client_name').eq('client_code', code).single();
                if (data) {
                    clientNameInput.value = data.client_name;
                    clientNameInput.disabled = true;
                } else {
                    clientNameInput.value = 'Cliente não encontrado';
                    clientNameInput.disabled = true;
                }
            };

            clientCodeInput.addEventListener('blur', fetchClientName);

            const dropArea = document.getElementById('file-drop-area');
            const fileInput = document.getElementById('file-input');
            dropArea.addEventListener('click', () => fileInput.click());
            dropArea.addEventListener('paste', handlePaste);
            fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

            document.getElementById('proof-form').addEventListener('submit', handleProofSubmit);
            document.getElementById('modal-container').classList.add('active');

        } catch (error) {
            console.error("Erro ao renderizar modal de comprovante:", error);
            alert('Falha ao abrir o formulário.');
        } finally {
            App.hideLoader();
        }
    };

    const handleFileSelect = (files) => {
        if (files.length > 0) {
            fileToUpload = files[0];
            renderPreview(fileToUpload);
        }
    };

    const handlePaste = (e) => {
        const files = e.clipboardData.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            e.preventDefault();
            fileToUpload = files[0];
            renderPreview(fileToUpload);
        }
    };

    const renderPreview = (file) => {
        const previewContainer = document.getElementById('file-preview');
        previewContainer.innerHTML = '';
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                previewContainer.appendChild(img);
            };
            reader.readDataURL(file);
        } else if (file.type === 'application/pdf') {
            previewContainer.innerHTML = `<p><span class="pdf-icon">📄</span> ${file.name}</p>`;
        }
    };

    const handleProofSubmit = async (e) => {
        e.preventDefault();
        App.showLoader();
        const form = e.target;
        const errorP = document.getElementById('modal-error');
        errorP.textContent = '';

        try {
            const proofId = form.proofId.value;
            const isNew = !proofId;
            let proofUrl = null;
            if(!isNew) {
                const { data } = await supabase.from('proofs').select('proof_url').eq('id', proofId).single();
                proofUrl = data.proof_url;
            }

            if (fileToUpload) {
                const filePath = `${App.userProfile.id}/${Date.now()}-${fileToUpload.name}`;
                const { error: uploadError } = await supabase.storage.from('comprovantes').upload(filePath, fileToUpload, { upsert: true });
                if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);
                
                const { data: urlData } = supabase.storage.from('comprovantes').getPublicUrl(filePath);
                proofUrl = urlData.publicUrl;
            }

            const proofData = {
                client_code: form.clientCode.value.toUpperCase() || null,
                client_name_manual: form.clientName.disabled ? null : form.clientName.value,
                value: parseFloat(form.value.value),
                payment_type_id: form.payment_type.value,
                proof_url: proofUrl,
                account_note: form.accountNote.value,
                updated_at: new Date(),
            };

            if (isNew) {
                proofData.created_by = App.userProfile.id;
                proofData.status = 'AGUARDANDO CONFIRMAÇÃO';
                const { error } = await supabase.from('proofs').insert(proofData);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('proofs').update(proofData).eq('id', proofId);
                if (error) throw error;
            }

            document.getElementById('modal-container').classList.remove('active');
            await loadProofs();

        } catch (error) {
            console.error("Erro ao salvar comprovante:", error);
            errorP.textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };
    
    const renderFaturarModal = async (proofId) => {
        App.showLoader();
        try {
            const { data: proof, error } = await supabase.from('proofs').select('value').eq('id', proofId).single();
            if (error) throw error;

            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = `
                <h2>Faturar Pagamento</h2>
                <form id="faturar-form">
                    <p>Valor total do pagamento: <strong>${proof.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
                    <div class="form-group">
                        <label for="pedidoCode">Código do Pedido</label>
                        <input type="text" id="pedidoCode" required>
                    </div>
                    <div class="form-group">
                        <label for="faturarValue">Valor a Faturar</label>
                        <input type="number" id="faturarValue" step="0.01" value="${proof.value}" max="${proof.value}" required>
                    </div>
                    <p id="modal-error" class="error-message"></p>
                    <button type="submit" class="btn btn-primary">Confirmar Faturamento</button>
                </form>
            `;
            document.getElementById('modal-container').classList.add('active');
            
            document.getElementById('faturar-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                await handleFaturarSubmit(proofId, proof.value);
            });

        } catch (error) {
            console.error("Erro ao buscar dados para faturamento:", error);
            alert('Não foi possível carregar os dados do pagamento.');
        } finally {
            App.hideLoader();
        }
    };

    const handleFaturarSubmit = async (proofId, originalValue) => {
        App.showLoader();
        const pedidoCode = document.getElementById('pedidoCode').value;
        const faturarValue = parseFloat(document.getElementById('faturarValue').value);

        try {
            if (!pedidoCode || isNaN(faturarValue) || faturarValue <= 0 || faturarValue > originalValue) {
                throw new Error('Dados inválidos. Verifique o código do pedido e o valor.');
            }

            const remainingValue = originalValue - faturarValue;

            if (remainingValue > 0.009) {
                const { data: originalProof, error: selectError } = await supabase.from('proofs').select('*').eq('id', proofId).single();
                if (selectError) throw selectError;

                const { error: updateError } = await supabase
                    .from('proofs')
                    .update({
                        value: faturarValue,
                        status: 'FATURADO',
                        faturado_pedido_code: pedidoCode,
                        updated_at: new Date()
                    })
                    .eq('id', proofId);
                if (updateError) throw updateError;

                delete originalProof.id;
                
                // ==================================================================
                // CORREÇÃO 2: Status do valor restante alterado para 'CONFIRMADO'
                // ==================================================================
                const newProof = {
                    ...originalProof,
                    value: remainingValue,
                    status: 'CONFIRMADO',
                    faturado_pedido_code: null,
                    created_at: new Date(),
                    updated_at: new Date(),
                };

                const { error: insertError } = await supabase.from('proofs').insert(newProof);
                if (insertError) throw insertError;

            } else {
                const { error } = await supabase
                    .from('proofs')
                    .update({ status: 'FATURADO', faturado_pedido_code: pedidoCode, updated_at: new Date() })
                    .eq('id', proofId);
                if (error) throw error;
            }

            document.getElementById('modal-container').classList.remove('active');
            await loadProofs();

        } catch (error) {
            console.error("Erro ao faturar:", error);
            document.getElementById('modal-error').textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };

    const render = async () => {
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>Comprovantes de Pagamento</h2>
                    <button id="btn-new-proof" class="btn btn-primary">Novo Pagamento</button>
                </div>
                <div class="filters">
                    <input type="text" id="filter-client-code" placeholder="Cód. Cliente" style="text-transform: uppercase;">
                    <input type="text" id="filter-client-name" placeholder="Nome do Cliente">
                    <select id="filter-status">
                        <option value="">Todos Status</option>
                        <option value="AGUARDANDO CONFIRMAÇÃO">Pendente</option>
                        <option value="CONFIRMADO" selected>Confirmado</option>
                        <option value="FATURADO">Faturado</option>
                        <option value="BAIXADO">Baixado</option>
                        <option value="CRÉDITO">Crédito Gerado</option>
                    </select>
                    <button id="btn-apply-filters" class="btn btn-secondary">Buscar</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Cód. Cliente</th>
                                <th>Cliente</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th>Pedido</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="proofs-list"></tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('btn-new-proof').addEventListener('click', () => renderProofModal());
        document.getElementById('btn-apply-filters').addEventListener('click', () => {
            currentFilters.client_code = document.getElementById('filter-client-code').value;
            currentFilters.client_name = document.getElementById('filter-client-name').value;
            currentFilters.status = document.getElementById('filter-status').value;
            loadProofs();
        });
        document.getElementById('proofs-list').addEventListener('click', handleTableClick);
        await loadProofs();
    };

    return {
        name: 'Comprovantes',
        render: render,
    };
})();
