// Centraliza todas as interações com o Supabase

const api = {
    // Auth
    login: (usuario, senha) => supabase.functions.invoke('login', { body: { usuario, senha } }),
    
    // Usuários (via Edge Function para segurança)
    createUser: (userData) => supabase.functions.invoke('manage-user', { body: { action: 'create', userData } }),
    updateUser: (userData) => supabase.functions.invoke('manage-user', { body: { action: 'update', userData } }),
    updateUserPassword: (id, senha) => supabase.functions.invoke('manage-user', { body: { action: 'update_password', userData: { id, senha } } }),
    getUsers: () => supabase.from('usuarios').select('*').order('nome'),
    
    // Clientes e Produtos
    getClientes: () => supabase.from('clientes_erp').select('codigo, nome').order('nome'),
    getProdutos: () => supabase.from('produtos_erp').select('codigo, nome').order('nome'),

    // Tipos de Pagamento
    getTiposPagamento: () => supabase.from('tipos_pagamento').select('*'),

    // Comprovantes
    getComprovantes: (filters, page = 1, perPage = 50) => {
        let query = supabase.from('comprovantes')
            .select(`
                id, created_at, updated_at, valor, status, pedido_faturado,
                cliente:clientes_erp(nome),
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
    getComprovanteById: (id) => supabase.from('comprovantes').select('*, historico_status').eq('id', id).single(),
    createComprovante: (data) => supabase.from('comprovantes').insert(data).select().single(),
    updateComprovante: (id, data) => supabase.from('comprovantes').update(data).eq('id', id),
    uploadComprovante: (file) => {
        const fileName = `${Date.now()}_${file.name}`;
        return supabase.storage.from('comprovantes').upload(fileName, file);
    },

    // Solicitações D/C
    getSolicitacoes: (filters, page = 1, perPage = 50) => {
        let query = supabase.from('solicitacoes_dc')
            .select(`
                id, created_at, status, debito_valor, credito_valor,
                solicitante:usuarios(nome),
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
    createSolicitacao: (data) => supabase.from('solicitacoes_dc').insert(data),
    updateSolicitacao: (id, data) => supabase.from('solicitacoes_dc').update(data).eq('id', id),

    // Créditos
    getCreditos: (filters, page = 1, perPage = 50) => {
        let query = supabase.from('creditos')
            .select(`
                id, created_at, valor, descricao, quantidade, status, pedido_abatido,
                cliente:clientes_erp(codigo, nome),
                vendedor:usuarios(nome)
            `)
            .order('created_at', { ascending: false });

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.cliente_query) query = query.or(`cliente_codigo.ilike.%${filters.cliente_query}%,clientes_erp.nome.ilike.%${filters.cliente_query}%`);
        // Adicionar outros filtros aqui...
        
        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);

        return query;
    },
    createCredito: (data) => supabase.from('creditos').insert(data),
    updateCredito: (id, data) => supabase.from('creditos').update(data).eq('id', id),

    // Dashboard Stats
    getDashboardStats: async () => {
        const user = auth.getCurrentUser();
        
        const { count: pagamentosConfirmados } = await supabase.from('comprovantes').select('*', { count: 'exact', head: true }).eq('status', 'CONFIRMADO');
        const { count: pagamentosParaBaixa } = await supabase.from('comprovantes').select('*', { count: 'exact', head: true }).eq('status', 'FATURADO');
        const { count: solicitacoesPendentes } = await supabase.from('solicitacoes_dc').select('*', { count: 'exact', head: true }).eq('status', 'PENDENTE');
        
        let queryCreditos = supabase.from('creditos').select('cliente_codigo', { count: 'exact', head: true }).eq('status', 'DISPONÍVEL');
        if (auth.hasPermission('creditos', 'ver_apenas_meus')) {
            queryCreditos = queryCreditos.eq('vendedor_id', user.id);
        }
        const { count: clientesComCredito } = await queryCreditos;

        return { pagamentosConfirmados, pagamentosParaBaixa, solicitacoesPendentes, clientesComCredito };
    }
};
