// app.js (VERSÃO COM GERENCIADOR DE WIDGETS NA HOME)

const App = {
    userProfile: null,
    initialized: false,
    dashboardChannel: null,
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

    isInitialized() { return this.initialized; },

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
        const contentArea = document.getElementById('content-area');
        const userRoles = this.userProfile.roles || [];

        // <<< ALTERAÇÃO AQUI: Adiciona o botão de gerenciamento se houver permissão >>>
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
        this.hideLoader();
    },

    // ... (As funções _render...Dashboard permanecem as mesmas) ...
    async _renderVendedorDashboard() { /* ...código inalterado... */ },
    _renderCaixaDashboard() { /* ...código inalterado... */ },
    _renderFinanceiroDashboard() { /* ...código inalterado... */ },
    _renderFaturistaDashboard() { /* ...código inalterado... */ },
    _renderGarantiaDashboard() { /* ...código inalterado... */ },

    setupHomeEventListeners() {
        const contentArea = document.getElementById('content-area');
        
        const addProofBtn = contentArea.querySelector('#home-add-proof');
        if (addProofBtn) {
            addProofBtn.addEventListener('click', () => {
                this.modules.comprovantes.renderProofModal();
            });
        }
        
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

        // <<< NOVO: Listener para o botão de gerenciamento >>>
        const manageWidgetsBtn = contentArea.querySelector('#btn-manage-widgets');
        if (manageWidgetsBtn) {
            manageWidgetsBtn.addEventListener('click', () => this.renderManagementModal());
        }
    },

    // <<< NOVO: Modal completo para gerenciar Avisos e Links >>>
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

        // Adiciona listeners para os botões dentro do modal
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
            this.renderHome(); // Re-renderiza a home para atualizar a lista de avisos
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

    // ... (O restante do App.js: updateDashboardStats, subscribe, etc., permanece o mesmo) ...
    async updateDashboardStats() { /* ...código inalterado... */ },
    subscribeToDashboardChanges() { /* ...código inalterado... */ },
    unsubscribeFromDashboardChanges() { /* ...código inalterado... */ },
    setupEventListeners() { /* ...código inalterado... */ },
    showLoader() { document.getElementById('loader').classList.add('active'); },
    hideLoader() { document.getElementById('loader').classList.remove('active'); },
};
