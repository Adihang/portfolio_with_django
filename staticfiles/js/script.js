document.addEventListener('DOMContentLoaded', function () {
    const imageElements = document.querySelectorAll('.hover-dark');

    imageElements.forEach(function (imageElement) {
        imageElement.style.transition = 'filter 0.5s ease';
        imageElement.addEventListener('mouseover', function () {
            imageElement.style.filter = 'brightness(0.5)';
        });

        imageElement.addEventListener('mouseout', function () {
            imageElement.style.filter = 'brightness(1)';
        });
    });

    const bubbleCanvas = document.getElementById('interactiveBubbleCanvas');

    const initInteractiveBubbleBackground = function (canvas) {
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pointer = { x: 0, y: 0, active: false };
        const bubbleBaseColor = '108, 166, 133';
        const bubbleGlowColor = '167, 212, 185';
        const bubbles = [];
        let width = 0;
        let height = 0;
        let rafBubbleId = null;

        const randomBetween = function (min, max) {
            return Math.random() * (max - min) + min;
        };

        const createBubble = function () {
            return {
                x: randomBetween(0, width || window.innerWidth),
                y: randomBetween(0, height || window.innerHeight),
                radius: randomBetween(18, 42),
                vx: randomBetween(-0.18, 0.18),
                vy: randomBetween(-0.12, 0.12),
                alpha: randomBetween(0.55, 1),
                phase: randomBetween(0, Math.PI * 2),
                drift: randomBetween(0.85, 1.2)
            };
        };

        const resizeCanvas = function () {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const density = prefersReducedMotion ? 95 : 70;
            const nextCount = Math.max(10, Math.min(28, Math.round(width / density)));

            while (bubbles.length < nextCount) {
                bubbles.push(createBubble());
            }

            bubbles.length = nextCount;
        };

        const drawBubble = function (bubble, time) {
            const pulse = 1 + Math.sin((time * 0.0012) + bubble.phase) * 0.08;
            const glowRadius = bubble.radius * 1.9 * pulse;
            const glow = ctx.createRadialGradient(
                bubble.x - (bubble.radius * 0.25),
                bubble.y - (bubble.radius * 0.25),
                bubble.radius * 0.2,
                bubble.x,
                bubble.y,
                glowRadius
            );

            glow.addColorStop(0, 'rgba(' + bubbleGlowColor + ', ' + (0.34 * bubble.alpha) + ')');
            glow.addColorStop(0.65, 'rgba(' + bubbleBaseColor + ', ' + (0.16 * bubble.alpha) + ')');
            glow.addColorStop(1, 'rgba(' + bubbleBaseColor + ', 0)');

            ctx.beginPath();
            ctx.fillStyle = glow;
            ctx.arc(bubble.x, bubble.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = 'rgba(236, 248, 241, ' + (0.2 * bubble.alpha) + ')';
            ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
            ctx.fill();
        };

        const animate = function (time) {
            rafBubbleId = window.requestAnimationFrame(animate);

            if (document.hidden) {
                return;
            }

            ctx.clearRect(0, 0, width, height);

            bubbles.forEach(function (bubble) {
                bubble.vx += Math.sin((time * 0.0005 * bubble.drift) + bubble.phase) * 0.007;
                bubble.vy += Math.cos((time * 0.00042 * bubble.drift) + bubble.phase) * 0.006;

                if (!prefersReducedMotion && pointer.active) {
                    const dx = bubble.x - pointer.x;
                    const dy = bubble.y - pointer.y;
                    const distanceSquared = (dx * dx) + (dy * dy);
                    const reactionRadius = bubble.radius + 66;
                    const reactionRadiusSquared = reactionRadius * reactionRadius;

                    if (distanceSquared < reactionRadiusSquared && distanceSquared > 9) {
                        const distance = Math.sqrt(distanceSquared);
                        const proximity = 1 - (distance / reactionRadius);
                        const force = proximity * proximity * 0.28;
                        bubble.vx += (dx / distance) * force;
                        bubble.vy += (dy / distance) * force;
                    }
                }

                bubble.x += bubble.vx;
                bubble.y += bubble.vy;
                bubble.vx *= 0.986;
                bubble.vy *= 0.986;

                const margin = bubble.radius * 2.2;

                if (bubble.x < -margin) {
                    bubble.x = width + margin;
                } else if (bubble.x > width + margin) {
                    bubble.x = -margin;
                }

                if (bubble.y < -margin) {
                    bubble.y = height + margin;
                } else if (bubble.y > height + margin) {
                    bubble.y = -margin;
                }

                drawBubble(bubble, time);
            });
        };

        window.addEventListener('pointermove', function (event) {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.active = true;
        }, { passive: true });

        window.addEventListener('pointerleave', function () {
            pointer.active = false;
        });

        window.addEventListener('blur', function () {
            pointer.active = false;
        });

        window.addEventListener('resize', resizeCanvas, { passive: true });
        window.addEventListener('orientationchange', resizeCanvas);

        resizeCanvas();

        if (rafBubbleId !== null) {
            window.cancelAnimationFrame(rafBubbleId);
        }

        rafBubbleId = window.requestAnimationFrame(animate);
    };

    if (bubbleCanvas) {
        initInteractiveBubbleBackground(bubbleCanvas);
    }

    const nav = document.querySelector('.portfolio-nav');

    if (!nav) {
        return;
    }

    const navContainer = nav.querySelector('.container-fluid');
    const navBrand = nav.querySelector('.portfolio-brand');
    const navLinks = nav.querySelector('.portfolio-nav-links');
    const navCollapse = nav.querySelector('.navbar-collapse');
    const navToggler = nav.querySelector('.portfolio-nav-toggler');

    if (!navContainer || !navBrand || !navLinks || !navCollapse || !navToggler) {
        return;
    }

    let rafId = null;

    const forceCloseNavMenu = function () {
        if (window.bootstrap && window.bootstrap.Collapse) {
            const collapseInstance = window.bootstrap.Collapse.getInstance(navCollapse);

            if (collapseInstance) {
                collapseInstance.hide();
            }
        }

        navCollapse.classList.remove('show', 'collapsing');
        navCollapse.style.height = '';
        navToggler.classList.add('collapsed');
        navToggler.setAttribute('aria-expanded', 'false');
    };

    const updateNavMode = function () {
        rafId = null;

        const wasCollapsed = nav.classList.contains('nav-auto-collapsed');
        nav.classList.remove('nav-auto-collapsed');
        forceCloseNavMenu();

        const availableWidth = navContainer.getBoundingClientRect().width;
        const brandWidth = navBrand.getBoundingClientRect().width;
        const linksWidth = navLinks.scrollWidth;
        const requiredWidth = brandWidth + linksWidth;
        const hysteresis = wasCollapsed ? 10 : -20;

        if (requiredWidth + hysteresis >= availableWidth) {
            nav.classList.add('nav-auto-collapsed');
            forceCloseNavMenu();
        }
    };

    const scheduleNavModeUpdate = function () {
        if (rafId !== null) {
            return;
        }

        rafId = window.requestAnimationFrame(updateNavMode);
    };

    window.addEventListener('resize', scheduleNavModeUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleNavModeUpdate);
    scheduleNavModeUpdate();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleNavModeUpdate).catch(function () {});
    }
});
