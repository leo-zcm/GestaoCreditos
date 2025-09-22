// Centraliza todas as interações com o Supabase

const api = {
    // Auth Helpers
    getEmailByUsername: (username) => {
        return supabaseClient.rpc('get_email_by_username', { p_username: username });
    },
    
    // Usuários (agora usa a função de admin para criar usuários)
    adminCreateUser: (userData) => {
        // Gera um email único e "falso" para o sistema de auth do Supabase
        const fakeEmail = `${userData.usuario.toLowerCase()}-${Date.now()}@local.user`;
        return supabaseClient.rpc('admin_create_user', {
            p_email: fakeEmail,
            p_password: userData.senha,
            p_username: userData.usuario,
            p_nome: userData.nome,
            p_funcoes: userData.funcoes,
            p_permissoes: userData.permissoes
        });
    },
    // A atualização de dados do usuário (exceto senha) é um UPDATE normal
    updateUser: (userData) => {
        const { id, ...updateData } = userData;
        return supabaseClient.from('usuarios').update(updateData).eq('id', id);
    },
    // Para atualizar a senha, usamos a função nativa do Supabase
    updateUserPassword: (userId, newPassword) => {
        // Esta é uma operação de admin e requer uma Edge Function ou
        // ser executada a partir de um backend seguro.
        // Por simplicidade, vamos usar a função de usuário logado por enquanto.
        // O ideal seria criar uma Edge Function 'admin-update-password'.
        console.warn("A atualização de senha de outros usuários requer privilégios de admin. Esta chamada pode falhar.");
        // A função abaixo só funciona para o próprio usuário logado.
        // return supabaseClient.auth.updateUser({ password: newPassword });
        // Por enquanto, vamos desabilitar a alteração de senha de terceiros sem uma Edge Function
        return { error: { message: "Função não implementada de forma segura. Use o Supabase Studio." } };
    },
    getUsers: () => supabaseClient.from('usuarios').select('*').order('nome'),
    
    // Todas as outras chamadas continuam iguais, pois a RLS cuida da segurança
    getClientes: () => supabaseClient.from('clientes_erp').select('codigo, nome').order('nome'),
    getProdutos: () => supabaseClient.from('produtos_erp').select('codigo, nome').order('nome'),
    getTiposPagamento: () => supabaseClient.from('tipos_pagamento').select('*'),
    getComprovantes: (filters, page = 1, perPage = 50) => {
        let query = supabaseClient.from('comprovantes').select(`*, cliente:clientes_erp(nome), tipo_pagamento:tipos_pagamento(nome, cor)`).order('updated_at', { ascending: false });
        // ... (lógica de filtros e paginação)
        return query;
    },
    // ... (incluir o resto das suas funções de API para `solicitacoes`, `creditos`, etc.)
    // Elas não precisam de alteração.
};
