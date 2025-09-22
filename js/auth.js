// js/auth.js

const auth = {
    user: null,
    token: null,

    init() {
        const sessionData = sessionStorage.getItem('supabase.session');
        if (sessionData) {
            const session = JSON.parse(sessionData);
            this.user = session.user;
            this.token = session.token;
            
            // --- CRÍTICO ---
            // Configura a sessão no cliente Supabase para que todas as futuras
            // chamadas à API sejam autenticadas.
            if (this.token) {
                supabaseClient.auth.setSession({ access_token: this.token, refresh_token: '' });
            }
            return true;
        }
        return false;
    },

    async login(username, password) {
        const { data, error } = await api.login(username, password);

        if (error || !data) {
            console.error('Falha no login:', error);
            throw new Error(error?.message || 'Usuário ou senha inválidos.');
        }

        // --- CRÍTICO ---
        // A API agora deve retornar o usuário e o token
        if (!data.token) {
            console.error("CRÍTICO: A função RPC 'authenticate_user' não retornou um 'token' (JWT).");
            throw new Error('Erro de configuração do servidor. Contate o administrador.');
        }

        this.user = {
            id: data.id,
            nome: data.nome,
            funcoes: data.funcoes,
            permissoes: data.permissoes
            // Não armazene informações sensíveis aqui
        };
        this.token = data.token;

        // Armazena a sessão completa
        const session = { user: this.user, token: this.token };
        sessionStorage.setItem('supabase.session', JSON.stringify(session));

        // Configura a sessão no cliente Supabase
        supabaseClient.auth.setSession({ access_token: this.token, refresh_token: '' });
        
        return true;
    },

    logout() {
        this.user = null;
        this.token = null;
        sessionStorage.removeItem('supabase.session');
        supabaseClient.auth.signOut(); // Limpa a sessão do cliente
        window.location.hash = '';
        window.location.reload();
    },

    getCurrentUser() {
        return this.user;
    },

    hasPermission(module, action) {
        if (!this.user || !this.user.permissoes) return false;
        if (this.user.permissoes.admin === true || (this.user.permissoes.admin && this.user.permissoes.admin.gerenciar_usuarios)) return true;
        
        return this.user.permissoes[module] && this.user.permissoes[module][action];
    },

    hasRole(role) {
        return this.user && this.user.funcoes && this.user.funcoes.includes(role);
    }
};
