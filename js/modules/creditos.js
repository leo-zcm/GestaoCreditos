async function renderCreditosPage() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="card">
            <div class="filters">
                <input type="text" id="filter-cliente-credito" placeholder="Cód/Nome Cliente">
                <select id="filter-status-credito">
                    <option value="">Todos os Status</option>
                    <option value="DISPONÍVEL" selected>Disponível</option>
                    <option value="ABATIDO">Abatido</option>
                </select>
                <button id="apply-filters-creditos" class="btn btn-primary">Buscar</button>
                ${auth.hasPermission('creditos', 'inserir') ? '<button id="add-credito" class="btn btn-success">Novo Crédito</button>' : ''}
            </div>
        </div>
        <div class="card" id="selection-summary" style="display: none;">
            <p><strong><span id="selection-count">0</span> créditos selecionados.</strong> Total: <strong id="selection-total">R$ 0,00</strong></p>
            <button id="abater-selecionados" class="btn btn-warning">Abater Selecionados</button>
        </div>
        <div class="table-container">
            <table id="creditos-table">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="select-all-creditos"></th>
                        <th>Criação</th>
                        <th>Cliente</th>
                        <th>Descrição</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="pagination" id="pagination-creditos"></div>
    `;

    document.getElementById('add-credito')?.addEventListener('click', showAddCreditoModal);
    document.getElementById('apply-filters-creditos').addEventListener('click', () => loadCreditos());
    document.getElementById('abater-selecionados').addEventListener('click', handleAbaterSelecionados);
    document.getElementById('select-all-creditos').addEventListener('change', (e) => {
        document.querySelectorAll('#creditos-table tbody .credito-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateSelectionSummary();
    });

    loadCreditos();
}

async function loadCreditos(page = 1) {
    const tbody = document.querySelector('#creditos-table tbody');
    tbody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

    const filters = {
        cliente_query: document.getElementById('filter-cliente-credito').value,
        status: document.getElementById('filter-status-credito').value,
    };
    if (auth.hasPermission('creditos', 'ver_apenas_meus')) {
        filters.vendedor_id = auth.getCurrentUser().id;
    }

    const { data, error } = await api.getCreditos(filters, page);

    if (error) {
        tbody.innerHTML = '<tr><td colspan="7">Erro ao carregar dados.</td></tr>';
        console.error(error);
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum crédito encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(c => `
        <tr data-credito='${JSON.stringify(c)}'>
            <td>${c.status === 'DISPONÍVEL' ? `<input type="checkbox" class="credito-checkbox" value="${c.id}" data-valor="${c.valor}">` : ''}</td>
            <td>${formatDate(c.created_at)}</td>
            <td>${c.cliente.codigo} - ${c.cliente.nome}</td>
            <td>${c.descricao}</td>
            <td>${formatCurrency(c.valor)}</td>
            <td><span class="status-tag ${getStatusClass(c.status)}">${c.status}</span></td>
            <td>${renderCreditoActions(c)}</td>
        </tr>
    `).join('');
    
    tbody.addEventListener('change', (e) => {
        if (e.target.classList.contains('credito-checkbox')) {
            updateSelectionSummary();
        }
    });

    document.querySelectorAll('.action-btn-credito').forEach(btn => {
        btn.addEventListener('click', handleCreditoAction);
    });
    updateSelectionSummary();
}

function renderCreditoActions(credito) {
    if (credito.status === 'DISPONÍVEL' && auth.hasPermission('creditos', 'abater')) {
        return `<button class="btn btn-info action-btn-credito" data-action="abater" data-id="${credito.id}" data-valor="${credito.valor}">Abater</button>`;
    }
    if (credito.status === 'ABATIDO') {
        return `Pedido: ${credito.pedido_abatido || 'N/A'}`;
    }
    return 'N/A';
}

function handleCreditoAction(event) {
    const { action, id, valor } = event.target.dataset;
    if (action === 'abater') {
        showAbaterModal(id, parseFloat(valor));
    }
}

function updateSelectionSummary() {
    const checkboxes = document.querySelectorAll('.credito-checkbox:checked');
    const count = checkboxes.length;
    let total = 0;
    checkboxes.forEach(cb => {
        total += parseFloat(cb.dataset.valor);
    });

    const summaryEl = document.getElementById('selection-summary');
    if (count > 0) {
        document.getElementById('selection-count').textContent = count;
        document.getElementById('selection-total').textContent = formatCurrency(total);
        summaryEl.style.display = 'block';
    } else {
        summaryEl.style.display = 'none';
    }
}

function showAbaterModal(id, valor) {
    const modalHtml = `
        <form id="abater-form">
            <div class="form-group">
                <label for="pedido_abatido">Código do Pedido/Lançamento</label>
                <input type="text" id="pedido_abatido" required>
            </div>
            <div class="form-group">
                <label for="valor_abatido">Valor a Abater</label>
                <input type="number" id="valor_abatido" step="0.01" value="${valor.toFixed(2)}" max="${valor.toFixed(2)}" required>
            </div>
            <button type="submit" class="btn btn-primary">Confirmar Abatimento</button>
        </form>
    `;
    showModal('Abater Crédito', modalHtml);

    document.getElementById('abater-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pedido_abatido = document.getElementById('pedido_abatido').value;
        const valor_abatido = parseFloat(document.getElementById('valor_abatido').value);

        if (valor_abatido > valor) {
            showNotification('Valor a abater não pode ser maior que o valor do crédito.', 'error');
            return;
        }

        if (valor_abatido < valor) {
            // Divisão de crédito
            const valor_restante = valor - valor_abatido;
            
            // 1. Atualiza o crédito original para ser o valor abatido
            const { error: updateError } = await api.updateCredito(id, {
                valor: valor_abatido,
                status: 'ABATIDO',
                pedido_abatido
            });
            if (updateError) { showNotification('Erro ao abater crédito.', 'error'); return; }

            // 2. Cria um novo crédito com o valor restante
            const { data: originalCredito } = await supabase.from('creditos').select('*').eq('id', id).single();
            delete originalCredito.id; // Remove ID para criar um novo
            const newCredito = {
                ...originalCredito,
                valor: valor_restante,
                status: 'DISPONÍVEL',
                pedido_abatido: null,
                credito_pai_id: id,
                created_at: new Date()
            };
            const { error: createError } = await api.createCredito(newCredito);
            if (createError) { showNotification('Crédito abatido, mas erro ao criar o crédito restante.', 'error'); }
            
        } else {
            // Abatimento total
            const { error } = await api.updateCredito(id, { status: 'ABATIDO', pedido_abatido });
            if (error) { showNotification('Erro ao abater crédito.', 'error'); return; }
        }

        showNotification('Crédito abatido com sucesso!', 'success');
        hideModal();
        loadCreditos();
    });
}

function handleAbaterSelecionados() {
    const checkboxes = document.querySelectorAll('.credito-checkbox:checked');
    if (checkboxes.length === 0) return;
    
    let total = 0;
    checkboxes.forEach(cb => total += parseFloat(cb.dataset.valor));

    const modalHtml = `
        <form id="abater-massa-form">
            <p>Você está abatendo <strong>${checkboxes.length}</strong> créditos, totalizando <strong>${formatCurrency(total)}</strong>.</p>
            <div class="form-group">
                <label for="pedido_abatido_massa">Código do Pedido/Lançamento Único</label>
                <input type="text" id="pedido_abatido_massa" required>
            </div>
            <div class="form-group">
                <label for="valor_abatido_massa">Valor Total a Abater</label>
                <input type="number" id="valor_abatido_massa" step="0.01" value="${total.toFixed(2)}" max="${total.toFixed(2)}" required>
            </div>
            <button type="submit" class="btn btn-primary">Confirmar Abatimento em Massa</button>
        </form>
    `;
    showModal('Abater Créditos Selecionados', modalHtml);

    document.getElementById('abater-massa-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pedido_abatido = document.getElementById('pedido_abatido_massa').value;
        let valor_a_abater = parseFloat(document.getElementById('valor_abatido_massa').value);

        const creditosSelecionados = Array.from(checkboxes).map(cb => {
            return JSON.parse(cb.closest('tr').dataset.credito);
        });

        for (const credito of creditosSelecionados) {
            if (valor_a_abater <= 0) break;

            if (valor_a_abater >= credito.valor) {
                // Abate o crédito inteiro
                await api.updateCredito(credito.id, { status: 'ABATIDO', pedido_abatido });
                valor_a_abater -= credito.valor;
            } else {
                // Abate parcial (último crédito)
                const valor_restante = credito.valor - valor_a_abater;
                
                // Atualiza o original
                await api.updateCredito(credito.id, {
                    valor: valor_a_abater,
                    status: 'ABATIDO',
                    pedido_abatido
                });

                // Cria o restante
                delete credito.id;
                const newCredito = {
                    ...credito,
                    valor: valor_restante,
                    status: 'DISPONÍVEL',
                    pedido_abatido: null,
                    credito_pai_id: credito.id,
                    created_at: new Date()
                };
                await api.createCredito(newCredito);
                valor_a_abater = 0;
            }
        }
        showNotification('Créditos abatidos em massa com sucesso!', 'success');
        hideModal();
        loadCreditos();
    });
}

// Função para modal de novo crédito (simplificada, pode ser expandida)
async function showAddCreditoModal() {
    // ... Lógica para buscar vendedores, clientes, produtos ...
    const modalHtml = `
        <form id="add-credito-form">
            <!-- Campos do formulário de novo crédito aqui -->
            <p>Formulário de novo crédito a ser implementado.</p>
            <button type="submit" class="btn btn-primary">Salvar</button>
        </form>
    `;
    showModal('Novo Crédito', modalHtml);
}
