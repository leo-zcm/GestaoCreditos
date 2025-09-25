// app.js (VERSÃO FINAL COM CORREÇÃO DE SESSÃO)

// Módulos da aplicação
const modules = {
    home: {
        name: 'Home',
        render: (user) => {
            const contentArea = document.getElementById('content-area');
            let homeContent = `
                <div class="card">
                    <h2>Bem-vindo(a), ${user.full_name}!</h2>
                    <p>Selecione um módulo no menu ao lado para começar.</p>
                </div>`;
            
            if (user.roles.includes('VENDEDOR')) {
                homeContent += `<div class="card"><h3>Atalhos do Vendedor</h3><p>...</p></div>`;
            }
            if (user.roles.includes('CAIXA')) {
                homeContent += `<div class="card"><h3>Atalhos do Caixa</h3><p>...</p></div>`;
            }
            if (user.roles.includes('FATURISTA')) {
                homeContent += `<div class="card"><h3>Atalhos do Faturista</h3><p>...</p></div>`;
            }
            
            contentArea.innerHTML = homeContent;
        }
    },
    comprovantes: {
        name: 'Comprovantes',
        render: () => { document.getElementById('content-area').innerHTML = '<div class="card"><h2>Módulo de Comprovantes</h2></div>'; }
    },
    solicitacoes: {
        name: 'Solicitações D/C',
        render: () => { document.getElementById('content-area').innerHTML = '<div class="card"><h2>Módulo de Solicitações D/C</h2></div>'; }
    },
    creditos: {
        name: 'Créditos',
        render: () => { document.getElementById('content-area').innerHTML = '<div class="card"><h2>Módulo de Créditos</h2></div>'; }
    },
    usuarios: UsuariosModule
};


const App = {
    currentUser: null,
    visibilityListenerSetup: false,

    init(userProfile) {
        this.currentUser = userProfile;
        this.setupHeader();
        this.buildSidebar();
        this.setupEventListeners();
        
        this.setupVisibilityListener();

        this.loadModule('home');
    },

    setupHeader() {
        document.getElementById('user-display-name').textContent = this.currentUser.full_name;
    },

    buildSidebar() {
        const nav = document.getElementById('main-nav');
        nav.innerHTML = '';
        const ul = document.createElement('ul');
        const userPermissions = this.currentUser.permissions || {};
        const menuItems = [
            { id: 'home', requiredPermission: true },
            { id: 'comprovantes', requiredPermission: userPermissions.comprovantes?.view },
            { id: 'solicitacoes', requiredPermission: userPermissions.solicitacoes?.view },
            { id: 'creditos', requiredPermission: userPermissions.creditos?.view },
            { id: 'usuarios', requiredPermission: this.currentUser.is_admin }
        ];
        menuItems.forEach(item => {
            if (item.requiredPermission) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#';
                a.dataset.module = item.id;
                a.textContent = modules[item.id].name;
                li.appendChild(a);
                ul.appendChild(li);
            }
        });
        nav.appendChild(ul);
    },

    setupEventListeners() {
        const nav = document.getElementById('main-nav');
        nav.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.dataset.module) {
                e.preventDefault();
                this.loadModule(e.target.dataset.module);
                document.getElementById('sidebar').classList.remove('active');
            }
        });

        const menuToggle = document.getElementById('menu-toggle');
        menuToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });

        const modalContainer = document.getElementById('modal-container');
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer || e.target.closest('.modal-close-btn')) {
                modalContainer.classList.remove('active');
            }
        });
    },

    /**
     * Sets up a listener to re-validate the session when the tab becomes visible.
     * A flag prevents this listener from being added more than once.
     */
    setupVisibilityListener() {
        if (this.visibilityListenerSetup) {
            return; // Do not add the listener again if it's already there.
        }
        
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // supabase.auth.getSession() intelligently refreshes the session
                // if the token is about to expire.
                supabase.auth.getSession();
            }
        });

        this.visibilityListenerSetup = true; // Mark the listener as set up.
    },

    loadModule(moduleId) {
        if (!modules[moduleId]) {
            console.error(`Módulo '${moduleId}' não encontrado.`);
            return;
        }
        document.getElementById('header-title').textContent = modules[moduleId].name;
        const navLinks = document.querySelectorAll('#main-nav a');
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.module === moduleId);
        });
        modules[moduleId].render(this.currentUser);
    }
};
