// auth.js (CORRIGIDO - SEM CONFLITO DE VARIÁVEIS)

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

// Verifica se a biblioteca carregou
if (typeof self.supabase === 'undefined') {
    alert("Erro crítico: A biblioteca do Supabase não foi carregada.");
}

// <<< CORREÇÃO DO ERRO DE SYNTAX ERROR >>>
// Não podemos usar 'const supabase' aqui porque a CDN já criou uma variável com esse nome.
// Usamos '_supabaseClient' e depois jogamos para o window.supabase para seu app.js funcionar.
const _supabaseClient = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseOptions);
window.supabase = _supabaseClient; // Agora 'supabase' é o seu cliente, e não mais a biblioteca genérica.

// Limpa sessão ao fechar/atualizar para evitar estados zumbis
window.addEventListener('beforeunload', () => {
    sessionStorage.clear();
});

async function getUserProfile(userId) {
    try {
        const { data: profile, error } = await window.supabase
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

    const showLoader = () => loader && loader.classList.add("active");
    const hideLoader = () => loader && loader.classList.remove("active");
    
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

    const handleLogin = async (event) => {
        if (event) event.preventDefault();
        showLoader();
        if (loginError) loginError.textContent = "";

        const username = usernameInput.value.toUpperCase();
        const password = passwordInput.value;

        if (!username || !password) {
            if (loginError) loginError.textContent = "Usuário e senha são obrigatórios.";
            hideLoader();
            return;
        }

        try {
            const { data: emailData, error: rpcError } = await window.supabase.rpc(
                "get_email_by_username",
                { p_username: username }
            );
            if (rpcError || !emailData) throw new Error("Usuário não encontrado.");

            const { data: signInData, error: signInError } =
                await window.supabase.auth.signInWithPassword({
                    email: emailData,
                    password,
                });

            if (signInError) throw new Error("Usuário ou senha inválidos.");
            if (!signInData.user) throw new Error("Falha na autenticação.");

            await initSession(signInData.user);

        } catch (error) {
            console.error("Erro no login:", error.message);
            if (loginError) loginError.textContent = error.message;
            hideLoader();
        } 
    };

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            showLoader();
            await window.supabase.auth.signOut();
            if (typeof App !== 'undefined') App.destroy();
            showLoginScreen();
        });
    }

    const initSession = async (user) => {
        try {
            if (typeof App !== 'undefined' && !App.isInitialized()) {
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
            await window.supabase.auth.signOut();
            showLoginScreen();
        }
    };

    // Verificação inicial manual (evita a condição de corrida do loading infinito)
    const checkCurrentSession = async () => {
        try {
            const { data: { session }, error } = await window.supabase.auth.getSession();
            
            if (error || !session) {
                showLoginScreen();
            } else {
                await initSession(session.user);
            }
        } catch (err) {
            console.error("Erro na verificação inicial:", err);
            showLoginScreen();
        }
    };

    await checkCurrentSession();

    window.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'INITIAL_SESSION') return; 

        if (event === "SIGNED_OUT") {
            if (typeof App !== 'undefined') App.destroy();
            showLoginScreen();
        } else if (event === "SIGNED_IN" && session) {
            await initSession(session.user);
        }
    });
});
