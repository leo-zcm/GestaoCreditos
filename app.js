// app.js (VERSÃO CORRIGIDA E FINAL)

// Objeto principal da aplicação
const App = {
    userProfile: null,
    initialized: false,
    modules: {
        usuarios: UsuariosModule,
        comprovantes: ComprovantesModule,
        // creditos: CreditosModule,
        // solicitacoes: SolicitacoesModule,
    },

    // ==================================================================
    // CORREÇÃO 1: ORDEM DO MENU E CONFIGURAÇÃO CENTRALIZADA
    // Usamos um Array para garantir a ordem de exibição no menu e nos widgets.
    // ==================================================================
    moduleConfig: [
        {
            key: 'comprovantes',
            name: 'Comprovantes',
            permissionCheck: (user) => user.permissions?.comprovantes?.view
        },
        {
            key: 'creditos',
            name: 'Créditos',
            permissionCheck: (user) => user.permissions?.creditos?.view
        },
        {
            key: 'solicitacoes',
            name: 'Solicitações D/C',
            permissionCheck: (user) => user.permissions?.solicitacoes?.view
        },
        {
            key: 'usuarios',
            name: 'Usuários',
            permissionCheck: (user) => user.is_admin
        }
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

        // Itera sobre o Array de configuração para garantir a ordem
        this.moduleConfig.forEach(config => {
            if (config.permissionCheck(this.userProfile)) {
                navHtml += `<li><a href="#" data-module="${config.key}" class="nav-link">${config.name}</a></li>`;
            }
        });

        navHtml += '</ul>';
        nav.innerHTML = navHtml;
    },

    // ==================================================================
    // CORREÇÃO 3: CONTROLE DO LOADER CENTRALIZADO
    // Esta função agora controla o início e o fim do loader, resolvendo o bug.
    // ==================================================================
    async loadModule(moduleName) {
        this.showLoader();
        try {
            const module = this.modules[moduleName];
            const moduleConf = this.moduleConfig.find(m => m.key === moduleName);
            document.getElementById('header-title').textContent = moduleConf?.name || 'Módulo';

            if (module && typeof module.render === 'function') {
                await module.render(); // Espera a renderização do módulo terminar
            } else {
                console.warn(`Módulo "${moduleName}" não implementado ou não encontrado.`);
                document.getElementById('content-area').innerHTML = `<div class="card"><p>O módulo <strong>${moduleConf.name}</strong> está em desenvolvimento.</p></div>`;
            }
        } catch (error) {
            console.error(`Erro ao renderizar o módulo ${moduleName}:`, error);
            document.getElementById('content-area').innerHTML = `<div class="card error-message">Ocorreu um erro grave ao carregar este módulo.</div>`;
        } finally {
            this.hideLoader(); // Garante que o loader seja escondido, não importa o que aconteça.
        }
    },

    // ==================================================================
    // CORREÇÃO 2: WIDGETS DA HOME RESTAURADOS
    // ==================================================================
    renderHome() {
        this.showLoader();
        document.getElementById('header-title').textContent = 'Início';
        const contentArea = document.getElementById('content-area');
        
        let widgetsHtml = this.moduleConfig
            .filter(config => config.permissionCheck(this.userProfile))
            .map(config => `
                <div class="home-widget" data-module="${config.key}">
                    <h3>${config.name}</h3>
                    <p>Acessar o módulo de ${config.name.toLowerCase()}.</p>
                </div>
            `).join('');

        contentArea.innerHTML = `
            <div class="card">
                <h2>Bem-vindo, ${this.userProfile.full_name}!</h2>
                <p>Selecione um atalho abaixo ou use o menu ao lado para começar.</p>
            </div>
            <div class="widgets-container">
                ${widgetsHtml || '<p>Você não tem permissão para acessar nenhum módulo.</p>'}
            </div>
        `;

        // Adiciona estilo para os widgets (opcional, mas recomendado)
        const styleId = 'home-widgets-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                .widgets-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
                .home-widget { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: var(--shadow); cursor: pointer; transition: all 0.2s ease; border-left: 4px solid var(--primary-color); }
                .home-widget:hover { transform: translateY(-5px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                .home-widget h3 { margin-bottom: 0.5rem; color: var(--primary-color); }
            `;
            document.head.appendChild(style);
        }

        // Adiciona eventos de clique para os widgets
        document.querySelectorAll('.home-widget').forEach(widget => {
            widget.addEventListener('click', () => {
                const moduleName = widget.dataset.module;
                // Simula o clique no link do menu correspondente
                const navLink = document.querySelector(`#main-nav a[data-module="${moduleName}"]`);
                if (navLink) {
                    navLink.click();
                }
            });
        });

        this.hideLoader();
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
        
        // LÓGICA DE FECHAMENTO DO MODAL ATUALIZADA
        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer || e.target.classList.contains('modal-close-btn')) {
                // Verifica se o módulo de comprovantes tem uma função de limpeza e a chama
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
