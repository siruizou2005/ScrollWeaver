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
            leftCollapsed = !leftCollapsed;
            
            if (leftCollapsed) {
                leftSection.classList.add('collapsed');
                leftToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                leftToggle.style.position = 'fixed';
                leftToggle.style.left = '8px';
                leftToggle.style.right = 'auto';
                leftToggle.style.zIndex = '1000';
            } else {
                leftSection.classList.remove('collapsed');
                leftToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                leftToggle.style.position = 'absolute';
                leftToggle.style.left = 'auto';
                leftToggle.style.right = '-16px';
                leftToggle.style.zIndex = '11';
            }
        });
    }

    // 右侧栏折叠/展开
    if (rightToggle && rightSection) {
        rightToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            rightCollapsed = !rightCollapsed;
            
            if (rightCollapsed) {
                rightSection.classList.add('collapsed');
                rightToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                rightToggle.style.position = 'fixed';
                rightToggle.style.right = '8px';
                rightToggle.style.left = 'auto';
                rightToggle.style.zIndex = '1000';
            } else {
                rightSection.classList.remove('collapsed');
                rightToggle.innerHTML = '<i class="fas fa-chevron-right"></i>';
                rightToggle.style.position = 'absolute';
                rightToggle.style.right = 'auto';
                rightToggle.style.left = '-16px';
                rightToggle.style.zIndex = '11';
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
                }
                leftCollapsed = true;
            }
            if (rightSection && !rightCollapsed) {
                rightSection.classList.add('collapsed');
                if (rightToggle) {
                    rightToggle.innerHTML = '<i class="fas fa-chevron-left"></i>';
                }
                rightCollapsed = true;
            }
        }
    }

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
    handleResize(); // 初始检查
});

