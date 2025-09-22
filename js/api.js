// js/api.js

// Centraliza todas as interações com o Supabase

const api = {
    // Auth (usando Database Functions via RPC)
    login: async (usuario, senha) => {
        // --- ALTERADO ---
        // AVISO IMPORTANTE: Sua função 'authenticate_user' no Supabase DEVE ser ajustada
        // para retornar não apenas os dados do usuário, mas também um JWT válido.
        // O objeto retornado deve ser algo como:
        // { id, nome, funcoes, permissoes, token }
        // Onde 'token' é o JWT gerado para a sessão do usuário.
        const { data, error } = await supabaseClient.rpc('authenticate_user', {
            p_usuario: usuario,
            p_senha: senha
        });
        
        if (error || !data || data.length === 0) {
            console.error("Erro na autenticação RPC:", error);
            return { data: null, error: error || new Error('Usuário ou senha inválidos.') };
        }
        // A RPC retorna um array, então pegamos o primeiro elemento.
        return { data: data[0], error: null };
    },
    
    // Usuários (usando Database Functions para operações seguras)
    createUser: (userData) => {
        return supabaseClient.rpc('create_new_user', {
            p_usuario: userData.usuario,
            p_nome: userData.nome,
            p_senha: userData.senha,
            p_funcoes: userData.funcoes,
            p_permissoes: userData.permissoes
        });
    },
    updateUser: (userData) => {
        const { id, ...updateData } = userData;
        delete updateData.usuario;
        return supabaseClient.from('usuarios').update(updateData).eq('id', id);
    },
    updateUserPassword: (id, senha) => {
        return supabaseClient.rpc('update_user_password', {
            p_user_id: id,
            p_new_senha: senha
        });
    },
    getUsers: () => supabaseClient.from('usuarios').select('id, created_at, usuario, nome, funcoes, permissoes, ativo').order('nome'),
    
    // --- NOVO ---
    // Funções de busca por código para os novos inputs dinâmicos
    getClienteByCodigo: (codigo) => supabaseClient.from('clientes_erp').select('codigo, nome').eq('codigo', codigo).single(),
    getProdutoByCodigo: (codigo) => supabaseClient.from('produtos_erp').select('codigo, nome').eq('codigo', codigo).single(),
    // ----------------

    // Clientes e Produtos (mantidos para selects em massa se necessário no futuro)
    getClientes: () => supabaseClient.from('clientes_erp').select('codigo, nome').order('nome'),
    getProdutos: () => supabaseClient.from('produtos_erp').select('codigo, nome').order('nome'),

    // Tipos de Pagamento
    getTiposPagamento: () => supabaseClient.from('tipos_pagamento').select('*'),

    // Comprovantes
    getComprovantes: (filters, page = 1, perPage = 50) => {
        let query = supabaseClient.from('comprovantes')
            .select(`
                id, created_at, updated_at, valor, status, pedido_faturado, comprovante_url,
                cliente_codigo, cliente_nome_manual,
                tipo_pagamento:tipos_pagamento(nome, cor)
            `)
            .order('updated_at', { ascending: false });

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.data_inicio) query = query.gte('updated_at', filters.data_inicio);
        if (filters.data_fim) query = query.lte('updated_at', filters.data_fim);

        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);
        
        return query;
    },
    getComprovanteById: (id) => supabaseClient.from('comprovantes').select('*, historico_status').eq('id', id).single(),
    createComprovante: (data) => supabaseClient.from('comprovantes').insert(data).select().single(),
    updateComprovante: (id, data) => supabaseClient.from('comprovantes').update(data).eq('id', id),
    uploadComprovante: (file) => {
        const fileName = `${Date.now()}_${file.name}`;
        return supabaseClient.storage.from('comprovantes').upload(fileName, file);
    },

    // Solicitações D/C
    getSolicitacoes: (filters, page = 1, perPage = 50) => {
        let query = supabaseClient.from('solicitacoes_dc')
            .select(`
                id, created_at, status, debito_valor, credito_valor, debito_qtd, credito_qtd,
                debito_cliente_codigo, credito_cliente_codigo, debito_produto_codigo, credito_produto_codigo,
                solicitante:usuarios(id, nome),
                debito_cliente:clientes_erp(nome),
                credito_cliente:clientes_erp(nome),
                debito_produto:produtos_erp(nome),
                credito_produto:produtos_erp(nome)
            `)
            .order('created_at', { ascending: false });

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.solicitante_id) query = query.eq('solicitante_id', filters.solicitante_id);
        if (filters.data_inicio) query = query.gte('created_at', filters.data_inicio);
        if (filters.data_fim) query = query.lte('created_at', filters.data_fim);

        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);

        return query;
    },
    createSolicitacao: (data) => supabaseClient.from('solicitacoes_dc').insert(data),
    updateSolicitacao: (id, data) => supabaseClient.from('solicitacoes_dc').update(data).eq('id', id),

    // Créditos
    getCreditos: (filters, page = 1, perPage = 50) => {
        let query = supabaseClient.from('creditos')
            .select(`
                id, created_at, valor, descricao, quantidade, status, pedido_abatido,
                cliente:clientes_erp(codigo, nome),
                vendedor:usuarios(nome)
            `)
            .order('created_at', { ascending: false });

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.cliente_query) query = query.or(`cliente_codigo.ilike.%${filters.cliente_query}%,clientes_erp.nome.ilike.%${filters.cliente_query}%`);
        if (filters.vendedor_id) query = query.eq('vendedor_id', filters.vendedor_id);
        
        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);

        return query;
    },
    createCredito: (data) => supabaseClient.from('creditos').insert(data),
    updateCredito: (id, data) => supabaseClient.from('creditos').update(data).eq('id', id),

    // Dashboard Stats
    getDashboardStats: async () => {
        const user = auth.getCurrentUser();
        
        const { count: pagamentosConfirmados } = await supabaseClient.from('comprovantes').select('*', { count: 'exact', head: true }).eq('status', 'CONFIRMADO');
        const { count: pagamentosParaBaixa } = await supabaseClient.from('comprovantes').select('*', { count: 'exact', head: true }).eq('status', 'FATURADO');
        const { count: solicitacoesPendentes } = await supabaseClient.from('solicitacoes_dc').select('*', { count: 'exact', head: true }).eq('status', 'PENDENTE');
        
        let queryCreditos = supabaseClient.from('creditos').select('id', { count: 'exact', head: true }).eq('status', 'DISPONÍVEL');
        if (auth.hasPermission('creditos', 'ver_apenas_meus')) {
            queryCreditos = queryCreditos.eq('vendedor_id', user.id);
        }
        const { count: creditosDisponiveis } = await queryCreditos;

        return { pagamentosConfirmados, pagamentosParaBaixa, solicitacoesPendentes, creditosDisponiveis };
    }
};
