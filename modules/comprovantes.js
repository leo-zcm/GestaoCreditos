// modules/comprovantes.js (VERSÃO COM MÚLTIPLOS ANEXOS)

const ComprovantesModule = (() => {
    const STATUS_MAP = {
        'AGUARDANDO CONFIRMAÇÃO': { text: 'Pendente', class: 'status-pending' },
        'CONFIRMADO': { text: 'Confirmado', class: 'status-confirmed' },
        'FATURADO': { text: 'Faturado', class: 'status-invoiced' },
        'CRÉDITO': { text: 'Crédito Gerado', class: 'status-credit' },
        'BAIXADO': { text: 'Baixado', class: 'status-cleared' },
    };

    let currentFilters = { client_code: '', client_name: '', status: 'CONFIRMADO' };
    // <<< MUDANÇA CRÍTICA >>> Agora é um array para múltiplos arquivos
    let filesToUpload = [];
    let documentPasteHandler = null;

    const loadProofs = async (initialFilters = null) => {
        if (initialFilters && initialFilters.status) {
            currentFilters.status = initialFilters.status;
            document.getElementById('filter-status').value = initialFilters.status;
        }

        App.showLoader();
        const listContainer = document.getElementById('proofs-list');
        if (!listContainer) { App.hideLoader(); return; }
        listContainer.innerHTML = '<tr><td colspan="8">Buscando...</td></tr>';
        try {
            const { data: idObjects, error: rpcError } = await supabase.rpc('filter_proof_ids', {
                p_status: currentFilters.status,
                p_client_code: currentFilters.client_code,
                p_name_search: currentFilters.client_name
            });
            if (rpcError) throw rpcError;
            if (!idObjects || idObjects.length === 0) {
                renderTable([]);
                return;
            }
            const proofIds = idObjects.map(item => item.id);
            const { data: proofs, error: selectError } = await supabase
                .from('proofs')
                // <<< MUDANÇA CRÍTICA >>> Selecionando a nova coluna `proof_urls`
                .select(`id, created_at, client_code, value, status, proof_urls, faturado_pedido_code, client_name_manual, clients_erp(client_name), payment_types(name, color)`)
                .in('id', proofIds)
                .order('created_at', { ascending: false });
            if (selectError) throw selectError;
            renderTable(proofs);
        } catch (error) {
            console.error("Erro ao carregar comprovantes:", error);
            listContainer.innerHTML = `<tr><td colspan="8" class="error-message">Falha ao carregar dados. Verifique o console.</td></tr>`;
        } finally {
            App.hideLoader();
        }
    };

    const renderTable = (proofs) => {
        const listContainer = document.getElementById('proofs-list');
        if (proofs.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="8">Nenhum resultado encontrado.</td></tr>';
            return;
        }
        listContainer.innerHTML = proofs.map(proof => {
            const statusInfo = STATUS_MAP[proof.status] || { text: proof.status, class: '' };
            const paymentType = proof.payment_types || { name: 'N/A', color: 'grey' };
            const clientName = proof.clients_erp?.client_name || proof.client_name_manual || '---';
            
            // <<< MUDANÇA CRÍTICA >>> Lógica para o botão "Ver" com múltiplos anexos
            const hasProofs = proof.proof_urls && proof.proof_urls.length > 0;
            let viewButtonHtml = '';
            if (hasProofs) {
                // Converte o array de URLs em uma string JSON segura para o atributo data
                const urlsData = JSON.stringify(proof.proof_urls);
                const buttonText = proof.proof_urls.length > 1 ? `Ver (${proof.proof_urls.length})` : 'Ver';
                viewButtonHtml = `<button class="btn btn-secondary btn-sm" data-action="view-all" data-urls='${urlsData}'>${buttonText}</button>`;
            }

            let actions = { edit: false, confirm: false, faturar: false, baixar: false, credit: false };
            const userPermissions = App.userProfile.permissions?.comprovantes || {};
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
            }
            return `
                <tr>
                    <td>${new Date(proof.created_at).toLocaleDateString()}</td>
                    <td>${proof.client_code || 'N/A'}</td>
                    <td>${clientName}</td>
                    <td>${proof.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td class="col-payment-type" style="background-color: ${paymentType.color};">${paymentType.name}</td>
                    <td><span class="status-badge ${statusInfo.class}">${statusInfo.text}</span></td>
                    <td>${proof.faturado_pedido_code || '---'}</td>
                    <td class="col-actions">
                        <div class="action-buttons">
                            ${viewButtonHtml}
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

    const cleanupModalListeners = () => {
        if (documentPasteHandler) {
            document.removeEventListener('paste', documentPasteHandler);
            documentPasteHandler = null;
        }
    };

    const renderProofModal = async (proof = null) => {
        // <<< MUDANÇA CRÍTICA >>> Limpa o array de arquivos
        filesToUpload = [];
        cleanupModalListeners();
        App.showLoader();
        try {
            const isNew = proof === null;
            const isVendedor = App.userProfile.roles.includes('VENDEDOR');
            const clientNameDisabled = (proof?.client_code && proof.clients_erp) || (isNew && isVendedor);

            const { data: paymentTypes, error } = await supabase.from('payment_types').select('*');
            if (error) throw error;
            const paymentTypesHtml = paymentTypes.map(pt => `
                <div class="payment-type-radio">
                    <input type="radio" id="pt-${pt.id}" name="payment_type" value="${pt.id}" ${proof?.payment_type_id === pt.id ? 'checked' : ''} required>
                    <label for="pt-${pt.id}">${pt.name}</label>
                </div>
            `).join('');

            // <<< MUDANÇA CRÍTICA >>> Gera a lista de comprovantes já existentes
            let existingProofsHtml = '';
            if (proof?.proof_urls && proof.proof_urls.length > 0) {
                existingProofsHtml = '<h6>Comprovantes existentes:</h6><ul>' + proof.proof_urls.map((url, index) => 
                    `<li><a href="${url}" target="_blank">Comprovante ${index + 1}</a></li>`
                ).join('') + '</ul>';
            }

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
                        <input type="text" id="clientName" value="${proof?.clients_erp?.client_name || proof?.client_name_manual || ''}" placeholder="${clientNameDisabled ? 'Preencha o código do cliente' : ''}" ${clientNameDisabled ? 'disabled' : ''}>
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
                        <label>Comprovante(s)</label>
                        <div id="file-drop-area" class="file-drop-area">
                            <p><strong>Cole (Ctrl+V)</strong> imagens, ou <strong>clique para selecionar</strong> um ou mais arquivos (imagem ou PDF).</p>
                        </div>
                        <!-- <<< MUDANÇA CRÍTICA >>> Adicionado 'multiple' ao input de arquivo -->
                        <input type="file" id="file-input" accept="image/*,application/pdf" style="display: none;" multiple>
                        <div id="file-preview">
                            ${existingProofsHtml}
                            <!-- Novos arquivos aparecerão aqui -->
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
                    clientNameInput.disabled = isNew && isVendedor;
                    return;
                }
                const { data } = await supabase.from('clients_erp').select('client_name').eq('client_code', code).single();
                clientNameInput.value = data ? data.client_name : 'Cliente não encontrado';
                clientNameInput.disabled = !!data || (isNew && isVendedor);
            };

            clientCodeInput.addEventListener('blur', fetchClientName);
            const dropArea = document.getElementById('file-drop-area');
            const fileInput = document.getElementById('file-input');
            dropArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));
            documentPasteHandler = (e) => handlePaste(e);
            document.addEventListener('paste', documentPasteHandler);
            document.getElementById('proof-form').addEventListener('submit', handleProofSubmit);
            document.getElementById('modal-container').classList.add('active');
        } catch (error) {
            console.error("Erro ao renderizar modal de comprovante:", error);
            alert('Falha ao abrir o formulário.');
            cleanupModalListeners();
        } finally {
            App.hideLoader();
        }
    };

    const handleTableClick = async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        const id = button.dataset.id;

        // <<< MUDANÇA CRÍTICA >>> Nova ação para ver múltiplos comprovantes
        if (action === 'view-all') {
            const urls = JSON.parse(button.dataset.urls);
            urls.forEach(url => window.open(url, '_blank'));
            return;
        }

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
            renderGenerateCreditModal(id);
        }
    };
    
    // <<< MUDANÇA CRÍTICA >>> Lida com a seleção de múltiplos arquivos
    const handleFileSelect = (selectedFiles) => {
        if (selectedFiles.length > 0) {
            // Converte FileList em Array e adiciona aos arquivos a serem enviados
            filesToUpload.push(...Array.from(selectedFiles));
            renderPreview();
        }
    };

    // <<< MUDANÇA CRÍTICA >>> Lida com o "colar" de múltiplos arquivos
    const handlePaste = (e) => {
        if (!document.getElementById('modal-container').classList.contains('active')) return;
        const pastedFiles = e.clipboardData.files;
        if (pastedFiles.length > 0) {
            const imageFiles = Array.from(pastedFiles).filter(file => file.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                e.preventDefault();
                filesToUpload.push(...imageFiles);
                renderPreview();
            }
        }
    };

    // <<< MUDANÇA CRÍTICA >>> Renderiza o preview de múltiplos arquivos
    const renderPreview = () => {
        const previewContainer = document.getElementById('file-preview');
        // Limpa apenas a parte de novos previews, mantendo os existentes
        const newFilesContainer = previewContainer.querySelector('#new-files-container') || document.createElement('div');
        newFilesContainer.id = 'new-files-container';
        newFilesContainer.innerHTML = filesToUpload.length > 0 ? '<h6>Novos comprovantes a serem adicionados:</h6>' : '';

        const list = document.createElement('ul');
        filesToUpload.forEach((file, index) => {
            const listItem = document.createElement('li');
            listItem.textContent = file.name;
            // Opcional: Adicionar um botão de remover
            const removeBtn = document.createElement('button');
            removeBtn.textContent = ' (x)';
            removeBtn.style.border = 'none';
            removeBtn.style.background = 'transparent';
            removeBtn.style.color = 'red';
            removeBtn.style.cursor = 'pointer';
            removeBtn.onclick = () => {
                filesToUpload.splice(index, 1); // Remove o arquivo do array
                renderPreview(); // Re-renderiza o preview
            };
            listItem.appendChild(removeBtn);
            list.appendChild(listItem);
        });
        newFilesContainer.appendChild(list);
        previewContainer.appendChild(newFilesContainer);
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
            
            // <<< MUDANÇA CRÍTICA >>> Lógica de upload para múltiplos arquivos
            let uploadedUrls = [];
            if (filesToUpload.length > 0) {
                for (const file of filesToUpload) {
                    const filePath = `${App.userProfile.id}/${Date.now()}-${file.name}`;
                    const { error: uploadError } = await supabase.storage.from('comprovantes').upload(filePath, file);
                    if (uploadError) throw new Error(`Falha no upload do arquivo ${file.name}: ${uploadError.message}`);
                    const { data: urlData } = supabase.storage.from('comprovantes').getPublicUrl(filePath);
                    uploadedUrls.push(urlData.publicUrl);
                }
            }

            let finalProofUrls = [];
            if (!isNew) {
                // Se estiver editando, busca as URLs existentes para combinar com as novas
                const { data: existingProof, error } = await supabase.from('proofs').select('proof_urls').eq('id', proofId).single();
                if (error) throw error;
                finalProofUrls = existingProof.proof_urls || [];
            }
            finalProofUrls.push(...uploadedUrls);
            // <<< FIM DA MUDANÇA CRÍTICA >>>

            const proofData = {
                client_code: form.clientCode.value.toUpperCase() || null,
                client_name_manual: form.clientName.disabled ? null : form.clientName.value,
                value: parseFloat(form.value.value),
                payment_type_id: form.payment_type.value,
                proof_urls: finalProofUrls, // Salva o array de URLs
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
            cleanupModalListeners();
            document.getElementById('modal-container').classList.remove('active');
            if (document.getElementById('proofs-list')) {
                await loadProofs();
            }
        } catch (error) {
            console.error("Erro ao salvar comprovante:", error);
            errorP.textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };

    // O restante do código (renderFaturarModal, handleFaturarSubmit, renderGenerateCreditModal, etc.) permanece o mesmo.
    // ...
    const renderGenerateCreditModal = async (proofId) => {
        App.showLoader();
        try {
            const { data: proof, error } = await supabase.from('proofs').select('client_code, value').eq('id', proofId).single();
            if (error) throw error;

            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = `
                <h2>Gerar Crédito</h2>
                <form id="credit-gen-form">
                    <p>Será gerado um crédito no valor de <strong>${proof.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>.</p>
                    <div class="form-group">
                        <label for="creditClientCode">Código do Cliente</label>
                        <input type="text" id="creditClientCode" value="${proof.client_code || ''}" ${proof.client_code ? 'disabled' : 'required'}>
                    </div>
                    <div class="form-group">
                        <label for="creditDescription">Descrição do Crédito</label>
                        <input type="text" id="creditDescription" placeholder="Ex: Devolução item X, Pagamento duplicado" required>
                    </div>
                    <p id="modal-error" class="error-message"></p>
                    <button type="submit" class="btn btn-primary">Confirmar Geração de Crédito</button>
                </form>
            `;
            document.getElementById('modal-container').classList.add('active');
            document.getElementById('credit-gen-form').addEventListener('submit', (e) => {
                e.preventDefault();
                handleGenerateCreditSubmit(proofId, proof.value);
            });
        } catch (err) {
            console.error("Erro ao preparar geração de crédito:", err);
            alert("Não foi possível carregar os dados do comprovante.");
        } finally {
            App.hideLoader();
        }
    };

    const handleGenerateCreditSubmit = async (proofId, proofValue) => {
        App.showLoader();
        const errorP = document.getElementById('modal-error');
        errorP.textContent = '';
        try {
            const clientCode = document.getElementById('creditClientCode').value.toUpperCase();
            const description = document.getElementById('creditDescription').value;

            if (!clientCode || !description) {
                throw new Error("Código do cliente e descrição são obrigatórios.");
            }

            const { error: creditError } = await supabase.from('credits').insert({
                client_code: clientCode,
                description: description,
                value: proofValue,
                status: 'Disponível',
                created_by: App.userProfile.id,
                original_proof_id: proofId
            });
            if (creditError) throw creditError;

            const { error: proofError } = await supabase.from('proofs').update({ status: 'CRÉDITO', updated_at: new Date() }).eq('id', proofId);
            if (proofError) throw proofError;

            document.getElementById('modal-container').classList.remove('active');
            await loadProofs();

        } catch (error) {
            console.error("Erro ao gerar crédito:", error);
            errorP.textContent = `Falha: ${error.message}`;
        } finally {
            App.hideLoader();
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
                const { error: updateError } = await supabase.from('proofs').update({ value: faturarValue, status: 'FATURADO', faturado_pedido_code: pedidoCode, updated_at: new Date() }).eq('id', proofId);
                if (updateError) throw updateError;
                delete originalProof.id;
                const newProof = { ...originalProof, value: remainingValue, status: 'CONFIRMADO', faturado_pedido_code: null, created_at: new Date(), updated_at: new Date() };
                const { error: insertError } = await supabase.from('proofs').insert(newProof);
                if (insertError) throw insertError;
            } else {
                const { error } = await supabase.from('proofs').update({ status: 'FATURADO', faturado_pedido_code: pedidoCode, updated_at: new Date() }).eq('id', proofId);
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

    const render = async (initialFilters = null) => {
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
                                <th>Tipo</th>
                                <th>Status</th>
                                <th>Pedido</th>
                                <th class="col-actions">Ações</th>
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
        await loadProofs(initialFilters);
    };
    
    return {
        name: 'Comprovantes',
        render,
        cleanupModalListeners,
        renderProofModal
    };
})();
