document.addEventListener('DOMContentLoaded', () => {

    // =================================================================================
    // 1. CONFIGURAÇÃO DO SUPABASE (INSIRA SUAS CHAVES AQUI)
    // =================================================================================
    const SUPABASE_URL = 'https://vahbjeewkjqwcxgdrtnf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhaGJqZWV3a2pxd2N4Z2RydG5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjMzNDUsImV4cCI6MjA3MzUzOTM0NX0.XHnOh4qB3yNTWOL5JhhJnV5va4Q4bKGhqQ7gv-czdRQ';

    // Verificação para garantir que as chaves foram inseridas
    if (SUPABASE_URL === 'SUA_URL_DO_PROJETO_SUPABASE' || SUPABASE_ANON_KEY === 'SUA_CHAVE_ANON_PUBLICA') {
        alert('ERRO: Por favor, insira suas credenciais do Supabase no arquivo script.js para que a aplicação possa funcionar.');
    }

    const { createClient } = supabase;
    const dbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


    // =================================================================================
    // ESTADO DA APLICAÇÃO
    // =================================================================================
    let state = {
        currentUser: null,
        activeView: 'login',
        credits: {
            currentPage: 1,
            itemsPerPage: 50,
        }
    };

    // =================================================================================
    // SELETORES DE ELEMENTOS DO DOM
    // =================================================================================
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const welcomeMessage = document.getElementById('welcome-message');
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    
    const dashboardCardsContainer = document.getElementById('dashboard-cards-container');
    const paymentsTableBody = document.querySelector('#payments-table tbody');
    const filterPaymentsBtn = document.getElementById('filter-payments-btn');
    const creditsTableBody = document.querySelector('#credits-table tbody');
    const searchCreditsBtn = document.getElementById('search-credits-btn');
    const creditsPagination = document.getElementById('credits-pagination');
    const modalContainer = document.getElementById('modal-container');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalFooter = document.getElementById('modal-footer');
    const modalCloseBtn = document.querySelector('.modal-close');

    // =================================================================================
    // LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO (ATUALIZADA)
    // =================================================================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        // Alterado para 'login-input' para corresponder ao HTML
        const loginInput = document.getElementById('login-input').value;
        const password = document.getElementById('password').value;

        let userEmail = loginInput;

        // Verifica se o input parece ser um nome de usuário (não contém '@')
        if (!loginInput.includes('@')) {
            // Se for um nome de usuário, busca o e-mail correspondente na tabela de perfis
            const { data: profile, error: profileError } = await dbClient
                .from('profiles')
                .select('email') // Seleciona apenas a coluna de e-mail
                .eq('username', loginInput) // Onde o username corresponde ao input
                .single(); // Espera encontrar apenas um resultado

            if (profileError || !profile) {
                loginError.textContent = 'Usuário ou senha inválidos.';
                console.error('Usuário não encontrado:', loginInput);
                return;
            }

            // Se encontrou, usa o e-mail do perfil para o login
            userEmail = profile.email;
        }

        // Agora, tenta fazer o login com o e-mail (seja o digitado ou o encontrado)
        const { data: { user }, error: authError } = await dbClient.auth.signInWithPassword({
            email: userEmail,
            password: password
        });

        if (authError) {
            loginError.textContent = 'Usuário ou senha inválidos.';
            return;
        }

        if (user) {
            // Após o login bem-sucedido, busca o perfil completo para obter as permissões
            const { data: profile, error: fetchProfileError } = await dbClient
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            
            if (fetchProfileError || !profile) {
                loginError.textContent = 'Não foi possível carregar o perfil do usuário.';
                await dbClient.auth.signOut();
                return;
            }
            
            state.currentUser = profile;
            initializeApp();
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await dbClient.auth.signOut();
        state.currentUser = null;
        loginError.textContent = '';
        // Alterado para 'login-input' para limpar o campo correto
        document.getElementById('login-input').value = '';
        document.getElementById('password').value = '';
        appView.classList.add('hidden');
        loginView.classList.remove('hidden');
        loginView.classList.add('active-view');
    });

    function initializeApp() {
        loginView.classList.remove('active-view');
        loginView.classList.add('hidden');
        appView.classList.remove('hidden');
        welcomeMessage.textContent = `Bem-vindo(a), ${state.currentUser.full_name}!`;
        
        setupUIByPermissions();
        navigateTo('dashboard');
    }

    // =================================================================================
    // NAVEGAÇÃO E CONTROLE DE UI
    // =================================================================================
    function setupUIByPermissions() {
        const permissions = state.currentUser.permissions || {}; // Garante que permissions não seja nulo
        document.getElementById('nav-payments').style.display = (permissions.can_send_payments || permissions.can_edit_payments || permissions.can_confirm_payments || permissions.can_process_payments) ? 'block' : 'none';
        document.getElementById('nav-credits').style.display = (permissions.can_use_credits || permissions.can_create_credits) ? 'block' : 'none';
        document.getElementById('nav-users').style.display = permissions.can_manage_users ? 'block' : 'none';
    }
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.getAttribute('data-view'));
        });
    });

    function navigateTo(viewName) {
        views.forEach(view => view.classList.remove('active-view'));
        navItems.forEach(nav => nav.classList.remove('active'));

        document.getElementById(`${viewName}-view`).classList.add('active-view');
        document.querySelector(`.nav-item[data-view="${viewName}"]`).classList.add('active');
        
        state.activeView = viewName;
        renderCurrentView();
    }

    function renderCurrentView() {
        switch (state.activeView) {
            case 'dashboard':
                renderDashboard();
                break;
            case 'payments':
                renderPaymentsTable();
                break;
            case 'credits':
                creditsTableBody.innerHTML = '<tr><td colspan="7">Utilize a busca para listar os créditos.</td></tr>';
                creditsPagination.innerHTML = '';
                break;
        }
    }

    // =================================================================================
    // LÓGICA DO DASHBOARD
    // =================================================================================
    async function renderDashboard() {
        const { permissions } = state.currentUser;
        dashboardCardsContainer.innerHTML = 'Carregando cards...';
        
        const promises = [];

        if (permissions.can_confirm_payments) {
            promises.push(dbClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Aguardando Confirmação'));
        }
        if (permissions.can_process_payments) {
            promises.push(dbClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Confirmado'));
        }
        promises.push(dbClient.from('credits').select('id', { count: 'exact', head: true }).eq('status', 'Disponível').eq('consultor_id', state.currentUser.id));

        const results = await Promise.all(promises);
        let cardsHtml = '';
        
        let promiseIndex = 0;
        if (permissions.can_confirm_payments) {
            if (!results[promiseIndex].error) cardsHtml += createDashboardCard('Pagamentos Aguardando Confirmação', results[promiseIndex].count);
            promiseIndex++;
        }
        if (permissions.can_process_payments) {
            if (!results[promiseIndex].error) cardsHtml += createDashboardCard('Pagamentos Prontos para Faturar', results[promiseIndex].count);
            promiseIndex++;
        }
        if (!results[promiseIndex].error && results[promiseIndex].count > 0) {
            cardsHtml += createDashboardCard('Seus clientes com créditos', results[promiseIndex].count);
        }
        
        dashboardCardsContainer.innerHTML = cardsHtml || '<p>Nenhum card disponível para seu perfil.</p>';
    }

    function createDashboardCard(title, count) {
        return `<div class="dashboard-card"><h3>${title}</h3><div class="count">${count}</div></div>`;
    }

    // =================================================================================
    // LÓGICA DE COMPROVANTES (PAYMENTS)
    // =================================================================================
    filterPaymentsBtn.addEventListener('click', renderPaymentsTable);

    async function renderPaymentsTable() {
        paymentsTableBody.innerHTML = '<tr><td colspan="7">Carregando comprovantes...</td></tr>';
        
        let query = dbClient.from('payments').select(`*, payment_types(name, color_theme)`);
        
        const statusFilter = document.getElementById('payment-status-filter').value;
        if (statusFilter) query = query.eq('status', statusFilter);
        
        const dateFilter = document.getElementById('payment-date-filter').value;
        if (dateFilter) {
            const nextDay = new Date(new Date(dateFilter).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query = query.gte('created_at', dateFilter).lt('created_at', nextDay);
        }

        const { data: payments, error } = await query.order('created_at', { ascending: false });

        if (error) {
            paymentsTableBody.innerHTML = '<tr><td colspan="7">Erro ao carregar comprovantes.</td></tr>';
            return;
        }
        if (payments.length === 0) {
            paymentsTableBody.innerHTML = '<tr><td colspan="7">Nenhum comprovante encontrado.</td></tr>';
            return;
        }

        paymentsTableBody.innerHTML = '';
        payments.forEach(payment => {
            const tr = document.createElement('tr');
            tr.className = `payment-row-${payment.payment_types?.color_theme || 'secondary'}`;
            tr.innerHTML = `
                <td>${payment.id}</td>
                <td>${payment.client_name}</td>
                <td>R$ ${payment.value.toFixed(2)}</td>
                <td>${payment.payment_types?.name || 'N/A'}</td>
                <td>${payment.status}</td>
                <td>${new Date(payment.created_at).toLocaleDateString()}</td>
                <td class="action-buttons">${getPaymentActionButtons(payment)}</td>
            `;
            paymentsTableBody.appendChild(tr);
        });
        
        addPaymentActionListeners();
    }

    function getPaymentActionButtons(payment) {
        const { permissions } = state.currentUser;
        let buttons = '';
        if (permissions.can_edit_payments && ['Aguardando Confirmação', 'Confirmado'].includes(payment.status)) {
            buttons += `<button class="btn btn-secondary btn-edit-payment" data-id="${payment.id}">Editar</button>`;
        }
        if (permissions.can_process_payments && payment.status === 'Confirmado') {
            buttons += `<button class="btn btn-success btn-faturar-payment" data-id="${payment.id}">Faturar</button>`;
        }
        if (permissions.can_convert_payment_to_credit && payment.status === 'Confirmado') {
            buttons += `<button class="btn btn-warning btn-convert-credit" data-id="${payment.id}">Crédito</button>`;
        }
        return buttons || 'N/A';
    }
    
    function addPaymentActionListeners() {
        document.querySelectorAll('.btn-faturar-payment').forEach(btn => btn.addEventListener('click', handleFaturarClick));
        document.querySelectorAll('.btn-convert-credit').forEach(btn => btn.addEventListener('click', handleConvertToCreditClick));
    }

    // =================================================================================
    // LÓGICA DE CRÉDITOS
    // =================================================================================
    searchCreditsBtn.addEventListener('click', () => {
        state.credits.currentPage = 1;
        renderCreditsTable();
    });

    async function renderCreditsTable() {
        creditsTableBody.innerHTML = '<tr><td colspan="7">Buscando créditos...</td></tr>';
        
        const { currentPage, itemsPerPage } = state.credits;
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage - 1;

        let query = dbClient.from('credits').select('*', { count: 'exact' });

        const searchTerm = document.getElementById('credit-client-search').value;
        if (searchTerm) {
            query = query.or(`client_name.ilike.%${searchTerm}%,client_code.ilike.%${searchTerm}%`);
        }
        
        const consultorId = document.getElementById('credit-consultor-select').value;
        if(consultorId) {
            query = query.eq('consultor_id', consultorId);
        }

        const { data: credits, error, count } = await query.range(start, end).order('created_at', { ascending: false });

        if (error) {
            creditsTableBody.innerHTML = '<tr><td colspan="7">Erro ao buscar créditos.</td></tr>';
            return;
        }
        if (credits.length === 0) {
            creditsTableBody.innerHTML = '<tr><td colspan="7">Nenhum crédito encontrado.</td></tr>';
            creditsPagination.innerHTML = '';
            return;
        }

        creditsTableBody.innerHTML = '';
        credits.forEach(credit => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${credit.id}</td>
                <td>${credit.client_name} (${credit.client_code || 'N/A'})</td>
                <td>${credit.description}</td>
                <td>R$ ${Number(credit.original_value).toFixed(2)}</td>
                <td>R$ ${Number(credit.current_value).toFixed(2)}</td>
                <td>${credit.status}</td>
                <td class="action-buttons">${credit.status === 'Disponível' && state.currentUser.permissions.can_use_credits ? `<button class="btn btn-primary">Usar</button>` : ''}</td>
            `;
            creditsTableBody.appendChild(tr);
        });

        renderCreditsPagination(count);
    }

    function renderCreditsPagination(totalItems) {
        creditsPagination.innerHTML = '';
        const totalPages = Math.ceil(totalItems / state.credits.itemsPerPage);
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.textContent = 'Anterior';
        prevBtn.className = 'btn';
        prevBtn.disabled = state.credits.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            state.credits.currentPage--;
            renderCreditsTable();
        });

        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Página ${state.credits.currentPage} de ${totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Próxima';
        nextBtn.className = 'btn';
        nextBtn.disabled = state.credits.currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            state.credits.currentPage++;
            renderCreditsTable();
        });

        creditsPagination.append(prevBtn, pageInfo, nextBtn);
    }

    // =================================================================================
    // LÓGICA DO MODAL E AÇÕES
    // =================================================================================
    modalCloseBtn.addEventListener('click', closeModal);
    modalContainer.addEventListener('click', (e) => e.target === modalContainer && closeModal());

    function openModal(title, body, footerButtons) {
        modalTitle.innerHTML = title;
        modalBody.innerHTML = body;
        modalFooter.innerHTML = ''; // Limpa botões antigos
        
        footerButtons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.className = btnConfig.className;
            button.textContent = btnConfig.text;
            button.addEventListener('click', btnConfig.handler);
            modalFooter.appendChild(button);
        });

        modalContainer.classList.remove('hidden');
    }

    function closeModal() {
        modalContainer.classList.add('hidden');
    }

    async function handleFaturarClick(e) {
        const paymentId = parseInt(e.target.dataset.id);
        const { data: payment, error } = await dbClient.from('payments').select('*').eq('id', paymentId).single();
        if (error || !payment) return alert('Erro ao carregar dados do pagamento.');

        const bodyHtml = `
            <p>Cliente: <strong>${payment.client_name}</strong></p>
            <p>Valor Confirmado: <strong>R$ ${payment.value.toFixed(2)}</strong></p>
            <div class="form-group"><label for="faturar-order-code">Código do Pedido</label><input type="text" id="faturar-order-code" required></div>
            <p>Utilizar o valor total (R$ ${payment.value.toFixed(2)})?</p>
            <button class="btn btn-success" id="faturar-total-sim">Sim</button> <button class="btn btn-secondary" id="faturar-total-nao">Não</button>
            <div id="faturar-valor-parcial-group" class="form-group hidden"><label for="faturar-valor-parcial">Valor utilizado no pedido</label><input type="number" id="faturar-valor-parcial" step="0.01"></div>
        `;

        const footerButtons = [
            { text: 'Cancelar', className: 'btn btn-secondary', handler: closeModal },
            { text: 'Confirmar Faturamento', className: 'btn btn-primary', handler: async () => {
                const orderCode = document.getElementById('faturar-order-code').value;
                if (!orderCode) return alert('O código do pedido é obrigatório.');

                if (useTotal) {
                    const { error } = await dbClient.from('payments').update({ status: 'Faturado', order_code: orderCode, processed_at: new Date(), processed_by_user_id: state.currentUser.id }).eq('id', paymentId);
                    if (error) return alert('Erro ao faturar pagamento.');
                } else {
                    const usedValue = parseFloat(document.getElementById('faturar-valor-parcial').value);
                    if (!usedValue || usedValue <= 0 || usedValue >= payment.value) return alert('Valor parcial inválido.');

                    const { error: updateError } = await dbClient.from('payments').update({ status: 'Faturado Parcialmente', value: usedValue, order_code: orderCode, processed_at: new Date(), processed_by_user_id: state.currentUser.id }).eq('id', paymentId);
                    if (updateError) return alert('Erro ao atualizar pagamento original.');
                    
                    const remainingValue = payment.value - usedValue;
                    const { error: insertError } = await dbClient.from('payments').insert([{ client_name: payment.client_name, value: remainingValue, payment_type_id: payment.payment_type_id, status: 'Confirmado', parent_payment_id: paymentId, created_by_user_id: state.currentUser.id }]);
                    if (insertError) return alert('Erro ao criar pagamento restante. Contate o suporte.');
                }
                
                alert('Operação de faturamento concluída!');
                closeModal();
                renderPaymentsTable();
            }}
        ];

        openModal(`Faturar Pagamento #${payment.id}`, bodyHtml, footerButtons);
        
        let useTotal = true;
        document.getElementById('faturar-total-sim').addEventListener('click', () => {
            document.getElementById('faturar-valor-parcial-group').classList.add('hidden');
            useTotal = true;
        });
        document.getElementById('faturar-total-nao').addEventListener('click', () => {
            document.getElementById('faturar-valor-parcial-group').classList.remove('hidden');
            useTotal = false;
        });
    }

    async function handleConvertToCreditClick(e) {
        const paymentId = parseInt(e.target.dataset.id);
        const { data: payment, error } = await dbClient.from('payments').select('*').eq('id', paymentId).single();
        if (error || !payment) return alert('Erro ao carregar dados do pagamento.');

        const bodyHtml = `
            <p>Deseja converter <strong>R$ ${payment.value.toFixed(2)}</strong> em crédito para <strong>${payment.client_name}</strong>?</p>
            <div class="form-group"><label for="credit-description">Descrição do Crédito</label><input type="text" id="credit-description" value="Saldo do pagamento de ${new Date(payment.created_at).toLocaleDateString()}" required></div>
        `;

        const footerButtons = [
            { text: 'Cancelar', className: 'btn btn-secondary', handler: closeModal },
            { text: 'Confirmar Conversão', className: 'btn btn-primary', handler: async () => {
                const { error: updateError } = await dbClient.from('payments').update({ status: 'Convertido em Crédito', last_modified_at: new Date(), last_modified_by_user_id: state.currentUser.id }).eq('id', paymentId);
                if (updateError) return alert('Erro ao atualizar status do pagamento.');

                const { error: insertError } = await dbClient.from('credits').insert([{ client_name: payment.client_name, description: document.getElementById('credit-description').value, original_value: payment.value, current_value: payment.value, status: 'Disponível', created_by_user_id: state.currentUser.id }]);
                if (insertError) return alert('Erro ao criar o crédito. Contate o suporte.');

                alert('Pagamento convertido em crédito com sucesso!');
                closeModal();
                renderPaymentsTable();
            }}
        ];
        
        openModal(`Converter Pagamento #${payment.id} em Crédito`, bodyHtml, footerButtons);
    }
});
