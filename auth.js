// auth.js (VERSÃO FINAL COM DOMCONTENTLOADED)

// 1. CONFIGURAÇÃO DO SUPABASE (imutável)
const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";
const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Função auxiliar para buscar perfil de usuário
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

// 2. LÓGICA PRINCIPAL DA APLICAÇÃO
// Executa somente após o DOM estar completamente carregado
document.addEventListener('DOMContentLoaded', () => {
    
    // Seletores de elementos do DOM
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const loginError = document.getElementById('login-error');
    const loader = document.getElementById('loader');

    const showLoader = () => loader.classList.add('active');
    const hideLoader = () => loader.classList.remove('active');

    // LÓGICA DE LOGIN (FLUXO DIRETO)
    loginButton.addEventListener('click', async () => {
        showLoader();
        loginError.textContent = '';
        const username = document.getElementById('username').value.toUpperCase();
        const password = document.getElementById('password').value;

        try {
            const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
            if (rpcError || !email) throw new Error('Usuário não encontrado.');

            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw new Error('Usuário ou senha inválidos.');
            if (!signInData.user) throw new Error('Falha na autenticação.');

            const userProfile = await getUserProfile(signInData.user.id);
            if (!userProfile) {
                await supabase.auth.signOut();
                throw new Error('Não foi possível carregar o perfil do usuário.');
            }

            App.init(userProfile);
            loginScreen.classList.remove('active');
            appScreen.style.display = 'flex';

        } catch (error) {
            console.error('Erro no processo de login:', error.message);
            loginError.textContent = error.message;
        } finally {
            hideLoader();
        }
    });

    // LÓGICA DE LOGOUT
    logoutButton.addEventListener('click', async () => {
        showLoader();
        await supabase.auth.signOut();
        window.location.reload();
    });

    // GERENCIADOR DE ESTADO DE AUTENTICAÇÃO (Sessão existente)
    supabase.auth.onAuthStateChange(async (event, session) => {
        // Este listener agora lida principalmente com o estado inicial da página
        // e mudanças de estado que não são o clique de login (ex: refresh de token).
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            showLoader();
            try {
                if (session && session.user) {
                    const userProfile = await getUserProfile(session.user.id);
                    if (userProfile) {
                        App.init(userProfile);
                        loginScreen.classList.remove('active');
                        appScreen.style.display = 'flex';
                    } else {
                        throw new Error("Sessão de usuário inválida.");
                    }
                } else {
                    appScreen.style.display = 'none';
                    loginScreen.classList.add('active');
                }
            } catch (error) {
                console.error("Erro ao verificar sessão:", error.message);
                appScreen.style.display = 'none';
                loginScreen.classList.add('active');
            } finally {
                hideLoader();
            }
        } else if (event === 'SIGNED_OUT') {
            appScreen.style.display = 'none';
            loginScreen.classList.add('active');
            hideLoader();
        }
    });
});
