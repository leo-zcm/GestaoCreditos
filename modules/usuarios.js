// modules/usuarios.js (VERSÃO CORRIGIDA E COMPLETA)

const UsuariosModule = (() => {
    // Modelo de todas as permissões possíveis na plataforma
    const ALL_PERMISSIONS = {
        comprovantes: {
            label: 'Comprovantes',
            perms: {
                view: 'Ver Módulo', create: 'Inserir Pagamentos', edit: 'Editar (antes de confirmar)',
                confirm: 'Confirmar', faturar: 'Faturar', baixar: 'Baixar', gerar_credito: 'Gerar Crédito'
            }
        },
        creditos: {
            label: 'Créditos',
            perms: {
                view: { label: 'Ver Módulo', type: 'select', options: { all: 'Todos Vendedores', own: 'Apenas Próprios' } },
                create: 'Inserir Crédito', edit: 'Editar (enquanto disponível)', abater: 'Abater Crédito'
            }
        },
        solicitacoes: {
            label: 'Solicitações D/C',
            perms: {
                view: { label: 'Ver Solicitações', type: 'select', options: { all: 'Todos Vendedores', own: 'Apenas Próprias' } },
                create: 'Inserir Solicitação', edit: 'Editar (enquanto pendente)', approve: 'Aprovar/Rejeitar'
            }
        }
    };
    
    const ALL_ROLES = ['VENDEDOR', 'CAIXA', 'FINANCEIRO', 'FATURISTA', 'GARANTIA'];

    const renderUserModal = (user = null) => {
        const modalBody = document.getElementById('modal-body');
        const isNewUser = user === null;
        const userPerms = user?.permissions || {};

        const rolesCheckboxes = ALL_ROLES.map(role => `
            <div class="checkbox-group">
                <input type="checkbox" id="role-${role}" name="roles" value="${role}" ${user && user.roles.includes(role) ? 'checked' : ''}>
                <label for="role-${role}">${role}</label>
            </div>
        `).join('');

        let permissionsHtml = '';
        for (const moduleKey in ALL_PERMISSIONS) {
            const module = ALL_PERMISSIONS[moduleKey];
            permissionsHtml += `<fieldset><legend>${module.label}</legend>`;
            for (const permKey in module.perms) {
                const perm = module.perms[permKey];
                const currentPermValue = userPerms[moduleKey]?.[permKey];
                
                if (typeof perm === 'object' && perm.type === 'select') {
                    permissionsHtml += `<div class="perm-item"><label>${perm.label}</label><select name="perm-${moduleKey}-${permKey}">`;
                    for(const optKey in perm.options) {
                        permissionsHtml += `<option value="${optKey}" ${currentPermValue === optKey ? 'selected' : ''}>${perm.options[optKey]}</option>`;
                    }
                    permissionsHtml += `</select></div>`;
                } else {
                    permissionsHtml += `<div class="checkbox-group">
                        <input type="checkbox" id="perm-${moduleKey}-${permKey}" name="perm-${moduleKey}-${permKey}" ${currentPermValue ? 'checked' : ''}>
                        <label for="perm-${moduleKey}-${permKey}">${perm}</label>
                    </div>`;
                }
            }
            permissionsHtml += `</fieldset>`;
        }

        modalBody.innerHTML = `
            <h2>${isNewUser ? 'Criar Novo Usuário' : 'Editar Usuário'}</h2>
            <form id="user-form">
                <input type="hidden" id="userId" value="${user ? user.id : ''}">
                <div class="form-group">
                    <label for="fullName">Nome Completo</label>
                    <input type="text" id="fullName" value="${user ? user.full_name : ''}" required>
                </div>
                <div class="form-group">
                    <label for="username">Usuário (somente maiúsculas)</label>
                    <input type="text" id="username" value="${user ? user.username : ''}" ${!isNewUser ? 'disabled' : ''} style="text-transform: uppercase;" required>
                </div>
                ${isNewUser ? `
                <div class="form-group">
                    <label for="password">Senha</label>
                    <input type="password" id="password" required>
                </div>` : ''}
                <fieldset>
                    <legend>Funções (para a Tela Home)</legend>
                    <div class="roles-container">${rolesCheckboxes}</div>
                </fieldset>
                <h3>Permissões Detalhadas</h3>
                ${permissionsHtml}
                <p id="modal-error" class="error-message"></p>
                <button type="submit" class="btn btn-primary">${isNewUser ? 'Criar Usuário' : 'Salvar Alterações'}</button>
            </form>
        `;
        document.getElementById('modal-container').classList.add('active');
        document.getElementById('user-form').addEventListener('submit', handleFormSubmit);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        showLoader();
        document.getElementById('modal-error').textContent = '';
        
        const form = e.target;
        const userId = form.userId.value;
        const fullName = form.fullName.value;
        const username = form.username.value.toUpperCase();
        const selectedRoles = Array.from(form.querySelectorAll('input[name="roles"]:checked')).map(cb => cb.value);

        const newPermissions = {};
        for (const moduleKey in ALL_PERMISSIONS) {
            newPermissions[moduleKey] = {};
            for (const permKey in ALL_PERMISSIONS[moduleKey].perms) {
                const input = form[`perm-${moduleKey}-${permKey}`];
                if(input) { // Checa se o elemento existe
                    if (input.type === 'checkbox') {
                        newPermissions[moduleKey][permKey] = input.checked;
                    } else if (input.tagName === 'SELECT') {
                        newPermissions[moduleKey][permKey] = input.value;
                    }
                }
            }
        }

        try {
            const profileData = { full_name: fullName, roles: selectedRoles, permissions: newPermissions };

            if (userId) {
                const { error } = await supabase.from('profiles').update(profileData).eq('id', userId);
                if (error) throw error;
            } else {
                const password = form.password.value;
                const email = `${username.toLowerCase()}@zcm.local`;
                const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password });
                if (signUpError) throw signUpError;
                
                profileData.username = username;
                const { error: profileError } = await supabase.from('profiles').update(profileData).eq('id', authData.user.id);
                if (profileError) throw profileError;
            }

            document.getElementById('modal-container').classList.remove('active');
            await loadUsers();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error.message);
            document.getElementById('modal-error').textContent = error.message;
        } finally {
            hideLoader();
        }
    };

    // ==================================================================
    // AQUI ESTÁ A CORREÇÃO - A FUNÇÃO AGORA ESTÁ COMPLETA
    // ==================================================================
    const loadUsers = async () => {
        showLoader();
        const contentArea = document.getElementById('content-area');
        // Limpa a área de conteúdo e desenha a estrutura da página
        contentArea.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2>Gerenciamento de Usuários</h2>
                    <button id="btn-create-user" class="btn btn-primary">Criar Novo Usuário</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome Completo</th>
                                <th>Usuário</th>
                                <th>Funções</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="users-list">
                            <!-- Os usuários serão inseridos aqui -->
                        </tbody>
                    </table>
                </div>
            </div>`;

        // Busca os dados no Supabase
        const { data: users, error } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) {
            console.error("Erro ao carregar usuários:", error);
            contentArea.innerHTML += '<p class="error-message">Não foi possível carregar os usuários.</p>';
        } else {
            // Preenche a tabela com os dados
            const usersList = document.getElementById('users-list');
            usersList.innerHTML = users.map(user => `
                <tr>
                    <td>${user.full_name}</td>
                    <td>${user.username}</td>
                    <td>${user.roles ? user.roles.join(', ') : 'Nenhuma'}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm btn-edit-user" data-user-id="${user.id}">Editar</button>
                    </td>
                </tr>
            `).join('');

            // Adiciona os event listeners para os botões de ação
            document.getElementById('btn-create-user').addEventListener('click', () => renderUserModal());
            
            document.querySelectorAll('.btn-edit-user').forEach(button => {
                button.addEventListener('click', (e) => {
                    const userId = e.target.dataset.userId;
                    const userToEdit = users.find(u => u.id === userId);
                    renderUserModal(userToEdit);
                });
            });
        }
        hideLoader();
    };
    
    // Objeto público do módulo
    return {
        name: 'Usuários',
        render: () => {
            const style = document.createElement('style');
            style.innerHTML = `
                fieldset { border: 1px solid #ccc; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; }
                legend { font-weight: bold; padding: 0 0.5rem; }
                .roles-container, .perm-item { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.5rem; }
                .checkbox-group { display: flex; align-items: center; }
                .checkbox-group input { margin-right: 0.5rem; }
            `;
            // Garante que o estilo não seja adicionado múltiplas vezes
            if (!document.head.querySelector('#usuarios-module-style')) {
                style.id = 'usuarios-module-style';
                document.head.appendChild(style);
            }
            
            loadUsers();
        },
    };
})();
