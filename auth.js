// auth.js (VERSÃO CORRIGIDA E CENTRALIZADA)

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
document.addEventListener('DOMContentLoaded', () => {
    
    // Seletores de elementos do DOM
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const loginError = document.getElementById('login-error');
    const loader = document.getElementById('loader');

    const showLoader = () => loader.classList.add('active');
    const hideLoader = () => loader.classList.remove('active');

    // Função para transicionar para a tela da aplicação
    const showAppScreen = () => {
        loginScreen.classList.remove('active');
        appScreen.classList.add('active'); // Usar classe para consistência
    };

    // Função para transicionar para a tela de login
    const showLoginScreen = () => {
        appScreen.classList.remove('active');
        loginScreen.classList.add('active');
    };

    // LÓGICA DE LOGIN
    const handleLogin = async (event) => {
        // Previne o envio do formulário se o evento for de submit
        if(event) event.preventDefault(); 
        
        showLoader();
        loginError.textContent = '';
        const username = document.getElementById('username').value.toUpperCase();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            loginError.textContent = 'Usuário e senha são obrigatórios.';
            hideLoader();
            return;
        }

        try {
            // Usamos um RPC para obter o email a partir do username (case-insensitive)
            const { data: emailData, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
            if (rpcError || !emailData) {
                // Se o RPC falhar ou não retornar dados, o usuário não existe.
                throw new Error('Usuário não encontrado.');
            }
            const email = emailData;

            // Tentativa de login com o email obtido e a senha
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
                // Erro de senha incorreta ou outro problema de autenticação
                throw new Error('Usuário ou senha inválidos.');
            }
            if (!signInData.user) {
                throw new Error('Falha na autenticação. Tente novamente.');
            }

            // O onAuthStateChange vai lidar com a inicialização do app após o login bem-sucedido.
            // Não precisamos fazer mais nada aqui, pois o evento 'SIGNED_IN' será disparado.

        } catch (error) {
            console.error('Erro no processo de login:', error.message);
            loginError.textContent = error.message;
            hideLoader(); // Esconde o loader apenas em caso de erro aqui
        }
    };

    loginButton.addEventListener('click', handleLogin);
    loginForm.addEventListener('submit', handleLogin); // Permite login com Enter

    // LÓGICA DE LOGOUT
    logoutButton.addEventListener('click', async () => {
        showLoader();
        await supabase.auth.signOut();
        // O onAuthStateChange vai lidar com a transição de tela após o logout.
    });

    // ==================================================================
    // PONTO ÚNICO E CENTRAL DE GERENCIAMENTO DE SESSÃO
    // ==================================================================
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`Auth event: ${event}`);
        showLoader();

        // Se existe uma sessão válida (seja no carregamento inicial ou após login)
        if (session && session.user) {
            try {
                // Verifica se o App já foi inicializado para evitar chamadas duplicadas
                if (!App.isInitialized()) {
                    const userProfile = await getUserProfile(session.user.id);
                    if (userProfile) {
                        App.init(userProfile); // Inicializa o App com os dados do perfil
                        showAppScreen();
                    } else {
                        // Caso crítico: usuário autenticado mas sem perfil no banco
                        await supabase.auth.signOut();
                        throw new Error("Perfil de usuário não encontrado. Deslogando.");
                    }
                } else {
                    // Se o app já está inicializado, apenas garante que a tela correta está visível
                    showAppScreen();
                }
            } catch (error) {
                console.error("Erro ao processar sessão:", error.message);
                showLoginScreen();
            } finally {
                hideLoader();
            }
        } 
        // Se não há sessão (seja no carregamento inicial, após logout ou token expirado)
        else {
            App.destroy(); // Limpa o estado do App
            showLoginScreen();
            hideLoader();
        }
    });

    // REMOVIDO o listener de 'visibilitychange', pois a biblioteca do Supabase já lida com isso.
});
