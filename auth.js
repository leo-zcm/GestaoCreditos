// auth.js (VERSÃO BLINDADA)

// 1. CONFIGURAÇÃO E INICIALIZAÇÃO DO SUPABASE (sem alterações)
const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";
const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. SELETORES DE ELEMENTOS DO DOM (sem alterações)
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const loginError = document.getElementById('login-error');
const loader = document.getElementById('loader');

const showLoader = () => loader.classList.add('active');
const hideLoader = () => loader.classList.remove('active');

async function getUserProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, username, full_name, roles, is_admin, permissions')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return profile;
    } catch (error) {
        console.error('Erro ao buscar perfil do usuário:', error.message);
        return null;
    }
}

// 3. LÓGICA DE LOGIN (sem alterações)
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    loginError.textContent = '';
    const username = document.getElementById('username').value.toUpperCase();
    const password = document.getElementById('password').value;
    try {
        const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
        if (rpcError || !email) throw new Error('Usuário não encontrado.');
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email, password: password });
        if (signInError) throw new Error('Usuário ou senha inválidos.');
    } catch (error) {
        console.error('Erro de login:', error.message);
        loginError.textContent = error.message;
        hideLoader();
    }
});

// 4. LÓGICA DE LOGOUT (sem alterações)
logoutButton.addEventListener('click', async () => {
    showLoader();
    await supabase.auth.signOut();
    window.location.reload();
});


/* 5. GERENCIADOR DE ESTADO DE AUTENTICAÇÃO (VERSÃO FINAL E ROBUSTA)
 * Previne o loop de carregamento envolvendo a lógica em um try/catch/finally
 * para garantir que o loader seja sempre escondido, mesmo em caso de erro.
 */
supabase.auth.onAuthStateChange(async (event, session) => {
    showLoader(); // Mostra o loader no início de qualquer mudança de estado

    try {
        if (session && session.user) {
            const userProfile = await getUserProfile(session.user.id);

            if (userProfile) {
                // SUCESSO: Usuário autenticado e perfil carregado
                App.init(userProfile);
                loginScreen.classList.remove('active');
                appScreen.style.display = 'flex';
            } else {
                // FALHA CONTROLADA: Sessão existe, mas perfil não foi encontrado (ex: usuário deletado)
                // Força o logout para limpar a sessão inválida.
                throw new Error("Sessão de usuário inválida. O perfil não foi encontrado.");
            }
        } else {
            // ESTADO LIMPO: Nenhum usuário logado
            appScreen.style.display = 'none';
            loginScreen.classList.add('active');
        }
    } catch (error) {
        // ERRO INESPERADO: Captura qualquer erro no processo (falha de rede, etc.)
        console.error("Erro crítico durante a verificação de autenticação:", error.message);

        appScreen.style.display = 'none';
        loginScreen.classList.add('active');
    } finally {
        // GARANTIA: Esconde o loader, não importa o que aconteça.
        hideLoader();
    }
});
