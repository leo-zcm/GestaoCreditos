document.addEventListener('DOMContentLoaded', () => {
    // =================================================================================
    //  CONFIGURAÇÃO DO SUPABASE - COLOQUE SUAS CHAVES AQUI!
    // =================================================================================
    const SUPABASE_URL = 'https://munhzkymbxwixydnuvyl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bmh6a3ltYnh3aXh5ZG51dnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNDEyMDksImV4cCI6MjA3MzcxNzIwOX0.s7Qu4usG3Z3AokosWNtMwmivpt6IGpvsWzLtti24ibc';

    const { createClient } = window.supabase;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // =================================================================================
    //  VARIÁVEIS GLOBAIS E ELEMENTOS DO DOM
    // =================================================================================
    let currentUser = null;

    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const userDisplay = document.getElementById('user-display');
    const logoutButton = document.getElementById('logout-button');
    const mainMenu = document.getElementById('main-menu');
    const mainContent = document.getElementById('main-content');
    const pageTitle = document.getElementById('page-title');
    const modalContainer = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseButton = document.getElementById('modal-close-button');
    
    // =================================================================================
    //  LÓGICA DE AUTENTICAÇÃO E SESSÃO
    // =================================================================================

    // Força o campo de usuário a ser maiúsculo
    usernameInput.addEventListener('input', () => {
        usernameInput.value = usernameInput.value.toUpperCase();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const username = usernameInput.value;
        const password = passwordInput.value;

        // ATENÇÃO MÁXIMA: Esta é uma forma insegura de autenticação.
        // A senha está sendo comparada em texto plano.
        // Em um ambiente de produção, use o Supabase Auth ou uma Edge Function para
        // fazer a verificação de senha com hash (ex: bcrypt).
        // Esta implementação segue o requisito de "não usar Supabase Auth".
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('usuario', username)
            .eq('senha', password) // NUNCA FAÇA ISSO EM PRODUÇÃO REAL
            .single();

        if (error || !data) {
            loginError.textContent = 'Usuário ou senha inválidos.';
            return;
        }

        currentUser = data;
        sessionStorage.setItem('gestaoCreditosUser', JSON.stringify(currentUser));
        initializeApp();
    });

    logoutButton.addEventListener('click', () => {
        currentUser = null;
        sessionStorage.removeItem('gestaoCreditosUser');
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
        mainContent.innerHTML = '';
    });

    function checkSession() {
        const user = sessionStorage.getItem('gestaoCreditosUser');
        if (user) {
            currentUser = JSON.parse(user);
            initializeApp();
        } else {
            loginContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
        }
    }

    function initializeApp() {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        userDisplay.textContent = `Olá, ${currentUser.nome}`;
        setupMenu();
        navigateTo('home');
    }
    
    // =================================================================================
    //  NAVEGAÇÃO E ROTEAMENTO
    // =================================================================================

    function setupMenu() {
        // Lógica para mostrar/esconder itens do menu com base nas permissões
        // Por simplicidade, vamos mostrar todos e a página dará erro se não tiver permissão
        mainMenu.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                const page = e.target.dataset.page;
                navigateTo(page);
            }
        });
    }

    function navigateTo(page) {
        mainContent.innerHTML = 'Carregando...';
        // Atualiza o link ativo no menu
        document.querySelectorAll('#main-menu a').forEach(a => a.classList.remove('active'));
        document.querySelector(`#main-menu a[data-page="${page}"]`).classList.add('active');

        switch (page) {
            case 'home':
                pageTitle.textContent = 'Home';
                renderHomePage();
                break;
            case 'comprovantes':
                pageTitle.textContent = 'Comprovantes';
                // renderComprovantesPage(); // Implementação futura
                mainContent.innerHTML = '<h2>Módulo Comprovantes (Em construção)</h2>';
                break;
            case 'solicitacoes':
                pageTitle.textContent = 'Solicitações D/C';
                // renderSolicitacoesPage(); // Implementação futura
                mainContent.innerHTML = '<h2>Módulo Solicitações D/C (Em construção)</h2>';
                break;
            case 'creditos':
                pageTitle.textContent = 'Créditos';
                renderCreditosPage();
                break;
            case 'usuarios':
                pageTitle.textContent = 'Usuários';
                // renderUsuariosPage(); // Implementação futura
                mainContent.innerHTML = '<h2>Módulo Usuários (Em construção)</h2>';
                break;
            default:
                mainContent.innerHTML = '<h2>Página não encontrada</h2>';
        }
    }
    
    // =================================================================================
    //  RENDERIZAÇÃO DAS PÁGINAS (Módulos)
    // =================================================================================

    // --- PÁGINA HOME ---
    async function renderHomePage() {
        const userRoles = currentUser.funcoes;
        let content = '<div class="home-grid">';
        
        // Lógica de widgets baseada na função
        if (userRoles.includes('vendedor')) {
            content += `
                <div class="widget-card">
                    <h3>Consultar Créditos de Cliente</h3>
                    <form id="check-credito-form" class="quick-action-form">
                        <input type="text" id="cliente-codigo-home" placeholder="Código do Cliente" required>
                        <button type="submit" class="primary-btn">Buscar</button>
                    </form>
                    <div id="credito-cliente-result"></div>
                </div>
                <div class="widget-card">
                    <h3>Nova Solicitação D/C</h3>
                    <p>Crie rapidamente uma nova solicitação de débito/crédito.</p>
                    <button id="nova-solicitacao-home-btn" class="primary-btn" style="margin-top: 10px;">Nova Solicitação</button>
                </div>
            `;
            // Adicionar cards de estatísticas (exemplo)
            // const { count: creditosCount } = await supabase.from('creditos').select('*', { count: 'exact' }).eq('vendedor_id', currentUser.id).eq('status', 'DISPONÍVEL');
            // content += `<div class="widget-card clickable" data-target-page="creditos"><h3>Você tem</h3><p class="stat">${creditosCount || 0}</p><p class="stat-description">créditos disponíveis.</p></div>`;
        }
        
        if (userRoles.includes('faturista')) {
             content += `
                <div class="widget-card clickable" data-target-page="comprovantes" data-filter-status="CONFIRMADO">
                    <h3>Pagamentos a Faturar</h3>
                    <p class="stat">X</p>
                    <p class="stat-description">pagamentos confirmados aguardando faturamento.</p>
                </div>
                 <div class="widget-card clickable" data-target-page="solicitacoes" data-filter-status="PENDENTE">
                    <h3>Solicitações Pendentes</h3>
                    <p class="stat">Y</p>
                    <p class="stat-description">solicitações D/C aguardando aprovação.</p>
                </div>
            `;
        }

        // Adicionar lógicas para CAIXA, FINANCEIRO, GARANTIA...

        content += '</div>';
        mainContent.innerHTML = content;
        
        // Adicionar event listeners para os elementos da home
        const checkCreditoForm = document.getElementById('check-credito-form');
        if(checkCreditoForm) {
            checkCreditoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const clienteCodigo = document.getElementById('cliente-codigo-home').value;
                const resultDiv = document.getElementById('credito-cliente-result');
                resultDiv.textContent = 'Buscando...';

                const { data, error } = await supabase
                    .from('creditos')
                    .select('valor, clientes_erp(nome)')
                    .eq('cliente_codigo', clienteCodigo)
                    .eq('status', 'DISPONÍVEL');

                if (error || data.length === 0) {
                    resultDiv.textContent = 'Nenhum crédito disponível para este cliente.';
                    return;
                }
                
                const total = data.reduce((sum, item) => sum + item.valor, 0);
                resultDiv.innerHTML = `<b>${data[0].clientes_erp.nome}</b><br>Total de Crédito: <b>R$ ${total.toFixed(2)}</b>`;
            });
        }
    }

    // --- PÁGINA CRÉDITOS ---
    async function renderCreditosPage() {
        // HTML da estrutura da página
        mainContent.innerHTML = `
            <div class="page-controls">
                <div class="filters">
                    <input type="text" id="search-creditos" placeholder="Buscar cliente, produto, vendedor...">
                    <select id="status-filter-creditos">
                        <option value="">Todos Status</option>
                        <option value="DISPONÍVEL" selected>Disponível</option>
                        <option value="ABATIDO">Abatido</option>
                    </select>
                    <input type="date" id="date-filter-creditos">
                    <button id="filter-btn-creditos" class="secondary-btn">Filtrar</button>
                </div>
                <div>
                    <button id="abater-selecionados-btn" class="secondary-btn hidden">Abater Selecionados</button>
                    <button id="novo-credito-btn" class="primary-btn">Novo Crédito</button>
                </div>
            </div>
            <table id="creditos-table">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="select-all-creditos"></th>
                        <th>Criação</th>
                        <th>Cliente</th>
                        <th>Descrição</th>
                        <th>Qtd</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Linhas serão inseridas aqui -->
                </tbody>
            </table>
            <div class="pagination">
                <button id="prev-page-creditos" disabled>Anterior</button>
                <span id="page-info-creditos">Página 1</span>
                <button id="next-page-creditos">Próxima</button>
            </div>
            <div id="selection-total" style="text-align: right; margin-top: 10px; font-weight: bold;"></div>
        `;
        
        loadCreditos(); // Função para carregar os dados na tabela

        // Event Listeners
        document.getElementById('novo-credito-btn').addEventListener('click', showNovoCreditoModal);
        document.getElementById('filter-btn-creditos').addEventListener('click', loadCreditos);
    }
    
    let creditosCurrentPage = 0;
    const creditosPageSize = 50;

    async function loadCreditos() {
        const searchTerm = document.getElementById('search-creditos').value;
        const statusFilter = document.getElementById('status-filter-creditos').value;
        
        const tbody = document.querySelector('#creditos-table tbody');
        tbody.innerHTML = '<tr><td colspan="8">Carregando...</td></tr>';
        
        let query = supabase
            .from('creditos')
            .select(`
                id, created_at, cliente_codigo, quantidade, valor, descricao, status, pedido_abatimento,
                cliente:clientes_erp(nome),
                vendedor:usuarios(nome)
            `)
            .order('created_at', { ascending: false })
            .range(creditosCurrentPage * creditosPageSize, (creditosCurrentPage + 1) * creditosPageSize - 1);

        if (statusFilter) {
            query = query.eq('status', statusFilter);
        }
        // Adicionar mais filtros aqui (searchTerm, data, etc)

        const { data, error } = await query;

        if (error) {
            tbody.innerHTML = '<tr><td colspan="8">Erro ao carregar créditos.</td></tr>';
            console.error(error);
            return;
        }

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8">Nenhum crédito encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(credito => `
            <tr data-id="${credito.id}">
                <td><input type="checkbox" class="credito-checkbox" value="${credito.valor}"></td>
                <td>${new Date(credito.created_at).toLocaleString('pt-BR')}</td>
                <td>${credito.cliente_codigo} - ${credito.cliente.nome}</td>
                <td>${credito.descricao}</td>
                <td>${credito.quantidade || '-'}</td>
                <td>R$ ${credito.valor.toFixed(2)}</td>
                <td><span class="status-badge status-${credito.status.toLowerCase()}">${credito.status}</span></td>
                <td class="action-buttons">
                    ${credito.status === 'DISPONÍVEL'
                        ? `<button class="btn-abater" data-id="${credito.id}" data-valor="${credito.valor}">Abater</button>`
                        : `<span>${credito.pedido_abatimento || 'Abatido'}</span>`
                    }
                </td>
            </tr>
        `).join('');
        
        // Adicionar listeners para os botões de abater e checkboxes
        tbody.querySelectorAll('.btn-abater').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const valor = e.target.dataset.valor;
                showAbaterCreditoModal(id, valor);
            });
        });
        
        updateSelectionTotal();
        document.querySelectorAll('.credito-checkbox, #select-all-creditos').forEach(cb => {
            cb.addEventListener('change', updateSelectionTotal);
        });
    }
    
    function updateSelectionTotal() {
        const checkboxes = document.querySelectorAll('.credito-checkbox:checked');
        const totalDiv = document.getElementById('selection-total');
        const abaterBtn = document.getElementById('abater-selecionados-btn');
        
        if (checkboxes.length > 0) {
            const total = Array.from(checkboxes).reduce((sum, cb) => sum + parseFloat(cb.value), 0);
            totalDiv.textContent = `Total Selecionado: R$ ${total.toFixed(2)}`;
            abaterBtn.classList.remove('hidden');
        } else {
            totalDiv.textContent = '';
            abaterBtn.classList.add('hidden');
        }
    }

    // =================================================================================
    //  LÓGICA DOS MODAIS (Pop-ups)
    // =================================================================================
    
    function showModal(title, content) {
        modalTitle.textContent = title;
        modalBody.innerHTML = content;
        modalContainer.classList.remove('hidden');
    }

    function hideModal() {
        modalContainer.classList.add('hidden');
        modalBody.innerHTML = '';
    }

    modalCloseButton.addEventListener('click', hideModal);
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            hideModal();
        }
    });

    function showNovoCreditoModal() {
        const content = `
            <form id="novo-credito-form">
                <div class="form-group">
                    <label for="n_registro">Nº Registro (Opcional)</label>
                    <input type="text" id="n_registro">
                </div>
                <div class="form-group">
                    <label for="vendedor_id">Vendedor</label>
                    <select id="vendedor_id" required></select>
                </div>
                <div class="form-group">
                    <label for="cliente_codigo">Código do Cliente</label>
                    <input type="text" id="cliente_codigo" required>
                </div>
                <div class="form-group">
                    <label for="produto_codigo">Código do Produto (Opcional)</label>
                    <input type="text" id="produto_codigo">
                </div>
                <div class="form-group">
                    <label for="quantidade">Quantidade</label>
                    <input type="number" id="quantidade" min="1">
                </div>
                <div class="form-group">
                    <label for="valor">Valor</label>
                    <input type="number" id="valor" step="0.01" required>
                </div>
                <div class="form-group">
                    <label for="descricao">Descrição</label>
                    <textarea id="descricao" rows="3" required></textarea>
                </div>
                <div class="form-group">
                    <label for="observacoes">Observações</label>
                    <textarea id="observacoes" rows="2"></textarea>
                </div>
                <div class="modal-footer">
                    <button type="button" class="secondary-btn" onclick="document.getElementById('modal-container').classList.add('hidden')">Cancelar</button>
                    <button type="submit" class="primary-btn">Salvar Crédito</button>
                </div>
            </form>
        `;
        showModal('Novo Crédito', content);
        
        // Popular o select de vendedores
        populateVendedoresSelect('vendedor_id');

        // Lógica para preencher descrição com nome do produto
        const produtoInput = document.getElementById('produto_codigo');
        const descricaoTextarea = document.getElementById('descricao');
        produtoInput.addEventListener('blur', async () => {
            if (produtoInput.value) {
                const { data } = await supabase.from('produtos_erp').select('nome').eq('codigo', produtoInput.value).single();
                if (data) {
                    descricaoTextarea.value = data.nome;
                    descricaoTextarea.readOnly = true;
                } else {
                    descricaoTextarea.value = '';
                    descricaoTextarea.readOnly = false;
                }
            } else {
                descricaoTextarea.readOnly = false;
            }
        });

        // Lógica do formulário
        document.getElementById('novo-credito-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newCredito = {
                n_registro: document.getElementById('n_registro').value || null,
                vendedor_id: document.getElementById('vendedor_id').value,
                cliente_codigo: document.getElementById('cliente_codigo').value,
                produto_codigo: document.getElementById('produto_codigo').value || null,
                quantidade: document.getElementById('quantidade').value ? parseInt(document.getElementById('quantidade').value) : null,
                valor: parseFloat(document.getElementById('valor').value),
                descricao: document.getElementById('descricao').value,
                observacoes: document.getElementById('observacoes').value || null,
                usuario_id_criacao: currentUser.id,
                status: 'DISPONÍVEL'
            };

            const { error } = await supabase.from('creditos').insert(newCredito);
            if (error) {
                alert('Erro ao criar crédito: ' + error.message);
            } else {
                alert('Crédito criado com sucesso!');
                hideModal();
                loadCreditos();
            }
        });
    }
    
    async function populateVendedoresSelect(selectId) {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option>Carregando...</option>';
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nome')
            .contains('funcoes', ['vendedor']);
        
        if (data) {
            select.innerHTML = data.map(v => `<option value="${v.id}">${v.nome}</option>`).join('');
        }
    }

    function showAbaterCreditoModal(id, valor) {
        const content = `
            <form id="abater-credito-form">
                <input type="hidden" id="credito_id" value="${id}">
                <div class="form-group">
                    <label for="pedido_abatimento">Código do Pedido/Lançamento</label>
                    <input type="text" id="pedido_abatimento" required>
                </div>
                <div class="form-group">
                    <label for="valor_abatimento">Valor a Abater</label>
                    <input type="number" id="valor_abatimento" step="0.01" value="${parseFloat(valor).toFixed(2)}" max="${valor}" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="secondary-btn" onclick="document.getElementById('modal-container').classList.add('hidden')">Cancelar</button>
                    <button type="submit" class="primary-btn">Confirmar Abatimento</button>
                </div>
            </form>
        `;
        showModal('Abater Crédito', content);

        document.getElementById('abater-credito-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const creditoId = document.getElementById('credito_id').value;
            const pedido = document.getElementById('pedido_abatimento').value;
            const valorAbater = parseFloat(document.getElementById('valor_abatimento').value);
            const valorOriginal = parseFloat(valor);

            if (valorAbater > valorOriginal) {
                alert('O valor a abater não pode ser maior que o valor do crédito.');
                return;
            }

            if (valorAbater < valorOriginal) {
                // Divisão do crédito
                const valorRestante = valorOriginal - valorAbater;
                
                // 1. Pega os dados originais para criar o novo crédito
                const { data: originalCredito, error: fetchError } = await supabase.from('creditos').select('*').eq('id', creditoId).single();
                if(fetchError) {
                    alert('Erro ao buscar dados do crédito original.');
                    return;
                }

                // 2. Atualiza o crédito original para o valor abatido
                const { error: updateError } = await supabase
                    .from('creditos')
                    .update({
                        valor: valorAbater,
                        status: 'ABATIDO',
                        pedido_abatimento: pedido
                    })
                    .eq('id', creditoId);

                // 3. Cria um novo crédito com o valor restante
                const newCreditoRestante = { ...originalCredito };
                delete newCreditoRestante.id;
                delete newCreditoRestante.created_at;
                newCreditoRestante.valor = valorRestante;
                newCreditoRestante.status = 'DISPONÍVEL';
                newCreditoRestante.pedido_abatimento = null;
                newCreditoRestante.observacoes = `Crédito restante do abatimento parcial do ID ${creditoId}`;

                const { error: insertError } = await supabase.from('creditos').insert(newCreditoRestante);

                if (updateError || insertError) {
                    alert('Ocorreu um erro ao dividir o crédito.');
                    // Idealmente, aqui deveria ter uma lógica de "rollback"
                } else {
                    alert('Crédito abatido parcialmente com sucesso!');
                }

            } else {
                // Abatimento total
                const { error } = await supabase
                    .from('creditos')
                    .update({ status: 'ABATIDO', pedido_abatimento: pedido })
                    .eq('id', creditoId);
                
                if (error) {
                    alert('Erro ao abater crédito: ' + error.message);
                } else {
                    alert('Crédito abatido com sucesso!');
                }
            }
            hideModal();
            loadCreditos();
        });
    }

    // =================================================================================
    //  INICIALIZAÇÃO
    // =================================================================================
    checkSession();
});
