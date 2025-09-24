// app.js:

// Módulos da aplicação (serão substituídos pelos arquivos reais)
// Por enquanto, são funções que renderizam conteúdo placeholder.
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
            
            // Personalização do Home com base na role do usuário
            if (user.roles.includes('VENDEDOR')) {
                homeContent += `
                    <div class="card"><h3>Atalhos do Vendedor</h3><p>Atalho de busca de cliente, novo D/C, etc.</p></div>
                    <div class="card"><h3>Avisos</h3><p>Nenhum aviso no momento.</p></div>
                `;
            }
             if (user.roles.includes('CAIXA')) {
                homeContent += `<div class="card"><h3>Atalhos do Caixa</h3><p>Botão de Inserir Novo Pagamento, etc.</p></div>`;
            }
             if (user.roles.includes('FATURISTA')) {
                homeContent += `<div class="card"><h3>Atalhos do Faturista</h3><p>Cards de pagamentos confirmados e solicitações pendentes.</p></div>`;
            }
            
            contentArea.innerHTML = homeContent;
        }
    },
    comprovantes: {
        name: 'Comprovantes',
        render: () => {
            document.getElementById('content-area').innerHTML = '<div class="card"><h2>Módulo de Comprovantes</h2><p>Conteúdo do módulo de comprovantes será carregado aqui...</p></div>';
        }
    },
    solicitacoes: {
        name: 'Solicitações D/C',
        render: () => {
            document.getElementById('content-area').innerHTML = '<div class="card"><h2>Módulo de Solicitações D/C</h2><p>Conteúdo do módulo de solicitações será carregado aqui...</p></div>';
        }
    },
    creditos: {
        name: 'Créditos',
        render: () => {
            document.getElementById('content-area').innerHTML = '<div class="card"><h2>Módulo de Créditos</h2><p>Conteúdo do módulo de créditos será carregado aqui...</p></div>';
        }
    },
    usuarios: UsuariosModule
};


const App = {
    // Para armazenar dados do usuário logado
    currentUser: null,

    /**
     * Ponto de entrada da aplicação. Chamado por auth.js após login bem-sucedido.
     * @param {object} userProfile - O objeto do usuário com perfil e permissões.
     */
    init(userProfile) {
        this.currentUser = userProfile;
        this.setupHeader();
        this.buildSidebar();
        this.setupEventListeners();
        
        // Carrega a página inicial por padrão
        this.loadModule('home');
    },

    /**
     * Configura o cabeçalho com informações do usuário.
     */
    setupHeader() {
        document.getElementById('user-display-name').textContent = this.currentUser.full_name;
    },

    /**
     * Constrói o menu lateral dinamicamente com base nas permissões do usuário.
     */
    buildSidebar() {
        const nav = document.getElementById('main-nav');
        nav.innerHTML = ''; // Limpa o menu
        const ul = document.createElement('ul');

        const menuItems = [
            { id: 'home', requiredPermission: true }, // Home sempre visível
            { id: 'comprovantes', requiredPermission: this.currentUser.permissions?.comprovantes?.view },
            { id: 'solicitacoes', requiredPermission: this.currentUser.permissions?.solicitacoes?.view },
            { id: 'creditos', requiredPermission: this.currentUser.permissions?.creditos?.view },
            { id: 'usuarios', requiredPermission: this.currentUser.is_admin } // Apenas para admins
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

    /**
     * Configura os ouvintes de eventos globais da aplicação.
     */
    setupEventListeners() {
        // Delegação de eventos para os links de navegação
        const nav = document.getElementById('main-nav');
        nav.addEventListener('click', (e) => {
            if (e.target.tagName === 'A' && e.target.dataset.module) {
                e.preventDefault();
                this.loadModule(e.target.dataset.module);
                
                // Em telas pequenas, esconde o menu após o clique
                document.getElementById('sidebar').classList.remove('active');
            }
        });

        // Botão de toggle para o menu em modo responsivo
        const menuToggle = document.getElementById('menu-toggle');
        menuToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('active');
        });
    },

    /**
     * Carrega o conteúdo de um módulo na área principal.
     * @param {string} moduleId - O ID do módulo a ser carregado ('home', 'comprovantes', etc.).
     */
    loadModule(moduleId) {
        if (!modules[moduleId]) {
            console.error(`Módulo '${moduleId}' não encontrado.`);
            return;
        }

        // Atualiza o título do cabeçalho
        document.getElementById('header-title').textContent = modules[moduleId].name;

        // Atualiza o link ativo no menu lateral
        const navLinks = document.querySelectorAll('#main-nav a');
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.module === moduleId);
        });

        // Renderiza o conteúdo do módulo
        // Passamos o usuário atual para o render, caso ele precise
        modules[moduleId].render(this.currentUser);
    }
};
