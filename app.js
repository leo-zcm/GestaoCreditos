// app.js (VERSÃO CORRIGIDA)

// Objeto principal da aplicação
const App = {
    userProfile: null,
    initialized: false,

    // Inicializa o app com o perfil do usuário
    init(userProfile) {
        if (this.initialized) {
            console.warn("App já inicializado, ignorando chamada duplicada.");
            return;
        }

        this.userProfile = userProfile;
        this.initialized = true;

        console.log("Aplicação iniciada com usuário:", userProfile);

        // Exemplo: carregar dados iniciais
        this.loadDashboard();
        this.setupEventListeners();
    },

    // Carregar informações iniciais do dashboard
    async loadDashboard() {
        try {
            this.showLoader();

            // Exemplo: buscar pedidos, notificações ou dados do usuário
            const { data, error } = await supabase
                .from("pedidos")
                .select("*")
                .eq("user_id", this.userProfile.id);

            if (error) throw error;

            console.log("Pedidos carregados:", data);

            // Aqui você pode popular a UI com os dados
            const container = document.getElementById("dashboard-content");
            if (container) {
                container.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
            }

        } catch (err) {
            console.error("Erro ao carregar dashboard:", err.message);
            this.handleSessionError();
        } finally {
            this.hideLoader();
        }
    },

    // Eventos da interface
    setupEventListeners() {
        // Exemplo: botão para recarregar dados
        const reloadBtn = document.getElementById("reload-dashboard");
        if (reloadBtn) {
            reloadBtn.addEventListener("click", () => this.loadDashboard());
        }
    },

    // Mostra loader
    showLoader() {
        const loader = document.getElementById("loader");
        if (loader) loader.classList.add("active");
    },

    // Esconde loader
    hideLoader() {
        const loader = document.getElementById("loader");
        if (loader) loader.classList.remove("active");
    },

    // Tratamento de sessão inválida
    async handleSessionError() {
        console.warn("Sessão inválida ou expirada. Retornando para tela de login.");

        // Deslogar usuário e voltar para login
        await supabase.auth.signOut();

        const appScreen = document.getElementById("app-screen");
        const loginScreen = document.getElementById("login-screen");

        if (appScreen) appScreen.style.display = "none";
        if (loginScreen) loginScreen.classList.add("active");

        this.hideLoader();
        this.initialized = false;
        this.userProfile = null;
    }
};

// Verificação inicial quando a página carregar
document.addEventListener("DOMContentLoaded", async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
        console.error("Erro ao recuperar sessão:", error.message);
        App.handleSessionError();
        return;
    }

    if (data.session && data.session.user) {
        const userProfile = await (async () => {
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("id, username, full_name, roles, is_admin, permissions")
                .eq("id", data.session.user.id)
                .single();

            if (profileError) {
                console.error("Erro ao recuperar perfil:", profileError.message);
                return null;
            }
            return profile;
        })();

        if (userProfile) {
            App.init(userProfile);
        } else {
            App.handleSessionError();
        }
    } else {
        console.log("Nenhuma sessão encontrada. Mostrando tela de login.");
        App.handleSessionError();
    }
});
