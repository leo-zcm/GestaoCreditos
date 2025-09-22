// Arquivo principal que orquestra a aplicação

const routes = {
    '': renderHomePage,
    '#home': renderHomePage,
    '#comprovantes': renderComprovantesPage,
    '#solicitacoes': renderSolicitacoesDcPage, // Você precisará criar esta função
    '#creditos': renderCreditosPage,       // e esta
    '#usuarios': renderUsuariosPage,       // e esta
};

function router() {
    const path = window.location.hash.split('?')[0] || '#home';
    const pageRenderer = routes[path];

    if (pageRenderer) {
        document.getElementById('page-title').innerText = path.replace('#', '').charAt(0).toUpperCase() + path.slice(2) || 'Home';
        pageRenderer();
        updateActiveMenuLink(path);
    } else {
        document.getElementById('main-content').innerHTML = '<h2>Página não encontrada</h2>';
    }
}

function updateActiveMenuLink(path) {
    document.querySelectorAll('#menu-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
    });
}

function buildMenu() {
    const menu = document.getElementById('menu-links');
    let menuHtml = '<li><a href="#home">Home</a></li>';

    if (auth.hasPermission('comprovantes', 'ver')) {
        menuHtml += '<li><a href="#comprovantes">Comprovantes</a></li>';
    }
    if (auth.hasPermission('solicitacoes', 'ver')) {
        menuHtml += '<li><a href="#solicitacoes">Solicitações D/C</a></li>';
    }
    if (auth.hasPermission('creditos', 'ver')) {
        menuHtml += '<li><a href="#creditos">Créditos</a></li>';
    }
    if (auth.hasPermission('admin', 'gerenciar_usuarios')) { // Permissão especial para admin
        menuHtml += '<li><a href="#usuarios">Usuários</a></li>';
    }
    
    menu.innerHTML = menuHtml;
}

async function initApp() {
    if (auth.init()) {
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        
        const user = auth.getCurrentUser();
        document.getElementById('user-name').innerText = user.nome;
        
        buildMenu();
        
        window.addEventListener('hashchange', router);
        router(); // Roda o roteador na carga inicial
    } else {
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    }
}

// Event Listeners
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
        await auth.login(username, password);
        initApp();
    } catch (error) {
        errorEl.textContent = 'Usuário ou senha inválidos.';
        console.error(error);
    }
});

document.getElementById('logout-btn').addEventListener('click', auth.logout);

// Inicia a aplicação
initApp();
