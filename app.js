// app.js (VERSÃO CORRIGIDA E REFATORADA)

// Objeto principal da aplicação
const App = {
    userProfile: null,
    initialized: false,
    // Módulos disponíveis na aplicação
    modules: {
        usuarios: UsuariosModule,
        // Adicione outros módulos aqui no futuro
        // creditos: CreditosModule, 
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

    // Constrói o menu de navegação com base nas permissões do usuário
    buildNavigation() {
        const nav = document.getElementById('main-nav');
        let navHtml = '<ul>';
        
        // Link Fixo para Home/Início
        navHtml += `<li><a href="#" data-module="home" class="nav-link active">Início</a></li>`;

        // Adiciona módulos com base nas permissões
        // Exemplo: Módulo de Usuários visível apenas para admins
        if (this.userProfile.is_admin) {
             navHtml += `<li><a href="#" data-module="usuarios" class="nav-link">Usuários</a></li>`;
        }

        // Adicione outras verificações de permissão para outros módulos aqui
        // if (this.userProfile.permissions?.creditos?.view) {
        //     navHtml += `<li><a href="#" data-module="creditos" class="nav-link">Créditos</a></li>`;
        // }

        navHtml += '</ul>';
        nav.innerHTML = navHtml;
    },

    // Carrega o conteúdo de um módulo na área principal
    loadModule(moduleName) {
        this.showLoader();
        document.getElementById('header-title').textContent = this.modules[moduleName]?.name || 'Módulo não encontrado';
        
        const module = this.modules[moduleName];
        if (module && typeof module.render === 'function') {
            try {
                module.render(); // O próprio módulo deve gerenciar seu loader interno se precisar
            } catch (error) {
                console.error(`Erro ao renderizar o módulo ${moduleName}:`, error);
                document.getElementById('content-area').innerHTML = `<p class="error-message">Ocorreu um erro ao carregar este módulo.</p>`;
            }
        } else {
            console.warn(`Módulo "${moduleName}" não encontrado ou não possui um método render.`);
            document.getElementById('content-area').innerHTML = ''; // Limpa a área
        }
        // O loader principal é escondido pelo próprio módulo ou aqui se a operação for síncrona
        if(moduleName !== 'usuarios') this.hideLoader();
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
                <!-- Aqui você pode adicionar gráficos, estatísticas rápidas, etc. -->
            </div>
        `;
        this.hideLoader();
    },

    // Configura os ouvintes de eventos da aplicação
    setupEventListeners() {
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menu-toggle');

        // Toggle do menu lateral em telas menores
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });

        // Navegação principal (delegação de evento)
        document.getElementById('main-nav').addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.classList.contains('nav-link')) {
                e.preventDefault();
                
                // Atualiza o link ativo
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
        
        // Fechar modal
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

// REMOVIDO: O listener de DOMContentLoaded foi movido e centralizado no auth.js
// A aplicação agora espera ser iniciada pela chamada App.init() do auth.js
