// Slider Logic (Generic)
function initSlider(trackId, dotsId, cardSelector, gapDefault = 24, autoMs = 10000) {
    const track = document.getElementById(trackId);
    const dotsContainer = document.getElementById(dotsId);
    const cards = track ? track.querySelectorAll(cardSelector) : [];

    if (track && cards.length > 0) {
        const cardCount = cards.length;
        let autoPlayInterval;
        let observer;
        
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
            }, autoMs);
        };
        const stopAutoPlay = () => clearInterval(autoPlayInterval);

        // Start Autoplay only when section is visible
        const section = track.closest('.audience-section') || document.getElementById('quem-e');
        if ('IntersectionObserver' in window && section) {
            observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    startAutoPlay();
                } else {
                    stopAutoPlay();
                }
            }, { threshold: 0.35 });
            observer.observe(section);
        } else {
            startAutoPlay();
        }

        // Pause on Interaction
        track.addEventListener('mouseenter', () => clearInterval(autoPlayInterval));
        track.addEventListener('touchstart', () => clearInterval(autoPlayInterval), { passive: true });
        
        // Resume on mouse leave
        track.addEventListener('mouseleave', () => {
            isDown = false;
            track.classList.remove('active');
            // Only resume if section is visible
            if (!observer) startAutoPlay();
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
    initSlider('whyUsTrack', 'whyUsDots', '.why-us-card', 24, 7000);
    
    // Video Slider
    initSlider('videoTrack', 'videoDots', '.video-slide', 24, 10000);

    // Why Choose Slider (Por que escolher a ferramenta)
    initSlider('whyChooseTrack', 'whyChooseDots', '.why-us-card', 24, 7000);
});

// Mobile Menu Toggle (Simple implementation)
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;
        if (navLinks.style.display === 'flex') {
            navLinks.style.display = 'none';
        } else {
            navLinks.style.display = 'flex';
            navLinks.style.flexDirection = 'column';
            // Positioning/styles handled in CSS
        }
    });
    // Close menu when a link is clicked
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.addEventListener('click', (e) => {
            const target = e.target.closest('a');
            if (target) {
                navLinks.style.display = 'none';
            }
        });
    }
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

// CTA Timer Logic
document.addEventListener('DOMContentLoaded', () => {
    const timerElement = document.getElementById('ctaTimer');
    if (!timerElement) return;

    // Get duration from data attribute or default to 15 minutes
    const initialDuration = parseInt(timerElement.getAttribute('data-duration')) || 15 * 60;
    let duration = initialDuration;
    
    // Check if there's a stored timestamp
    // Use a unique key based on the page or ID to avoid sharing timers across different pages with different durations
    const storageKey = 'ctaTimerEnd_' + (timerElement.getAttribute('data-context') || 'default');
    const savedEndTime = localStorage.getItem(storageKey);
    const now = Date.now();

    if (savedEndTime && now < parseInt(savedEndTime)) {
        duration = Math.floor((parseInt(savedEndTime) - now) / 1000);
    } else {
        // Set new end time
        localStorage.setItem(storageKey, (now + duration * 1000).toString());
    }

    function updateTimer() {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        if (duration > 0) {
            duration--;
        } else {
            // Loop timer for constant urgency
            duration = initialDuration; 
            localStorage.setItem(storageKey, (Date.now() + duration * 1000).toString());
        }
    }

    // Initial call
    updateTimer();
    // Update every second
    setInterval(updateTimer, 1000);
});

// FAQ Accordion
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    items.forEach((item) => {
        const btn = item.querySelector('.faq-question');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const isOpen = item.classList.contains('is-open');
            items.forEach(i => i.classList.remove('is-open'));
            if (!isOpen) {
                item.classList.add('is-open');
            }
        });
    });
});
