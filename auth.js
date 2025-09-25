// auth.js (CORRIGIDO - SEM RACE CONDITION + LOGIN FLUXO COMPLETO)

const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";
const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getUserProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("id, username, full_name, roles, is_admin, permissions")
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

    const showLoader = () => loader.classList.add("active");
    const hideLoader = () => loader.classList.remove("active");
    const showAppScreen = () => {
        loginScreen.classList.remove("active");
        appScreen.classList.add("active");
    };
    const showLoginScreen = () => {
        appScreen.classList.remove("active");
        loginScreen.classList.add("active");
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
            hideLoader();
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

            // 🔑 Após login bem-sucedido, busca o perfil e inicializa o app
            const userProfile = await getUserProfile(signInData.user.id);
            if (!userProfile) throw new Error("Perfil de usuário não encontrado.");

            App.init(userProfile);
            showAppScreen();
        } catch (error) {
            console.error("Erro no processo de login:", error.message);
            loginError.textContent = error.message;
        } finally {
            hideLoader();
        }
    };

    loginButton.addEventListener("click", handleLogin);
    loginForm.addEventListener("submit", handleLogin);

    logoutButton.addEventListener("click", async () => {
        showLoader();
        await supabase.auth.signOut();
    });

    // ===========================================================
    // GERENCIAMENTO DE SESSÃO (ROBUSTO E SEM DEADLOCK DO LOADER)
    // ===========================================================
    let isHandlingAuthChange = false;

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (isHandlingAuthChange) {
            console.log(`Auth event [${event}] ignorado (já em andamento).`);
            return;
        }

        isHandlingAuthChange = true;
        showLoader();

        try {
            if (event === "TOKEN_REFRESHED") {
                console.log("Token atualizado.");
                // Não altera UI, mas libera o lock
                return;
            }

            if (!session || !session.user) {
                App.destroy();
                showLoginScreen();
                return;
            }

            if (!App.isInitialized()) {
                const userProfile = await getUserProfile(session.user.id);
                if (userProfile) {
                    App.init(userProfile);
                } else {
                    console.error("Perfil não encontrado. Forçando logout.");
                    await supabase.auth.signOut();
                    return;
                }
            }

            showAppScreen();
        } catch (error) {
            console.error("Erro crítico no onAuthStateChange:", error);
            await supabase.auth.signOut();
        } finally {
            hideLoader();
            isHandlingAuthChange = false; // 🔑 garante destravar SEMPRE
        }
    });
});
