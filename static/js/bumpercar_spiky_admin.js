(function () {
    'use strict';

    const select = document.querySelector('[data-bumpercar-admin-character-select]');
    const panels = Array.from(document.querySelectorAll('[data-bumpercar-admin-character-panel]'));
    if (!select || !panels.length) {
        return;
    }

    const syncPanels = function () {
        const selectedCharacter = String(select.value || '').trim();
        panels.forEach(function (panel) {
            const panelCharacter = String(panel.getAttribute('data-bumpercar-admin-character-panel') || '').trim();
            const isActive = panelCharacter === selectedCharacter;
            panel.hidden = !isActive;
            panel.classList.toggle('is-active', isActive);
        });
    };

    select.addEventListener('change', syncPanels);
    syncPanels();
})();
