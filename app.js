// app.js (VERSÃO COM DASHBOARD DINÂMICO E REALTIME)

const App = {
    userProfile: null,
    initialized: false,
    dashboardChannel: null, // <<< NOVO: Canal para Realtime
    modules: {
        usuarios: UsuariosModule,
        comprovantes: ComprovantesModule,
    },
    moduleConfig: [
        { key: 'comprovantes', name: 'Comprovantes', permissionCheck: (user) => user.permissions?.comprovantes?.view },
        { key: 'creditos', name: 'Créditos', permissionCheck: (user) => user.permissions?.creditos?.view },
        { key: 'solicitacoes', name: 'Solicitações D/C', permissionCheck: (user) => user.permissions?.solicitacoes?.view },
        { key: 'usuarios', name: 'Usuários', permissionCheck: (user) => user.is_admin }
    ],

    isInitialized() {
        return this.initialized;
    },

    init(userProfile) {
        if (this.initialized) return;
        this.userProfile = userProfile;
        this.initialized = true;
        console.log("Aplicação iniciada com o perfil:", userProfile);
        this.renderLayout();
        this.setupEventListeners();
        this.renderHome();
    },

    destroy() {
        this.unsubscribeFromDashboardChanges(); // <<< NOVO: Limpa a inscrição ao sair
        this.userProfile = null;
        this.initialized = false;
        console.log("Estado da aplicação limpo.");
    },

    renderLayout() {
        document.getElementById('user-display-name').textContent = this.userProfile.full_name || this.userProfile.username;
        this.buildNavigation();
    },

    buildNavigation() {
        const nav = document.getElementById('main-nav');
        let navHtml = '<ul>';
        navHtml += `<li><a href="#" data-module="home" class="nav-link active">Início</a></li>`;
        this.moduleConfig.forEach(config => {
            if (config.permissionCheck(this.userProfile)) {
                navHtml += `<li><a href="#" data-module="${config.key}" class="nav-link">${config.name}</a></li>`;
            }
        });
        navHtml += '</ul>';
        nav.innerHTML = navHtml;
    },

    // <<< ALTERADO: Agora aceita filtros iniciais >>>
    async loadModule(moduleName, initialFilters = null) {
        this.unsubscribeFromDashboardChanges(); // Garante que o realtime só rode na home
        this.showLoader();
        try {
            const module = this.modules[moduleName];
            const moduleConf = this.moduleConfig.find(m => m.key === moduleName);
            document.getElementById('header-title').textContent = moduleConf?.name || 'Módulo';
            if (module && typeof module.render === 'function') {
                // Passa os filtros para o método render do módulo
                await module.render(initialFilters);
            } else {
                console.warn(`Módulo "${moduleName}" não implementado ou não encontrado.`);
                document.getElementById('content-area').innerHTML = `<div class="card"><p>O módulo <strong>${moduleConf.name}</strong> está em desenvolvimento.</p></div>`;
            }
        } catch (error) {
            console.error(`Erro ao renderizar o módulo ${moduleName}:`, error);
            document.getElementById('content-area').innerHTML = `<div class="card error-message">Ocorreu um erro grave ao carregar este módulo.</div>`;
        } finally {
            this.hideLoader();
        }
    },

    // <<< NOVO: Lógica de navegação a partir dos widgets >>>
    navigateToModule(moduleName, filters) {
        const navLink = document.querySelector(`#main-nav a[data-module="${moduleName}"]`);
        if (navLink) {
            document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
            navLink.classList.add('active');
            this.loadModule(moduleName, filters);
        }
    },

    // <<< GRANDE REESTRUTURAÇÃO: Lógica do Dashboard >>>
    async renderHome() {
        this.showLoader();
        document.getElementById('header-title').textContent = 'Início';
        const contentArea = document.getElementById('content-area');
        const userRoles = this.userProfile.roles || [];

        let dashboardHtml = `<div class="card"><h2>Bem-vindo, ${this.userProfile.full_name}!</h2></div>`;
        
        // Constrói o HTML baseado nas funções
        const roleRenderers = {
            'VENDEDOR': this._renderVendedorDashboard,
            'CAIXA': this._renderCaixaDashboard,
            'FINANCEIRO': this._renderFinanceiroDashboard,
            'FATURISTA': this._renderFaturistaDashboard,
            'GARANTIA': this._renderGarantiaDashboard,
        };

        let renderedSections = new Set();
        for (const role of userRoles) {
            if (roleRenderers[role] && !renderedSections.has(role)) {
                dashboardHtml += await roleRenderers[role].call(this);
                renderedSections.add(role);
            }
        }

        if (renderedSections.size === 0) {
            dashboardHtml += '<div class="card"><p>Você não possui uma função com dashboard definido.</p></div>';
        }

        contentArea.innerHTML = dashboardHtml;
        this.setupHomeEventListeners();
        this.updateDashboardStats(); // Busca inicial dos dados
        this.subscribeToDashboardChanges(); // Inicia o listener de realtime
        this.hideLoader();
    },

    // <<< NOVOS MÉTODOS: Funções auxiliares para renderizar cada dashboard >>>
    async _renderVendedorDashboard() {
        const { data: avisos, error: avisosError } = await supabase
            .from('avisos')
            .select('content')
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString());
        
        const avisosHtml = avisos && avisos.length > 0 
            ? `<ul>${avisos.map(a => `<li>${a.content}</li>`).join('')}</ul>` 
            : '<p>Nenhum aviso no momento.</p>';

        return `
            <div class="dashboard-section">
                <div class="dashboard-grid">
                    <div class="card quick-action-card">
                        <h3>Ações Rápidas</h3>
                        <button id="home-add-proof" class="btn btn-primary">Adicionar Comprovante</button>
                        <button class="btn btn-secondary" disabled>Nova Solicitação D/C</button>
                        <button id="home-show-links" class="btn btn-info">Links Úteis</button>
                    </div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="home-client-code">Código do Cliente</label>
                            <input type="text" id="home-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary" disabled>Buscar</button>
                        <div class="search-result">
                            <p>-- Status do cliente --</p>
                        </div>
                    </div>
                    <div class="card stat-card is-info" style="cursor: default;">
                        <div id="widget-vendedor-creditos" class="stat-number">--</div>
                        <div class="stat-label">Clientes com Crédito</div>
                    </div>
                     <div class="card stat-card is-warning" style="cursor: default;">
                        <div id="widget-vendedor-solicitacoes" class="stat-number">--</div>
                        <div class="stat-label">Solicitações Pendentes</div>
                    </div>
                    <div class="card avisos-card">
                        <h3>Avisos</h3>
                        ${avisosHtml}
                    </div>
                </div>
            </div>
        `;
    },
    _renderCaixaDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel do Caixa</h3>
                <div class="dashboard-grid">
                    <div class="card quick-action-card">
                         <button id="home-add-proof" class="btn btn-primary">Inserir Novo Pagamento</button>
                    </div>
                    <div id="widget-faturado" class="card stat-card is-success" data-status-filter="FATURADO">
                        <div id="widget-faturado-count" class="stat-number">...</div>
                        <div class="stat-label">Pagamentos Prontos para Baixa</div>
                    </div>
                </div>
            </div>
        `;
    },
    _renderFinanceiroDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel Financeiro</h3>
                <div class="dashboard-grid">
                    <div id="widget-pending" class="card stat-card is-warning" data-status-filter="AGUARDANDO CONFIRMAÇÃO">
                        <div id="widget-pending-count" class="stat-number">...</div>
                        <div class="stat-label">Pagamentos Aguardando Confirmação</div>
                    </div>
                </div>
            </div>
        `;
    },
    _renderFaturistaDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel do Faturista</h3>
                <div class="dashboard-grid">
                     <div class="card quick-action-card">
                        <button class="btn btn-primary" disabled>Inserir Novo Crédito</button>
                    </div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="home-client-code">Código do Cliente</label>
                            <input type="text" id="home-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary" disabled>Buscar</button>
                    </div>
                    <div id="widget-confirmed" class="card stat-card is-info" data-status-filter="CONFIRMADO">
                        <div id="widget-confirmed-count" class="stat-number">...</div>
                        <div class="stat-label">Pagamentos Confirmados para Faturar</div>
                    </div>
                </div>
            </div>
        `;
    },
    _renderGarantiaDashboard() {
        return this._renderFaturistaDashboard(); // Reutiliza o mesmo layout por enquanto
    },

    // <<< NOVO: Gerencia os listeners específicos da Home >>>
    setupHomeEventListeners() {
        const contentArea = document.getElementById('content-area');
        
        // Botão de adicionar comprovante (presente em vários dashboards)
        const addProofBtn = contentArea.querySelector('#home-add-proof');
        if (addProofBtn) {
            addProofBtn.addEventListener('click', () => {
                this.modules.comprovantes.renderProofModal();
            });
        }
        
        // Botão de links úteis (Vendedor)
        const showLinksBtn = contentArea.querySelector('#home-show-links');
        if (showLinksBtn) {
            showLinksBtn.addEventListener('click', async () => {
                const { data: links, error } = await supabase.from('links_uteis').select('*').order('display_order');
                const modalBody = document.getElementById('modal-body');
                if(links && links.length > 0) {
                    modalBody.innerHTML = `<h2>Links Úteis</h2><div id="links-uteis-list">${links.map(l => `<a href="${l.url}" target="_blank">${l.title}</a>`).join('')}</div>`;
                } else {
                    modalBody.innerHTML = `<h2>Links Úteis</h2><p>Nenhum link cadastrado.</p>`;
                }
                document.getElementById('modal-container').classList.add('active');
            });
        }

        // Widgets clicáveis que levam ao módulo de comprovantes com filtro
        contentArea.querySelectorAll('.stat-card[data-status-filter]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.dataset.statusFilter;
                this.navigateToModule('comprovantes', { status: status });
            });
        });
    },

    // <<< NOVO: Busca os dados para os widgets >>>
    async updateDashboardStats() {
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        if (error) {
            console.error("Erro ao buscar estatísticas do dashboard:", error);
            return;
        }
        if (data) {
            const pendingEl = document.getElementById('widget-pending-count');
            if (pendingEl) pendingEl.textContent = data.pending_proofs;

            const confirmedEl = document.getElementById('widget-confirmed-count');
            if (confirmedEl) confirmedEl.textContent = data.confirmed_proofs;

            const faturadoEl = document.getElementById('widget-faturado-count');
            if (faturadoEl) faturadoEl.textContent = data.faturado_proofs;
        }
    },

    // <<< NOVO: Lógica de Realtime >>>
    subscribeToDashboardChanges() {
        if (this.dashboardChannel) return; // Já está inscrito
        
        const handleDbChange = (payload) => {
            console.log('Mudança no banco de dados detectada:', payload);
            this.updateDashboardStats(); // Re-busca os totais
        };

        this.dashboardChannel = supabase
            .channel('dashboard-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proofs' }, handleDbChange)
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Conectado ao canal de realtime do dashboard!');
                }
                if (err) {
                    console.error('Erro na inscrição do canal de realtime:', err);
                }
            });
    },

    unsubscribeFromDashboardChanges() {
        if (this.dashboardChannel) {
            supabase.removeChannel(this.dashboardChannel);
            this.dashboardChannel = null;
            console.log('Desconectado do canal de realtime do dashboard.');
        }
    },

    setupEventListeners() {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menu-toggle');
        menuToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
        document.getElementById('main-nav').addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.classList.contains('nav-link')) {
                e.preventDefault();
                document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
                e.target.classList.add('active');
                const moduleName = e.target.dataset.module;
                if (moduleName === 'home') this.renderHome();
                else this.loadModule(moduleName);
            }
        });
        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer || e.target.classList.contains('modal-close-btn')) {
                if (this.modules.comprovantes && typeof this.modules.comprovantes.cleanupModalListeners === 'function') {
                    this.modules.comprovantes.cleanupModalListeners();
                }
                modalContainer.classList.remove('active');
            }
        });
    },

    showLoader() { document.getElementById('loader').classList.add('active'); },
    hideLoader() { document.getElementById('loader').classList.remove('active'); },
};
