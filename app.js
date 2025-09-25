// app.js (VERSÃO CORRIGIDA E FINAL)

// Objeto principal da aplicação
const App = {
    userProfile: null,
    initialized: false,
    // Módulos disponíveis na aplicação
    modules: {
        usuarios: UsuariosModule,
        // Adicione outros módulos aqui no futuro
        // creditos: CreditosModule, 
        // comprovantes: ComprovantesModule,
    },

    // Mapeamento de módulos para suas permissões de visualização
    modulePermissions: {
        usuarios: (user) => user.is_admin,
        creditos: (user) => user.permissions?.creditos?.view,
        comprovantes: (user) => user.permissions?.comprovantes?.view,
        solicitacoes: (user) => user.permissions?.solicitacoes?.view,
    },

    // Verifica se o app já foi inicializado
    isInitialized() {
        return this.initialized;
    },

    // Inicializa o app com o perfil do usuário
    init(userProfile) {
        if (this.initialized) {
            console.warn("App já inicializado, ignorando chamada duplicada.");
            return;
        }
        this.userProfile = userProfile;
        this.initialized = true;

        console.log("Aplicação iniciada com o perfil:", userProfile);

        this.renderLayout();
        this.setupEventListeners();
        this.renderHome(); // Carrega a tela inicial/dashboard
    },

    // Limpa o estado da aplicação ao deslogar
    destroy() {
        this.userProfile = null;
        this.initialized = false;
        console.log("Estado da aplicação limpo.");
    },

    // Renderiza os componentes fixos da UI (header, sidebar)
    renderLayout() {
        document.getElementById('user-display-name').textContent = this.userProfile.full_name || this.userProfile.username;
        this.buildNavigation();
    },

    // ==================================================================
    // CORREÇÃO 1: LÓGICA DE NAVEGAÇÃO DINÂMICA
    // ==================================================================
    // Constrói o menu de navegação com base nas permissões do usuário
    buildNavigation() {
        const nav = document.getElementById('main-nav');
        let navHtml = '<ul>';
        
        // Link Fixo para Home/Início
        navHtml += `<li><a href="#" data-module="home" class="nav-link active">Início</a></li>`;

        // Itera sobre as permissões de módulo para construir o menu
        for (const moduleName in this.modulePermissions) {
            const hasPermission = this.modulePermissions[moduleName](this.userProfile);
            
            if (hasPermission) {
                // Tenta obter o nome do módulo do objeto do módulo, se existir
                const moduleDisplayName = this.modules[moduleName]?.name || 
                                          moduleName.charAt(0).toUpperCase() + moduleName.slice(1); // Fallback
                navHtml += `<li><a href="#" data-module="${moduleName}" class="nav-link">${moduleDisplayName}</a></li>`;
            }
        }

        navHtml += '</ul>';
        nav.innerHTML = navHtml;
    },

    // ==================================================================
    // CORREÇÃO 2: GERENCIAMENTO DE LOADER SIMPLIFICADO
    // ==================================================================
    // Carrega o conteúdo de um módulo na área principal
    async loadModule(moduleName) {
        this.showLoader(); // Apenas MOSTRA o loader. O módulo é responsável por escondê-lo.
        
        const module = this.modules[moduleName];
        if (module && typeof module.render === 'function') {
            document.getElementById('header-title').textContent = module.name || 'Módulo';
            try {
                // A função render do módulo agora é responsável por todo o fluxo,
                // incluindo esconder o loader quando terminar.
                await module.render(); 
            } catch (error) {
                console.error(`Erro ao renderizar o módulo ${moduleName}:`, error);
                document.getElementById('content-area').innerHTML = `<p class="error-message">Ocorreu um erro ao carregar este módulo.</p>`;
                this.hideLoader(); // Esconde o loader em caso de erro na renderização
            }
        } else {
            console.warn(`Módulo "${moduleName}" não encontrado ou não possui um método render.`);
            document.getElementById('content-area').innerHTML = `<p>Módulo em desenvolvimento.</p>`;
            this.hideLoader(); // Esconde o loader se o módulo não for encontrado
        }
    },

    // Renderiza o conteúdo da tela inicial
    renderHome() {
        this.showLoader();
        document.getElementById('header-title').textContent = 'Início';
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="card">
                <h2>Bem-vindo, ${this.userProfile.full_name}!</h2>
                <p>Selecione uma opção no menu ao lado para começar.</p>
            </div>
        `;
        this.hideLoader();
    },

    // Configura os ouvintes de eventos da aplicação
    setupEventListeners() {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menu-toggle');

        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });

        document.getElementById('main-nav').addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.classList.contains('nav-link')) {
                e.preventDefault();
                
                document.querySelectorAll('#main-nav .nav-link').forEach(link => link.classList.remove('active'));
                e.target.classList.add('active');

                const moduleName = e.target.dataset.module;
                if (moduleName === 'home') {
                    this.renderHome();
                } else {
                    this.loadModule(moduleName);
                }
            }
        });
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer || e.target.classList.contains('modal-close-btn')) {
                modalContainer.classList.remove('active');
            }
        });
    },

    // Funções utilitárias
    showLoader() {
        document.getElementById('loader').classList.add('active');
    },

    hideLoader() {
        document.getElementById('loader').classList.remove('active');
    },
};
