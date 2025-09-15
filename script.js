document.addEventListener('DOMContentLoaded', () => {

    // =================================================================================
    // 1. CONFIGURAÇÃO DO SUPABASE (INSIRA SUAS CHAVES AQUI)
    // =================================================================================
    const SUPABASE_URL = 'https://vahbjeewkjqwcxgdrtnf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhaGJqZWV3a2pxd2N4Z2RydG5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjMzNDUsImV4cCI6MjA3MzUzOTM0NX0.XHnOh4qB3yNTWOL5JhhJnV5va4Q4bKGhqQ7gv-czdRQ';

    const { createClient } = supabase;
    const dbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // =================================================================================
    // ESTADO DA APLICAÇÃO
    // =================================================================================
    let state = {
        currentUser: null,
        activeView: 'login',
        credits: { currentPage: 1, itemsPerPage: 50 },
        allUsers: [], // Cache para preencher selects
    };

    // =================================================================================
    // SELETORES DE ELEMENTOS DO DOM
    // =================================================================================
    const loginView = document.getElementById('login-view'),
          appView = document.getElementById('app-view'),
          loginForm = document.getElementById('login-form'),
          loginError = document.getElementById('login-error'),
          logoutBtn = document.getElementById('logout-btn'),
          welcomeMessage = document.getElementById('welcome-message'),
          navItems = document.querySelectorAll('.nav-item'),
          views = document.querySelectorAll('.view'),
          dashboardCardsContainer = document.getElementById('dashboard-cards-container'),
          paymentsTableBody = document.querySelector('#payments-table tbody'),
          filterPaymentsBtn = document.getElementById('filter-payments-btn'),
          creditsTableBody = document.querySelector('#credits-table tbody'),
          searchCreditsBtn = document.getElementById('search-credits-btn'),
          creditsPagination = document.getElementById('credits-pagination'),
          requestsTableBody = document.querySelector('#requests-table tbody'),
          addRequestBtn = document.getElementById('add-request-btn'),
          exportPaymentsCsvBtn = document.getElementById('export-payments-csv'),
          exportCreditsCsvBtn = document.getElementById('export-credits-csv'),
          usersTableBody = document.querySelector('#users-table tbody'),
          modalContainer = document.getElementById('modal-container'),
          modalTitle = document.getElementById('modal-title'),
          modalBody = document.getElementById('modal-body'),
          modalFooter = document.getElementById('modal-footer'),
          modalCloseBtn = document.querySelector('.modal-close');

    // =================================================================================
    // LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO
    // =================================================================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.textContent = '';
        const loginInput = document.getElementById('login-input').value;
        const password = document.getElementById('password').value;
        let userEmail = loginInput;

        if (!loginInput.includes('@')) {
            const usernameUpper = loginInput.toUpperCase();
            const { data: profile, error } = await dbClient.from('profiles').select('email').eq('username', usernameUpper).single();
            if (error || !profile) {
                loginError.textContent = 'Usuário ou senha inválidos.';
                return;
            }
            userEmail = profile.email;
        }

        const { data: { user }, error: authError } = await dbClient.auth.signInWithPassword({ email: userEmail, password });
        if (authError) {
            loginError.textContent = 'Usuário ou senha inválidos.';
            return;
        }

        if (user) {
            const { data: profile, error } = await dbClient.from('profiles').select('*').eq('id', user.id).single();
            if (error || !profile) {
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
        document.getElementById('login-input').value = '';
        document.getElementById('password').value = '';
        appView.classList.add('hidden');
        loginView.classList.remove('hidden');
        loginView.classList.add('active-view');
    });

    async function initializeApp() {
        loginView.classList.add('hidden');
        appView.classList.remove('hidden');
        welcomeMessage.textContent = `Bem-vindo(a), ${state.currentUser.full_name}!`;
        setupUIByPermissions();
        await fetchInitialData();
        navigateTo('dashboard');
    }
    
    async function fetchInitialData() {
        const { data, error } = await dbClient.from('profiles').select('id, full_name');
        if (!error) {
            state.allUsers = data;
            const consultorSelect = document.getElementById('credit-consultor-select');
            consultorSelect.innerHTML = '<option value="">Selecione...</option>';
            data.forEach(user => {
                consultorSelect.innerHTML += `<option value="${user.id}">${user.full_name}</option>`;
            });
        }
    }

    // =================================================================================
    // NAVEGAÇÃO E CONTROLE DE UI
    // =================================================================================
    function setupUIByPermissions() {
        const p = state.currentUser.permissions || {};
        document.getElementById('nav-payments').style.display = (p.can_send_payments || p.can_edit_payments || p.can_confirm_payments || p.can_process_payments) ? 'block' : 'none';
        document.getElementById('nav-credits').style.display = (p.can_use_credits || p.can_create_credits) ? 'block' : 'none';
        document.getElementById('nav-users').style.display = p.can_manage_users ? 'block' : 'none';
        document.getElementById('nav-requests').style.display = 'block';
        document.getElementById('nav-reports').style.display = 'block';
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
            case 'dashboard': renderDashboard(); break;
            case 'payments': renderPaymentsTable(); break;
            case 'credits':
                creditsTableBody.innerHTML = '<tr><td colspan="7">Utilize a busca para listar os créditos.</td></tr>';
                creditsPagination.innerHTML = '';
                break;
            case 'requests': renderRequestsTable(); break;
            case 'reports': break;
            case 'users': renderUsersTable(); break;
        }
    }
    
    // =================================================================================
    // LÓGICA DO DASHBOARD
    // =================================================================================
    async function renderDashboard() {
        const { permissions } = state.currentUser;
        dashboardCardsContainer.innerHTML = 'Carregando cards...';
        const promises = [];
        if (permissions.can_confirm_payments) promises.push(dbClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Aguardando Confirmação'));
        if (permissions.can_process_payments) promises.push(dbClient.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Confirmado'));
        promises.push(dbClient.from('credits').select('id', { count: 'exact', head: true }).eq('status', 'Disponível').eq('consultor_id', state.currentUser.id));
        const results = await Promise.all(promises);
        let cardsHtml = '';
        let promiseIndex = 0;
        if (permissions.can_confirm_payments) { if (!results[promiseIndex].error) cardsHtml += createDashboardCard('Pagamentos Aguardando Confirmação', results[promiseIndex].count); promiseIndex++; }
        if (permissions.can_process_payments) { if (!results[promiseIndex].error) cardsHtml += createDashboardCard('Pagamentos Prontos para Faturar', results[promiseIndex].count); promiseIndex++; }
        if (!results[promiseIndex].error && results[promiseIndex].count > 0) cardsHtml += createDashboardCard('Seus clientes com créditos', results[promiseIndex].count);
        dashboardCardsContainer.innerHTML = cardsHtml || '<p>Nenhum card disponível para seu perfil.</p>';
    }
    function createDashboardCard(title, count) { return `<div class="dashboard-card"><h3>${title}</h3><div class="count">${count}</div></div>`; }

    // =================================================================================
    // LÓGICA DE COMPROVANTES (PAYMENTS)
    // =================================================================================
    filterPaymentsBtn.addEventListener('click', renderPaymentsTable);
    async function renderPaymentsTable() {
        paymentsTableBody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
        let query = dbClient.from('payments').select(`*, payment_types(name, color_theme)`);
        const statusFilter = document.getElementById('payment-status-filter').value;
        if (statusFilter) query = query.eq('status', statusFilter);
        const dateFilter = document.getElementById('payment-date-filter').value;
        if (dateFilter) {
            const nextDay = new Date(new Date(dateFilter).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query = query.gte('created_at', dateFilter).lt('created_at', nextDay);
        }
        const { data: payments, error } = await query.order('created_at', { ascending: false });
        if (error) return paymentsTableBody.innerHTML = '<tr><td colspan="7">Erro ao carregar.</td></tr>';
        if (payments.length === 0) return paymentsTableBody.innerHTML = '<tr><td colspan="7">Nenhum comprovante encontrado.</td></tr>';
        paymentsTableBody.innerHTML = '';
        payments.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = `payment-row-${p.payment_types?.color_theme || 'secondary'}`;
            tr.innerHTML = `<td>${p.id}</td><td>${p.client_name}</td><td>R$ ${p.value.toFixed(2)}</td><td>${p.payment_types?.name || 'N/A'}</td><td>${p.status}</td><td>${new Date(p.created_at).toLocaleDateString()}</td><td class="action-buttons">${getPaymentActionButtons(p)}</td>`;
            paymentsTableBody.appendChild(tr);
        });
        addPaymentActionListeners();
    }
    function getPaymentActionButtons(payment) {
        const p = state.currentUser.permissions; let buttons = '';
        if (p.can_edit_payments && ['Aguardando Confirmação', 'Confirmado'].includes(payment.status)) buttons += `<button class="btn btn-secondary btn-edit-payment" data-id="${payment.id}">Editar</button>`;
        if (p.can_process_payments && payment.status === 'Confirmado') buttons += `<button class="btn btn-success btn-faturar-payment" data-id="${payment.id}">Faturar</button>`;
        if (p.can_convert_payment_to_credit && payment.status === 'Confirmado') buttons += `<button class="btn btn-warning btn-convert-credit" data-id="${payment.id}">Crédito</button>`;
        return buttons || 'N/A';
    }
    function addPaymentActionListeners() {
        document.querySelectorAll('.btn-faturar-payment').forEach(btn => btn.addEventListener('click', handleFaturarClick));
        document.querySelectorAll('.btn-convert-credit').forEach(btn => btn.addEventListener('click', handleConvertToCreditClick));
    }

    // =================================================================================
    // LÓGICA DE CRÉDITOS
    // =================================================================================
    searchCreditsBtn.addEventListener('click', () => { state.credits.currentPage = 1; renderCreditsTable(); });
    async function renderCreditsTable() {
        creditsTableBody.innerHTML = '<tr><td colspan="7">Buscando...</td></tr>';
        const { currentPage, itemsPerPage } = state.credits;
        const start = (currentPage - 1) * itemsPerPage, end = start + itemsPerPage - 1;
        let query = dbClient.from('credits').select('*, consultor:profiles(full_name)', { count: 'exact' });
        const searchTerm = document.getElementById('credit-client-search').value;
        if (searchTerm) query = query.or(`client_name.ilike.%${searchTerm}%,client_code.ilike.%${searchTerm}%`);
        const consultorId = document.getElementById('credit-consultor-select').value;
        if(consultorId) query = query.eq('consultor_id', consultorId);
        const { data: credits, error, count } = await query.range(start, end).order('created_at', { ascending: false });
        if (error) return creditsTableBody.innerHTML = '<tr><td colspan="7">Erro ao buscar.</td></tr>';
        if (credits.length === 0) { creditsTableBody.innerHTML = '<tr><td colspan="7">Nenhum crédito encontrado.</td></tr>'; creditsPagination.innerHTML = ''; return; }
        creditsTableBody.innerHTML = '';
        credits.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.id}</td><td>${c.client_name} (${c.client_code || 'N/A'})</td><td>${c.description}</td><td>R$ ${Number(c.current_value).toFixed(2)}</td><td>${c.status}</td><td>${c.consultor?.full_name || 'N/A'}</td><td class="action-buttons">${c.status === 'Disponível' && state.currentUser.permissions.can_use_credits ? `<button class="btn btn-primary">Usar</button>` : ''}</td>`;
            creditsTableBody.appendChild(tr);
        });
        renderCreditsPagination(count);
    }
    function renderCreditsPagination(totalItems) {
        creditsPagination.innerHTML = '';
        const totalPages = Math.ceil(totalItems / state.credits.itemsPerPage);
        if (totalPages <= 1) return;
        const prevBtn = document.createElement('button'); prevBtn.textContent = 'Anterior'; prevBtn.className = 'btn'; prevBtn.disabled = state.credits.currentPage === 1;
        prevBtn.addEventListener('click', () => { state.credits.currentPage--; renderCreditsTable(); });
        const pageInfo = document.createElement('span'); pageInfo.textContent = `Página ${state.credits.currentPage} de ${totalPages}`;
        const nextBtn = document.createElement('button'); nextBtn.textContent = 'Próxima'; nextBtn.className = 'btn'; nextBtn.disabled = state.credits.currentPage === totalPages;
        nextBtn.addEventListener('click', () => { state.credits.currentPage++; renderCreditsTable(); });
        creditsPagination.append(prevBtn, pageInfo, nextBtn);
    }

    // =================================================================================
    // LÓGICA DE GESTÃO DE USUÁRIOS
    // =================================================================================
    async function renderUsersTable() {
        usersTableBody.innerHTML = '<tr><td colspan="4">Carregando usuários...</td></tr>';
        const { data: users, error } = await dbClient.from('profiles').select('*').order('full_name');
        if (error) return usersTableBody.innerHTML = '<tr><td colspan="4">Erro ao carregar usuários.</td></tr>';
        usersTableBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${user.full_name || ''}</td><td>${user.username || ''}</td><td>${user.email || ''}</td><td class="action-buttons"><button class="btn btn-secondary btn-edit-user" data-id="${user.id}">Editar</button></td>`;
            usersTableBody.appendChild(tr);
        });
        document.querySelectorAll('.btn-edit-user').forEach(btn => btn.addEventListener('click', handleEditUserClick));
    }
    async function handleEditUserClick(e) {
        const userId = e.target.dataset.id;
        const { data: user, error } = await dbClient.from('profiles').select('*').eq('id', userId).single();
        if (error) return alert('Erro ao buscar dados do usuário.');
        const p = user.permissions || {};
        const allP = ['can_send_payments', 'can_edit_payments', 'can_confirm_payments', 'can_process_payments', 'can_convert_payment_to_credit', 'can_use_credits', 'can_create_credits', 'can_manage_users'];
        let permissionsHtml = allP.map(perm => `<div class="permission-item"><input type="checkbox" id="perm_${perm}" name="${perm}" ${p[perm] ? 'checked' : ''}><label for="perm_${perm}">${perm.replace(/_/g, ' ')}</label></div>`).join('');
        const bodyHtml = `<div class="form-group"><label for="user-fullname">Nome Completo</label><input type="text" id="user-fullname" value="${user.full_name || ''}"></div><div class="form-group"><label for="user-username">Usuário (MAIÚSCULAS)</label><input type="text" id="user-username" value="${user.username || ''}"></div><div class="form-group"><label for="user-email">Email</label><input type="email" id="user-email" value="${user.email || ''}" disabled></div><h4>Permissões</h4><div class="permissions-grid">${permissionsHtml}</div>`;
        const footerButtons = [ { text: 'Cancelar', className: 'btn btn-secondary', handler: closeModal }, { text: 'Salvar Alterações', className: 'btn btn-primary', handler: async () => {
            const newPermissions = {};
            allP.forEach(perm => { newPermissions[perm] = document.getElementById(`perm_${perm}`).checked; });
            const updatedProfile = { full_name: document.getElementById('user-fullname').value, username: document.getElementById('user-username').value.toUpperCase(), permissions: newPermissions };
            const { error } = await dbClient.from('profiles').update(updatedProfile).eq('id', userId);
            if (error) alert('Erro ao salvar: ' + error.message);
            else { alert('Usuário atualizado!'); closeModal(); renderUsersTable(); }
        }}];
        openModal(`Editar Usuário: ${user.full_name}`, bodyHtml, footerButtons);
    }

    // =================================================================================
    // LÓGICA DE SOLICITAÇÕES D/C
    // =================================================================================
    addRequestBtn.addEventListener('click', handleNewRequestClick);
    async function renderRequestsTable() {
        requestsTableBody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
        const { data, error } = await dbClient.from('credit_debit_requests').select('*, solicitante:profiles(full_name)').order('created_at', { ascending: false });
        if (error) return requestsTableBody.innerHTML = '<tr><td colspan="7">Erro ao carregar.</td></tr>';
        if (data.length === 0) return requestsTableBody.innerHTML = '<tr><td colspan="7">Nenhuma solicitação encontrada.</td></tr>';
        requestsTableBody.innerHTML = '';
        data.forEach(r => {
            const tr = document.createElement('tr');
            let actions = '';
            if (r.status === 'Pendente' && state.currentUser.permissions.can_confirm_payments) {
                actions = `<button class="btn btn-success btn-approve-request" data-id="${r.id}">Aprovar</button><button class="btn btn-danger btn-reject-request" data-id="${r.id}">Rejeitar</button>`;
            }
            tr.innerHTML = `<td>${r.id}</td><td>${r.debit_client_name}</td><td>${r.credit_client_name}</td><td>R$ ${Number(r.value).toFixed(2)}</td><td>${r.status}</td><td>${r.solicitante?.full_name || 'N/A'}</td><td class="action-buttons">${actions}</td>`;
            requestsTableBody.appendChild(tr);
        });
        document.querySelectorAll('.btn-approve-request').forEach(b => b.addEventListener('click', handleApproveRequest));
        document.querySelectorAll('.btn-reject-request').forEach(b => b.addEventListener('click', handleRejectRequest));
    }
    async function handleApproveRequest(e) {
        const reqId = e.target.dataset.id;
        const { data: request, error: fetchError } = await dbClient.from('credit_debit_requests').select('*').eq('id', reqId).single();
        if(fetchError) return alert('Erro ao buscar solicitação.');

        const { error: updateError } = await dbClient.from('credit_debit_requests').update({ status: 'Aprovado', approved_at: new Date(), approved_by_user_id: state.currentUser.id }).eq('id', reqId);
        if (updateError) return alert('Erro ao aprovar solicitação.');
        
        const { error: creditError } = await dbClient.from('credits').insert([{ client_name: request.credit_client_name, client_code: request.credit_client_code, description: `Crédito da solicitação #${reqId} (${request.product_details})`, original_value: request.value, current_value: request.value, status: 'Disponível', created_by_user_id: state.currentUser.id, consultor_id: request.created_by_consultor_id }]);
        if(creditError) return alert('Solicitação aprovada, mas falhou ao gerar o crédito. Contate o suporte.');

        alert('Solicitação aprovada e crédito gerado!');
        renderRequestsTable();
    }
    async function handleRejectRequest(e) {
        const reqId = e.target.dataset.id;
        const { error } = await dbClient.from('credit_debit_requests').update({ status: 'Rejeitado', approved_at: new Date(), approved_by_user_id: state.currentUser.id }).eq('id', reqId);
        if(error) return alert('Erro ao rejeitar solicitação.');
        alert('Solicitação rejeitada.');
        renderRequestsTable();
    }
    function handleNewRequestClick() {
        const bodyHtml = `<div class="form-group"><label>Cliente (Débito)</label><input id="req-debit-client" type="text"></div><div class="form-group"><label>Cliente (Crédito)</label><input id="req-credit-client" type="text"></div><div class="form-group"><label>Código Cliente (Crédito)</label><input id="req-credit-code" type="text"></div><div class="form-group"><label>Detalhes do Produto</label><input id="req-product" type="text"></div><div class="form-group"><label>Valor</label><input id="req-value" type="number" step="0.01"></div><div class="form-group"><label>Observações</label><input id="req-notes" type="text"></div>`;
        const footerButtons = [ { text: 'Cancelar', className: 'btn btn-secondary', handler: closeModal }, { text: 'Criar Solicitação', className: 'btn btn-primary', handler: async () => {
            const newReq = {
                debit_client_name: document.getElementById('req-debit-client').value,
                credit_client_name: document.getElementById('req-credit-client').value,
                credit_client_code: document.getElementById('req-credit-code').value,
                product_details: document.getElementById('req-product').value,
                value: parseFloat(document.getElementById('req-value').value),
                notes: document.getElementById('req-notes').value,
                status: 'Pendente',
                created_by_consultor_id: state.currentUser.id
            };
            if(!newReq.debit_client_name || !newReq.credit_client_name || !newReq.value) return alert('Preencha os campos obrigatórios.');
            const { error } = await dbClient.from('credit_debit_requests').insert([newReq]);
            if(error) return alert('Erro ao criar solicitação: ' + error.message);
            alert('Solicitação criada com sucesso!');
            closeModal();
            renderRequestsTable();
        }}];
        openModal('Nova Solicitação de D/C', bodyHtml, footerButtons);
    }
    
    // =================================================================================
    // LÓGICA DE RELATÓRIOS
    // =================================================================================
    exportPaymentsCsvBtn.addEventListener('click', () => handleExportCsv('payments', 'relatorio_comprovantes.csv'));
    exportCreditsCsvBtn.addEventListener('click', () => handleExportCsv('credits', 'relatorio_creditos.csv'));
    async function handleExportCsv(tableName, filename) {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        if (!startDate || !endDate) return alert('Por favor, selecione data de início e fim.');
        const { data, error } = await dbClient.from(tableName).select('*').gte('created_at', startDate).lte('created_at', `${endDate}T23:59:59`);
        if (error) return alert('Erro ao buscar dados: ' + error.message);
        if (data.length === 0) return alert('Nenhum dado encontrado para o período.');
        exportToCsv(filename, data);
    }
    function exportToCsv(filename, rows) {
        if (!rows || !rows.length) return;
        const separator = ',';
        const keys = Object.keys(rows[0]);
        const csvContent = keys.join(separator) + '\n' + rows.map(row => {
            return keys.map(k => {
                let cell = row[k] === null || row[k] === undefined ? '' : row[k];
                cell = typeof cell === 'object' ? JSON.stringify(cell).replace(/"/g, '""') : String(cell).replace(/"/g, '""');
                return `"${cell}"`;
            }).join(separator);
        }).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // =================================================================================
    // LÓGICA DO MODAL E AÇÕES GENÉRICAS
    // =================================================================================
    modalCloseBtn.addEventListener('click', closeModal);
    modalContainer.addEventListener('click', (e) => e.target === modalContainer && closeModal());
    function openModal(title, body, footerButtons) {
        modalTitle.innerHTML = title;
        modalBody.innerHTML = body;
        modalFooter.innerHTML = '';
        footerButtons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.className = btnConfig.className;
            button.textContent = btnConfig.text;
            button.addEventListener('click', btnConfig.handler);
            modalFooter.appendChild(button);
        });
        modalContainer.classList.remove('hidden');
    }
    function closeModal() { modalContainer.classList.add('hidden'); }
    async function handleFaturarClick(e) {
        const paymentId = parseInt(e.target.dataset.id);
        const { data: payment, error } = await dbClient.from('payments').select('*').eq('id', paymentId).single();
        if (error || !payment) return alert('Erro ao carregar dados do pagamento.');
        const bodyHtml = `<p>Cliente: <strong>${payment.client_name}</strong></p><p>Valor: <strong>R$ ${payment.value.toFixed(2)}</strong></p><div class="form-group"><label for="faturar-order-code">Código do Pedido</label><input type="text" id="faturar-order-code" required></div><p>Utilizar o valor total?</p><button class="btn btn-success" id="faturar-total-sim">Sim</button> <button class="btn btn-secondary" id="faturar-total-nao">Não</button><div id="faturar-valor-parcial-group" class="form-group hidden"><label for="faturar-valor-parcial">Valor utilizado</label><input type="number" id="faturar-valor-parcial" step="0.01"></div>`;
        const footerButtons = [ { text: 'Cancelar', className: 'btn btn-secondary', handler: closeModal }, { text: 'Confirmar Faturamento', className: 'btn btn-primary', handler: async () => {
            const orderCode = document.getElementById('faturar-order-code').value;
            if (!orderCode) return alert('O código do pedido é obrigatório.');
            if (useTotal) {
                const { error } = await dbClient.from('payments').update({ status: 'Faturado', order_code: orderCode, processed_at: new Date(), processed_by_user_id: state.currentUser.id }).eq('id', paymentId);
                if (error) return alert('Erro ao faturar.');
            } else {
                const usedValue = parseFloat(document.getElementById('faturar-valor-parcial').value);
                if (!usedValue || usedValue <= 0 || usedValue >= payment.value) return alert('Valor parcial inválido.');
                const { error: updateError } = await dbClient.from('payments').update({ status: 'Faturado Parcialmente', value: usedValue, order_code: orderCode, processed_at: new Date(), processed_by_user_id: state.currentUser.id }).eq('id', paymentId);
                if (updateError) return alert('Erro ao atualizar pagamento original.');
                const remainingValue = payment.value - usedValue;
                const { error: insertError } = await dbClient.from('payments').insert([{ client_name: payment.client_name, value: remainingValue, payment_type_id: payment.payment_type_id, status: 'Confirmado', parent_payment_id: paymentId, created_by_user_id: state.currentUser.id }]);
                if (insertError) return alert('Erro ao criar pagamento restante. Contate o suporte.');
            }
            alert('Operação concluída!'); closeModal(); renderPaymentsTable();
        }}];
        openModal(`Faturar Pagamento #${payment.id}`, bodyHtml, footerButtons);
        let useTotal = true;
        document.getElementById('faturar-total-sim').addEventListener('click', () => { document.getElementById('faturar-valor-parcial-group').classList.add('hidden'); useTotal = true; });
        document.getElementById('faturar-total-nao').addEventListener('click', () => { document.getElementById('faturar-valor-parcial-group').classList.remove('hidden'); useTotal = false; });
    }
    async function handleConvertToCreditClick(e) {
        const paymentId = parseInt(e.target.dataset.id);
        const { data: payment, error } = await dbClient.from('payments').select('*').eq('id', paymentId).single();
        if (error || !payment) return alert('Erro ao carregar dados do pagamento.');
        const bodyHtml = `<p>Converter <strong>R$ ${payment.value.toFixed(2)}</strong> em crédito para <strong>${payment.client_name}</strong>?</p><div class="form-group"><label for="credit-description">Descrição</label><input type="text" id="credit-description" value="Saldo do pagamento de ${new Date(payment.created_at).toLocaleDateString()}" required></div>`;
        const footerButtons = [ { text: 'Cancelar', className: 'btn btn-secondary', handler: closeModal }, { text: 'Confirmar Conversão', className: 'btn btn-primary', handler: async () => {
            const { error: updateError } = await dbClient.from('payments').update({ status: 'Convertido em Crédito', last_modified_at: new Date(), last_modified_by_user_id: state.currentUser.id }).eq('id', paymentId);
            if (updateError) return alert('Erro ao atualizar status.');
            const { error: insertError } = await dbClient.from('credits').insert([{ client_name: payment.client_name, description: document.getElementById('credit-description').value, original_value: payment.value, current_value: payment.value, status: 'Disponível', created_by_user_id: state.currentUser.id }]);
            if (insertError) return alert('Erro ao criar o crédito. Contate o suporte.');
            alert('Pagamento convertido em crédito!'); closeModal(); renderPaymentsTable();
        }}];
        openModal(`Converter Pagamento #${payment.id} em Crédito`, bodyHtml, footerButtons);
    }
});
