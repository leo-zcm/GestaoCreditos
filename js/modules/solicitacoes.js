async function renderSolicitacoesDcPage() {
    const mainContent = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    
    // Busca usuários para o filtro de solicitante, se tiver permissão
    let usersOptions = '';
    if (!auth.hasPermission('solicitacoes', 'ver_apenas_minhas')) {
        const { data: users } = await api.getUsers();
        usersOptions = users.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
    }

    mainContent.innerHTML = `
        <div class="card">
            <div class="filters">
                <input type="date" id="filter-data-inicio">
                <input type="date" id="filter-data-fim">
                <select id="filter-status">
                    <option value="">Todos os Status</option>
                    <option value="PENDENTE" selected>Pendente</option>
                    <option value="APROVADO">Aprovado</option>
                    <option value="REJEITADO">Rejeitado</option>
                </select>
                ${!auth.hasPermission('solicitacoes', 'ver_apenas_minhas') ? `
                <select id="filter-solicitante">
                    <option value="">Todos Solicitantes</option>
                    ${usersOptions}
                </select>
                ` : ''}
                <button id="apply-filters-solicitacoes" class="btn btn-primary">Filtrar</button>
                ${auth.hasPermission('solicitacoes', 'inserir') ? '<button id="add-solicitacao" class="btn btn-success">Nova Solicitação</button>' : ''}
            </div>
        </div>
        <div class="table-container">
            <table id="solicitacoes-table">
                <thead>
                    <tr>
                        <th>Data/Hora</th>
                        <th>Solicitante</th>
                        <th>Débito</th>
                        <th>Crédito</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="pagination" id="pagination-solicitacoes"></div>
    `;

    document.getElementById('add-solicitacao')?.addEventListener('click', showAddSolicitacaoModal);
    document.getElementById('apply-filters-solicitacoes').addEventListener('click', () => loadSolicitacoesDc());
    
    loadSolicitacoesDc();
}

async function loadSolicitacoesDc(page = 1) {
    const tbody = document.querySelector('#solicitacoes-table tbody');
    tbody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';

    const user = auth.getCurrentUser();
    const filters = {
        status: document.getElementById('filter-status').value,
        data_inicio: document.getElementById('filter-data-inicio').value,
        data_fim: document.getElementById('filter-data-fim').value,
        solicitante_id: auth.hasPermission('solicitacoes', 'ver_apenas_minhas') 
            ? user.id 
            : document.getElementById('filter-solicitante')?.value
    };

    const { data, error } = await api.getSolicitacoes(filters, page);

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6">Erro ao carregar dados.</td></tr>';
        console.error(error);
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => `
        <tr>
            <td>${formatDate(s.created_at)}</td>
            <td>${s.solicitante.nome}</td>
            <td>${s.debito_qtd} ${s.debito_produto.nome} para ${s.debito_cliente.nome} - ${formatCurrency(s.debito_valor)}</td>
            <td>${s.credito_qtd} ${s.credito_produto.nome} para ${s.credito_cliente.nome} - ${formatCurrency(s.credito_valor)}</td>
            <td><span class="status-tag ${getStatusClass(s.status)}">${s.status}</span></td>
            <td>${renderSolicitacaoActions(s)}</td>
        </tr>
    `).join('');
    
    document.querySelectorAll('.action-btn-solicitacao').forEach(btn => {
        btn.addEventListener('click', handleSolicitacaoAction);
    });
}

function renderSolicitacaoActions(solicitacao) {
    if (solicitacao.status === 'PENDENTE' && auth.hasPermission('solicitacoes', 'aprovar_rejeitar')) {
        return `
            <button class="btn btn-success action-btn-solicitacao" data-action="aprovar" data-id='${solicitacao.id}' data-solicitacao='${JSON.stringify(solicitacao)}'>Aprovar</button>
            <button class="btn btn-danger action-btn-solicitacao" data-action="rejeitar" data-id="${solicitacao.id}">Rejeitar</button>
        `;
    }
    return 'N/A';
}

async function handleSolicitacaoAction(event) {
    const { action, id } = event.target.dataset;
    
    if (action === 'aprovar') {
        const solicitacao = JSON.parse(event.target.dataset.solicitacao);
        showAprovarModal(id, solicitacao);
    } else if (action === 'rejeitar') {
        showRejeitarModal(id);
    }
}

