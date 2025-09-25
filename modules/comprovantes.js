// modules/comprovantes.js (NOVO ARQUIVO)

const ComprovantesModule = (() => {
    // Mapeamento de status do DB para um texto mais amigável e classes de CSS
    const STATUS_MAP = {
        'AGUARDANDO CONFIRMAÇÃO': { text: 'Pendente', class: 'status-pending' },
        'CONFIRMADO': { text: 'Confirmado', class: 'status-confirmed' },
        'FATURADO': { text: 'Faturado', class: 'status-invoiced' },
        'CRÉDITO': { text: 'Crédito Gerado', class: 'status-credit' },
        'BAIXADO': { text: 'Baixado', class: 'status-cleared' },
    };

    // Estado local do módulo para manter os filtros
    let currentFilters = {
        client_code: '',
        client_name: '',
        start_date: '',
        end_date: '',
        status: 'CONFIRMADO', // Filtro padrão
    };
    
    // Função principal para carregar e renderizar os comprovantes
    const loadProofs = async () => {
        App.showLoader();
        const listContainer = document.getElementById('proofs-list');
        if (!listContainer) {
            App.hideLoader();
            return;
        }
        listContainer.innerHTML = '<tr><td colspan="7">Buscando...</td></tr>';

        try {
            let query = supabase
                .from('proofs')
                .select(`
                    id, created_at, client_code, value, status, proof_url, faturado_pedido_code,
                    clients_erp ( client_name ),
                    payment_types ( name, color )
                `)
                .order('created_at', { ascending: false });

            // Aplicar filtros
            if (currentFilters.status) query = query.eq('status', currentFilters.status);
            if (currentFilters.client_code) query = query.eq('client_code', currentFilters.client_code);
            if (currentFilters.client_name) query = query.ilike('clients_erp.client_name', `%${currentFilters.client_name}%`);
            // Adicionar filtros de data aqui se necessário

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

    // Renderiza as linhas da tabela
    const renderTable = (proofs) => {
        const listContainer = document.getElementById('proofs-list');
        if (proofs.length === 0) {
            listContainer.innerHTML = '<tr><td colspan="7">Nenhum resultado encontrado.</td></tr>';
            return;
        }

        listContainer.innerHTML = proofs.map(proof => {
            const statusInfo = STATUS_MAP[proof.status] || { text: proof.status, class: '' };
            const paymentColor = proof.payment_types?.color || 'grey';
            const canEdit = proof.status === 'AGUARDANDO CONFIRMAÇÃO';
            const canConfirm = proof.status === 'AGUARDANDO CONFIRMAÇÃO';
            const canFaturar = proof.status === 'CONFIRMADO';
            const canGenerateCredit = proof.status === 'AGUARDANDO CONFIRMAÇÃO';

            return `
                <tr style="border-left: 4px solid ${paymentColor};">
                    <td>${new Date(proof.created_at).toLocaleDateString()}</td>
                    <td>${proof.client_code}</td>
                    <td>${proof.clients_erp.client_name}</td>
                    <td>${proof.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${proof.proof_url ? `<a href="${proof.proof_url}" target="_blank" class="btn btn-secondary btn-sm">Ver</a>` : 'N/A'}</td>
                    <td>${proof.faturado_pedido_code || '---'}</td>
                    <td>
                        <div class="action-buttons">
                            ${canEdit ? `<button class="btn btn-secondary btn-sm" data-action="edit" data-id="${proof.id}">Editar</button>` : ''}
                            ${canConfirm ? `<button class="btn btn-success btn-sm" data-action="confirm" data-id="${proof.id}">Confirmar</button>` : ''}
                            ${canFaturar ? `<button class="btn btn-primary btn-sm" data-action="faturar" data-id="${proof.id}">Faturar</button>` : ''}
                            <button class="btn btn-secondary btn-sm" data-action="baixar" data-id="${proof.id}">Baixar</button>
                            ${canGenerateCredit ? `<button class="btn btn-warning btn-sm" data-action="credit" data-id="${proof.id}">Gerar Crédito</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // Lida com cliques nos botões de ação da tabela
    const handleTableClick = async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;

        switch (action) {
            case 'confirm':
                if (confirm('Deseja confirmar este pagamento?')) {
                    await updateProofStatus(id, 'CONFIRMADO');
                }
                break;
            case 'faturar':
                // Lógica de faturamento com modal
                renderFaturarModal(id);
                break;
            case 'baixar':
                 if (confirm('Deseja baixar este pagamento?')) {
                    await updateProofStatus(id, 'BAIXADO');
                }
                break;
            // Adicionar outros casos (edit, credit) aqui
        }
    };
    
    // Função genérica para atualizar o status
    const updateProofStatus = async (id, newStatus) => {
        App.showLoader();
        try {
            const { error } = await supabase
                .from('proofs')
                .update({ status: newStatus, updated_at: new Date() })
                .eq('id', id);
            if (error) throw error;
            await loadProofs(); // Recarrega a lista
        } catch (error) {
            console.error(`Erro ao atualizar status para ${newStatus}:`, error);
            alert('Falha ao atualizar o status.');
        } finally {
            App.hideLoader();
        }
    };

    // Renderiza o modal de faturamento
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

    // Lida com o submit do formulário de faturamento
    const handleFaturarSubmit = async (proofId, originalValue) => {
        App.showLoader();
        const pedidoCode = document.getElementById('pedidoCode').value;
        const faturarValue = parseFloat(document.getElementById('faturarValue').value);

        try {
            if (!pedidoCode || isNaN(faturarValue) || faturarValue <= 0 || faturarValue > originalValue) {
                throw new Error('Dados inválidos. Verifique o código do pedido e o valor.');
            }

            const remainingValue = originalValue - faturarValue;

            if (remainingValue > 0) {
                // Lógica de divisão
                // 1. Atualiza o registro original para ser o valor faturado
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

                // 2. Cria um novo registro com o valor restante
                const { data: originalProof, error: selectError } = await supabase.from('proofs').select('*').eq('id', proofId).single();
                if (selectError) throw selectError;
                
                delete originalProof.id; // Remove o ID para criar um novo
                const newProof = {
                    ...originalProof,
                    value: remainingValue,
                    status: 'AGUARDANDO CONFIRMAÇÃO',
                    faturado_pedido_code: null,
                    created_at: new Date(),
                    updated_at: new Date(),
                };

                const { error: insertError } = await supabase.from('proofs').insert(newProof);
                if (insertError) throw insertError;

            } else {
                // Faturamento total
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
    
    // Função principal de renderização do módulo
    const render = async () => {
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>Comprovantes de Pagamento</h2>
                    <button id="btn-new-proof" class="btn btn-primary">Novo Pagamento</button>
                </div>
                <div class="filters">
                    <input type="text" id="filter-client-code" placeholder="Cód. Cliente">
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
                                <th>Comprovante</th>
                                <th>Pedido</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="proofs-list"></tbody>
                    </table>
                </div>
            </div>
        `;

        // Adicionar event listeners
        document.getElementById('btn-apply-filters').addEventListener('click', () => {
            currentFilters.client_code = document.getElementById('filter-client-code').value;
            currentFilters.client_name = document.getElementById('filter-client-name').value;
            currentFilters.status = document.getElementById('filter-status').value;
            loadProofs();
        });
        
        // Listener para a tabela (delegação de eventos)
        document.getElementById('proofs-list').addEventListener('click', handleTableClick);

        // TODO: Adicionar listener para o botão "Novo Pagamento"
        // document.getElementById('btn-new-proof').addEventListener('click', renderNewProofModal);

        // Carga inicial
        await loadProofs();
    };

    return {
        name: 'Comprovantes',
        render: render,
    };
})();
