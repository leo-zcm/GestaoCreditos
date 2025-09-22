// js/modules/usuarios.js

// Definição global de todas as permissões e funções para construir os formulários dinamicamente
const ALL_PERMISSIONS = {
    admin: {
        gerenciar_usuarios: "Gerenciar Usuários (Acesso total)"
    },
    comprovantes: {
        ver: "Ver Módulo de Comprovantes",
        inserir: "Inserir Novos Pagamentos",
        editar: "Editar Pagamentos (antes de confirmar)",
        confirmar: "Confirmar Pagamentos",
        faturar: "Faturar Pagamentos",
        baixar: "Baixar Pagamentos",
        gerar_credito: "Transformar Pagamentos em Crédito"
    },
    creditos: {
        ver: "Ver Módulo de Créditos",
        ver_apenas_meus: "Ver Apenas Meus Créditos (para Vendedores)",
        inserir: "Inserir Crédito Manualmente",
        editar: "Editar Créditos (enquanto 'Disponível')",
        abater: "Abater Créditos"
    },
    solicitacoes: {
        ver: "Ver Módulo de Solicitações D/C",
        ver_apenas_minhas: "Ver Apenas Minhas Solicitações (para Vendedores)",
        inserir: "Inserir Nova Solicitação",
        editar: "Editar Solicitações (enquanto 'Pendente')",
        aprovar_rejeitar: "Aprovar/Rejeitar Solicitações"
    }
};

const ALL_FUNCOES = ['faturista', 'financeiro', 'caixa', 'garantia', 'vendedor', 'admin'];


/**
 * Renderiza a página de gerenciamento de usuários.
 */
async function renderUsuariosPage() {
    const mainContent = document.getElementById('main-content');
    
    // Verificação de segurança: Apenas administradores podem ver esta página.
    if (!auth.hasPermission('admin', 'gerenciar_usuarios')) {
        mainContent.innerHTML = '<h2>Acesso Negado</h2><p>Você não tem permissão para acessar esta página.</p>';
        return;
    }

    mainContent.innerHTML = `
        <div class="card">
            <button id="add-usuario-btn" class="btn btn-success">Novo Usuário</button>
        </div>
        <div class="table-container">
            <table id="usuarios-table">
                <thead>
                    <tr>
                        <th>Usuário</th>
                        <th>Nome</th>
                        <th>Funções</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colspan="5">Carregando usuários...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-usuario-btn').addEventListener('click', () => showUsuarioModal());
    loadUsuarios();
}

/**
 * Carrega a lista de usuários da API e preenche a tabela.
 */
async function loadUsuarios() {
    const tbody = document.querySelector('#usuarios-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Carregando usuários...</td></tr>';

    const { data: users, error } = await api.getUsers();

    if (error) {
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar usuários.</td></tr>';
        console.error(error);
        return;
    }

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr data-user='${JSON.stringify(user)}'>
            <td>${user.usuario}</td>
            <td>${user.nome}</td>
            <td>${user.funcoes ? user.funcoes.join(', ') : 'N/A'}</td>
            <td><span class="status-tag ${user.ativo ? 'status-aprovado' : 'status-rejeitado'}">${user.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn btn-primary btn-sm action-btn" data-action="edit">Editar</button>
                <button class="btn btn-warning btn-sm action-btn" data-action="password">Alterar Senha</button>
            </td>
        </tr>
    `).join('');

    // Adiciona os event listeners aos botões de ação recém-criados
    document.querySelectorAll('#usuarios-table .action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const user = JSON.parse(e.target.closest('tr').dataset.user);
            const action = e.target.dataset.action;

            if (action === 'edit') {
                showUsuarioModal(user);
            } else if (action === 'password') {
                showChangePasswordModal(user);
            }
        });
    });
}

/**
 * Exibe o modal para criar ou editar um usuário.
 * @param {object|null} user - O objeto do usuário para editar, ou null para criar um novo.
 */
