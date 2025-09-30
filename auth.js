// auth.js (VERSÃO FINAL E CORRIGIDA - COM LOGOUT FORÇADO NO REFRESH)

const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";

const supabaseOptions = {
    auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
};
const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseOptions);

// <<< MUDANÇA CRÍTICA: LOGOUT AUTOMÁTICO AO RECARREGAR A PÁGINA >>>
// Adicionamos um event listener para o evento 'beforeunload'.
// Este evento dispara quando o usuário tenta fechar a aba ou recarregar a página.
// Ao chamar signOut() aqui, garantimos que a sessão seja limpa ANTES da página recarregar.
// O `localStorage.clear()` é uma garantia extra para limpar qualquer resquício.
window.addEventListener('beforeunload', (event) => {
    // Importante: Não podemos usar 'await' aqui. A ação deve ser síncrona.
    supabase.auth.signOut();
    // Apenas para garantir, limpamos o sessionStorage explicitamente.
    sessionStorage.clear();
});


async function getUserProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, roles, is_admin, permissions, seller_id_erp")
            .eq("id", userId)
            .single();

        if (error) throw error;
        return profile;
    } catch (error) {
        console.error("Erro ao buscar perfil do usuário:", error.message);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    const loginForm = document.getElementById("login-form");
    const logoutButton = document.getElementById("logout-button");
    const loginError = document.getElementById("login-error");
    const loader = document.getElementById("loader");

    const showLoader = () => loader.classList.add("active");
    const hideLoader = () => loader.classList.remove("active");
    
    const showAppScreen = () => {
        appScreen.classList.add("active");
        loginScreen.classList.remove("active");
        hideLoader();
    };
    const showLoginScreen = () => {
        loginScreen.classList.add("active");
        appScreen.classList.remove("active");
        hideLoader();
    };

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    usernameInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
    usernameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            passwordInput.focus();
        }
    });
    passwordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            document.getElementById("login-button").click();
        }
    });

    const handleLogin = async (event) => {
        if (event) event.preventDefault();
        showLoader();
        loginError.textContent = "";

        const username = usernameInput.value.toUpperCase();
        const password = passwordInput.value;

        if (!username || !password) {
            loginError.textContent = "Usuário e senha são obrigatórios.";
            showLoginScreen(); 
            return;
        }

        try {
            const { data: emailData, error: rpcError } = await supabase.rpc(
                "get_email_by_username",
                { p_username: username }
            );
            if (rpcError || !emailData) throw new Error("Usuário não encontrado.");

            const { data: signInData, error: signInError } =
                await supabase.auth.signInWithPassword({
                    email: emailData,
                    password,
                });

            if (signInError) throw new Error("Usuário ou senha inválidos.");
            if (!signInData.user)
                throw new Error("Falha na autenticação. Tente novamente.");

            const userProfile = await getUserProfile(signInData.user.id);
            if (!userProfile) throw new Error("Perfil de usuário não encontrado.");

            App.init(userProfile);
            showAppScreen();
        } catch (error) {
            console.error("Erro no processo de login:", error.message);
            loginError.textContent = error.message;
            showLoginScreen();
        } 
    };

    loginForm.addEventListener("submit", handleLogin);

    logoutButton.addEventListener("click", async () => {
        showLoader();
        await supabase.auth.signOut();
    });

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === "SIGNED_OUT") {
            App.destroy();
            showLoginScreen();
            return;
        }

        if (session && session.user) {
            try {
                if (!App.isInitialized()) {
                    const userProfile = await getUserProfile(session.user.id);
                    if (userProfile) {
                        App.init(userProfile);
                        showAppScreen();
                    } else {
                        console.error("Sessão válida, mas perfil não encontrado. Forçando logout.");
                        await supabase.auth.signOut();
                    }
                } else {
                    showAppScreen();
                }
            } catch (error) {
                console.error("Erro crítico ao restaurar sessão:", error);
                await supabase.auth.signOut();
            }
        } else {
            App.destroy();
            showLoginScreen();
        }
    });
});
