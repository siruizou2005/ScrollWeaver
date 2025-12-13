// 首页交互逻辑
document.addEventListener('DOMContentLoaded', () => {
    // 滚动显示介绍内容
    const introBlocks = document.querySelectorAll('.intro-block');
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    introBlocks.forEach(block => {
        observer.observe(block);
    });
    
    // 书卷点击跳转
    const scrollCover = document.querySelector('.scroll-cover');
    if (scrollCover) {
        scrollCover.addEventListener('click', () => {
            window.location.href = '/frontend/pages/login.html';
        });
    }
    
    // 平滑滚动
    const scrollHint = document.querySelector('.scroll-hint');
    if (scrollHint) {
        scrollHint.addEventListener('click', () => {
            const introSection = document.getElementById('introSection');
            introSection.scrollIntoView({ behavior: 'smooth' });
        });
    }
});

