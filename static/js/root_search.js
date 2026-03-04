(function () {
    'use strict';

    const form = document.querySelector('[data-root-search-form]');
    const input = document.querySelector('[data-root-search-input]');
    const engineSelect = document.querySelector('[data-root-search-engine]');
    const enginePicker = document.querySelector('[data-root-engine-picker]');
    const engineToggle = document.querySelector('[data-root-engine-toggle]');
    const enginePopup = document.querySelector('[data-root-engine-popup]');
    const engineLabel = document.querySelector('[data-root-engine-label]');
    const engineIcon = document.querySelector('[data-root-engine-icon]');
    const engineOptions = Array.from(document.querySelectorAll('[data-engine-option]'));

    if (!form || !input || !engineSelect || !enginePicker || !engineToggle || !enginePopup || !engineLabel || !engineIcon || !engineOptions.length) {
        return;
    }

    const ENGINE_URLS = {
        google: 'https://www.google.com/search?q=',
        duckduckgo: 'https://duckduckgo.com/?q=',
        bing: 'https://www.bing.com/search?q=',
        naver: 'https://search.naver.com/search.naver?query='
    };

    const hasScheme = function (text) {
        return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(text);
    };

    const looksLikeDomainOrIp = function (text) {
        if (/\s/.test(text)) {
            return false;
        }

        const value = text.toLowerCase();
        const hostPart = value.split('/')[0].split('?')[0].split('#')[0].split(':')[0];

        if (!hostPart) {
            return false;
        }

        if (hostPart === 'localhost') {
            return true;
        }

        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostPart)) {
            return true;
        }

        if (hostPart.includes('.') && /^[a-z0-9.-]+$/.test(hostPart)) {
            return true;
        }

        return false;
    };

    const toNavigableUrl = function (rawText) {
        const text = rawText.trim();
        if (!text) {
            return null;
        }

        const candidate = hasScheme(text) ? text : 'https://' + text;
        try {
            const parsed = new URL(candidate);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.toString();
            }
        } catch (error) {}
        return null;
    };

    const closeEngineMenu = function () {
        enginePicker.classList.remove('is-open');
        enginePicker.removeAttribute('data-open');
        engineToggle.setAttribute('aria-expanded', 'false');
        enginePopup.classList.remove('is-open');
        enginePopup.setAttribute('aria-hidden', 'true');
    };

    const positionPopup = function () {
        const toggleRect = engineToggle.getBoundingClientRect();
        const popupWidth = Math.max(172, toggleRect.width);
        enginePopup.style.width = popupWidth + 'px';
        let left = Math.round(toggleRect.right - popupWidth);
        const maxLeft = window.innerWidth - popupWidth - 8;
        if (left > maxLeft) {
            left = maxLeft;
        }
        if (left < 8) {
            left = 8;
        }
        enginePopup.style.left = left + 'px';
        enginePopup.style.top = Math.round(toggleRect.bottom + 8) + 'px';
    };

    const openEngineMenu = function () {
        positionPopup();
        enginePicker.classList.add('is-open');
        enginePicker.setAttribute('data-open', '1');
        engineToggle.setAttribute('aria-expanded', 'true');
        enginePopup.classList.add('is-open');
        enginePopup.setAttribute('aria-hidden', 'false');
    };

    const syncEngineUI = function (value) {
        const targetValue = value in ENGINE_URLS ? value : 'google';
        engineSelect.value = targetValue;
        enginePicker.dataset.engine = targetValue;
        engineIcon.dataset.engine = targetValue;

        engineOptions.forEach(function (option) {
            const isActive = option.dataset.engineValue === targetValue;
            option.classList.toggle('is-active', isActive);
            if (isActive) {
                engineLabel.textContent = option.textContent.trim();
            }
        });
    };

    engineToggle.addEventListener('click', function (event) {
        event.preventDefault();
        if (enginePopup.classList.contains('is-open')) {
            closeEngineMenu();
            return;
        }
        openEngineMenu();
    });

    engineOptions.forEach(function (option) {
        option.addEventListener('click', function () {
            syncEngineUI(option.dataset.engineValue || 'google');
            closeEngineMenu();
        });
    });

    document.addEventListener('click', function (event) {
        if (!enginePicker.contains(event.target) && !enginePopup.contains(event.target)) {
            closeEngineMenu();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeEngineMenu();
        }
    });

    window.addEventListener('resize', function () {
        if (enginePopup.classList.contains('is-open')) {
            positionPopup();
        }
    });

    window.addEventListener('scroll', function () {
        if (enginePopup.classList.contains('is-open')) {
            positionPopup();
        }
    }, { passive: true });

    syncEngineUI(engineSelect.value || 'google');

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        const raw = input.value.trim();
        if (!raw) {
            input.focus();
            return;
        }

        if (hasScheme(raw) || looksLikeDomainOrIp(raw)) {
            const targetUrl = toNavigableUrl(raw);
            if (targetUrl) {
                window.location.href = targetUrl;
                return;
            }
        }

        const engine = engineSelect.value in ENGINE_URLS ? engineSelect.value : 'google';
        window.location.href = ENGINE_URLS[engine] + encodeURIComponent(raw);
    });
})();
