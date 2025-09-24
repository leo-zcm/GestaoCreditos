// modules/usuarios.js

const UsuariosModule = (() => {
    let allRoles = []; // Cache para as roles disponíveis

    // Função para buscar as roles do banco de dados, se ainda não tiverem sido buscadas
    const getRoles = async () => {
        if (allRoles.length === 0) {
            const { data, error } = await supabase
                .from('role_permissions')
                .select('role')
                .order('role', { ascending: true });
            if (error) {
                console.error("Erro ao buscar funções:", error);
                return [];
            }
            allRoles = data.map(r => r.role);
        }
        return allRoles;
    };

    // Renderiza o modal para criar ou editar um usuário
    const renderUserModal = async (user = null) => {
        const modalBody = document.getElementById('modal-body');
        const availableRoles = await getRoles();
        const isNewUser = user === null;

        const rolesCheckboxes = availableRoles.map(role => `
            <div class="checkbox-group">
                <input type="checkbox" id="role-${role}" name="roles" value="${role}" ${user && user.roles.includes(role) ? 'checked' : ''}>
                <label for="role-${role}">${role}</label>
            </div>
        `).join('');

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
                    <input type="text" id="username" value="${user ? user.username : ''}" ${!isNewUser ? 'disabled' : ''} 
                           style="text-transform: uppercase;" required>
                </div>
                <div class="form-group">
                    <label>Funções</label>
                    <div class="roles-container">${rolesCheckboxes}</div>
                </div>
                <div class="form-group">
                    <label for="password">Senha</label>
                    <input type="password" id="password" ${isNewUser ? 'required' : ''}>
                    ${!isNewUser ? '<small>Deixe em branco para não alterar.</small>' : ''}
                </div>
                <p id="modal-error" class="error-message"></p>
                <button type="submit" class="btn btn-primary">${isNewUser ? 'Criar Usuário' : 'Salvar Alterações'}</button>
            </form>
        `;

        document.getElementById('modal-container').classList.add('active');
        document.getElementById('user-form').addEventListener('submit', handleFormSubmit);
    };

    // Lida com o envio do formulário do modal
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        showLoader();
        document.getElementById('modal-error').textContent = '';

        const userId = document.getElementById('userId').value;
        const fullName = document.getElementById('fullName').value;
        const username = document.getElementById('username').value.toUpperCase();
        const password = document.getElementById('password').value;
        const selectedRoles = Array.from(document.querySelectorAll('input[name="roles"]:checked')).map(cb => cb.value);

        if (selectedRoles.length === 0) {
            document.getElementById('modal-error').textContent = 'Selecione pelo menos uma função.';
            hideLoader();
            return;
        }

        try {
            if (userId) { // Editando usuário existente
                // Atualiza o perfil
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ full_name: fullName, roles: selectedRoles })
                    .eq('id', userId);
                if (profileError) throw profileError;

                // Atualiza a senha, se fornecida
                if (password) {
                    const { error: passwordError } = await supabase.auth.admin.updateUserById(userId, { password: password });
                    if (passwordError) throw passwordError;
                }

            } else { // Criando novo usuário
                // O email é obrigatório para o Supabase Auth, criamos um "fake"
                const email = `${username.toLowerCase()}@zcm.local`;
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email: email,
                    password: password
                });
                if (signUpError) throw signUpError;
                
                // O trigger já criou um perfil básico, agora atualizamos com os dados corretos.
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({
                        full_name: fullName,
                        username: username,
                        roles: selectedRoles
                    })
                    .eq('id', data.user.id);
                if (profileError) throw profileError;
            }

            document.getElementById('modal-container').classList.remove('active');
            await loadUsers(); // Recarrega a lista de usuários

        } catch (error) {
            console.error('Erro ao salvar usuário:', error.message);
            document.getElementById('modal-error').textContent = error.message;
        } finally {
            hideLoader();
        }
    };

    // Carrega e exibe a lista de usuários
    const loadUsers = async () => {
        showLoader();
        const contentArea = document.getElementById('content-area');
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

        const { data: users, error } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) {
            console.error("Erro ao carregar usuários:", error);
            contentArea.innerHTML += '<p class="error-message">Não foi possível carregar os usuários.</p>';
        } else {
            const usersList = document.getElementById('users-list');
            usersList.innerHTML = users.map(user => `
                <tr>
                    <td>${user.full_name}</td>
                    <td>${user.username}</td>
                    <td>${user.roles.join(', ')}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm btn-edit-user" data-user-id="${user.id}">Editar</button>
                    </td>
                </tr>
            `).join('');

            // Adicionar event listeners após renderizar a tabela
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
            const contentArea = document.getElementById('content-area');
            // CSS específico para o modal de usuários, se necessário
            const style = document.createElement('style');
            style.innerHTML = `
                .roles-container { display: flex; flex-wrap: wrap; gap: 1rem; }
                .checkbox-group { display: flex; align-items: center; }
                .checkbox-group input { margin-right: 0.5rem; }
            `;
            document.head.appendChild(style);

            loadUsers();
        },
    };
})();
