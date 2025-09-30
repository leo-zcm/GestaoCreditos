// auth.js (VERSÃO FINAL E CORRIGIDA - COM SESSION STORAGE E LÓGICA DE INICIALIZAÇÃO ROBUSTA)

const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";

// <<< MUDANÇA CRÍTICA >>>
// Adicionamos um objeto de opções para forçar o uso do sessionStorage.
// Isso faz com que o login seja encerrado automaticamente ao fechar a aba do navegador.
const supabaseOptions = {
    auth: {
        storage: sessionStorage, // Usa sessionStorage em vez de localStorage
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
};
const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseOptions);

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
    const loginButton = document.getElementById("login-button");
    const logoutButton = document.getElementById("logout-button");
    const loginError = document.getElementById("login-error");
    const loader = document.getElementById("loader");

    // <<< MUDANÇA CRÍTICA >>>
    // Funções de controle de UI simplificadas. O loader agora é o estado padrão.
    const showLoader = () => loader.classList.add("active");
    const hideLoader = () => loader.classList.remove("active");
    
    const showAppScreen = () => {
        appScreen.classList.add("active");
        loginScreen.classList.remove("active");
        hideLoader(); // O loader é escondido apenas quando a tela correta é exibida
    };
    const showLoginScreen = () => {
        loginScreen.classList.add("active");
        appScreen.classList.remove("active");
        hideLoader(); // O loader é escondido apenas quando a tela correta é exibida
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
            loginButton.click();
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
            // <<< MUDANÇA CRÍTICA >>> Não escondemos o loader aqui, deixamos o fluxo continuar
            // para que a tela de login seja exibida corretamente no final.
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
            showLoginScreen(); // Em caso de erro, garante que a tela de login seja exibida
        } 
        // <<< MUDANÇA CRÍTICA >>> O `finally` não é mais necessário aqui, pois
        // `showAppScreen` e `showLoginScreen` já cuidam de esconder o loader.
    };

    // <<< MUDANÇA CRÍTICA >>> Agora o evento é 'submit'
    loginForm.addEventListener("submit", handleLogin);

    logoutButton.addEventListener("click", async () => {
        showLoader();
        await supabase.auth.signOut();
        // O onAuthStateChange cuidará de mostrar a tela de login
    });

    // ===========================================================
    // GERENCIAMENTO DE SESSÃO (AGORA 100% ROBUSTO)
    // ===========================================================
    supabase.auth.onAuthStateChange(async (event, session) => {
        // O loader já está ativo por padrão no carregamento da página.
        // Não precisamos de flags complexas aqui, a lógica é linear.

        if (event === "SIGNED_OUT") {
            App.destroy();
            showLoginScreen();
            return;
        }

        if (session && session.user) {
            // Se já existe uma sessão (ex: F5 na página)
            try {
                if (!App.isInitialized()) {
                    const userProfile = await getUserProfile(session.user.id);
                    if (userProfile) {
                        App.init(userProfile);
                        showAppScreen();
                    } else {
                        // Caso raro: sessão existe mas perfil não foi encontrado
                        console.error("Sessão válida, mas perfil não encontrado. Forçando logout.");
                        await supabase.auth.signOut();
                    }
                } else {
                    // App já inicializado, apenas garante que a tela correta está visível
                    showAppScreen();
                }
            } catch (error) {
                console.error("Erro crítico ao restaurar sessão:", error);
                await supabase.auth.signOut();
            }
        } else {
            // Nenhuma sessão encontrada
            App.destroy();
            showLoginScreen();
        }
    });
});
