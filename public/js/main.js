// Slider Logic (Generic)
function initSlider(trackId, dotsId, cardSelector, gapDefault = 24) {
    const track = document.getElementById(trackId);
    const dotsContainer = document.getElementById(dotsId);
    const cards = track ? track.querySelectorAll(cardSelector) : [];

    if (track && cards.length > 0) {
        const cardCount = cards.length;
        let autoPlayInterval;
        
        // Create Dots
        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            for (let i = 0; i < cardCount; i++) {
                const dot = document.createElement('div');
                dot.classList.add('why-us-dot'); // Reuse same dot style
                if (i === 0) dot.classList.add('active');
                
                dot.addEventListener('click', () => {
                    const cardWidth = cards[0].offsetWidth;
                    const style = window.getComputedStyle(track);
                    const gap = parseFloat(style.gap) || gapDefault;
                    
                    track.scrollTo({
                        left: i * (cardWidth + gap),
                        behavior: 'smooth'
                    });
                });
                dotsContainer.appendChild(dot);
            }
        }

        // Update active dot on scroll
        const updateActiveDot = () => {
            if (!dotsContainer) return;
            
            const cardWidth = cards[0].offsetWidth;
            const style = window.getComputedStyle(track);
            const gap = parseFloat(style.gap) || gapDefault;
            
            // Calculate index based on scroll position
            const maxScroll = track.scrollWidth - track.clientWidth;
            let index;

            if (maxScroll > 0) {
                const scrollRatio = track.scrollLeft / maxScroll;
                index = Math.round(scrollRatio * (cardCount - 1));
            } else {
                index = 0;
            }
            
            // Clamp index
            if (index < 0) index = 0;
            if (index >= cardCount) index = cardCount - 1;

            const dots = dotsContainer.querySelectorAll('.why-us-dot');
            dots.forEach((dot, i) => {
                if (i === index) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        };

        track.addEventListener('scroll', () => {
            window.requestAnimationFrame(updateActiveDot);
        });

        // Auto Play
        const startAutoPlay = () => {
            clearInterval(autoPlayInterval);
            autoPlayInterval = setInterval(() => {
                const cardWidth = cards[0].offsetWidth;
                const style = window.getComputedStyle(track);
                const gap = parseFloat(style.gap) || gapDefault;
                const itemWidth = cardWidth + gap;
                
                let nextScroll = track.scrollLeft + itemWidth;
                const maxScroll = track.scrollWidth - track.clientWidth;
                
                // Loop back to start if at end
                if (track.scrollLeft >= maxScroll - 10) {
                    nextScroll = 0;
                }
                
                track.scrollTo({
                    left: nextScroll,
                    behavior: 'smooth'
                });
            }, 6000); // Faster autoplay for better engagement (6s)
        };

        // Start Autoplay
        startAutoPlay();

        // Pause on Interaction
        track.addEventListener('mouseenter', () => clearInterval(autoPlayInterval));
        track.addEventListener('touchstart', () => clearInterval(autoPlayInterval), { passive: true });
        
        // Resume on mouse leave
        track.addEventListener('mouseleave', () => {
            isDown = false;
            track.classList.remove('active');
            startAutoPlay();
        });

        // Mouse Drag Implementation
        let isDown = false;
        let startX;
        let scrollLeft;

        track.addEventListener('mousedown', (e) => {
            isDown = true;
            track.classList.add('active');
            startX = e.pageX - track.offsetLeft;
            scrollLeft = track.scrollLeft;
            clearInterval(autoPlayInterval);
        });

        track.addEventListener('mouseup', () => {
            isDown = false;
            track.classList.remove('active');
            startAutoPlay();
        });

        track.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - track.offsetLeft;
            const walk = (x - startX) * 2;
            track.scrollLeft = scrollLeft - walk;
        });
    }
}

// Initialize Sliders
document.addEventListener('DOMContentLoaded', () => {
    // Why Us Slider
    initSlider('whyUsTrack', 'whyUsDots', '.why-us-card');
    
    // Video Slider
    initSlider('videoTrack', 'videoDots', '.video-slide');
});

// Order Modal Logic - REMOVED/DISABLED as elements are not in HTML
const modal = document.getElementById('orderModal');
if (modal) {
    const orderForm = document.getElementById('orderForm');

    function openOrderModal(planName = null) {
        modal.style.display = 'flex';
        if (planName) {
            console.log('Selected Plan:', planName);
        }
    }

    // Close modal when clicking X or outside
    const closeBtn = document.querySelector('.close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    // Handle Form Submission
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = orderForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerText;
            submitBtn.innerText = 'Processando...';
            submitBtn.disabled = true;

            const formData = {
                name: document.getElementById('name').value,
                phone: document.getElementById('phone').value,
                flavor: document.getElementById('flavor').value,
                message: `Gostaria de encomendar o bolo da promoção (Sabor: ${document.getElementById('flavor').value})`
            };

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                const data = await response.json();

                if (data.success) {
                    window.location.href = data.whatsappLink;
                } else {
                    alert('Erro ao processar pedido: ' + (data.message || 'Tente novamente.'));
                    submitBtn.innerText = originalText;
                    submitBtn.disabled = false;
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Erro de conexão. Tente novamente.');
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        });
    }
} else {
    // Define dummy function to prevent errors if called from HTML
    window.openOrderModal = function() {}; 
}

// Mobile Menu Toggle (Simple implementation)
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        const navLinks = document.querySelector('.nav-links');
        if (navLinks.style.display === 'flex') {
            navLinks.style.display = 'none';
        } else {
            navLinks.style.display = 'flex';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '100%';
            navLinks.style.left = '0';
            navLinks.style.width = '100%';
            navLinks.style.background = 'rgba(0,0,0,0.95)';
            navLinks.style.padding = '1rem';
        }
    });
}

// Theme Toggle Logic
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunWrapper = document.getElementById('sun-wrapper');
    const moonWrapper = document.getElementById('moon-wrapper');
    
    // Check saved theme or default to 'light'
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!sunWrapper || !moonWrapper) return;
        
        if (theme === 'light') {
            // Light mode active -> Show Moon (to switch back to dark)
            sunWrapper.style.display = 'none';
            moonWrapper.style.display = 'block';
        } else {
            // Dark mode active -> Show Sun (to switch to light)
            sunWrapper.style.display = 'block';
            moonWrapper.style.display = 'none';
        }
    }
});
