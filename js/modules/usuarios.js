// Definição de todas as permissões possíveis para gerar o formulário
const ALL_PERMISSIONS = {
    admin: {
        gerenciar_usuarios: "Gerenciar Usuários (Acesso total)"
    },
    comprovantes: {
        ver: "Ver Módulo",
        inserir: "Inserir Pagamentos",
        editar: "Editar (antes de confirmar)",
        confirmar: "Confirmar Pagamentos",
        faturar: "Faturar Pagamentos",
        baixar: "Baixar Pagamentos",
        gerar_credito: "Transformar em Crédito"
    },
    creditos: {
        ver: "Ver Módulo",
        ver_apenas_meus: "Ver Apenas Meus Créditos (Vendedor)",
        inserir: "Inserir Crédito",
        editar: "Editar (enquanto disponível)",
        abater: "Abater Crédito"
    },
    solicitacoes: {
        ver: "Ver Módulo",
        ver_apenas_minhas: "Ver Apenas Minhas Solicitações (Vendedor)",
        inserir: "Inserir Solicitação",
        editar: "Editar (enquanto pendente)",
        aprovar_rejeitar: "Aprovar/Rejeitar Solicitações"
    }
};

const ALL_FUNCOES = ['faturista', 'financeiro', 'caixa', 'garantia', 'vendedor', 'admin'];

async function renderUsuariosPage() {
    const mainContent = document.getElementById('main-content');
    if (!auth.user.permissoes.admin) {
        mainContent.innerHTML = '<h2>Acesso Negado</h2><p>Você não tem permissão para acessar esta página.</p>';
        return;
    }

    mainContent.innerHTML = `
        <div class="card">
            <button id="add-usuario" class="btn btn-success">Novo Usuário</button>
        </div>
        <div class="table-container">
            <table id="usuarios-table">
                <thead>
                    <tr>
                        <th>Usuário</th>
                        <th>Nome</th>
                        <th>Funções</th>
                        <th>Ativo</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;

    document.getElementById('add-usuario').addEventListener('click', () => showUsuarioModal());
    loadUsuarios();
}

async function loadUsuarios() {
    const tbody = document.querySelector('#usuarios-table tbody');
    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';

    const { data, error } = await api.getUsers();
    if (error) {
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar usuários.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(user => `
        <tr data-user='${JSON.stringify(user)}'>
            <td>${user.usuario}</td>
            <td>${user.nome}</td>
            <td>${user.funcoes.join(', ')}</td>
            <td>${user.ativo ? 'Sim' : 'Não'}</td>
            <td>
                <button class="btn btn-primary action-btn-usuario" data-action="edit">Editar</button>
                <button class="btn btn-warning action-btn-usuario" data-action="password">Alterar Senha</button>
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.action-btn-usuario').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const user = JSON.parse(e.target.closest('tr').dataset.user);
            const action = e.target.dataset.action;
            if (action === 'edit') showUsuarioModal(user);
            if (action === 'password') showChangePasswordModal(user.id);
        });
    });
}

function showUsuarioModal(user = null) {
    const isEdit = user !== null;
    const title = isEdit ? 'Editar Usuário' : 'Novo Usuário';

    let funcoesHtml = ALL_FUNCOES.map(funcao => `
        <label><input type="checkbox" name="funcoes" value="${funcao}" ${isEdit && user.funcoes.includes(funcao) ? 'checked' : ''}> ${funcao}</label>
    `).join('<br>');

    let permissoesHtml = '';
    for (const module in ALL_PERMISSIONS) {
        permissoesHtml += `<h4>${module.charAt(0).toUpperCase() + module.slice(1)}</h4>`;
        for (const p in ALL_PERMISSIONS[module]) {
            const isChecked = isEdit && user.permissoes[module] && user.permissoes[module][p];
            permissoesHtml += `<label><input type="checkbox" name="perm_${module}_${p}" ${isChecked ? 'checked' : ''}> ${ALL_PERMISSIONS[module][p]}</label><br>`;
        }
    }

    const modalHtml = `
        <form id="usuario-form">
            <input type="hidden" name="id" value="${isEdit ? user.id : ''}">
            <div class="form-group">
                <label>Usuário (Maiúsculas, sem espaços)</label>
                <input type="text" name="usuario" value="${isEdit ? user.usuario : ''}" ${isEdit ? 'readonly' : ''} required style="text-transform:uppercase">
            </div>
            <div class="form-group">
                <label>Nome Completo</label>
                <input type="text" name="nome" value="${isEdit ? user.nome : ''}" required>
            </div>
            ${!isEdit ? `
            <div class="form-group">
                <label>Senha (mínimo 6 caracteres)</label>
                <input type="password" name="senha" required>
            </div>` : ''}
            <div class="form-group">
                <label>Ativo</label>
                <select name="ativo">
                    <option value="true" ${isEdit && user.ativo ? 'selected' : ''}>Sim</option>
                    <option value="false" ${isEdit && !user.ativo ? 'selected' : ''}>Não</option>
                </select>
            </div>
            <div class="form-group">
                <h4>Funções</h4>
                ${funcoesHtml}
            </div>
            <div class="form-group">
                <h4>Permissões Detalhadas</h4>
                ${permissoesHtml}
            </div>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}</button>
        </form>
    `;
    showModal(title, modalHtml);

    document.getElementById('usuario-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const userData = {
            funcoes: formData.getAll('funcoes'),
            permissoes: {}
        };
        
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('perm_')) {
                const [, module, p] = key.split('_');
                if (!userData.permissoes[module]) userData.permissoes[module] = {};
                userData.permissoes[module][p] = true;
            } else if (key !== 'funcoes') {
                userData[key] = value;
            }
        }
        userData.ativo = userData.ativo === 'true';
        userData.usuario = userData.usuario.toUpperCase();

        let response;
        if (isEdit) {
            response = await api.updateUser(userData);
        } else {
            response = await api.createUser(userData);
        }

        if (response.error) {
            showNotification('Erro: ' + response.error.message, 'error');
        } else {
            showNotification(`Usuário ${isEdit ? 'atualizado' : 'criado'} com sucesso!`, 'success');
            hideModal();
            loadUsuarios();
        }
    });
}

function showChangePasswordModal(userId) {
    const modalHtml = `
        <form id="change-password-form">
            <div class="form-group">
                <label for="new_password">Nova Senha (mínimo 6 caracteres)</label>
                <input type="password" id="new_password" required>
            </div>
            <button type="submit" class="btn btn-primary">Alterar Senha</button>
        </form>
    `;
    showModal('Alterar Senha', modalHtml);

    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('new_password').value;
        const { error } = await api.updateUserPassword(userId, newPassword);
        if (error) {
            showNotification('Erro ao alterar senha: ' + error.message, 'error');
        } else {
            showNotification('Senha alterada com sucesso!', 'success');
            hideModal();
        }
    });
}
