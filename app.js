// app.js (VERSÃO BLINDADA CONTRA LOADING INFINITO)

const App = {
    userProfile: null,
    initialized: false,
    dashboardChannel: null,
    modules: {
        usuarios: UsuariosModule,
        comprovantes: ComprovantesModule,
        creditos: CreditosModule,
        solicitacoes: SolicitacoesModule
    },
    moduleConfig: [
        { key: 'comprovantes', name: 'Comprovantes', permissionCheck: (user) => user.permissions?.comprovantes?.view },
        { key: 'creditos', name: 'Créditos', permissionCheck: (user) => user.permissions?.creditos?.view },
        { key: 'solicitacoes', name: 'Solicitações D/C', permissionCheck: (user) => user.permissions?.solicitacoes?.view && user.permissions.solicitacoes.view !== 'none' },
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
        this.unsubscribeFromDashboardChanges();
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

    async loadModule(moduleName, initialFilters = null) {
        this.unsubscribeFromDashboardChanges();
        this.showLoader();
        // <<< MUDANÇA CRÍTICA: BLINDAGEM ANTI-LOADING >>>
        try {
            const module = this.modules[moduleName];
            const moduleConf = this.moduleConfig.find(m => m.key === moduleName);
            document.getElementById('header-title').textContent = moduleConf?.name || 'Módulo';
            if (module && typeof module.render === 'function') {
                await module.render(initialFilters);
            } else {
                console.warn(`Módulo "${moduleName}" não implementado ou não encontrado.`);
                document.getElementById('content-area').innerHTML = `<div class="card"><p>O módulo <strong>${moduleConf.name}</strong> está em desenvolvimento.</p></div>`;
            }
        } catch (error) {
            console.error(`Erro ao renderizar o módulo ${moduleName}:`, error);
            document.getElementById('content-area').innerHTML = `<div class="card error-message">Ocorreu um erro grave ao carregar este módulo.</div>`;
        } finally {
            // Esta linha garante que o loader SEMPRE será escondido, com ou sem erro.
            this.hideLoader();
        }
    },

    navigateToModule(moduleName, filters) {
        const navLink = document.querySelector(`#main-nav a[data-module="${moduleName}"]`);
        if (navLink) {
            document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
            navLink.classList.add('active');
            this.loadModule(moduleName, filters);
        }
    },

    async renderHome() {
        this.showLoader();
        document.getElementById('header-title').textContent = 'Início';
        // <<< MUDANÇA CRÍTICA: BLINDAGEM ANTI-LOADING >>>
        try {
            const contentArea = document.getElementById('content-area');
            const userRoles = this.userProfile.roles || [];

            const canManageWidgets = this.userProfile.permissions?.home?.manage_widgets;
            let managementButtonHtml = canManageWidgets 
                ? `<button id="btn-manage-widgets" class="btn btn-secondary">Gerenciar Avisos e Links</button>` 
                : '';

            let dashboardHtml = `
                <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Bem-vindo, ${this.userProfile.full_name}!</h2>
                    ${managementButtonHtml}
                </div>`;
            
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

            if (renderedSections.size === 0 && !canManageWidgets) {
                dashboardHtml += '<div class="card"><p>Você não possui uma função com dashboard definido.</p></div>';
            }

            contentArea.innerHTML = dashboardHtml;
            this.setupHomeEventListeners();
            this.updateDashboardStats();
            this.subscribeToDashboardChanges();
        } catch (error) {
            console.error("Erro grave ao renderizar a Home:", error);
            document.getElementById('content-area').innerHTML = `<div class="card error-message">Ocorreu um erro ao carregar o painel inicial. Tente novamente mais tarde.</div>`;
        } finally {
            // Esta linha garante que o loader SEMPRE será escondido, com ou sem erro.
            this.hideLoader();
        }
    },

    // ... (o resto do seu arquivo app.js permanece exatamente igual)
    // ... (funções _renderVendedorDashboard, _renderCaixaDashboard, etc.)
    // ... (funções setupHomeEventListeners, renderManagementModal, etc.)
    // ...
    async _renderVendedorDashboard() {
        const { data: avisos } = await supabase.from('avisos').select('content').eq('is_active', true).gt('expires_at', new Date().toISOString());
        const avisosHtml = avisos && avisos.length > 0 ? `<ul>${avisos.map(a => `<li>${a.content}</li>`).join('')}</ul>` : '<p>Nenhum aviso no momento.</p>';

        const canViewSolicitacoes = this.userProfile.permissions?.solicitacoes?.view && this.userProfile.permissions.solicitacoes.view !== 'none';
        const canCreateSolicitacoes = this.userProfile.permissions?.solicitacoes?.create;

        return `
            <div class="dashboard-section">
                <div class="dashboard-grid">
                    <div class="card avisos-card"><h3>Avisos</h3>${avisosHtml}</div>

                    <div class="card quick-action-card">
                        <h3>Ações Rápidas</h3>
                        <button class="btn btn-primary home-add-proof">Adicionar Comprovante</button>
                        ${canCreateSolicitacoes ? '<button id="home-add-solicitacao" class="btn btn-secondary">Nova Solicitação D/C</button>' : ''}
                        <button id="home-show-links" class="btn btn-info">Links Úteis</button>
                    </div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="home-search-credit-input-vendedor">Código do Cliente</label>
                            <input type="text" class="home-search-credit-input" id="home-search-credit-input-vendedor" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary home-search-credit-btn">Buscar</button>
                    </div>
                    <div id="widget-vendedor-creditos-card" class="card stat-card is-info">
                        <div id="widget-vendedor-creditos-count" class="stat-number">--</div>
                        <div class="stat-label">Clientes com Crédito</div>
                    </div>
                    ${canViewSolicitacoes ? `
                        <div id="widget-vendedor-solicitacoes-card" class="card stat-card is-warning">
                            <div id="widget-vendedor-solicitacoes-count" class="stat-number">--</div>
                            <div class="stat-label">Solicitações Pendentes</div>
                        </div>
                    ` : ''}
                </div>
            </div>`;
    },

    _renderCaixaDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel do Caixa</h3>
                <div class="dashboard-grid">
                    <div class="card quick-action-card">
                         <button class="btn btn-primary home-add-proof">Inserir Novo Pagamento</button>
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
                     <div class="card quick-action-card"><button class="btn btn-primary home-add-credit">Inserir Novo Crédito</button></div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="faturista-client-code">Código do Cliente</label>
                            <input type="text" class="home-search-credit-input" id="faturista-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary home-search-credit-btn">Buscar</button>
                    </div>
                    <div id="widget-confirmed" class="card stat-card is-info" data-status-filter="CONFIRMADO"><div id="widget-confirmed-count" class="stat-number">...</div><div class="stat-label">Pagamentos Confirmados para Faturar</div></div>
                </div>
            </div>`;
    },

    _renderGarantiaDashboard() {
        return `
            <div class="dashboard-section">
                <h3>Painel da Garantia</h3>
                <div class="dashboard-grid">
                    <div class="card quick-action-card"><button class="btn btn-primary home-add-credit">Inserir Novo Crédito</button></div>
                    <div class="card search-card">
                        <h3>Consultar Créditos</h3>
                        <div class="form-group">
                            <label for="garantia-client-code">Código do Cliente</label>
                            <input type="text" class="home-search-credit-input" id="garantia-client-code" placeholder="Digite o código">
                        </div>
                        <button class="btn btn-secondary home-search-credit-btn">Buscar</button>
                    </div>
                </div>
            </div>`;
    },

    setupHomeEventListeners() {
        const contentArea = document.getElementById('content-area');
        
        contentArea.querySelectorAll('.home-add-proof').forEach(button => {
            button.addEventListener('click', () => {
                this.modules.comprovantes.renderProofModal();
            });
        });

        contentArea.querySelectorAll('.home-add-credit').forEach(button => {
            button.addEventListener('click', () => {
                this.modules.creditos.renderCreditModal();
            });
        });

        const addSolicitacaoBtn = contentArea.querySelector('#home-add-solicitacao');
        if (addSolicitacaoBtn) {
            addSolicitacaoBtn.addEventListener('click', () => {
                this.modules.solicitacoes.renderRequestModal();
            });
        }

        contentArea.querySelectorAll('.home-search-credit-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const searchCard = e.target.closest('.search-card');
                if (searchCard) {
                    const input = searchCard.querySelector('.home-search-credit-input');
                    const clientCode = input.value;
                    if (clientCode) {
                        this.navigateToModule('creditos', { client_code: clientCode, status: 'Disponível' });
                    }
                }
            });
        });
        
        const showLinksBtn = contentArea.querySelector('#home-show-links');
        if (showLinksBtn) {
            showLinksBtn.addEventListener('click', async () => {
                const { data: links } = await supabase.from('links_uteis').select('*').order('display_order');
                const modalBody = document.getElementById('modal-body');
                if(links && links.length > 0) {
                    modalBody.innerHTML = `<h2>Links Úteis</h2><div id="links-uteis-list">${links.map(l => `<a href="${l.url}" target="_blank">${l.title}</a>`).join('')}</div>`;
                } else {
                    modalBody.innerHTML = `<h2>Links Úteis</h2><p>Nenhum link cadastrado.</p>`;
                }
                document.getElementById('modal-container').classList.add('active');
            });
        }

        contentArea.querySelectorAll('.stat-card[data-status-filter]').forEach(card => {
            card.addEventListener('click', () => {
                const status = card.dataset.statusFilter;
                this.navigateToModule('comprovantes', { status: status });
            });
        });

        const manageWidgetsBtn = contentArea.querySelector('#btn-manage-widgets');
        if (manageWidgetsBtn) {
            manageWidgetsBtn.addEventListener('click', () => this.renderManagementModal());
        }

        const creditStatCard = contentArea.querySelector('#widget-vendedor-creditos-card');
        if (creditStatCard) {
            creditStatCard.addEventListener('click', () => {
                if (this.userProfile.seller_id_erp) {
                    this.navigateToModule('creditos', {
                        seller_id: this.userProfile.seller_id_erp,
                        status: 'Disponível'
                    });
                }
            });
        }

        const solicitacoesStatCard = contentArea.querySelector('#widget-vendedor-solicitacoes-card');
        if (solicitacoesStatCard) {
            solicitacoesStatCard.addEventListener('click', () => {
                this.navigateToModule('solicitacoes', { status: 'PENDENTE' });
            });
        }
    },

    async renderManagementModal() {
        this.showLoader();
        const modalBody = document.getElementById('modal-body');

        const { data: avisos } = await supabase.from('avisos').select('*').order('created_at', { ascending: false });
        const { data: links } = await supabase.from('links_uteis').select('*').order('display_order');

        modalBody.innerHTML = `
            <h2>Gerenciar Avisos e Links</h2>
            <div class="management-section">
                <h3>Avisos</h3>
                <button class="btn btn-primary btn-sm" data-action="create-aviso">Novo Aviso</button>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Conteúdo</th><th>Expira em</th><th>Ativo</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${avisos.map(a => `
                                <tr data-id="${a.id}">
                                    <td>${a.content.substring(0, 50)}...</td>
                                    <td>${new Date(a.expires_at).toLocaleDateString()}</td>
                                    <td>${a.is_active ? 'Sim' : 'Não'}</td>
                                    <td><button class="btn btn-secondary btn-sm" data-action="edit-aviso">Editar</button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="management-section">
                <h3>Links Úteis</h3>
                <button class="btn btn-primary btn-sm" data-action="create-link">Novo Link</button>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Título</th><th>URL</th><th>Ordem</th><th>Ações</th></tr></thead>
                        <tbody>
                            ${links.map(l => `
                                <tr data-id="${l.id}">
                                    <td>${l.title}</td>
                                    <td>${l.url.substring(0, 30)}...</td>
                                    <td>${l.display_order}</td>
                                    <td><button class="btn btn-secondary btn-sm" data-action="edit-link">Editar</button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        this.hideLoader();
        document.getElementById('modal-container').classList.add('active');

        modalBody.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            const id = e.target.closest('tr')?.dataset.id;

            if (action === 'create-aviso' || action === 'edit-aviso') {
                const aviso = action === 'edit-aviso' ? avisos.find(a => a.id === id) : null;
                this.renderAvisoForm(aviso);
            }
            if (action === 'create-link' || action === 'edit-link') {
                const link = action === 'edit-link' ? links.find(l => l.id === id) : null;
                this.renderLinkForm(link);
            }
        });
    },

    renderAvisoForm(aviso = null) {
        const modalBody = document.getElementById('modal-body');
        const expiresDate = aviso ? new Date(aviso.expires_at).toISOString().split('T')[0] : '';
        modalBody.innerHTML = `
            <h2>${aviso ? 'Editar' : 'Novo'} Aviso</h2>
            <form id="aviso-form">
                <input type="hidden" id="avisoId" value="${aviso?.id || ''}">
                <div class="form-group">
                    <label for="avisoContent">Conteúdo</label>
                    <textarea id="avisoContent" required>${aviso?.content || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="avisoExpires">Data de Expiração</label>
                    <input type="date" id="avisoExpires" value="${expiresDate}" required>
                </div>
                <div class="form-group">
                    <input type="checkbox" id="avisoActive" ${aviso?.is_active ?? true ? 'checked' : ''}>
                    <label for="avisoActive">Ativo</label>
                </div>
                <button type="submit" class="btn btn-primary">Salvar</button>
                <button type="button" class="btn btn-secondary" id="back-to-management">Voltar</button>
            </form>
        `;
        document.getElementById('aviso-form').addEventListener('submit', this.handleAvisoSubmit.bind(this));
        document.getElementById('back-to-management').addEventListener('click', () => this.renderManagementModal());
    },

    async handleAvisoSubmit(e) {
        e.preventDefault();
        this.showLoader();
        const form = e.target;
        const data = {
            content: form.avisoContent.value,
            expires_at: form.avisoExpires.value,
            is_active: form.avisoActive.checked
        };
        const id = form.avisoId.value;
        const { error } = id
            ? await supabase.from('avisos').update(data).eq('id', id)
            : await supabase.from('avisos').insert(data);

        if (error) {
            alert('Erro ao salvar aviso: ' + error.message);
        } else {
            await this.renderManagementModal();
            this.renderHome();
        }
        this.hideLoader();
    },

    renderLinkForm(link = null) {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2>${link ? 'Editar' : 'Novo'} Link Útil</h2>
            <form id="link-form">
                <input type="hidden" id="linkId" value="${link?.id || ''}">
                <div class="form-group">
                    <label for="linkTitle">Título</label>
                    <input type="text" id="linkTitle" value="${link?.title || ''}" required>
                </div>
                <div class="form-group">
                    <label for="linkUrl">URL</label>
                    <input type="url" id="linkUrl" value="${link?.url || ''}" required>
                </div>
                <div class="form-group">
                    <label for="linkOrder">Ordem de Exibição</label>
                    <input type="number" id="linkOrder" value="${link?.display_order || 0}" required>
                </div>
                <button type="submit" class="btn btn-primary">Salvar</button>
                <button type="button" class="btn btn-secondary" id="back-to-management">Voltar</button>
            </form>
        `;
        document.getElementById('link-form').addEventListener('submit', this.handleLinkSubmit.bind(this));
        document.getElementById('back-to-management').addEventListener('click', () => this.renderManagementModal());
    },

    async handleLinkSubmit(e) {
        e.preventDefault();
        this.showLoader();
        const form = e.target;
        const data = {
            title: form.linkTitle.value,
            url: form.linkUrl.value,
            display_order: parseInt(form.linkOrder.value)
        };
        const id = form.linkId.value;
        const { error } = id
            ? await supabase.from('links_uteis').update(data).eq('id', id)
            : await supabase.from('links_uteis').insert(data);

        if (error) {
            alert('Erro ao salvar link: ' + error.message);
        } else {
            await this.renderManagementModal();
        }
        this.hideLoader();
    },

    async updateDashboardStats() {
        const { data, error } = await supabase.rpc('get_dashboard_stats');
        if (error) {
            console.error("Erro ao buscar estatísticas do dashboard:", error);
        } else if (data) {
            const pendingEl = document.getElementById('widget-pending-count');
            if (pendingEl) pendingEl.textContent = data.pending_proofs;
            const confirmedEl = document.getElementById('widget-confirmed-count');
            if (confirmedEl) confirmedEl.textContent = data.confirmed_proofs;
            const faturadoEl = document.getElementById('widget-faturado-count');
            if (faturadoEl) faturadoEl.textContent = data.faturado_proofs;
        }

        if (this.userProfile.roles.includes('VENDEDOR') && this.userProfile.seller_id_erp) {
            const creditCountEl = document.getElementById('widget-vendedor-creditos-count');
            if (creditCountEl) {
                const { data: creditData, error: creditError } = await supabase.rpc('get_vendedor_credit_stats', {
                    p_seller_id: this.userProfile.seller_id_erp
                });
                creditCountEl.textContent = creditError ? 'Erro' : creditData;
            }

            const solicitacoesCountEl = document.getElementById('widget-vendedor-solicitacoes-count');
            if (solicitacoesCountEl) {
                const { data: reqData, error: reqError } = await supabase.rpc('get_vendedor_pending_requests_count', {
                    p_requester_id: this.userProfile.id
                });
                solicitacoesCountEl.textContent = reqError ? 'Erro' : reqData;
            }
        }
    },

    subscribeToDashboardChanges() {
        if (this.dashboardChannel) return;
        
        const handleDbChange = (payload) => {
            console.log('Mudança no banco de dados detectada:', payload.table);
            this.updateDashboardStats();
        };

        this.dashboardChannel = supabase
            .channel('dashboard-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proofs' }, handleDbChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'credits' }, handleDbChange)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'dc_requests' }, handleDbChange)
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
