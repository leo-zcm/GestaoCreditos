const auth = {
    user: null, // Armazenará os dados da nossa tabela 'usuarios' (com funções e permissões)

    async init() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            // Se há uma sessão ativa, buscamos nosso perfil customizado
            const { data: userData, error } = await supabaseClient
                .from('usuarios')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (userData) {
                this.user = userData;
                return true;
            }
        }
        // Se não há sessão ou perfil, limpa tudo
        this.user = null;
        return false;
    },

    async login(username, password) {
        // Passo 1: Buscar o email correspondente ao username
        const { data: email, error: emailError } = await api.getEmailByUsername(username);

        if (emailError || !email) {
            throw new Error('Usuário ou senha inválidos.');
        }

        // Passo 2: Tentar fazer o login com o email e senha usando o Supabase Auth
        const { data: sessionData, error: signInError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (signInError) {
            throw new Error('Usuário ou senha inválidos.');
        }

        if (sessionData.user) {
            // Passo 3: Se o login foi bem-sucedido, buscar nosso perfil customizado
            const { data: userData, error: userError } = await supabaseClient
                .from('usuarios')
                .select('*')
                .eq('id', sessionData.user.id)
                .single();
            
            if (userError) {
                // Se deu erro aqui, algo está muito errado (ex: perfil não existe)
                await this.logout(); // Desloga por segurança
                throw new Error('Falha ao carregar dados do perfil do usuário.');
            }
            
            this.user = userData;
            return true;
        }

        return false;
    },

    async logout() {
        await supabaseClient.auth.signOut();
        this.user = null;
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
