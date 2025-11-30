/**
 * 共享确认对话框功能
 * 可在所有页面使用
 */

// 全局确认对话框函数
let globalConfirmResolve = null;

function showConfirm(message) {
    return new Promise((resolve) => {
        globalConfirmResolve = resolve;
        const confirmModal = document.getElementById('confirmModal');
        const confirmMessage = document.getElementById('confirmMessage');
        if (confirmModal && confirmMessage) {
            confirmMessage.textContent = message;
            confirmModal.classList.add('active');
        } else {
            // 如果元素不存在，回退到系统确认对话框
            resolve(confirm(message));
        }
    });
}

function closeConfirm(result) {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.classList.remove('active');
    }
    if (globalConfirmResolve) {
        globalConfirmResolve(result);
        globalConfirmResolve = null;
    }
}

// 初始化确认对话框事件监听器
document.addEventListener('DOMContentLoaded', () => {
    const confirmOkBtn = document.getElementById('confirmOkBtn');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const confirmModal = document.getElementById('confirmModal');
    
    if (confirmOkBtn) {
        confirmOkBtn.addEventListener('click', () => {
            closeConfirm(true);
        });
    }
    
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', () => {
            closeConfirm(false);
        });
    }
    
    // 点击背景关闭确认对话框
    if (confirmModal) {
        const backdrop = confirmModal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                closeConfirm(false);
            });
        }
    }
});

