async function renderHomePage() {
    const mainContent = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    
    showLoader();
    const stats = await api.getDashboardStats();
    
    let content = '<div class="home-grid">';

    // Widgets para VENDEDOR
    if (auth.hasRole('vendedor')) {
        content += `
            <div class="card">
                <h3>Buscar Créditos de Cliente</h3>
                <div class="form-group">
                    <input type="text" id="home-search-cliente" placeholder="Código ou nome do cliente">
                    <button class="btn btn-primary" id="home-search-btn">Buscar</button>
                </div>
            </div>
            <div class="card">
                <h3>Nova Solicitação D/C</h3>
                <button class="btn btn-success" onclick="window.location.hash='#solicitacoes?action=new'">Criar Nova Solicitação</button>
            </div>
            <div class="widget" data-route="#creditos?status=DISPONÍVEL">
                <div class="count">${stats.clientesComCredito || 0}</div>
                <div class="description">Clientes com créditos disponíveis</div>
            </div>
            <div class="widget" data-route="#solicitacoes?status=PENDENTE">
                <div class="count">${stats.solicitacoesPendentes || 0}</div>
                <div class="description">Solicitações D/C pendentes</div>
            </div>
        `;
    }

    // Widgets para CAIXA
    if (auth.hasRole('caixa')) {
        content += `
            <div class="card">
                <h3>Novo Pagamento</h3>
                <button class="btn btn-success" onclick="window.location.hash='#comprovantes?action=new'">Registrar Novo Pagamento</button>
            </div>
            <div class="widget" data-route="#comprovantes?status=FATURADO">
                <div class="count">${stats.pagamentosParaBaixa || 0}</div>
                <div class="description">Pagamentos prontos para baixa</div>
            </div>
        `;
    }

    // Widgets para FATURISTA
    if (auth.hasRole('faturista')) {
        content += `
            <div class="widget" data-route="#comprovantes?status=CONFIRMADO">
                <div class="count">${stats.pagamentosConfirmados || 0}</div>
                <div class="description">Pagamentos confirmados para faturar</div>
            </div>
            <div class="widget" data-route="#solicitacoes?status=PENDENTE">
                <div class="count">${stats.solicitacoesPendentes || 0}</div>
                <div class="description">Solicitações D/C pendentes</div>
            </div>
        `;
    }
    
    // ... Adicionar outros widgets para GARANTIA, FINANCEIRO, etc.

    content += '</div>';
    mainContent.innerHTML = content;

    // Adicionar event listeners para os widgets
    document.querySelectorAll('.widget[data-route]').forEach(widget => {
        widget.addEventListener('click', () => {
            window.location.hash = widget.dataset.route;
        });
    });

    if (document.getElementById('home-search-btn')) {
        document.getElementById('home-search-btn').addEventListener('click', () => {
            const query = document.getElementById('home-search-cliente').value;
            window.location.hash = `#creditos?cliente=${encodeURIComponent(query)}`;
        });
    }
}