function showUsuarioModal(user = null) {
    const isEdit = user !== null;
    const title = isEdit ? `Editar Usuário: ${user.nome}` : 'Criar Novo Usuário';

    // Gera os checkboxes para as funções
    const funcoesHtml = ALL_FUNCOES.map(funcao => `
        <label class="checkbox-label">
            <input type="checkbox" name="funcoes" value="${funcao}" ${isEdit && user.funcoes && user.funcoes.includes(funcao) ? 'checked' : ''}>
            ${funcao.charAt(0).toUpperCase() + funcao.slice(1)}
        </label>
    `).join('');

    // Gera os checkboxes para as permissões detalhadas
    let permissoesHtml = '';
    for (const module in ALL_PERMISSIONS) {
        permissoesHtml += `<h4 class="permission-module">${module.charAt(0).toUpperCase() + module.slice(1)}</h4>`;
        for (const p_key in ALL_PERMISSIONS[module]) {
            const isChecked = isEdit && user.permissoes && user.permissoes[module] && user.permissoes[module][p_key];
            permissoesHtml += `
                <label class="checkbox-label">
                    <input type="checkbox" name="perm_${module}_${p_key}" ${isChecked ? 'checked' : ''}>
                    ${ALL_PERMISSIONS[module][p_key]}
                </label>`;
        }
    }

    const modalHtml = `
        <form id="usuario-form">
            <input type="hidden" name="id" value="${isEdit ? user.id : ''}">
            <div class="form-grid">
                <div class="form-group">
                    <label for="usuario">Usuário de Login (sem espaços, maiúsculas)</label>
                    <input type="text" id="usuario" name="usuario" value="${isEdit ? user.usuario : ''}" ${isEdit ? 'readonly' : ''} required style="text-transform: uppercase;">
                </div>
                <div class="form-group">
                    <label for="nome">Nome Completo</label>
                    <input type="text" id="nome" name="nome" value="${isEdit ? user.nome : ''}" required>
                </div>
            </div>
            ${!isEdit ? `
            <div class="form-group">
                <label for="senha">Senha Provisória (mínimo 6 caracteres)</label>
                <input type="password" id="senha" name="senha" required autocomplete="new-password">
            </div>
            ` : ''}
            <div class="form-group">
                <label for="ativo">Status do Usuário</label>
                <select id="ativo" name="ativo">
                    <option value="true" ${isEdit && user.ativo ? 'selected' : ''}>Ativo</option>
                    <option value="false" ${isEdit && !user.ativo ? 'selected' : ''}>Inativo</option>
                </select>
            </div>
            <hr>
            <div class="form-group">
                <h4>Funções</h4>
                <div class="checkbox-group">${funcoesHtml}</div>
            </div>
            <hr>
            <div class="form-group">
                <h4>Permissões Detalhadas</h4>
                <div class="checkbox-group">${permissoesHtml}</div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}</button>
            </div>
        </form>
    `;
    showModal(title, modalHtml);

    // Lógica de submissão do formulário
    document.getElementById('usuario-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const userData = {
            funcoes: formData.getAll('funcoes'),
            permissoes: {}
        };
        
        // Constrói o objeto de dados a partir do formulário
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('perm_')) {
                const [, module, p_key] = key.split('_');
                if (!userData.permissoes[module]) {
                    userData.permissoes[module] = {};
                }
                userData.permissoes[module][p_key] = true;
            } else if (key !== 'funcoes') {
                userData[key] = value;
            }
        }
        userData.ativo = userData.ativo === 'true';
        if (userData.usuario) {
            userData.usuario = userData.usuario.toUpperCase();
        }

        try {
            let response;
            if (isEdit) {
                response = await api.updateUser(userData);
            } else {
                response = await api.adminCreateUser(userData);
            }

            if (response.error) {
                throw new Error(response.error.message);
            }

            showNotification(`Usuário ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
            hideModal();
            loadUsuarios();
        } catch (error) {
            showNotification(`Erro: ${error.message}`, 'error');
        }
    });
}

/**
 * Exibe o modal para alterar a senha de um usuário.
 * @param {object} user - O objeto do usuário cuja senha será alterada.
 */
function showChangePasswordModal(user) {
    const modalHtml = `
        <p>Você está alterando a senha para o usuário <strong>${user.nome} (${user.usuario})</strong>.</p>
        <form id="change-password-form">
            <div class="form-group">
                <label for="new_password">Nova Senha (mínimo 6 caracteres)</label>
                <input type="password" id="new_password" required autocomplete="new-password">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="hideModal()">Cancelar</button>
                <button type="submit" class="btn btn-primary">Confirmar Nova Senha</button>
            </div>
        </form>
    `;
    showModal('Alterar Senha', modalHtml);

    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new_password').value;

        try {
            // AVISO: A API do Supabase para alterar a senha de OUTRO usuário
            // requer uma Edge Function por motivos de segurança.
            // A chamada abaixo está preparada para essa função.
            const { error } = await api.adminUpdateUserPassword(user.id, newPassword);
            
            if (error) {
                throw new Error(error.message);
            }

            showNotification('Senha alterada com sucesso!', 'success');
            hideModal();
        } catch (error) {
            showNotification(`Erro ao alterar senha: ${error.message}`, 'error');
        }
    });
}
