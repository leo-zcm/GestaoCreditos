// modules/comprovantes.js (VERSÃO COM PASTE GLOBAL E CORREÇÕES)

const ComprovantesModule = (() => {
    const STATUS_MAP = {
        'AGUARDANDO CONFIRMAÇÃO': { text: 'Pendente', class: 'status-pending' },
        'CONFIRMADO': { text: 'Confirmado', class: 'status-confirmed' },
        'FATURADO': { text: 'Faturado', class: 'status-invoiced' },
        'CRÉDITO': { text: 'Crédito Gerado', class: 'status-credit' },
        'BAIXADO': { text: 'Baixado', class: 'status-cleared' },
    };

    let currentFilters = { client_code: '', client_name: '', status: 'CONFIRMADO' };
    let fileToUpload = null;
    // ==================================================================
    // CORREÇÃO PASTE 1: Variável para guardar a referência do listener
    // ==================================================================
    let documentPasteHandler = null;

    const loadProofs = async () => {
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
                .select(`id, created_at, client_code, value, status, proof_url, faturado_pedido_code, client_name_manual, clients_erp(client_name), payment_types(name, color)`)
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
        // ... (código da renderTable inalterado)
        const listContainer = document.getElementById('proofs-list');
        if (proofs.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="8">Nenhum resultado encontrado.</td></tr>';
            return;
        }
        listContainer.innerHTML = proofs.map(proof => {
            const statusInfo = STATUS_MAP[proof.status] || { text: proof.status, class: '' };
            const paymentType = proof.payment_types || { name: 'N/A', color: 'grey' };
            const clientName = proof.clients_erp?.client_name || proof.client_name_manual || '---';
            let actions = { view: !!proof.proof_url, edit: false, confirm: false, faturar: false, baixar: false, credit: false };
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

    // ==================================================================
    // CORREÇÃO PASTE 2: Função para limpar os listeners do modal
    // ==================================================================
    const cleanupModalListeners = () => {
        if (documentPasteHandler) {
            document.removeEventListener('paste', documentPasteHandler);
            documentPasteHandler = null;
        }
    };

    const renderProofModal = async (proof = null) => {
        fileToUpload = null;
        const isNew = proof === null;
        App.showLoader();

        try {
            const { data: paymentTypes, error } = await supabase.from('payment_types').select('*');
            if (error) throw error;
            const paymentTypesHtml = paymentTypes.map(pt => `...`).join(''); // Omitido por brevidade, é o mesmo código

            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = `...`; // Omitido por brevidade, é o mesmo HTML do modal

            // ... (código de setup dos inputs clientCode e clientName inalterado)

            const dropArea = document.getElementById('file-drop-area');
            const fileInput = document.getElementById('file-input');
            dropArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

            // ==================================================================
            // CORREÇÃO PASTE 3: Adiciona o listener global ao abrir o modal
            // ==================================================================
            documentPasteHandler = (e) => handlePaste(e);
            document.addEventListener('paste', documentPasteHandler);

            document.getElementById('proof-form').addEventListener('submit', handleProofSubmit);
            document.getElementById('modal-container').classList.add('active');

        } catch (error) {
            console.error("Erro ao renderizar modal de comprovante:", error);
            alert('Falha ao abrir o formulário.');
            cleanupModalListeners(); // Limpa em caso de erro na abertura
        } finally {
            App.hideLoader();
        }
    };

    const handlePaste = (e) => {
        const files = e.clipboardData.files;
        // Verifica se o modal está ativo antes de processar
        if (document.getElementById('modal-container').classList.contains('active') && files.length > 0 && files[0].type.startsWith('image/')) {
            e.preventDefault();
            fileToUpload = files[0];
            renderPreview(fileToUpload);
        }
    };

    const handleProofSubmit = async (e) => {
        e.preventDefault();
        App.showLoader();
        // ... (código interno do submit inalterado)
        try {
            // ...
            // ==================================================================
            // CORREÇÃO PASTE 4: Limpa o listener após o sucesso
            // ==================================================================
            cleanupModalListeners();
            document.getElementById('modal-container').classList.remove('active');
            await loadProofs();
        } catch (error) {
            console.error("Erro ao salvar comprovante:", error);
            document.getElementById('modal-error').textContent = error.message;
        } finally {
            App.hideLoader();
        }
    };

    // ... (O restante do arquivo: renderFaturarModal, render, etc. permanece o mesmo)
    // Apenas adicione a chamada de cleanup no render() para o listener do modal
    const render = async () => {
        // ... (código de renderização do layout do módulo inalterado)
        
        // Adicionar a limpeza do listener ao evento de fechar o modal em app.js é mais centralizado.
        // Vamos modificar o app.js para isso.
        
        // ... (resto da função render)
    };

    // Expor a função de limpeza para que o app.js possa chamá-la
    return {
        name: 'Comprovantes',
        render,
        cleanupModalListeners // Exporta a função
    };
})();
