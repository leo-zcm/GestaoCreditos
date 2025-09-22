// Centraliza todas as interações com o Supabase

const api = {
    // Auth (agora usando Database Functions via RPC)
    login: async (usuario, senha) => {
        const { data, error } = await supabase.rpc('authenticate_user', {
            p_usuario: usuario,
            p_senha: senha
        });
        // A RPC retorna um array, mesmo que seja um único resultado.
        if (error || !data || data.length === 0) {
            return { data: null, error: error || new Error('Usuário ou senha inválidos.') };
        }
        return { data: { user: data[0] }, error: null };
    },
    
    // Usuários (agora usando Database Functions para operações seguras)
    createUser: (userData) => {
        return supabase.rpc('create_new_user', {
            p_usuario: userData.usuario,
            p_nome: userData.nome,
            p_senha: userData.senha,
            p_funcoes: userData.funcoes,
            p_permissoes: userData.permissoes
        });
    },
    updateUser: (userData) => {
        // A atualização de dados normais (sem senha) continua sendo um UPDATE normal.
        const { id, ...updateData } = userData;
        delete updateData.usuario; // Não permite alterar o nome de usuário
        return supabase.from('usuarios').update(updateData).eq('id', id);
    },
    updateUserPassword: (id, senha) => {
        return supabase.rpc('update_user_password', {
            p_user_id: id,
            p_new_senha: senha
        });
    },
    getUsers: () => supabase.from('usuarios').select('id, created_at, usuario, nome, funcoes, permissoes, ativo').order('nome'),
    
    // Clientes e Produtos
    getClientes: () => supabase.from('clientes_erp').select('codigo, nome').order('nome'),
    getProdutos: () => supabase.from('produtos_erp').select('codigo, nome').order('nome'),

    // Tipos de Pagamento
    getTiposPagamento: () => supabase.from('tipos_pagamento').select('*'),

    // Comprovantes
    getComprovantes: (filters, page = 1, perPage = 50) => {
        let query = supabase.from('comprovantes')
            .select(`
                id, created_at, updated_at, valor, status, pedido_faturado, comprovante_url,
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
        if (filters.vendedor_id) query = query.eq('vendedor_id', filters.vendedor_id);
        
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
