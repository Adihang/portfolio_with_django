document.addEventListener('DOMContentLoaded', function () {
    const SURFACE_COLOR = {
        light: '#ffffff',
        dark: '#14161a',
        transparent: 'transparent'
    };

    const currentPath = window.location.pathname;
    const localizedLightBgPattern = /^\/(?:ko|en)\/(?:portfolio\/?|project\/\d+\/?|docs(?:\/.*)?)$/;
    const isLightBackgroundPage = document.body.classList.contains('portfolio-page') ||
        document.body.classList.contains('project-page') ||
        document.body.classList.contains('docs-page') ||
        currentPath === '/portfolio/' ||
        currentPath === '/portfolio' ||
        currentPath === '/docs/' ||
        currentPath === '/docs' ||
        currentPath.startsWith('/docs/') ||
        currentPath.startsWith('/project/') ||
        localizedLightBgPattern.test(currentPath);
    const bubbleCanvas = document.getElementById('interactiveBubbleCanvas');
    const portfolioMainLayer = document.querySelector('.main-has-bubble-bg');
    const bubbleLayer = document.querySelector('.bubble-bg-layer');
    const themeToggle = document.querySelector('.portfolio-theme-toggle');
    const themeToggleButtons = themeToggle
        ? Array.from(themeToggle.querySelectorAll('.portfolio-control-link[data-theme-mode]'))
        : [];
    const THEME_MODE_STORAGE_KEY = 'portfolio_theme_mode';
    const printSurfaceSnapshot = {
        active: false,
        htmlStyle: null,
        bodyStyle: null,
        bubbleLayerStyle: null,
        bubbleCanvasStyle: null
    };

    let currentSurfaceMode = null;
    let manualThemeMode = null;

    const setSurfaceBackground = function (element, color) {
        if (!element) {
            return;
        }

        element.style.background = color;
        element.style.backgroundColor = color;
        element.style.backgroundImage = 'none';
    };

    const restoreStyleAttribute = function (element, styleText) {
        if (!element) {
            return;
        }

        if (styleText === null || typeof styleText === 'undefined') {
            element.removeAttribute('style');
            return;
        }

        element.setAttribute('style', styleText);
    };

    const applyPrintSurfaceOverride = function () {
        if (!isLightBackgroundPage || printSurfaceSnapshot.active) {
            return;
        }

        printSurfaceSnapshot.active = true;
        printSurfaceSnapshot.htmlStyle = document.documentElement.getAttribute('style');
        printSurfaceSnapshot.bodyStyle = document.body.getAttribute('style');
        printSurfaceSnapshot.bubbleLayerStyle = bubbleLayer ? bubbleLayer.getAttribute('style') : null;
        printSurfaceSnapshot.bubbleCanvasStyle = bubbleCanvas ? bubbleCanvas.getAttribute('style') : null;

        setSurfaceBackground(document.documentElement, SURFACE_COLOR.light);
        setSurfaceBackground(document.body, SURFACE_COLOR.light);

        if (bubbleLayer) {
            bubbleLayer.style.display = 'block';
            bubbleLayer.style.visibility = 'visible';
            setSurfaceBackground(bubbleLayer, SURFACE_COLOR.transparent);
        }

        if (bubbleCanvas) {
            bubbleCanvas.style.display = 'none';
            bubbleCanvas.style.visibility = 'hidden';
        }
    };

    const clearPrintSurfaceOverride = function () {
        if (!printSurfaceSnapshot.active) {
            return;
        }

        restoreStyleAttribute(document.documentElement, printSurfaceSnapshot.htmlStyle);
        restoreStyleAttribute(document.body, printSurfaceSnapshot.bodyStyle);
        restoreStyleAttribute(bubbleLayer, printSurfaceSnapshot.bubbleLayerStyle);
        restoreStyleAttribute(bubbleCanvas, printSurfaceSnapshot.bubbleCanvasStyle);

        printSurfaceSnapshot.active = false;
    };

    window.addEventListener('beforeprint', applyPrintSurfaceOverride);
    window.addEventListener('afterprint', clearPrintSurfaceOverride);

    const setLightSurfaceStylesEnabled = function (enabled) {
        const mediaValue = enabled ? 'all' : 'not all';
        const taggedStyles = document.querySelectorAll('style[data-surface-light]');

        taggedStyles.forEach(function (styleElement) {
            styleElement.media = mediaValue;
        });

        const legacyStyles = document.querySelectorAll('style:not([data-surface-light])');
        legacyStyles.forEach(function (styleElement) {
            const cssText = styleElement.textContent || '';
            const isLegacySurfaceStyle = cssText.includes('preload-light-bg') ||
                (cssText.includes('interactiveBubbleCanvas') && cssText.includes('#ffffff')) ||
                (cssText.includes('body') && cssText.includes('#ffffff') && cssText.includes('background'));

            if (!isLegacySurfaceStyle) {
                return;
            }

            styleElement.media = mediaValue;
        });
    };

    const readStoredThemeMode = function () {
        try {
            const storedMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
            if (storedMode === 'dark') {
                return true;
            }
            if (storedMode === 'light') {
                return false;
            }
        } catch (error) {}
        return null;
    };

    const persistThemeMode = function (darkMode) {
        try {
            if (darkMode === true) {
                window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark');
                return;
            }
            if (darkMode === false) {
                window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'light');
                return;
            }
            window.localStorage.removeItem(THEME_MODE_STORAGE_KEY);
        } catch (error) {}
    };

    const syncThemeToggleState = function () {
        if (!themeToggle) {
            return;
        }
        themeToggle.style.display = '';
        const darkActive = Boolean(currentSurfaceMode);

        themeToggleButtons.forEach(function (button) {
            const isDarkButton = button.dataset.themeMode === 'dark';
            const isActive = isDarkButton === darkActive;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    const applyPageSurfaceMode = function (useDarkTheme) {
        currentSurfaceMode = useDarkTheme;
        document.body.classList.toggle('theme-dark', useDarkTheme);

        if (!isLightBackgroundPage) {
            return;
        }

        const surfaceColor = useDarkTheme ? SURFACE_COLOR.dark : SURFACE_COLOR.light;
        if (useDarkTheme) {
            document.documentElement.classList.remove('preload-light-bg');
        } else {
            document.documentElement.classList.add('preload-light-bg');
        }
        setLightSurfaceStylesEnabled(!useDarkTheme);
        setSurfaceBackground(document.documentElement, surfaceColor);
        setSurfaceBackground(document.body, surfaceColor);

        if (portfolioMainLayer) {
            portfolioMainLayer.style.backgroundColor = 'transparent';
        }

        if (bubbleLayer) {
            bubbleLayer.style.display = 'block';
            setSurfaceBackground(bubbleLayer, surfaceColor);
        }

        if (bubbleCanvas) {
            setSurfaceBackground(bubbleCanvas, surfaceColor);
        }
    };

    const applyThemeMode = function () {
        applyPageSurfaceMode(Boolean(manualThemeMode));
        syncThemeToggleState();
    };

    const setManualThemeMode = function (useDarkTheme) {
        manualThemeMode = Boolean(useDarkTheme);
        persistThemeMode(manualThemeMode);
        applyThemeMode();
    };

    manualThemeMode = readStoredThemeMode();
    if (manualThemeMode === null) {
        manualThemeMode = false;
    }

    themeToggleButtons.forEach(function (button) {
        button.addEventListener('click', function (event) {
            event.preventDefault();
            const useDarkTheme = button.dataset.themeMode === 'dark';
            setManualThemeMode(useDarkTheme);
        });
    });

    applyThemeMode();

    const enableNestedScrollPriority = function () {
        const canUseOverflowScroll = function (overflowValue) {
            return overflowValue === 'auto' || overflowValue === 'scroll' || overflowValue === 'overlay';
        };

        const hasScrollableY = function (element, style) {
            return canUseOverflowScroll(style.overflowY) && (element.scrollHeight - element.clientHeight) > 1;
        };

        const hasScrollableX = function (element, style) {
            return canUseOverflowScroll(style.overflowX) && (element.scrollWidth - element.clientWidth) > 1;
        };

        const canConsumeY = function (element, deltaY) {
            if (deltaY < 0) {
                return element.scrollTop > 0;
            }

            if (deltaY > 0) {
                const maxScrollTop = element.scrollHeight - element.clientHeight;
                return element.scrollTop < maxScrollTop - 1;
            }

            return false;
        };

        const canConsumeX = function (element, deltaX) {
            if (deltaX < 0) {
                return element.scrollLeft > 0;
            }

            if (deltaX > 0) {
                const maxScrollLeft = element.scrollWidth - element.clientWidth;
                return element.scrollLeft < maxScrollLeft - 1;
            }

            return false;
        };

        const normalizeWheelDelta = function (delta, deltaMode) {
            if (deltaMode === 1) {
                return delta * 16;
            }

            if (deltaMode === 2) {
                return delta * window.innerHeight;
            }

            return delta;
        };

        const isEditableElement = function (element) {
            if (!element || !element.closest) {
                return false;
            }

            return Boolean(element.closest('input, textarea, select, option, [contenteditable="true"]'));
        };

        document.addEventListener('wheel', function (event) {
            if (event.defaultPrevented || event.ctrlKey) {
                return;
            }

            const eventTarget = event.target;
            if (!(eventTarget instanceof Element) || isEditableElement(eventTarget)) {
                return;
            }

            let deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
            let deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);

            if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) {
                return;
            }

            let current = eventTarget;
            while (current && current !== document.body && current !== document.documentElement) {
                if (!(current instanceof HTMLElement)) {
                    current = current.parentElement;
                    continue;
                }

                const style = window.getComputedStyle(current);
                const canScrollY = hasScrollableY(current, style);
                const canScrollX = hasScrollableX(current, style);

                if (!canScrollX && !canScrollY) {
                    current = current.parentElement;
                    continue;
                }

                if (canScrollY && canConsumeY(current, deltaY)) {
                    current.scrollTop += deltaY;
                    event.preventDefault();
                    return;
                }

                let horizontalDelta = deltaX;
                if (Math.abs(horizontalDelta) < 0.01 && Math.abs(deltaY) > 0.01) {
                    horizontalDelta = deltaY;
                }

                if (canScrollX && canConsumeX(current, horizontalDelta)) {
                    current.scrollLeft += horizontalDelta;
                    event.preventDefault();
                    return;
                }

                current = current.parentElement;
            }
        }, { passive: false });
    };

    enableNestedScrollPriority();

    const initInteractiveBubbleBackground = function (canvas) {
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const pointer = { x: 0, y: 0, active: false };
        const bubbles = [];
        const popEffects = [];
        let width = 0;
        let height = 0;
        let viewportMinDimension = 0;
        let topInset = 0;
        let rafBubbleId = null;
        let lastFrameTime = 0;
        let bubblesExhausted = false;
        let hasInitializedBubbles = false;
        let respawnTimerId = null;
        const isBubbleFunPage = document.body.classList.contains('bubble-page');
        const bubbleRespawnDelayMs = prefersReducedMotion ? 260 : 420;
        const bubblePhysicsConfig = {
            wallPopSpeedThreshold: prefersReducedMotion ? 12.31 : 10.65,
            bubblePopImpactThreshold: prefersReducedMotion ? 11.31 : 9.65,
            fixedBubbleCount: 7,
            pointerReactionPadding: 180,
            pointerKeepOutPadding: 32
        };

        const randomBetween = function (min, max) {
            return Math.random() * (max - min) + min;
        };

        const clampUnit = function (value) {
            return Math.min(1, Math.max(0, value));
        };

        const cmykToRgb = function (c, m, y, k) {
            const cyan = clampUnit(c);
            const magenta = clampUnit(m);
            const yellow = clampUnit(y);
            const black = clampUnit(k);

            return {
                r: Math.round(255 * (1 - cyan) * (1 - black)),
                g: Math.round(255 * (1 - magenta) * (1 - black)),
                b: Math.round(255 * (1 - yellow) * (1 - black))
            };
        };

        const clampByte = function (value) {
            return Math.min(255, Math.max(0, Math.round(value)));
        };

        const rgbToCss = function (color) {
            return 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
        };

        const rgbaFrom = function (color, alpha) {
            return 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', ' + alpha + ')';
        };

        const invertRgb = function (color) {
            return {
                r: 255 - color.r,
                g: 255 - color.g,
                b: 255 - color.b
            };
        };

        const mixRgb = function (fromColor, toColor, ratio) {
            const t = clampUnit(ratio);
            return {
                r: clampByte(fromColor.r + ((toColor.r - fromColor.r) * t)),
                g: clampByte(fromColor.g + ((toColor.g - fromColor.g) * t)),
                b: clampByte(fromColor.b + ((toColor.b - fromColor.b) * t))
            };
        };

        const buildBubbleVisualPalette = function (backgroundColor) {
            const inverse = invertRgb(backgroundColor);
            const white = { r: 255, g: 255, b: 255 };
            const black = { r: 0, g: 0, b: 0 };

            return {
                bodyCore: mixRgb(inverse, white, 0.12),
                bodyMid: mixRgb(inverse, white, 0.02),
                bodyEdge: mixRgb(inverse, black, 0.2),
                innerShadow: mixRgb(inverse, black, 0.44),
                highlight: mixRgb(inverse, white, 0.45),
                stroke: mixRgb(inverse, white, 0.2),
                popRing: mixRgb(inverse, white, 0.26),
                popFlash: mixRgb(inverse, white, 0.48),
                popParticle: mixRgb(inverse, black, 0.08)
            };
        };

        let bubbleVisualPalette = buildBubbleVisualPalette({ r: 191, g: 191, b: 191 });

        const pickRandomBubbleBackgroundColor = function () {
            // Keep a consistent tone by fixing K and keeping total C+M+Y ink in a narrow band.
            const k = randomBetween(0.2, 0.28);
            const targetInk = randomBetween(0.92, 1.18);
            const neutralMix = randomBetween(0.05, 0.12);
            const weights = [
                Math.random() + 0.08,
                Math.random() + 0.08,
                Math.random() + 0.08
            ];
            const weightSum = weights[0] + weights[1] + weights[2];

            let c = (targetInk * weights[0]) / weightSum;
            let m = (targetInk * weights[1]) / weightSum;
            let y = (targetInk * weights[2]) / weightSum;

            c = clampUnit(c * (1 - neutralMix) + (0.42 * neutralMix));
            m = clampUnit(m * (1 - neutralMix) + (0.42 * neutralMix));
            y = clampUnit(y * (1 - neutralMix) + (0.42 * neutralMix));

            return cmykToRgb(c, m, y, k);
        };

        const setBubblePageBackground = function (color) {
            if (!isBubbleFunPage || !color) {
                return;
            }

            const hasRgbObject = typeof color === 'object' && color !== null;
            const cssColor = hasRgbObject ? rgbToCss(color) : String(color);

            if (hasRgbObject) {
                bubbleVisualPalette = buildBubbleVisualPalette(color);
            }

            document.body.style.backgroundColor = cssColor;
            document.body.style.backgroundImage = 'none';

            if (bubbleLayer) {
                bubbleLayer.style.backgroundColor = cssColor;
                bubbleLayer.style.backgroundImage = 'none';
            }

            if (bubbleCanvas) {
                bubbleCanvas.style.backgroundColor = cssColor;
                bubbleCanvas.style.backgroundImage = 'none';
            }
        };

        const scheduleBubbleRespawn = function () {
            if (!isBubbleFunPage || respawnTimerId !== null) {
                return;
            }

            setBubblePageBackground(pickRandomBubbleBackgroundColor());
            respawnTimerId = window.setTimeout(function () {
                respawnTimerId = null;
                bubblesExhausted = false;
                hasInitializedBubbles = false;
                resizeCanvas();
            }, bubbleRespawnDelayMs);
        };

        const clamp = function (value, min, max) {
            return Math.min(max, Math.max(min, value));
        };

        const getViewportMinDimension = function () {
            const viewportWidth = width || window.innerWidth;
            const viewportHeight = height || window.innerHeight;
            return Math.max(320, Math.min(viewportWidth, viewportHeight));
        };

        const getBubbleRadiusRange = function () {
            const base = getViewportMinDimension();
            const baseMinRadius = Math.max(26, Math.round(base * 0.045));
            const baseMaxRadius = Math.max(baseMinRadius + 8, Math.round(base * 0.063));
            const minRadius = baseMinRadius * 2;
            const maxRadius = Math.max(minRadius + 16, baseMaxRadius * 2);
            return { min: minRadius, max: maxRadius };
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
            const radiusRange = getBubbleRadiusRange();
            const radius = randomBetween(radiusRange.min, radiusRange.max);
            const minX = radius;
            const maxX = Math.max(minX, (width || window.innerWidth) - radius);
            const minY = radius + topInset;
            const maxY = Math.max(minY, (height || window.innerHeight) - radius);
            const spawnDuration = prefersReducedMotion
                ? randomBetween(120, 220)
                : randomBetween(260, 420);

            return {
                x: randomBetween(minX, maxX),
                y: randomBetween(minY, maxY),
                radius: radius,
                vx: randomBetween(-0.18, 0.18),
                vy: randomBetween(-0.12, 0.12),
                alpha: randomBetween(0.35, 0.72),
                phase: randomBetween(0, Math.PI * 2),
                drift: randomBetween(0.85, 1.2),
                spawnElapsed: 0,
                spawnDuration: spawnDuration
            };
        };

        const getBubbleSpawnProgress = function (bubble) {
            if (!bubble || !bubble.spawnDuration || bubble.spawnDuration <= 0) {
                return 1;
            }
            return clampUnit((bubble.spawnElapsed || 0) / bubble.spawnDuration);
        };

        const getBubbleSpawnEase = function (bubble) {
            const progress = getBubbleSpawnProgress(bubble);
            return 1 - Math.pow(1 - progress, 3);
        };

        const resizeCanvas = function () {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const previousViewportMinDimension = viewportMinDimension || getViewportMinDimension();
            width = window.innerWidth;
            height = window.innerHeight;
            topInset = getTopInset();
            canvas.width = Math.max(1, Math.floor(width * dpr));
            canvas.height = Math.max(1, Math.floor(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const nextViewportMinDimension = getViewportMinDimension();

            if (bubblesExhausted) {
                bubbles.length = 0;
                viewportMinDimension = nextViewportMinDimension;
                return;
            }

            if (!hasInitializedBubbles) {
                while (bubbles.length < bubblePhysicsConfig.fixedBubbleCount) {
                    bubbles.push(createBubble());
                }

                bubbles.length = bubblePhysicsConfig.fixedBubbleCount;
                hasInitializedBubbles = true;
            } else if (previousViewportMinDimension > 0 && nextViewportMinDimension > 0) {
                const resizeScale = nextViewportMinDimension / previousViewportMinDimension;
                const radiusRange = getBubbleRadiusRange();

                bubbles.forEach(function (bubble) {
                    bubble.radius = clamp(bubble.radius * resizeScale, radiusRange.min, radiusRange.max);
                });
            }

            viewportMinDimension = nextViewportMinDimension;

            bubbles.forEach(function (bubble) {
                const minX = bubble.radius;
                const maxX = Math.max(minX, width - bubble.radius);
                const minY = topInset + bubble.radius;
                const maxY = Math.max(minY, height - bubble.radius);
                bubble.x = Math.min(maxX, Math.max(minX, bubble.x));
                bubble.y = Math.min(maxY, Math.max(minY, bubble.y));
            });
        };

        const drawBubble = function (bubble, time) {
            const spawnEase = getBubbleSpawnEase(bubble);
            const entranceScale = 0.72 + (0.28 * spawnEase);
            const entranceAlpha = 0.12 + (0.88 * spawnEase);
            const pulse = 1 + Math.sin((time * 0.0012) + bubble.phase) * 0.03;
            const radius = bubble.radius * pulse * entranceScale;
            const bubbleAlpha = bubble.alpha * entranceAlpha;
            const bodyGradient = ctx.createRadialGradient(
                bubble.x - (radius * 0.28),
                bubble.y - (radius * 0.32),
                radius * 0.14,
                bubble.x,
                bubble.y,
                radius
            );

            bodyGradient.addColorStop(0, rgbaFrom(bubbleVisualPalette.bodyCore, 0));
            bodyGradient.addColorStop(0.45, rgbaFrom(bubbleVisualPalette.bodyCore, 0.032 * bubbleAlpha));
            bodyGradient.addColorStop(0.8, rgbaFrom(bubbleVisualPalette.bodyMid, 0.082 * bubbleAlpha));
            bodyGradient.addColorStop(1, rgbaFrom(bubbleVisualPalette.bodyEdge, 0.14 * bubbleAlpha));

            ctx.beginPath();
            ctx.fillStyle = bodyGradient;
            ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Inner shadow clipped inside the bubble to avoid outer glow.
            ctx.save();
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
            ctx.clip();
            const innerShadow = ctx.createRadialGradient(
                bubble.x + (radius * 0.34),
                bubble.y + (radius * 0.38),
                radius * 0.06,
                bubble.x,
                bubble.y,
                radius * 0.92
            );
            innerShadow.addColorStop(0, rgbaFrom(bubbleVisualPalette.innerShadow, 0));
            innerShadow.addColorStop(0.72, rgbaFrom(bubbleVisualPalette.innerShadow, 0.11 * bubbleAlpha));
            innerShadow.addColorStop(1, rgbaFrom(bubbleVisualPalette.innerShadow, 0.24 * bubbleAlpha));
            ctx.fillStyle = innerShadow;
            ctx.fillRect(
                bubble.x - radius,
                bubble.y - radius,
                radius * 2,
                radius * 2
            );
            ctx.restore();

            const highlight = ctx.createRadialGradient(
                bubble.x - (radius * 0.22),
                bubble.y - (radius * 0.24),
                radius * 0.05,
                bubble.x - (radius * 0.08),
                bubble.y - (radius * 0.1),
                radius * 0.82
            );
            highlight.addColorStop(0, rgbaFrom(bubbleVisualPalette.highlight, 0));
            highlight.addColorStop(0.42, rgbaFrom(bubbleVisualPalette.highlight, 0.035 * bubbleAlpha));
            highlight.addColorStop(1, rgbaFrom(bubbleVisualPalette.highlight, 0));
            ctx.beginPath();
            ctx.fillStyle = highlight;
            ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        const createPopEffect = function (bubble) {
            const particleCount = prefersReducedMotion ? 4 : 12;
            const particles = [];
            const popPalette = {
                popRing: bubbleVisualPalette.popRing,
                popFlash: bubbleVisualPalette.popFlash,
                popParticle: bubbleVisualPalette.popParticle
            };

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
                palette: popPalette,
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
                const effectPalette = effect.palette || bubbleVisualPalette;
                const progress = Math.min(effect.age / effect.duration, 1);
                const expansion = 1 - Math.pow(1 - progress, 3);
                const ringRadius = effect.innerRadius + ((effect.outerRadius - effect.innerRadius) * expansion);
                const ringAlpha = (1 - progress) * 0.46 * effect.alpha;

                if (ringAlpha > 0.01) {
                    ctx.beginPath();
                    ctx.strokeStyle = rgbaFrom(effectPalette.popRing, ringAlpha);
                    ctx.lineWidth = Math.max(1.1, (1 - progress) * (effect.innerRadius * 0.5));
                    ctx.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }

                const flashAlpha = (1 - progress) * (1 - progress) * 0.4 * effect.alpha;
                if (flashAlpha > 0.01) {
                    ctx.beginPath();
                    ctx.fillStyle = rgbaFrom(effectPalette.popFlash, flashAlpha);
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
                    ctx.fillStyle = rgbaFrom(effectPalette.popParticle, particleAlpha);
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
                const spawnEase = getBubbleSpawnEase(bubble);
                const hitRadius = (bubble.radius * (0.72 + (0.28 * spawnEase))) * 1.05;

                if ((dx * dx) + (dy * dy) <= (hitRadius * hitRadius)) {
                    createPopEffect(bubble);
                    bubbles.splice(i, 1);
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
                if (bubble.spawnElapsed < bubble.spawnDuration) {
                    bubble.spawnElapsed = Math.min(bubble.spawnDuration, bubble.spawnElapsed + deltaMs);
                }

                bubble.vx += Math.sin((time * 0.0005 * bubble.drift) + bubble.phase) * 0.007;
                bubble.vy += Math.cos((time * 0.00042 * bubble.drift) + bubble.phase) * 0.006;

                if (!prefersReducedMotion && pointer.active) {
                    const dx = bubble.x - pointer.x;
                    const dy = bubble.y - pointer.y;
                    const distanceSquared = (dx * dx) + (dy * dy);
                    const reactionRadius = bubble.radius + bubblePhysicsConfig.pointerReactionPadding;
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
                    const keepOutRadius = bubble.radius + bubblePhysicsConfig.pointerKeepOutPadding;

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

                    if (impactSpeed > bubblePhysicsConfig.bubblePopImpactThreshold) {
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

                    if (impactSpeed > bubblePhysicsConfig.wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                } else if (bubble.x > maxX) {
                    const impactSpeed = Math.abs(bubble.vx);
                    bubble.x = maxX;
                    bubble.vx = -Math.abs(bubble.vx) * 0.92;

                    if (impactSpeed > bubblePhysicsConfig.wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                }

                if (bubble.y < minY) {
                    const impactSpeed = Math.abs(bubble.vy);
                    bubble.y = minY;
                    bubble.vy = Math.abs(bubble.vy) * 0.92;

                    if (impactSpeed > bubblePhysicsConfig.wallPopSpeedThreshold) {
                        poppedBubbles.add(bubble);
                        return;
                    }
                } else if (bubble.y > maxY) {
                    const impactSpeed = Math.abs(bubble.vy);
                    bubble.y = maxY;
                    bubble.vy = -Math.abs(bubble.vy) * 0.92;

                    if (impactSpeed > bubblePhysicsConfig.wallPopSpeedThreshold) {
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

            if (bubbles.length === 0 && !bubblesExhausted) {
                bubblesExhausted = true;
                scheduleBubbleRespawn();
            }

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
        window.addEventListener('orientationchange', resizeCanvas, { passive: true });

        if (isBubbleFunPage) {
            setBubblePageBackground(pickRandomBubbleBackgroundColor());
        }

        resizeCanvas();

        if (rafBubbleId !== null) {
            window.cancelAnimationFrame(rafBubbleId);
        }

        rafBubbleId = window.requestAnimationFrame(animate);
    };

    if (bubbleCanvas) {
        const initBubbleWhenIdle = function () {
            if (document.visibilityState === 'hidden') {
                const startWhenVisible = function () {
                    if (document.visibilityState !== 'visible') {
                        return;
                    }

                    document.removeEventListener('visibilitychange', startWhenVisible);
                    initInteractiveBubbleBackground(bubbleCanvas);
                };
                document.addEventListener('visibilitychange', startWhenVisible, { passive: true });
                return;
            }

            initInteractiveBubbleBackground(bubbleCanvas);
        };

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(initBubbleWhenIdle, { timeout: 650 });
        } else {
            window.setTimeout(initBubbleWhenIdle, 140);
        }
    }

    const pageLang = (document.documentElement.getAttribute('lang') || 'ko').toLowerCase();
    const isEnglishPage = pageLang.startsWith('en');
    const printText = isEnglishPage ? {
        dialogTitle: 'Select Projects to Print',
        dialogDescription: 'Checked project detail pages will be printed with the summary.\nIf none are selected, only the summary will be printed.',
        selectAll: 'Select All',
        clearAll: 'Clear',
        cancel: 'Cancel',
        print: 'Print',
        noProjects: 'No project pages available. Summary only will be printed.',
        loading: 'Preparing print document...',
        popupBlocked: 'Popup was blocked. Allow popups and try again.',
        loadFailed: 'Failed to load this project page.'
    } : {
        dialogTitle: '프로젝트 선택',
        dialogDescription: '체크한 프로젝트 상세 페이지를 요약과 함께 인쇄합니다.\n선택이 없으면 요약만 인쇄됩니다.',
        selectAll: '전체 선택',
        clearAll: '선택 해제',
        cancel: '취소',
        print: '인쇄',
        noProjects: '선택 가능한 프로젝트가 없습니다. 요약만 인쇄됩니다.',
        loading: '인쇄 문서를 준비하고 있습니다...',
        popupBlocked: '팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.',
        loadFailed: '프로젝트 페이지를 불러오지 못했습니다.'
    };

    const escapeHtml = function (value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const extractYouTubeVideoId = function (rawUrl) {
        if (!rawUrl) {
            return '';
        }

        try {
            const parsedUrl = new URL(rawUrl, window.location.origin);
            const host = parsedUrl.hostname.toLowerCase();
            let videoId = '';

            if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
                videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
            } else if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
                const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
                const embedIndex = pathSegments.indexOf('embed');

                if (embedIndex >= 0 && pathSegments[embedIndex + 1]) {
                    videoId = pathSegments[embedIndex + 1];
                }

                if (!videoId && pathSegments[0] === 'shorts' && pathSegments[1]) {
                    videoId = pathSegments[1];
                }

                if (!videoId) {
                    videoId = parsedUrl.searchParams.get('v') || '';
                }
            }

            videoId = (videoId || '').split('&')[0].split('?')[0].trim();
            return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : '';
        } catch (error) {
            return '';
        }
    };

    const toAbsoluteUrl = function (rawUrl) {
        if (!rawUrl) {
            return '';
        }

        try {
            return new URL(rawUrl, window.location.origin).toString();
        } catch (error) {
            return '';
        }
    };

    const resolveEmbeddedMediaTitle = function (rawTitle, projectTitle) {
        const title = (rawTitle || '').trim();
        const lowered = title.toLowerCase();
        const genericTitle = !title ||
            lowered === 'youtube video player' ||
            lowered === 'video player' ||
            lowered === 'youtube' ||
            (lowered.includes('youtube') && lowered.includes('player')) ||
            title.includes('동영상 플레이어');

        if (!genericTitle) {
            return title;
        }

        const normalizedProjectTitle = (projectTitle || '').trim();
        if (normalizedProjectTitle) {
            return isEnglishPage ? (normalizedProjectTitle + ' video') : (normalizedProjectTitle + ' 영상');
        }

        return isEnglishPage ? 'Project video' : '프로젝트 영상';
    };

    const buildEmbeddedMediaFallbackNode = function (embedUrl, mediaTitle) {
        const absoluteUrl = toAbsoluteUrl(embedUrl);
        if (!absoluteUrl) {
            return null;
        }

        const paragraph = document.createElement('p');
        paragraph.className = 'print-embed-link';

        const anchor = document.createElement('a');
        anchor.href = absoluteUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = (mediaTitle || '').trim() || (isEnglishPage ? 'Embedded media link' : '임베드 미디어 링크');

        paragraph.appendChild(anchor);
        return paragraph;
    };

    const buildYouTubeThumbnailNode = function (embedUrl, mediaTitle) {
        const videoId = extractYouTubeVideoId(embedUrl);
        if (!videoId) {
            return null;
        }

        const watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
        const thumbnailUrl = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';

        const figure = document.createElement('figure');
        figure.className = 'print-video-thumb';

        const link = document.createElement('a');
        link.href = watchUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'print-video-thumb-link';

        const image = document.createElement('img');
        image.src = thumbnailUrl;
        image.alt = mediaTitle || (isEnglishPage ? 'YouTube video thumbnail' : '유튜브 영상 썸네일');
        image.loading = 'eager';
        image.decoding = 'sync';
        link.appendChild(image);

        const caption = document.createElement('figcaption');
        const captionLink = document.createElement('a');
        captionLink.href = watchUrl;
        captionLink.target = '_blank';
        captionLink.rel = 'noopener noreferrer';
        captionLink.textContent = mediaTitle || (isEnglishPage ? 'YouTube video link' : '유튜브 영상 링크');
        caption.appendChild(captionLink);

        figure.appendChild(link);
        figure.appendChild(caption);
        return figure;
    };

    const absolutizeResourceUrls = function (container, baseUrl) {
        if (!container) {
            return;
        }

        container.querySelectorAll('[src]').forEach(function (element) {
            const rawSrc = element.getAttribute('src');
            if (!rawSrc) {
                return;
            }

            try {
                element.setAttribute('src', new URL(rawSrc, baseUrl).toString());
            } catch (error) {}
        });

        container.querySelectorAll('a[href]').forEach(function (element) {
            const rawHref = element.getAttribute('href');
            if (!rawHref || rawHref.startsWith('#')) {
                return;
            }

            try {
                element.setAttribute('href', new URL(rawHref, baseUrl).toString());
            } catch (error) {}
        });
    };

    const mmToPx = function (mm) {
        return mm * (96 / 25.4);
    };

    const PRINT_IMAGE_LAYOUT = {
        landscapePerRow: 2,
        squarePerRow: 3,
        portraitPerRow: 4,
        defaultGapPx: 10,
        sidePaddingReservePx: 14,
        rowSafetyScale: 0.88,
        fallbackContainerWidthPx: mmToPx(186),
        landscapeMaxHeightPx: mmToPx(84),
        squareMaxHeightPx: mmToPx(90),
        portraitMaxHeightPx: mmToPx(106),
        portraitMaxWidthMm: 45.6,
        landscapeWidthByPortraitMultiplier: 2.0,
        minWidthPx: 72
    };

    const getPrintTargetWidthByRow = function (availableWidth, perRow) {
        return Math.max(
            Math.floor(
                (
                    (availableWidth - (PRINT_IMAGE_LAYOUT.defaultGapPx * (perRow - 1))) /
                    perRow
                ) * PRINT_IMAGE_LAYOUT.rowSafetyScale
            ),
            PRINT_IMAGE_LAYOUT.minWidthPx
        );
    };

    const getPrintImageLayoutForRatio = function (ratio) {
        if (!ratio || !Number.isFinite(ratio)) {
            return {
                perRow: PRINT_IMAGE_LAYOUT.squarePerRow,
                maxHeightPx: PRINT_IMAGE_LAYOUT.squareMaxHeightPx
            };
        }

        if (ratio >= 1.15) {
            return {
                perRow: PRINT_IMAGE_LAYOUT.landscapePerRow,
                maxHeightPx: PRINT_IMAGE_LAYOUT.landscapeMaxHeightPx
            };
        }

        if (ratio <= 0.85) {
            return {
                perRow: PRINT_IMAGE_LAYOUT.portraitPerRow,
                maxHeightPx: PRINT_IMAGE_LAYOUT.portraitMaxHeightPx
            };
        }

        return {
            perRow: PRINT_IMAGE_LAYOUT.squarePerRow,
            maxHeightPx: PRINT_IMAGE_LAYOUT.squareMaxHeightPx
        };
    };

    const applyPrintImageSizeConstraints = function (image) {
        if (!image) {
            return;
        }

        const naturalWidth = image.naturalWidth || 0;
        const naturalHeight = image.naturalHeight || 0;

        if (!naturalWidth || !naturalHeight) {
            image.style.width = 'auto';
            image.style.height = 'auto';
            image.style.maxWidth = 'min(100%, ' + (PRINT_IMAGE_LAYOUT.portraitMaxWidthMm * PRINT_IMAGE_LAYOUT.landscapeWidthByPortraitMultiplier) + 'mm)';
            image.style.maxHeight = '136mm';
            image.style.objectFit = 'contain';
            return;
        }

        const ratio = naturalWidth / naturalHeight;
        const layoutRule = getPrintImageLayoutForRatio(ratio);
        const parentWidth = image.parentElement && image.parentElement.clientWidth
            ? image.parentElement.clientWidth
            : PRINT_IMAGE_LAYOUT.fallbackContainerWidthPx;
        const availableWidth = Math.max(
            parentWidth - PRINT_IMAGE_LAYOUT.sidePaddingReservePx,
            PRINT_IMAGE_LAYOUT.minWidthPx * layoutRule.perRow
        );
        const targetWidthByRow = getPrintTargetWidthByRow(availableWidth, layoutRule.perRow);
        const portraitWidthByRow = getPrintTargetWidthByRow(availableWidth, PRINT_IMAGE_LAYOUT.portraitPerRow);
        const portraitMaxWidthPx = Math.max(
            PRINT_IMAGE_LAYOUT.minWidthPx,
            Math.min(portraitWidthByRow, mmToPx(PRINT_IMAGE_LAYOUT.portraitMaxWidthMm))
        );
        const landscapeMaxWidthPx = portraitMaxWidthPx * PRINT_IMAGE_LAYOUT.landscapeWidthByPortraitMultiplier;
        const scale = Math.min(
            targetWidthByRow / naturalWidth,
            layoutRule.maxHeightPx / naturalHeight,
            ratio >= 1.15 ? (landscapeMaxWidthPx / naturalWidth) : 1,
            1
        );

        image.style.width = Math.round(naturalWidth * scale) + 'px';
        image.style.height = Math.round(naturalHeight * scale) + 'px';
        image.style.maxWidth = 'none';
        image.style.maxHeight = 'none';
        image.style.objectFit = 'contain';
    };

    const normalizeProjectPrintMediaLayout = function (container, projectTitle) {
        if (!container) {
            return;
        }

        container.querySelectorAll('iframe[src]').forEach(function (iframeNode) {
            const src = iframeNode.getAttribute('src') || '';
            const iframeTitle = iframeNode.getAttribute('title') || '';
            const mediaTitle = resolveEmbeddedMediaTitle(iframeTitle, projectTitle);
            const replacementNode = buildYouTubeThumbnailNode(src, mediaTitle) || buildEmbeddedMediaFallbackNode(src, mediaTitle);
            const wrapperNode = iframeNode.parentElement;
            const isResponsiveWrapper = wrapperNode &&
                wrapperNode.classList &&
                wrapperNode.classList.contains('responsive-iframe') &&
                wrapperNode.children.length === 1;

            if (replacementNode) {
                if (isResponsiveWrapper) {
                    wrapperNode.replaceWith(replacementNode);
                } else {
                    iframeNode.replaceWith(replacementNode);
                }
            } else {
                if (isResponsiveWrapper) {
                    wrapperNode.remove();
                } else {
                    iframeNode.remove();
                }
            }
        });

        container.querySelectorAll('img').forEach(function (image) {
            const dataSrc = image.getAttribute('data-src');
            if (dataSrc && !image.getAttribute('src')) {
                image.setAttribute('src', dataSrc);
            }

            const dataSrcset = image.getAttribute('data-srcset');
            if (dataSrcset && !image.getAttribute('srcset')) {
                image.setAttribute('srcset', dataSrcset);
            }

            image.setAttribute('loading', 'eager');
            image.setAttribute('decoding', 'sync');
            image.setAttribute('data-print-project-image', '1');
            applyPrintImageSizeConstraints(image);
        });

        container.querySelectorAll('[style*="overflow-x: auto"],[style*="overflow-x:auto"]').forEach(function (node) {
            node.style.overflowX = 'visible';
            node.style.overflow = 'visible';
            node.style.whiteSpace = 'normal';

            const displayValue = (node.style.display || '').toLowerCase();
            if (displayValue === 'flex' || displayValue === 'inline-flex') {
                node.style.flexWrap = 'wrap';
                if (!node.style.justifyContent) {
                    node.style.justifyContent = 'center';
                }
            }
        });
    };

    const waitForImagesReady = function (doc, timeoutMs) {
        const images = Array.from(doc.querySelectorAll('img[src]'));
        if (images.length === 0) {
            return Promise.resolve();
        }

        return new Promise(function (resolve) {
            let pending = 0;
            let finished = false;

            const finish = function () {
                if (finished) {
                    return;
                }
                finished = true;
                resolve();
            };

            const markDone = function () {
                pending -= 1;
                if (pending <= 0) {
                    finish();
                }
            };

            images.forEach(function (image) {
                image.setAttribute('loading', 'eager');
                image.setAttribute('decoding', 'sync');
                const shouldApplyPrintConstraint = image.closest('.print-project') || image.getAttribute('data-print-project-image') === '1';
                if (shouldApplyPrintConstraint) {
                    applyPrintImageSizeConstraints(image);
                }

                if (image.complete && image.naturalWidth > 0) {
                    if (shouldApplyPrintConstraint) {
                        applyPrintImageSizeConstraints(image);
                    }
                    return;
                }

                pending += 1;
                const onDone = function () {
                    image.removeEventListener('load', onDone);
                    image.removeEventListener('error', onDone);
                    if (shouldApplyPrintConstraint) {
                        applyPrintImageSizeConstraints(image);
                    }
                    markDone();
                };

                image.addEventListener('load', onDone, { once: true });
                image.addEventListener('error', onDone, { once: true });
            });

            if (pending === 0) {
                finish();
                return;
            }

            window.setTimeout(finish, timeoutMs || 4000);
        });
    };

    const collectProjectPrintOptions = function () {
        const projectMap = new Map();
        const projectAnchors = document.querySelectorAll('.main_projects .project_card a[href*="/project/"]');

        projectAnchors.forEach(function (anchor) {
            const href = anchor.getAttribute('href');
            if (!href) {
                return;
            }

            let absoluteUrl = '';
            try {
                absoluteUrl = new URL(href, window.location.origin).toString();
            } catch (error) {
                return;
            }

            if (projectMap.has(absoluteUrl)) {
                return;
            }

            const projectCard = anchor.closest('.project_card');
            const titleElement = projectCard ? projectCard.querySelector('.project_card_contents_title') : null;
            const title = (titleElement ? titleElement.textContent : anchor.textContent || '').trim() || absoluteUrl;
            projectMap.set(absoluteUrl, title);
        });

        return Array.from(projectMap.entries()).map(function (entry) {
            return { url: entry[0], title: entry[1] };
        });
    };

    const buildSummaryPrintHtml = function () {
        const container = document.createElement('section');
        container.className = 'print-summary';

        const banner = document.querySelector('.main_banner');
        if (banner) {
            container.appendChild(banner.cloneNode(true));
        }

        const mainContents = document.querySelector('.main_contents');
        if (mainContents) {
            const contentsClone = mainContents.cloneNode(true);
            const projectsSection = contentsClone.querySelector('.main_projects');
            const hobbysSection = contentsClone.querySelector('.main_hobbys');

            if (projectsSection) {
                projectsSection.remove();
            }
            if (hobbysSection) {
                hobbysSection.remove();
            }

            container.appendChild(contentsClone);
        }

        return container.outerHTML;
    };

    const fetchProjectPrintSectionHtml = async function (projectUrl, projectTitle) {
        const response = await fetch(projectUrl, { credentials: 'same-origin' });
        if (!response.ok) {
            throw new Error('Failed to fetch project page');
        }

        const html = await response.text();
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const detailNode = parsed.querySelector('.project_detail_page') || parsed.querySelector('.project_detail');

        if (!detailNode) {
            throw new Error('Project detail content not found');
        }

        const contentNode = detailNode.cloneNode(true);
        contentNode.querySelectorAll('script').forEach(function (scriptNode) {
            scriptNode.remove();
        });
        normalizeProjectPrintMediaLayout(contentNode, projectTitle);
        absolutizeResourceUrls(contentNode, response.url || projectUrl);

        return '<section class="print-project">' + contentNode.outerHTML + '</section>';
    };

    const openProjectPrintSelector = function (projectOptions) {
        return new Promise(function (resolve) {
            const isDarkDialog = document.body && document.body.classList
                ? document.body.classList.contains('theme-dark')
                : false;
            const readThemeToken = function (tokenName, fallbackValue) {
                try {
                    const styleTarget = document.body || document.documentElement;
                    const tokenValue = window.getComputedStyle(styleTarget).getPropertyValue(tokenName);
                    if (tokenValue && tokenValue.trim()) {
                        return tokenValue.trim();
                    }
                } catch (error) {}
                return fallbackValue;
            };

            const buttonTemplate = {
                base: {
                    background: readThemeToken('--btn-template-base-bg', 'transparent'),
                    border: readThemeToken('--btn-template-base-border', isDarkDialog ? 'rgba(255, 255, 255, 0.26)' : 'rgba(0, 0, 0, 0.18)'),
                    color: readThemeToken('--btn-template-base-color', isDarkDialog ? '#e8ebf1' : '#2f2f2f'),
                    hoverBackground: readThemeToken('--btn-template-base-hover-bg', isDarkDialog ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.06)'),
                    hoverBorder: readThemeToken('--btn-template-base-hover-border', isDarkDialog ? 'rgba(255, 255, 255, 0.32)' : 'rgba(0, 0, 0, 0.24)'),
                    hoverColor: readThemeToken('--btn-template-base-hover-color', isDarkDialog ? '#ffffff' : '#000000')
                },
                primary: {
                    background: readThemeToken('--btn-template-primary-bg', isDarkDialog ? 'rgb(95, 95, 104)' : 'rgb(65, 141, 65)'),
                    border: readThemeToken('--btn-template-primary-border', 'transparent'),
                    color: readThemeToken('--btn-template-primary-color', '#ffffff'),
                    hoverBackground: readThemeToken('--btn-template-primary-hover-bg', isDarkDialog ? 'rgb(84, 84, 92)' : 'rgb(57, 124, 57)'),
                    hoverBorder: readThemeToken('--btn-template-primary-hover-border', 'transparent'),
                    hoverColor: readThemeToken('--btn-template-primary-hover-color', '#ffffff')
                },
                transition: readThemeToken('--btn-template-transition', 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s ease'),
                hoverLift: readThemeToken('--btn-template-hover-lift', '-1px'),
                borderRadius: readThemeToken('--btn-template-radius', '8px')
            };

            const dialogTheme = isDarkDialog ? {
                overlayOpenColor: 'rgba(0, 0, 0, 0.56)',
                panelBackground: '#1e2026',
                panelBorderColor: 'transparent',
                panelShadow: '0 18px 38px rgba(0, 0, 0, 0.64)',
                titleColor: '#f1f3f7',
                descriptionColor: '#c1c7d0',
                listBorderColor: 'transparent',
                listInsetShadow: 'inset 0 12px 12px -12px rgba(255, 255, 255, 0.08), inset 0 -12px 12px -12px rgba(255, 255, 255, 0.08)',
                emptyColor: '#b5bbc5',
                labelHoverBackground: 'rgba(255, 255, 255, 0.08)',
                optionTextColor: '#e6e9ef',
                checkboxAccentColor: '#8d96a8',
                buttonBaseBackground: buttonTemplate.base.background,
                buttonBaseBorder: buttonTemplate.base.border,
                buttonBaseColor: buttonTemplate.base.color,
                buttonHoverBackground: buttonTemplate.base.hoverBackground,
                buttonHoverBorder: buttonTemplate.base.hoverBorder,
                buttonHoverColor: buttonTemplate.base.hoverColor,
                buttonPrimaryBackground: buttonTemplate.primary.background,
                buttonPrimaryBorder: buttonTemplate.primary.border,
                buttonPrimaryColor: buttonTemplate.primary.color,
                buttonPrimaryHoverBackground: buttonTemplate.primary.hoverBackground,
                buttonPrimaryHoverBorder: buttonTemplate.primary.hoverBorder,
                buttonPrimaryHoverColor: buttonTemplate.primary.hoverColor,
                buttonTransition: buttonTemplate.transition,
                buttonHoverLift: buttonTemplate.hoverLift,
                buttonRadius: buttonTemplate.borderRadius
            } : {
                overlayOpenColor: 'rgba(0, 0, 0, 0.34)',
                panelBackground: '#ffffff',
                panelBorderColor: 'transparent',
                panelShadow: '0 16px 34px rgba(0, 0, 0, 0.24)',
                titleColor: '#161616',
                descriptionColor: '#535353',
                listBorderColor: 'transparent',
                listInsetShadow: 'inset 0 12px 12px -12px rgba(0, 0, 0, 0.24), inset 0 -12px 12px -12px rgba(0, 0, 0, 0.24)',
                emptyColor: '#555555',
                labelHoverBackground: 'rgba(0, 0, 0, 0.04)',
                optionTextColor: '#202020',
                checkboxAccentColor: '#5a5a5a',
                buttonBaseBackground: buttonTemplate.base.background,
                buttonBaseBorder: buttonTemplate.base.border,
                buttonBaseColor: buttonTemplate.base.color,
                buttonHoverBackground: buttonTemplate.base.hoverBackground,
                buttonHoverBorder: buttonTemplate.base.hoverBorder,
                buttonHoverColor: buttonTemplate.base.hoverColor,
                buttonPrimaryBackground: buttonTemplate.primary.background,
                buttonPrimaryBorder: buttonTemplate.primary.border,
                buttonPrimaryColor: buttonTemplate.primary.color,
                buttonPrimaryHoverBackground: buttonTemplate.primary.hoverBackground,
                buttonPrimaryHoverBorder: buttonTemplate.primary.hoverBorder,
                buttonPrimaryHoverColor: buttonTemplate.primary.hoverColor,
                buttonTransition: buttonTemplate.transition,
                buttonHoverLift: buttonTemplate.hoverLift,
                buttonRadius: buttonTemplate.borderRadius
            };

            const bindDialogButtonInteraction = function (button, styleSet) {
                if (!button) {
                    return;
                }

                const baseBackground = typeof styleSet.baseBackground !== 'undefined'
                    ? styleSet.baseBackground
                    : dialogTheme.buttonBaseBackground;
                const baseBorder = typeof styleSet.baseBorder !== 'undefined'
                    ? styleSet.baseBorder
                    : dialogTheme.buttonBaseBorder;
                const baseColor = typeof styleSet.baseColor !== 'undefined'
                    ? styleSet.baseColor
                    : dialogTheme.buttonBaseColor;
                const hoverBackground = typeof styleSet.hoverBackground !== 'undefined'
                    ? styleSet.hoverBackground
                    : dialogTheme.buttonHoverBackground;
                const hoverBorder = typeof styleSet.hoverBorder !== 'undefined'
                    ? styleSet.hoverBorder
                    : dialogTheme.buttonHoverBorder;
                const hoverColor = typeof styleSet.hoverColor !== 'undefined'
                    ? styleSet.hoverColor
                    : baseColor;

                button.style.transition = dialogTheme.buttonTransition;

                const setBaseStyle = function () {
                    button.style.background = baseBackground;
                    button.style.borderColor = baseBorder;
                    button.style.color = baseColor;
                    button.style.boxShadow = 'none';
                    button.style.transform = 'translateY(0)';
                };

                const setHoverStyle = function () {
                    button.style.background = hoverBackground;
                    button.style.borderColor = hoverBorder;
                    button.style.color = hoverColor;
                    button.style.boxShadow = 'none';
                    button.style.transform = 'translateY(' + dialogTheme.buttonHoverLift + ')';
                };

                setBaseStyle();

                button.addEventListener('mouseenter', setHoverStyle);
                button.addEventListener('mouseleave', setBaseStyle);
                button.addEventListener('focus', setHoverStyle);
                button.addEventListener('blur', setBaseStyle);
            };

            const applyDialogNavLinkButtonStyle = function (button, options) {
                if (!button) {
                    return;
                }

                const resolved = options || {};
                Object.assign(button.style, {
                    padding: resolved.padding || '6.4px 14px',
                    borderRadius: dialogTheme.buttonRadius,
                    border: '1px solid ' + (resolved.borderColor || dialogTheme.buttonBaseBorder),
                    background: resolved.background || dialogTheme.buttonBaseBackground,
                    color: resolved.color || dialogTheme.buttonBaseColor,
                    fontWeight: resolved.fontWeight || '600',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                });

                if (resolved.fontSize) {
                    button.style.fontSize = resolved.fontSize;
                }

                bindDialogButtonInteraction(
                    button,
                    resolved.interactionStyle || {
                        baseBackground: dialogTheme.buttonBaseBackground,
                        baseBorder: dialogTheme.buttonBaseBorder,
                        baseColor: dialogTheme.buttonBaseColor,
                        hoverBackground: dialogTheme.buttonHoverBackground,
                        hoverBorder: dialogTheme.buttonHoverBorder,
                        hoverColor: dialogTheme.buttonHoverColor
                    }
                );
            };

            const overlayFadeMs = 210;
            const selectorTemplate = document.getElementById('portfolio-print-selector-template');
            const templateElementSupported = typeof HTMLTemplateElement !== 'undefined';
            if (!templateElementSupported || !(selectorTemplate instanceof HTMLTemplateElement)) {
                resolve(null);
                return;
            }

            const templateFragment = selectorTemplate.content.cloneNode(true);
            const overlay = templateFragment.querySelector('[data-popup-role="overlay"]');
            const panel = templateFragment.querySelector('[data-popup-role="panel"]');
            const title = templateFragment.querySelector('[data-popup-role="title"]');
            const description = templateFragment.querySelector('[data-popup-role="description"]');
            const listArea = templateFragment.querySelector('[data-popup-role="list"]');
            const footer = templateFragment.querySelector('[data-popup-role="footer"]');
            const leftButtons = templateFragment.querySelector('[data-popup-role="left-buttons"]');
            const rightButtons = templateFragment.querySelector('[data-popup-role="right-buttons"]');
            const selectAllButton = templateFragment.querySelector('button[data-popup-action="select-all"]');
            const clearButton = templateFragment.querySelector('button[data-popup-action="clear-all"]');
            const cancelButton = templateFragment.querySelector('button[data-popup-action="cancel"]');
            const printButtonInDialog = templateFragment.querySelector('button[data-popup-action="print"]');

            if (
                !overlay ||
                !panel ||
                !title ||
                !description ||
                !listArea ||
                !footer ||
                !leftButtons ||
                !rightButtons ||
                !selectAllButton ||
                !clearButton ||
                !cancelButton ||
                !printButtonInDialog
            ) {
                resolve(null);
                return;
            }

            Object.assign(overlay.style, {
                position: 'fixed',
                inset: '0',
                zIndex: '2100',
                background: 'rgba(0, 0, 0, 0)',
                opacity: '0',
                transition: 'background-color ' + overlayFadeMs + 'ms ease, opacity ' + overlayFadeMs + 'ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
            });

            Object.assign(panel.style, {
                width: 'fit-content',
                minWidth: '360px',
                maxWidth: 'calc(100vw - 28px)',
                maxHeight: '82vh',
                overflow: 'hidden',
                background: dialogTheme.panelBackground,
                border: '0',
                borderRadius: '14px',
                boxShadow: dialogTheme.panelShadow,
                display: 'flex',
                flexDirection: 'column'
            });

            title.textContent = printText.dialogTitle;
            Object.assign(title.style, {
                margin: '0',
                padding: '16px 18px 4px 18px',
                fontSize: '1.12rem',
                fontWeight: '700',
                color: dialogTheme.titleColor,
                textAlign: 'center'
            });

            description.textContent = printText.dialogDescription;
            Object.assign(description.style, {
                margin: '0',
                padding: '0 18px 10px 18px',
                fontSize: '0.9rem',
                lineHeight: '1.5',
                whiteSpace: 'pre-line',
                color: dialogTheme.descriptionColor
            });

            Object.assign(listArea.style, {
                overflowY: 'auto',
                maxHeight: '48vh',
                borderTop: '0',
                borderBottom: '0',
                padding: '8px 12px',
                boxShadow: dialogTheme.listInsetShadow
            });

            const checkboxes = [];
            if (projectOptions.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = printText.noProjects;
                Object.assign(emptyMessage.style, {
                    padding: '10px 8px',
                    color: dialogTheme.emptyColor,
                    fontSize: '0.9rem'
                });
                listArea.appendChild(emptyMessage);
            } else {
                projectOptions.forEach(function (project) {
                    const label = document.createElement('label');
                    Object.assign(label.style, {
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '9px 8px',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    });
                    label.addEventListener('mouseover', function () {
                        label.style.background = dialogTheme.labelHoverBackground;
                    });
                    label.addEventListener('mouseout', function () {
                        label.style.background = 'transparent';
                    });

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = project.url;
                    checkbox.style.marginTop = '2px';
                    checkbox.style.accentColor = dialogTheme.checkboxAccentColor;

                    const text = document.createElement('span');
                    text.textContent = project.title;
                    Object.assign(text.style, {
                        color: dialogTheme.optionTextColor,
                        fontSize: '0.92rem',
                        lineHeight: '1.4'
                    });

                    label.appendChild(checkbox);
                    label.appendChild(text);
                    listArea.appendChild(label);
                    checkboxes.push(checkbox);
                });
            }

            Object.assign(footer.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '12px 14px'
            });

            Object.assign(leftButtons.style, {
                display: 'flex',
                gap: '8px'
            });

            selectAllButton.textContent = printText.selectAll;
            applyDialogNavLinkButtonStyle(selectAllButton, {
                fontSize: '0.9rem',
                padding: '6px 10px'
            });

            clearButton.textContent = printText.clearAll;
            applyDialogNavLinkButtonStyle(clearButton, {
                fontSize: '0.9rem',
                padding: '6px 10px'
            });

            Object.assign(rightButtons.style, {
                display: 'flex',
                gap: '8px'
            });

            cancelButton.textContent = printText.cancel;
            applyDialogNavLinkButtonStyle(cancelButton, {
                fontSize: '0.95rem',
                padding: '7px 14px'
            });

            printButtonInDialog.textContent = printText.print;
            applyDialogNavLinkButtonStyle(printButtonInDialog, {
                fontSize: '0.95rem',
                padding: '7px 14px',
                fontWeight: '600',
                interactionStyle: {
                    baseBackground: dialogTheme.buttonPrimaryBackground,
                    baseBorder: dialogTheme.buttonPrimaryBorder,
                    baseColor: dialogTheme.buttonPrimaryColor,
                    hoverBackground: dialogTheme.buttonPrimaryHoverBackground,
                    hoverBorder: dialogTheme.buttonPrimaryHoverBorder,
                    hoverColor: dialogTheme.buttonPrimaryHoverColor
                }
            });

            document.body.appendChild(overlay);

            window.requestAnimationFrame(function () {
                overlay.style.background = dialogTheme.overlayOpenColor;
                overlay.style.opacity = '1';
            });

            let isClosing = false;
            const close = function (result) {
                if (isClosing) {
                    return;
                }
                isClosing = true;
                document.removeEventListener('keydown', onKeydown);
                overlay.style.pointerEvents = 'none';
                overlay.style.background = 'rgba(0, 0, 0, 0)';
                overlay.style.opacity = '0';
                window.setTimeout(function () {
                    overlay.remove();
                    resolve(result);
                }, overlayFadeMs + 20);
            };

            const onKeydown = function (event) {
                if (event.key === 'Escape') {
                    close(null);
                }
            };

            document.addEventListener('keydown', onKeydown);

            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    close(null);
                }
            });

            selectAllButton.addEventListener('click', function () {
                checkboxes.forEach(function (checkbox) {
                    checkbox.checked = true;
                });
            });

            clearButton.addEventListener('click', function () {
                checkboxes.forEach(function (checkbox) {
                    checkbox.checked = false;
                });
            });

            cancelButton.addEventListener('click', function () {
                close(null);
            });

            printButtonInDialog.addEventListener('click', function () {
                const selectedUrls = checkboxes
                    .filter(function (checkbox) {
                        return checkbox.checked;
                    })
                    .map(function (checkbox) {
                        return checkbox.value;
                    });
                close(selectedUrls);
            });
        });
    };

    const collectPrintStylesheetTags = function () {
        return Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
            .map(function (linkNode) {
                const href = linkNode.getAttribute('href');
                if (!href) {
                    return '';
                }

                try {
                    const absoluteHref = new URL(href, window.location.origin).toString();
                    return '<link rel="stylesheet" href="' + escapeHtml(absoluteHref) + '">';
                } catch (error) {
                    return '';
                }
            })
            .filter(Boolean)
            .join('');
    };

    const openPrintPopupWindow = function () {
        const width = Math.max(900, Math.min(1240, window.screen.availWidth - 80));
        const height = Math.max(760, Math.min(980, window.screen.availHeight - 80));
        const left = Math.max(0, Math.round(window.screenX + ((window.outerWidth - width) / 2)));
        const top = Math.max(0, Math.round(window.screenY + ((window.outerHeight - height) / 2)));
        const features = [
            'popup=yes',
            'resizable=yes',
            'scrollbars=yes',
            'toolbar=no',
            'menubar=no',
            'location=no',
            'status=no',
            'width=' + width,
            'height=' + height,
            'left=' + left,
            'top=' + top
        ].join(',');

        let popupWindow = null;
        try {
            popupWindow = window.open('about:blank', 'portfolioPrintPopup', features);
        } catch (error) {}

        if (!popupWindow) {
            try {
                popupWindow = window.open('', '_blank');
            } catch (error) {}
        }

        return popupWindow;
    };

    const buildPrintDocumentHtml = function (summaryHtml, projectSectionsHtml) {
        const stylesheetTags = collectPrintStylesheetTags();

        return '<!doctype html>' +
            '<html lang="' + (isEnglishPage ? 'en' : 'ko') + '">' +
            '<head>' +
            '<meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width, initial-scale=1">' +
            '<meta name="color-scheme" content="light">' +
            '<title>Portfolio Print</title>' +
            stylesheetTags +
            '<style>' +
            '@page{margin:0;}' +
            'html,body{margin:0;padding:0;background:#fff;color:#111;}' +
            'body{font-family:"Inter","KakaoBigFont","Noto Sans KR","Helvetica Neue",Arial,sans-serif;line-height:1.45;}' +
            'body::before{content:"www.hanplanet.com/portfolio/";position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-45deg);font-weight:900;font-size:clamp(24px,4.8vw,62px);letter-spacing:.06em;color:rgba(0,0,0,.11);pointer-events:none;z-index:0;white-space:nowrap;}' +
            '.print-root{position:relative;z-index:1;padding:3mm;box-sizing:border-box;}' +
            '.print-summary,.print-project{padding-top:8mm;padding-bottom:8mm;padding-left:0;padding-right:0;box-sizing:border-box;border:none;border-radius:0;background:transparent;overflow:visible;}' +
            '.print-summary .main_projects,.print-summary .main_hobbys,.print-summary .foot,.print-summary .portfolio-print-btn,.print-summary .chat-widget,.print-summary .portfolio-nav{display:none;}' +
            '.print-summary .main_banner,.print-summary .main_contents{width:100%;max-width:none;margin:0 auto;padding-left:0;padding-right:0;box-sizing:border-box;}' +
            '.print-summary .main_banner,.print-summary .main_text{padding-top:0;margin-top:0;}' +
            '.print-summary .main_title{margin-top:0;}' +
            '.print-project{margin-top:12mm;break-before:page;page-break-before:always;}' +
            '.print-project .project_detail_page,.print-project .project_detail{margin-top:0;}' +
            '.print-project .project_detail_title{margin-top:0;}' +
            '.print-summary .tag,.print-project .tag{box-shadow:none;background:#d6d6d6;color:#111;border:1px solid #bdbdbd;}' +
            '.print-summary .tag *,.print-project .tag *{color:inherit;}' +
            '.print-project .project_detail_content{padding-left:4px;padding-right:4px;}' +
            '.print-project .project_detail_content [style*="overflow-x: auto"],.print-project .project_detail_content [style*="overflow-x:auto"]{overflow:visible;white-space:normal;}' +
            '.print-project .project_detail_content img{display:block;margin:6px auto 10px;max-width:min(100%,' + (PRINT_IMAGE_LAYOUT.portraitMaxWidthMm * PRINT_IMAGE_LAYOUT.landscapeWidthByPortraitMultiplier) + 'mm);max-height:136mm;width:auto;height:auto;break-inside:avoid;page-break-inside:avoid;}' +
            '.print-project .responsive-iframe{position:static;width:100%;padding-bottom:0;}' +
            '.print-project iframe{display:none;}' +
            '.print-video-thumb{margin:6px auto 8px;max-width:520px;text-align:center;}' +
            '.print-video-thumb-link{display:block;border:1px solid rgba(0,0,0,.18);border-radius:10px;overflow:hidden;background:#f7f7f7;}' +
            '.print-video-thumb img{display:block;width:100%;height:auto;}' +
            '.print-video-thumb figcaption{margin-top:6px;font-size:12px;color:#444;}' +
            '.print-video-thumb figcaption a{color:inherit;text-decoration:underline;}' +
            '.print-embed-link{margin:8px 0 12px;font-size:12px;}' +
            '.print-embed-link a{color:#333;text-decoration:underline;word-break:break-all;}' +
            '.print-project-error{padding:10px 12px;border:1px solid rgba(0,0,0,.14);border-radius:8px;background:#fafafa;color:#333;}' +
            'hr{display:block;opacity:.25;height:0;border:0;border-top:1px solid #000;background:transparent;}' +
            'img,video,iframe{max-width:100%;height:auto;}' +
            '.bubble-bg-layer,#interactiveBubbleCanvas,.bubble-bg-canvas{display:none;visibility:hidden;}' +
            '</style>' +
            '</head>' +
            '<body class="portfolio-page project-page"><div class="print-root">' +
            summaryHtml +
            projectSectionsHtml.join('') +
            '</div></body></html>';
    };

    const printSummaryWithProjects = async function (selectedProjects) {
        const printWindow = openPrintPopupWindow();
        if (!printWindow) {
            window.alert(printText.popupBlocked);
            return;
        }

        printWindow.document.open();
        printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing...</title></head><body style="font-family:Inter,KakaoBigFont,\'Noto Sans KR\',\'Helvetica Neue\',Arial,sans-serif;padding:24px;">' + escapeHtml(printText.loading) + '</body></html>');
        printWindow.document.close();

        const summaryHtml = buildSummaryPrintHtml();
        const projectSectionHtmlList = [];
        for (const project of selectedProjects) {
            try {
                const sectionHtml = await fetchProjectPrintSectionHtml(project.url, project.title);
                projectSectionHtmlList.push(sectionHtml);
            } catch (error) {
                projectSectionHtmlList.push(
                    '<section class="print-project">' +
                    '<h2>' + escapeHtml(project.title) + '</h2>' +
                    '<p class="print-project-error">' + escapeHtml(printText.loadFailed) + '</p>' +
                    '</section>'
                );
            }
        }

        const printDocumentHtml = buildPrintDocumentHtml(summaryHtml, projectSectionHtmlList);
        printWindow.document.open();
        printWindow.document.write(printDocumentHtml);
        printWindow.document.close();

        let printed = false;
        const triggerPrint = function () {
            if (printed) {
                return;
            }
            printed = true;
            printWindow.focus();
            printWindow.print();
        };

        const triggerPrintWhenReady = function () {
            waitForImagesReady(printWindow.document, 4200)
                .then(function () {
                    triggerPrint();
                })
                .catch(function () {
                    triggerPrint();
                });
        };

        printWindow.addEventListener('load', function () {
            window.setTimeout(triggerPrintWhenReady, 160);
        }, { once: true });

        window.setTimeout(triggerPrintWhenReady, 1300);
        printWindow.addEventListener('afterprint', function () {
            try {
                printWindow.close();
            } catch (error) {}
        });
    };

    const printButton = document.querySelector('[data-portfolio-print]');
    if (printButton) {
        printButton.addEventListener('click', async function () {
            const projectOptions = collectProjectPrintOptions();
            const selectedUrls = await openProjectPrintSelector(projectOptions);
            if (selectedUrls === null) {
                return;
            }

            const selectedProjects = selectedUrls.map(function (url) {
                const matched = projectOptions.find(function (project) {
                    return project.url === url;
                });
                return {
                    url: url,
                    title: matched ? matched.title : url
                };
            });

            await printSummaryWithProjects(selectedProjects);
        });
    }

    const nav = document.querySelector('.portfolio-nav');

    if (!nav) {
        return;
    }

    const navContainer = nav.querySelector('.container-fluid');
    const navBrandGroup = nav.querySelector('.portfolio-brand-group');
    const navLinks = nav.querySelector('.portfolio-nav-links');
    const navCollapse = nav.querySelector('.portfolio-nav-collapse');
    const navControls = navCollapse ? navCollapse.querySelector('.portfolio-controls-stack') : null;
    const navToggler = nav.querySelector('.portfolio-nav-toggler');

    if (!navContainer || !navBrandGroup || !navLinks || !navCollapse || !navToggler) {
        return;
    }

    const forceClearNavContainerDecorations = function () {
        const resetTargets = [
            navContainer,
            navCollapse,
            navLinks,
            navCollapse.querySelector('.portfolio-nav-links')
        ];
        const navItems = nav.querySelectorAll('.nav-item');

        navItems.forEach(function (item) {
            resetTargets.push(item);
        });

        resetTargets.forEach(function (target) {
            if (!target || !target.style || !target.style.setProperty) {
                return;
            }

            if (target === navLinks) {
                target.style.removeProperty('border');
                target.style.removeProperty('border-color');
            } else {
                target.style.border = 'none';
                target.style.borderColor = 'transparent';
            }
            target.style.outline = 'none';
            target.style.outlineColor = 'transparent';
            target.style.outlineStyle = 'none';
            target.style.outlineWidth = '0';
            if (target === navLinks) {
                target.style.removeProperty('box-shadow');
            } else {
                target.style.boxShadow = 'none';
            }
            target.style.listStyle = 'none';
        });
    };

    const navItemsMeasure = document.createElement('div');
    navItemsMeasure.setAttribute('aria-hidden', 'true');
    Object.assign(navItemsMeasure.style, {
        position: 'fixed',
        left: '-99999px',
        top: '-99999px',
        visibility: 'hidden',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        flexWrap: 'nowrap',
        width: 'auto',
        maxWidth: 'none',
        margin: '0',
        padding: '0'
    });
    const navLinksMeasure = navLinks.cloneNode(true);
    Object.assign(navLinksMeasure.style, {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        width: 'auto',
        maxWidth: 'none',
        margin: '0',
        padding: '0',
        listStyle: 'none'
    });
    Array.from(navLinksMeasure.children).forEach(function (item) {
        item.style.flex = '0 0 auto';
    });
    navItemsMeasure.appendChild(navLinksMeasure);

    if (navControls) {
        const navControlsMeasure = navControls.cloneNode(true);
        Object.assign(navControlsMeasure.style, {
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            margin: '0',
            padding: '0'
        });
        navItemsMeasure.appendChild(navControlsMeasure);
    }

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
        forceClearNavContainerDecorations();
    };

    const updateNavMode = function () {
        rafId = null;

        nav.classList.remove('nav-auto-collapsed');
        forceCloseNavMenu();

        const availableWidth = navContainer.getBoundingClientRect().width;
        const brandWidth = navBrandGroup.getBoundingClientRect().width;
        const navItemsBlockWidth = getMeasuredNavItemsWidth();
        const requiredWidth = brandWidth + navItemsBlockWidth;
        const shouldCollapseByOverlap = requiredWidth > availableWidth;

        if (shouldCollapseByOverlap) {
            nav.classList.add('nav-auto-collapsed');
            forceCloseNavMenu();
        }

        forceClearNavContainerDecorations();
    };

    const scheduleNavModeUpdate = function () {
        if (rafId !== null) {
            return;
        }

        rafId = window.requestAnimationFrame(updateNavMode);
    };

    window.addEventListener('resize', scheduleNavModeUpdate, { passive: true });
    window.addEventListener('orientationchange', scheduleNavModeUpdate, { passive: true });
    navToggler.addEventListener('click', function () {
        window.requestAnimationFrame(forceClearNavContainerDecorations);
    });
    navCollapse.addEventListener('transitionend', forceClearNavContainerDecorations);

    let scrollCleanupTimerId = null;
    window.addEventListener('scroll', function () {
        if (scrollCleanupTimerId !== null) {
            window.clearTimeout(scrollCleanupTimerId);
        }

        scrollCleanupTimerId = window.setTimeout(function () {
            window.requestAnimationFrame(forceClearNavContainerDecorations);
            scrollCleanupTimerId = null;
        }, 180);
    }, { passive: true });
    forceClearNavContainerDecorations();
    scheduleNavModeUpdate();

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleNavModeUpdate).catch(function () {});
    }
});
