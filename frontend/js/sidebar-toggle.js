// sidebar-toggle.js
// 处理左右侧栏的折叠功能

document.addEventListener('DOMContentLoaded', function() {
    const leftSection = document.getElementById('leftSection');
    const rightSection = document.getElementById('rightSection');
    const leftToggle = document.getElementById('leftSectionToggle');
    const rightToggle = document.getElementById('rightSectionToggle');
    
    let leftCollapsed = false;
    let rightCollapsed = false;

    // 左侧栏折叠/展开
    if (leftToggle && leftSection) {
        leftToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            leftCollapsed = !leftCollapsed;
            
            if (leftCollapsed) {
                leftSection.classList.add('collapsed');
                leftToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                leftToggle.setAttribute('aria-label', '展开左侧栏');
            } else {
                leftSection.classList.remove('collapsed');
                leftToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                leftToggle.setAttribute('aria-label', '折叠左侧栏');
            }
        });
    }

    // 右侧栏折叠/展开
    if (rightToggle && rightSection) {
        rightToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            rightCollapsed = !rightCollapsed;
            
            if (rightCollapsed) {
                rightSection.classList.add('collapsed');
                rightToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                rightToggle.setAttribute('aria-label', '展开右侧栏');
            } else {
                rightSection.classList.remove('collapsed');
                rightToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                rightToggle.setAttribute('aria-label', '折叠右侧栏');
            }
        });
    }

    // 响应式处理：在小屏幕上自动折叠侧栏
    function handleResize() {
        const width = window.innerWidth;
        if (width < 768) {
            // 移动端：默认折叠侧栏
            if (leftSection && !leftCollapsed) {
                leftSection.classList.add('collapsed');
                if (leftToggle) {
                    leftToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    leftToggle.setAttribute('aria-label', '展开左侧栏');
                }
                leftCollapsed = true;
            }
            if (rightSection && !rightCollapsed) {
                rightSection.classList.add('collapsed');
                if (rightToggle) {
                    rightToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                    rightToggle.setAttribute('aria-label', '展开右侧栏');
                }
                rightCollapsed = true;
            }
        }
    }

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
    handleResize(); // 初始检查
});

