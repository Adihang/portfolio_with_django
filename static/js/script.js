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

    const isLightBackgroundPage = document.body.classList.contains('portfolio-page') ||
        document.body.classList.contains('project-page') ||
        window.location.pathname === '/portfolio/' ||
        window.location.pathname === '/portfolio' ||
        window.location.pathname.startsWith('/project/');
    const bubbleCanvas = document.getElementById('interactiveBubbleCanvas');
    const portfolioMainLayer = document.querySelector('.main-has-bubble-bg');
    const bubbleLayer = document.querySelector('.bubble-bg-layer');

    let currentSurfaceMode = null;

    const applyPageSurfaceMode = function (useDarkTheme) {
        if (!isLightBackgroundPage) {
            return;
        }

        if (currentSurfaceMode === useDarkTheme) {
            return;
        }

        currentSurfaceMode = useDarkTheme;
        const surfaceColor = useDarkTheme ? '#0f1012' : '#ffffff';
        document.body.classList.toggle('bubble-exhausted-dark', useDarkTheme);
        document.documentElement.style.backgroundColor = surfaceColor;
        document.body.style.backgroundColor = surfaceColor;
        document.body.style.backgroundImage = 'none';

        if (portfolioMainLayer) {
            portfolioMainLayer.style.backgroundColor = 'transparent';
        }

        if (bubbleLayer) {
            bubbleLayer.style.display = 'block';
            bubbleLayer.style.backgroundColor = surfaceColor;
        }

        if (bubbleCanvas) {
            bubbleCanvas.style.setProperty('background-color', surfaceColor, 'important');
        }
    };

    if (isLightBackgroundPage) {
        applyPageSurfaceMode(false);
    }

    const initInteractiveBubbleBackground = function (canvas) {
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pointer = { x: 0, y: 0, active: false };
        const bubbleBaseColor = '112, 112, 112';
        const bubbleGlowColor = '186, 186, 186';
        const bubbles = [];
        const popEffects = [];
        let width = 0;
        let height = 0;
        let topInset = 0;
        let rafBubbleId = null;
        let lastFrameTime = 0;
        let bubblesExhausted = false;
        let hasInitializedBubbles = false;
        const wallPopSpeedThreshold = prefersReducedMotion ? 12.31 : 10.65;
        const bubblePopImpactThreshold = prefersReducedMotion ? 11.31 : 9.65;

        const randomBetween = function (min, max) {
            return Math.random() * (max - min) + min;
        };

        const getTopInset = function () {
            const navElement = document.querySelector('.portfolio-nav');

            if (!navElement) {
                return 0;
            }

            const navRect = navElement.getBoundingClientRect();
            return Math.max(0, Math.ceil(navRect.bottom + 4));
        };

        const createBubble = function () {
            const radius = randomBetween(50, 70);
            const minX = radius;
            const maxX = Math.max(minX, (width || window.innerWidth) - radius);
            const minY = radius + topInset;
            const maxY = Math.max(minY, (height || window.innerHeight) - radius);

            return {
                x: randomBetween(minX, maxX),
                y: randomBetween(minY, maxY),
                radius: radius,
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
            topInset = getTopInset();
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            if (bubblesExhausted) {
                bubbles.length = 0;
                applyPageSurfaceMode(true);
                return;
            }

            if (!hasInitializedBubbles) {
                const density = prefersReducedMotion ? 95 : 70;
                const baseCount = Math.max(10, Math.min(28, Math.round(width / density)));
                const nextCount = Math.max(7, Math.round(baseCount * 0.7));

                while (bubbles.length < nextCount) {
                    bubbles.push(createBubble());
                }

                bubbles.length = nextCount;
                hasInitializedBubbles = true;
            }

            bubbles.forEach(function (bubble) {
                const minX = bubble.radius;
                const maxX = Math.max(minX, width - bubble.radius);
                const minY = topInset + bubble.radius;
                const maxY = Math.max(minY, height - bubble.radius);
                bubble.x = Math.min(maxX, Math.max(minX, bubble.x));
                bubble.y = Math.min(maxY, Math.max(minY, bubble.y));
            });
            applyPageSurfaceMode(bubbles.length === 0);
        };

        const drawBubble = function (bubble, time) {
            const pulse = 1 + Math.sin((time * 0.0012) + bubble.phase) * 0.08;
            const shadowScale = 1.15 + (bubble.radius * 0.006);
            const shadowOffset = bubble.radius * (0.12 + (bubble.radius * 0.0008));
            const innerShadowRadius = bubble.radius * (0.1 + (bubble.radius * 0.0006));
            const glowRadius = bubble.radius * shadowScale * pulse;
            const glow = ctx.createRadialGradient(
                bubble.x - shadowOffset,
                bubble.y - shadowOffset,
                innerShadowRadius,
                bubble.x,
                bubble.y,
                glowRadius
            );

            glow.addColorStop(0, 'rgba(' + bubbleGlowColor + ', ' + (0.46 * bubble.alpha) + ')');
            glow.addColorStop(0.65, 'rgba(' + bubbleBaseColor + ', ' + (0.22 * bubble.alpha) + ')');
            glow.addColorStop(1, 'rgba(' + bubbleBaseColor + ', 0)');

            ctx.beginPath();
            ctx.fillStyle = glow;
            ctx.arc(bubble.x, bubble.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.fillStyle = 'rgba(164, 164, 164, ' + (0.26 * bubble.alpha) + ')';
            ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
            ctx.fill();
        };

        const createPopEffect = function (bubble) {
            const particleCount = prefersReducedMotion ? 4 : 12;
            const particles = [];

            for (let i = 0; i < particleCount; i += 1) {
                const angle = randomBetween(0, Math.PI * 2);
                const speed = randomBetween(0.5, 1.8) + (bubble.radius * 0.02);

                particles.push({
                    x: bubble.x,
                    y: bubble.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: randomBetween(Math.max(1.6, bubble.radius * 0.08), Math.max(2.8, bubble.radius * 0.16)),
                    alpha: randomBetween(0.55, 0.95) * bubble.alpha,
                    life: randomBetween(180, 320),
                    age: 0
                });
            }

            popEffects.push({
                x: bubble.x,
                y: bubble.y,
                age: 0,
                duration: prefersReducedMotion ? 180 : 320,
                innerRadius: Math.max(4, bubble.radius * 0.35),
                outerRadius: bubble.radius * 1.9,
                alpha: Math.min(1, bubble.alpha + 0.2),
                particles: particles
            });
        };

        const updatePopEffects = function (deltaMs) {
            const frameScale = deltaMs / 16.666;

            for (let i = popEffects.length - 1; i >= 0; i -= 1) {
                const effect = popEffects[i];
                effect.age += deltaMs;

                for (let j = effect.particles.length - 1; j >= 0; j -= 1) {
                    const particle = effect.particles[j];
                    particle.age += deltaMs;

                    if (particle.age >= particle.life) {
                        effect.particles.splice(j, 1);
                        continue;
                    }

                    particle.x += particle.vx * frameScale;
                    particle.y += particle.vy * frameScale;
                    particle.vx *= 0.965;
                    particle.vy *= 0.965;
                }

                if (effect.age >= effect.duration && effect.particles.length === 0) {
                    popEffects.splice(i, 1);
                }
            }
        };

        const drawPopEffects = function () {
            popEffects.forEach(function (effect) {
                const progress = Math.min(effect.age / effect.duration, 1);
                const expansion = 1 - Math.pow(1 - progress, 3);
                const ringRadius = effect.innerRadius + ((effect.outerRadius - effect.innerRadius) * expansion);
                const ringAlpha = (1 - progress) * 0.46 * effect.alpha;

                if (ringAlpha > 0.01) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(185, 185, 185, ' + ringAlpha + ')';
                    ctx.lineWidth = Math.max(1.1, (1 - progress) * (effect.innerRadius * 0.5));
                    ctx.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }

                const flashAlpha = (1 - progress) * (1 - progress) * 0.4 * effect.alpha;
                if (flashAlpha > 0.01) {
                    ctx.beginPath();
                    ctx.fillStyle = 'rgba(220, 220, 220, ' + flashAlpha + ')';
                    ctx.arc(effect.x, effect.y, effect.innerRadius * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                effect.particles.forEach(function (particle) {
                    const particleProgress = particle.age / particle.life;
                    const particleAlpha = (1 - particleProgress) * (1 - particleProgress) * 0.75 * particle.alpha;

                    if (particleAlpha <= 0.01) {
                        return;
                    }

                    ctx.beginPath();
                    ctx.fillStyle = 'rgba(205, 205, 205, ' + particleAlpha + ')';
                    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                    ctx.fill();
                });
            });
        };

        const removeBubbleAtPoint = function (x, y) {
            for (let i = bubbles.length - 1; i >= 0; i -= 1) {
                const bubble = bubbles[i];
                const dx = x - bubble.x;
                const dy = y - bubble.y;
                const hitRadius = bubble.radius * 1.05;

                if ((dx * dx) + (dy * dy) <= (hitRadius * hitRadius)) {
                    createPopEffect(bubble);
                    bubbles.splice(i, 1);
                    if (bubbles.length === 0) {
                        bubblesExhausted = true;
                        applyPageSurfaceMode(true);
                    }
                    return true;
                }
            }

            return false;
        };

        const animate = function (time) {
            rafBubbleId = window.requestAnimationFrame(animate);

            if (document.hidden) {
                lastFrameTime = time;
                return;
            }

            const deltaMs = lastFrameTime > 0 ? Math.min(40, Math.max(8, time - lastFrameTime)) : 16.67;
            lastFrameTime = time;
            topInset = getTopInset();

            ctx.clearRect(0, 0, width, height);
            const poppedBubbles = new Set();

            bubbles.forEach(function (bubble) {
                bubble.vx += Math.sin((time * 0.0005 * bubble.drift) + bubble.phase) * 0.007;
                bubble.vy += Math.cos((time * 0.00042 * bubble.drift) + bubble.phase) * 0.006;

                if (!prefersReducedMotion && pointer.active) {
                    const dx = bubble.x - pointer.x;
                    const dy = bubble.y - pointer.y;
                    const distanceSquared = (dx * dx) + (dy * dy);
                    const reactionRadius = bubble.radius + 180;
                    const reactionRadiusSquared = reactionRadius * reactionRadius;

                    if (distanceSquared < reactionRadiusSquared) {
                        const distance = Math.max(Math.sqrt(distanceSquared), 0.0001);
                        const proximity = 1 - (distance / reactionRadius);
                        const force = 0.42 + (proximity * proximity * 0.72);
                        bubble.vx += (dx / distance) * force;
                        bubble.vy += (dy / distance) * force;
                    }
                }

                bubble.x += bubble.vx;
                bubble.y += bubble.vy;
                bubble.vx *= 0.986;
                bubble.vy *= 0.986;

                if (!prefersReducedMotion && pointer.active) {
                    const dxAfterMove = bubble.x - pointer.x;
                    const dyAfterMove = bubble.y - pointer.y;
                    const distanceAfterMove = Math.max(Math.sqrt((dxAfterMove * dxAfterMove) + (dyAfterMove * dyAfterMove)), 0.0001);
                    const keepOutRadius = bubble.radius + 32;

                    if (distanceAfterMove < keepOutRadius) {
                        const nx = dxAfterMove / distanceAfterMove;
                        const ny = dyAfterMove / distanceAfterMove;
                        const pushOut = keepOutRadius - distanceAfterMove;
                        bubble.x += nx * pushOut;
                        bubble.y += ny * pushOut;
                        bubble.vx += nx * 1.55;
                        bubble.vy += ny * 1.55;
                    }
                }
            });

            for (let i = 0; i < bubbles.length; i += 1) {
                const bubbleA = bubbles[i];

                if (poppedBubbles.has(bubbleA)) {
                    continue;
                }

                for (let j = i + 1; j < bubbles.length; j += 1) {
                    const bubbleB = bubbles[j];

                    if (poppedBubbles.has(bubbleB)) {
                        continue;
                    }
                    let dx = bubbleB.x - bubbleA.x;
                    let dy = bubbleB.y - bubbleA.y;
                    let distanceSquared = (dx * dx) + (dy * dy);
                    const minDistance = bubbleA.radius + bubbleB.radius + 2;
                    const minDistanceSquared = minDistance * minDistance;

                    if (distanceSquared >= minDistanceSquared) {
                        continue;
                    }

                    if (distanceSquared < 0.0001) {
                        const angle = (i + j + 1) * 0.61803398875;
                        dx = Math.cos(angle);
                        dy = Math.sin(angle);
                        distanceSquared = 1;
                    }

                    const distance = Math.sqrt(distanceSquared);
                    const nx = dx / distance;
                    const ny = dy / distance;
                    const overlap = minDistance - distance;
                    const separation = overlap * 0.5;

                    bubbleA.x -= nx * separation;
                    bubbleA.y -= ny * separation;
                    bubbleB.x += nx * separation;
                    bubbleB.y += ny * separation;

                    const relativeVelocityX = bubbleB.vx - bubbleA.vx;
                    const relativeVelocityY = bubbleB.vy - bubbleA.vy;
                    const normalVelocity = (relativeVelocityX * nx) + (relativeVelocityY * ny);
                    const impactSpeed = -normalVelocity;

                    if (impactSpeed > bubblePopImpactThreshold) {
                        poppedBubbles.add(bubbleA);
                        poppedBubbles.add(bubbleB);
                        continue;
                    }

                    if (normalVelocity < 0) {
                        const restitution = 0.84;
                        const impulse = -((1 + restitution) * normalVelocity) / 2;
                        bubbleA.vx -= nx * impulse;
                        bubbleA.vy -= ny * impulse;
                        bubbleB.vx += nx * impulse;
                        bubbleB.vy += ny * impulse;
                    }
                }
            }

            bubbles.forEach(function (bubble) {
                if (poppedBubbles.has(bubble)) {
                    return;
                }

                const minX = bubble.radius;
                const maxX = Math.max(minX, width - bubble.radius);
                const minY = topInset + bubble.radius;
                const maxY = Math.max(minY, height - bubble.radius);

                if (bubble.x < minX) {
                    const impactSpeed = Math.abs(bubble.vx);
                    bubble.x = minX;
                    bubble.vx = Math.abs(bubble.vx) * 0.92;

                    if (impactSpeed > wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                } else if (bubble.x > maxX) {
                    const impactSpeed = Math.abs(bubble.vx);
                    bubble.x = maxX;
                    bubble.vx = -Math.abs(bubble.vx) * 0.92;

                    if (impactSpeed > wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                }

                if (bubble.y < minY) {
                    const impactSpeed = Math.abs(bubble.vy);
                    bubble.y = minY;
                    bubble.vy = Math.abs(bubble.vy) * 0.92;

                    if (impactSpeed > wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                } else if (bubble.y > maxY) {
                    const impactSpeed = Math.abs(bubble.vy);
                    bubble.y = maxY;
                    bubble.vy = -Math.abs(bubble.vy) * 0.92;

                    if (impactSpeed > wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                }

                if (poppedBubbles.has(bubble)) {
                    return;
                }

                drawBubble(bubble, time);
            });

            if (poppedBubbles.size > 0) {
                for (let i = bubbles.length - 1; i >= 0; i -= 1) {
                    const bubble = bubbles[i];

                    if (!poppedBubbles.has(bubble)) {
                        continue;
                    }

                    createPopEffect(bubble);
                    bubbles.splice(i, 1);
                }
            }

            if (bubbles.length === 0) {
                bubblesExhausted = true;
            }

            applyPageSurfaceMode(bubblesExhausted || bubbles.length === 0);
            updatePopEffects(deltaMs);
            drawPopEffects();
        };

        window.addEventListener('pointermove', function (event) {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            pointer.active = true;
        }, { passive: true });

        window.addEventListener('pointerdown', function (event) {
            if (!event.isPrimary || event.button !== 0) {
                return;
            }

            const target = event.target;
            if (target && target.closest && target.closest('a, button, input, textarea, select, label, [role="button"], .chat-widget, .chatbot-container, .chatbot-toggle-btn')) {
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;

            if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
                return;
            }

            removeBubbleAtPoint(localX, localY);
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

    const navItemsMeasure = navLinks.cloneNode(true);
    navItemsMeasure.setAttribute('aria-hidden', 'true');
    Object.assign(navItemsMeasure.style, {
        position: 'fixed',
        left: '-99999px',
        top: '-99999px',
        visibility: 'hidden',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        width: 'auto',
        maxWidth: 'none',
        margin: '0',
        padding: '0',
        listStyle: 'none'
    });
    Array.from(navItemsMeasure.children).forEach(function (item) {
        item.style.flex = '0 0 auto';
    });
    document.body.appendChild(navItemsMeasure);

    let rafId = null;

    const getMeasuredNavItemsWidth = function () {
        return Math.ceil(navItemsMeasure.getBoundingClientRect().width);
    };

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

        nav.classList.remove('nav-auto-collapsed');
        forceCloseNavMenu();

        const availableWidth = navContainer.getBoundingClientRect().width;
        const brandWidth = navBrand.getBoundingClientRect().width;
        const navItemsBlockWidth = getMeasuredNavItemsWidth();
        const navItemsBlockLimit = window.innerWidth * 0.6;
        const requiredWidth = brandWidth + navItemsBlockWidth;
        const shouldCollapseByItemsBlock = navItemsBlockWidth > navItemsBlockLimit;
        const shouldCollapseByOverlap = requiredWidth >= availableWidth;

        if (shouldCollapseByItemsBlock || shouldCollapseByOverlap) {
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
