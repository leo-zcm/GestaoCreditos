// auth.js (VERSÃO CORRIGIDA)

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

/**
 * ALTERAÇÃO: Busca o perfil do usuário com suas permissões individuais.
 * A função ficou muito mais simples e direta.
 */
async function getUserProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, username, full_name, roles, is_admin, permissions') // Pega a nova coluna
            .eq('id', userId)
            .single();

        if (error) throw error;
        return profile;

    } catch (error) {
        console.error('Erro ao buscar perfil do usuário:', error.message);
        return null;
    }
}


// 3. LÓGICA DE LOGIN (sem alterações na lógica, apenas na chamada da função)
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
        loginError.textContent = error.message; // Mostra o erro real
        hideLoader();
    }
});

// 4. LÓGICA DE LOGOUT (sem alterações)
logoutButton.addEventListener('click', async () => {
    showLoader();
    await supabase.auth.signOut();
    window.location.reload();
});


/**
 * 5. GERENCIADOR DE ESTADO DE AUTENTICAÇÃO (ALTERAÇÃO CRÍTICA)
 * Adicionado tratamento de erro robusto para evitar o loader infinito.
 */
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
        showLoader();
        const userProfile = await getUserProfile(session.user.id);
        
        if (userProfile) {
            App.init(userProfile); // Inicializa a aplicação
            loginScreen.classList.remove('active');
            appScreen.style.display = 'flex';
            hideLoader();
        } else {
            // CORREÇÃO: Se não conseguir carregar o perfil, força o logout e recarrega.
            // Isso limpa a sessão inválida e previne o loader infinito.
            console.error("Não foi possível carregar o perfil do usuário. Deslogando para limpar a sessão.");
            await supabase.auth.signOut();
            window.location.reload(); 
        }
    } else {
        appScreen.style.display = 'none';
        loginScreen.classList.add('active');
        hideLoader(); // Garante que o loader não fique preso
    }
});
