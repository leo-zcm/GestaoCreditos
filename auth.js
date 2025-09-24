// auth.js

// 1. CONFIGURAÇÃO E INICIALIZAÇÃO DO SUPABASE
const SUPABASE_URL = "https://sqtdysubmskpvdsdcknu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxdGR5c3VibXNrcHZkc2Rja251Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MzM5MjQsImV4cCI6MjA3NDMwOTkyNH0.cGprn7VjLDzIrIkmh7KEL8OtxIPbVfmAY6n4gtq6Z8Q";

const supabase = self.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. SELETORES DE ELEMENTOS DO DOM
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const loginError = document.getElementById('login-error');
const loader = document.getElementById('loader');

// Funções utilitárias para mostrar/esconder o loader
const showLoader = () => loader.classList.add('active');
const hideLoader = () => loader.classList.remove('active');

/**
 * Busca o perfil do usuário e suas permissões consolidadas.
 * @param {string} userId - O UUID do usuário do Supabase.
 * @returns {object|null} Objeto com dados do perfil e permissões ou null se falhar.
 */
async function getUserProfileWithPermissions(userId) {
    try {
        // 1. Busca o perfil básico do usuário (que contém suas 'roles')
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, username, full_name, roles, is_admin')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;
        if (!profile) return null;

        // 2. Busca as permissões para cada 'role' do usuário
        const { data: permissionsData, error: permissionsError } = await supabase
            .from('role_permissions')
            .select('role, permissions')
            .in('role', profile.roles);
        
        if (permissionsError) throw permissionsError;

        // 3. Consolida as permissões de todas as 'roles' em um único objeto
        const mergedPermissions = {};
        permissionsData.forEach(rolePermission => {
            const rolePerms = rolePermission.permissions;
            for (const module in rolePerms) {
                if (!mergedPermissions[module]) {
                    mergedPermissions[module] = {};
                }
                for (const perm in rolePerms[module]) {
                    // Lógica de merge: 'true' sobrepõe 'false', 'all' sobrepõe 'own'
                    const existingPerm = mergedPermissions[module][perm];
                    const newPerm = rolePerms[module][perm];
                    
                    if (existingPerm === 'all' || newPerm === 'all') {
                        mergedPermissions[module][perm] = 'all';
                    } else if (existingPerm === true || newPerm === true) {
                         mergedPermissions[module][perm] = true;
                    } else if (existingPerm === 'own' || newPerm === 'own') {
                        mergedPermissions[module][perm] = 'own';
                    } else {
                        mergedPermissions[module][perm] = newPerm;
                    }
                }
            }
        });

        return { ...profile, permissions: mergedPermissions };

    } catch (error) {
        console.error('Erro ao buscar perfil e permissões:', error.message);
        return null;
    }
}


// 3. LÓGICA DE LOGIN
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    loginError.textContent = '';

    const username = document.getElementById('username').value.toUpperCase();
    const password = document.getElementById('password').value;

    try {
        // Passo 1: Chamar a função RPC para obter o email a partir do nome de usuário
        const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', {
            p_username: username
        });

        if (rpcError || !email) {
            throw new Error('Usuário não encontrado.');
        }

        // Passo 2: Tentar fazer login com o email retornado e a senha
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (signInError) {
            throw new Error('Usuário ou senha inválidos.');
        }

        // Se o login for bem-sucedido, o onAuthStateChange cuidará do resto.
        // O loader será escondido dentro do onAuthStateChange após a inicialização do app.

    } catch (error) {
        console.error('Erro de login:', error.message);
        loginError.textContent = 'Usuário ou senha inválidos.';
        hideLoader();
    }
});

// 4. LÓGICA DE LOGOUT
logoutButton.addEventListener('click', async () => {
    showLoader();
    await supabase.auth.signOut();
    // onAuthStateChange vai detectar a ausência de sessão e redirecionar para o login.
    // Escondemos o loader aqui para garantir uma transição suave.
    hideLoader();
    window.location.reload(); // Força a recarga para limpar o estado da aplicação
});


// 5. GERENCIADOR DE ESTADO DE AUTENTICAÇÃO
supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
        // Usuário está logado
        showLoader();
        const userProfile = await getUserProfileWithPermissions(session.user.id);
        
        if (userProfile) {
            // Inicializa a aplicação principal
            App.init(userProfile);
            loginScreen.classList.remove('active');
            appScreen.style.display = 'flex'; // Usar style para sobrescrever o .screen
        } else {
            // Falha ao carregar o perfil, força o logout
            console.error("Não foi possível carregar o perfil do usuário. Deslogando.");
            await supabase.auth.signOut();
        }
        hideLoader();
    } else {
        // Usuário não está logado
        appScreen.style.display = 'none';
        loginScreen.classList.add('active');
    }
});
