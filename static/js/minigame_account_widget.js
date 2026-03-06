(function () {
    'use strict';

    const host = document.querySelector('.minigame-auth-host [data-auth-account]');
    if (!host) {
        return;
    }

    const accountTrigger = host.querySelector('[data-auth-account-trigger]');
    const accountMenu = host.querySelector('[data-auth-account-menu]');
    const accountLogoutButton = host.querySelector('[data-auth-account-logout]');
    const profileUploadForm = host.querySelector('[data-root-account-profile-upload-form]');
    const profileImageTrigger = host.querySelector('[data-root-account-profile-image-trigger]');
    const profileImageInput = host.querySelector('[data-root-account-profile-image-input]');
    const logoutForm = document.getElementById('auth-logout-form-minigame');

    if (!accountTrigger || !logoutForm) {
        return;
    }

    if (accountTrigger.dataset.authWidgetBound === '1') {
        return;
    }
    accountTrigger.dataset.authWidgetBound = '1';

    const logoutModal = document.getElementById('root-auth-logout-modal');
    const logoutModalBackdrop = document.getElementById('root-auth-logout-modal-backdrop');
    const logoutCancelButton = document.getElementById('root-auth-logout-cancel-btn');
    const logoutConfirmButton = document.getElementById('root-auth-logout-confirm-btn');
    const logoutMessage = document.getElementById('root-auth-logout-message');

    let lastFocusedElement = null;

    const setAccountMenuOpen = function (opened) {
        if (!accountMenu) {
            return;
        }
        accountMenu.hidden = !opened;
        accountTrigger.setAttribute('aria-expanded', opened ? 'true' : 'false');
    };

    const setLogoutModalOpen = function (opened) {
        if (!logoutModal) {
            return;
        }
        logoutModal.hidden = !opened;
        if (opened) {
            if (logoutCancelButton) {
                logoutCancelButton.focus();
            }
            return;
        }
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    };

    const requestLogout = function () {
        const confirmMessage = String((accountLogoutButton && accountLogoutButton.getAttribute('data-confirm-message')) || '').trim();
        if (!logoutModal || !logoutModalBackdrop || !logoutCancelButton || !logoutConfirmButton || !logoutMessage) {
            if (confirmMessage && !window.confirm(confirmMessage)) {
                return;
            }
            logoutForm.submit();
            return;
        }
        lastFocusedElement = document.activeElement;
        logoutMessage.textContent = confirmMessage;
        setLogoutModalOpen(true);
    };

    accountTrigger.addEventListener('click', function (event) {
        event.preventDefault();
        if (!accountMenu) {
            requestLogout();
            return;
        }
        const isOpen = !accountMenu.hidden;
        setAccountMenuOpen(!isOpen);
    });

    if (accountLogoutButton) {
        accountLogoutButton.addEventListener('click', function (event) {
            event.preventDefault();
            setAccountMenuOpen(false);
            requestLogout();
        });
    }

    if (profileUploadForm && profileImageTrigger && profileImageInput) {
        profileImageTrigger.addEventListener('click', function (event) {
            event.preventDefault();
            profileImageInput.click();
        });

        profileImageInput.addEventListener('change', function () {
            if (!profileImageInput.files || !profileImageInput.files.length) {
                return;
            }
            profileUploadForm.submit();
        });
    }

    document.addEventListener('click', function (event) {
        if (!accountMenu || accountMenu.hidden) {
            return;
        }
        const target = event.target;
        if (accountMenu.contains(target) || accountTrigger.contains(target)) {
            return;
        }
        setAccountMenuOpen(false);
    });

    if (logoutModalBackdrop) {
        logoutModalBackdrop.addEventListener('click', function () {
            setLogoutModalOpen(false);
        });
    }

    if (logoutCancelButton) {
        logoutCancelButton.addEventListener('click', function () {
            setLogoutModalOpen(false);
        });
    }

    if (logoutConfirmButton) {
        logoutConfirmButton.addEventListener('click', function () {
            logoutForm.submit();
        });
    }

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') {
            return;
        }
        if (accountMenu && !accountMenu.hidden) {
            event.preventDefault();
            setAccountMenuOpen(false);
            return;
        }
        if (!logoutModal || logoutModal.hidden) {
            return;
        }
        event.preventDefault();
        setLogoutModalOpen(false);
    });
})();
