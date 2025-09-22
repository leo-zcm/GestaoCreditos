// js/ui.js

// Funções para manipular a interface do usuário

function showLoader() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div class="loader" style="text-align: center; padding: 40px;">Carregando...</div>';
}

function showModal(title, content) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-container').classList.remove('hidden');
}

function hideModal() {
    document.getElementById('modal-container').classList.add('hidden');
    document.getElementById('modal-title').innerText = '';
    document.getElementById('modal-body').innerHTML = '';
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
}

function formatCurrency(value) {
    if (typeof value !== 'number') {
        value = parseFloat(value) || 0;
    }
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStatusClass(status) {
    if (!status) return '';
    return 'status-' + status.toLowerCase().replace(/ /g, '-').replace(/ç/g, 'c').replace(/ã/g, 'a');
}

/**
 * --- NOVO ---
 * Cria um campo de input dinâmico que busca um nome com base no código digitado.
 * @param {object} options - Opções de configuração.
 * @param {string} options.containerId - O ID do elemento onde o input será renderizado.
 * @param {string} options.inputId - O ID para o campo de input do código.
 * @param {string} options.label - O texto do label para o campo.
 * @param {string} options.name - O atributo 'name' para o input (para formulários).
 * @param {function} options.lookupFn - A função da API para buscar os dados (ex: api.getClienteByCodigo).
 * @param {boolean} [options.allowFreeText=false] - Se permite texto livre quando o código não é encontrado.
 * @param {string} [options.freeTextInputId] - O ID para o campo de texto livre (se allowFreeText for true).
 * @param {string} [options.freeTextInputName] - O atributo 'name' para o campo de texto livre.
 */
function createDynamicInput(options) {
    const container = document.getElementById(options.containerId);
    let freeTextInputHtml = '';
    if (options.allowFreeText) {
        freeTextInputHtml = `
            <input type="text" id="${options.freeTextInputId}" name="${options.freeTextInputName}" class="form-control" placeholder="Ou digite o nome aqui" style="margin-top: 5px; display: none;">
        `;
    }

    container.innerHTML = `
        <label>${options.label}</label>
        <div style="display: flex; align-items: center; gap: 10px;">
            <input type="text" id="${options.inputId}" name="${options.name}" class="form-control" placeholder="Digite o código">
            <span id="${options.inputId}-name" style="font-weight: bold;"></span>
        </div>
        ${freeTextInputHtml}
    `;

    const input = document.getElementById(options.inputId);
    const nameSpan = document.getElementById(`${options.inputId}-name`);
    const freeTextInput = options.allowFreeText ? document.getElementById(options.freeTextInputId) : null;

    input.addEventListener('blur', async () => {
        const code = input.value.trim();
        nameSpan.textContent = '';
        if (freeTextInput) freeTextInput.style.display = 'none';

        if (!code) {
            if (freeTextInput) freeTextInput.style.display = 'block';
            return;
        }

        try {
            const { data, error } = await options.lookupFn(code);
            if (error || !data) {
                nameSpan.textContent = 'Não encontrado';
                nameSpan.style.color = 'red';
                if (freeTextInput) freeTextInput.style.display = 'block';
            } else {
                nameSpan.textContent = data.nome;
                nameSpan.style.color = 'green';
                if (freeTextInput) {
                    freeTextInput.style.display = 'none';
                    freeTextInput.value = ''; // Limpa o campo de texto livre se o código for encontrado
                }
            }
        } catch (e) {
            nameSpan.textContent = 'Erro na busca';
            nameSpan.style.color = 'red';
        }
    });
}


// Event listener global para fechar o modal
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('modal-close-btn').addEventListener('click', hideModal);
    document.getElementById('modal-container').addEventListener('click', (e) => {
        if (e.target.id === 'modal-container') {
            hideModal();
        }
    });
});
