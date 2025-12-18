// auth.js (VERSÃO CORRIGIDA - COM VERIFICAÇÃO EXPLÍCITA DE SESSÃO)

const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";

const supabaseOptions = {
    auth: {
        storage: sessionStorage, // Mantém a sessão apenas enquanto a aba estiver aberta
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    },
};

// Verifica se o script do Supabase carregou corretamente
if (typeof self.supabase === 'undefined') {
    alert("Erro crítico: A biblioteca do Supabase não foi carregada. Verifique sua conexão ou o bloqueio de scripts.");
}

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseOptions);

// <<< CORREÇÃO DO LOGOUT NO REFRESH >>>
// O signOut() é uma promessa assíncrona e navegadores cancelam requisições no unload.
// Para forçar logout no refresh, basta limpar o storage. O Supabase não achará a sessão na próxima carga.
window.addEventListener('beforeunload', () => {
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

document.addEventListener("DOMContentLoaded", async () => {
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    const loginForm = document.getElementById("login-form");
    const logoutButton = document.getElementById("logout-button");
    const loginError = document.getElementById("login-error");
    const loader = document.getElementById("loader");

    // Funções de UI
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

    // Inputs
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    // Eventos de Input
    if (usernameInput) {
        usernameInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
        usernameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                passwordInput.focus();
            }
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                document.getElementById("login-button").click();
            }
        });
    }

    // Lógica de Login
    const handleLogin = async (event) => {
        if (event) event.preventDefault();
        showLoader();
        loginError.textContent = "";

        const username = usernameInput.value.toUpperCase();
        const password = passwordInput.value;

        if (!username || !password) {
            loginError.textContent = "Usuário e senha são obrigatórios.";
            hideLoader(); // Garante que o loader some se der erro de validação
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
            if (!signInData.user) throw new Error("Falha na autenticação.");

            // O redirecionamento acontecerá via verificação de sessão ou listener
            // Mas podemos chamar initSession aqui para garantir resposta rápida
            await initSession(signInData.user);

        } catch (error) {
            console.error("Erro no login:", error.message);
            loginError.textContent = error.message;
            // Não chame showLoginScreen() aqui pois ele reseta a tela, apenas esconda o loader
            hideLoader();
        } 
    };

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            showLoader();
            await supabase.auth.signOut();
            App.destroy();
            showLoginScreen();
        });
    }

    // Função centralizada para iniciar a sessão
    const initSession = async (user) => {
        try {
            if (!App.isInitialized()) {
                const userProfile = await getUserProfile(user.id);
                if (userProfile) {
                    App.init(userProfile);
                    showAppScreen();
                } else {
                    throw new Error("Perfil não encontrado.");
                }
            } else {
                showAppScreen();
            }
        } catch (error) {
            console.error("Erro ao iniciar sessão:", error);
            await supabase.auth.signOut();
            showLoginScreen();
        }
    };

    // <<< AQUI ESTÁ A CORREÇÃO PRINCIPAL >>>
    // 1. Verificamos a sessão MANUALMENTE ao carregar a página
    // Isso previne que o evento onAuthStateChange seja "perdido" se disparar muito rápido.
    const checkCurrentSession = async () => {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error || !session) {
                showLoginScreen();
            } else {
                await initSession(session.user);
            }
        } catch (err) {
            console.error("Erro fatal na verificação inicial:", err);
            showLoginScreen();
        }
    };

    // Executa a verificação inicial
    await checkCurrentSession();

    // 2. Mantemos o listener para eventos futuros (ex: logout em outra aba, expiração)
    supabase.auth.onAuthStateChange(async (event, session) => {
        // Ignora INITIAL_SESSION pois já tratamos no checkCurrentSession
        if (event === 'INITIAL_SESSION') return; 

        if (event === "SIGNED_OUT") {
            App.destroy();
            showLoginScreen();
        } else if (event === "SIGNED_IN" && session) {
            await initSession(session.user);
        }
    });
});
