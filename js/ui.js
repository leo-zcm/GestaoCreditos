// Funções para manipular a interface do usuário

function showLoader() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div class="loader">Carregando...</div>';
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
    return parseFloat(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getStatusClass(status) {
    return 'status-' + status.toLowerCase().replace(/ /g, '-').replace(/ç/g, 'c').replace(/ã/g, 'a');
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