function showAprovarModal(id, solicitacao) {
    const modalHtml = `
        <form id="aprovar-form">
            <p>Para aprovar, por favor, insira o código do lançamento de débito do ERP.</p>
            <div class="form-group">
                <label for="lancamento_erp">Código Lançamento ERP</label>
                <input type="text" id="lancamento_erp" required>
            </div>
            <button type="submit" class="btn btn-primary">Aprovar e Gerar Crédito</button>
        </form>
    `;
    showModal('Aprovar Solicitação', modalHtml);

    document.getElementById('aprovar-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const lancamento_debito_erp = document.getElementById('lancamento_erp').value;
        const user = auth.getCurrentUser();

        // 1. Atualiza a solicitação
        const { error: updateError } = await api.updateSolicitacao(id, {
            status: 'APROVADO',
            lancamento_debito_erp,
            aprovador_id: user.id,
            data_aprovacao_rejeicao: new Date()
        });

        if (updateError) {
            showNotification('Erro ao aprovar solicitação.', 'error');
            return;
        }

        // 2. Cria o crédito correspondente
        const { error: creditError } = await api.createCredito({
            criado_por_id: user.id,
            origem_id: id,
            origem_tabela: 'solicitacoes_dc',
            vendedor_id: solicitacao.solicitante.id,
            cliente_codigo: solicitacao.credito_cliente_codigo,
            produto_codigo: solicitacao.credito_produto_codigo,
            quantidade: solicitacao.credito_qtd,
            valor: solicitacao.credito_valor,
            descricao: `Crédito originado da solicitação D/C #${id.substring(0, 8)}`,
            status: 'DISPONÍVEL'
        });
        
        if (creditError) {
            showNotification('Solicitação aprovada, mas houve um erro ao gerar o crédito.', 'error');
        } else {
            showNotification('Solicitação aprovada e crédito gerado com sucesso!', 'success');
        }

        hideModal();
        loadSolicitacoesDc();
    });
}

function showRejeitarModal(id) {
    const modalHtml = `
        <form id="rejeitar-form">
            <div class="form-group">
                <label for="justificativa">Justificativa da Rejeição</label>
                <textarea id="justificativa" rows="4" required style="width: 100%"></textarea>
            </div>
            <button type="submit" class="btn btn-danger">Rejeitar</button>
        </form>
    `;
    showModal('Rejeitar Solicitação', modalHtml);

    document.getElementById('rejeitar-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const justificativa_rejeicao = document.getElementById('justificativa').value;
        const user = auth.getCurrentUser();

        const { error } = await api.updateSolicitacao(id, {
            status: 'REJEITADO',
            justificativa_rejeicao,
            aprovador_id: user.id,
            data_aprovacao_rejeicao: new Date()
        });

        if (error) {
            showNotification('Erro ao rejeitar solicitação.', 'error');
        } else {
            showNotification('Solicitação rejeitada.', 'success');
        }
        hideModal();
        loadSolicitacoesDc();
    });
}

async function showAddSolicitacaoModal() {
    const [clientesRes, produtosRes] = await Promise.all([api.getClientes(), api.getProdutos()]);
    const clientes = clientesRes.data;
    const produtos = produtosRes.data;

    const options = (items) => items.map(i => `<option value="${i.codigo}">${i.nome}</option>`).join('');

    const modalHtml = `
        <form id="add-solicitacao-form">
            <h4>Informações de Débito</h4>
            <div class="form-group">
                <label>Cliente a ser Debitado</label>
                <select name="debito_cliente_codigo" required>${options(clientes)}</select>
            </div>
            <div class="form-group">
                <label>Produto</label>
                <select name="debito_produto_codigo" required>${options(produtos)}</select>
            </div>
            <div class="form-group">
                <label>Quantidade</label>
                <input type="number" name="debito_qtd" required>
            </div>
            <div class="form-group">
                <label>Valor do Débito</label>
                <input type="number" step="0.01" name="debito_valor" required>
            </div>
            <hr>
            <h4>Informações de Crédito</h4>
            <div class="form-group">
                <label>Cliente a ser Creditado</label>
                <select name="credito_cliente_codigo" required>${options(clientes)}</select>
            </div>
            <div class="form-group">
                <label>Produto</label>
                <select name="credito_produto_codigo" required>${options(produtos)}</select>
            </div>
            <div class="form-group">
                <label>Quantidade</label>
                <input type="number" name="credito_qtd" required>
            </div>
            <div class="form-group">
                <label>Valor do Crédito</label>
                <input type="number" step="0.01" name="credito_valor" required>
            </div>
            <button type="submit" class="btn btn-primary">Enviar Solicitação</button>
        </form>
    `;
    showModal('Nova Solicitação D/C', modalHtml);

    document.getElementById('add-solicitacao-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        data.solicitante_id = auth.getCurrentUser().id;

        const { error } = await api.createSolicitacao(data);
        if (error) {
            showNotification('Erro ao criar solicitação: ' + error.message, 'error');
        } else {
            showNotification('Solicitação criada com sucesso!', 'success');
            hideModal();
            loadSolicitacoesDc();
        }
    });
}
