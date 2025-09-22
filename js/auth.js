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
        const { data, error } = await api.login(username, password);

        if (error || !data.user) {
            throw new Error(data.error || 'Falha no login.');
        }

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
        if (this.user.permissoes.admin === true) return true;
        
        return this.user.permissoes[module] && this.user.permissoes[module][action];
    },

    hasRole(role) {
        return this.user && this.user.funcoes && this.user.funcoes.includes(role);
    }
};
