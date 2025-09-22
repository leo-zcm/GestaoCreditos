const auth = {
    user: null,

    init() {
        const userData = sessionStorage.getItem('user');
        if (userData) {
            this.user = JSON.parse(userData);
            return true;
        }
        return false;
    },

    async login(username, password) {
        // Esta parte recebe o resultado da API
        const { data, error } = await api.login(username, password);

        // --- CORREÇÃO AQUI ---
        // Se a API retornou um objeto de erro, nós simplesmente o lançamos.
        // Não tentamos mais inspecionar o objeto 'data', que será nulo neste caso.
        if (error) {
            throw new Error(error.message || 'Usuário ou senha inválidos.');
        }
        // ---------------------

        // Se o código chegou até aqui, significa que não houve erro e 'data' é válido.
        this.user = data.user;
        sessionStorage.setItem('user', JSON.stringify(this.user));
        return true;
    },

    logout() {
        this.user = null;
        sessionStorage.removeItem('user');
        window.location.hash = '';
        window.location.reload();
    },

    getCurrentUser() {
        return this.user;
    },

    hasPermission(module, action) {
        if (!this.user || !this.user.permissoes) return false;
        // A permissão de admin sobrepõe todas as outras
        if (this.user.permissoes.admin === true || (this.user.permissoes.admin && this.user.permissoes.admin.gerenciar_usuarios)) return true;
        
        return this.user.permissoes[module] && this.user.permissoes[module][action];
    },

    hasRole(role) {
        return this.user && this.user.funcoes && this.user.funcoes.includes(role);
    }
};
