// Small page-specific helper for the bumpercar admin screen's character settings switcher.
(function () {
    'use strict';

    const select = document.querySelector('[data-bumpercar-admin-character-select]');
    const panels = Array.from(document.querySelectorAll('[data-bumpercar-admin-character-panel]'));
    if (!select || !panels.length) {
        return;
    }

    const syncPanels = function () {
        // Only the selected character panel stays visible so the large admin form remains scannable.
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
