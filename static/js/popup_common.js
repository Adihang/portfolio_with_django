(function () {
    const viewportPadding = 10;
    const popupSelector = "[data-popup-fit-bottom]";

    function isVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }
        if (element.hidden || element.closest("[hidden]")) {
            return false;
        }
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return false;
        }
        return true;
    }

    function getViewportHeight() {
        if (window.visualViewport && Number.isFinite(window.visualViewport.height)) {
            return window.visualViewport.height;
        }
        return window.innerHeight;
    }

    function repositionPopup(element) {
        if (!isVisible(element)) {
            element.style.removeProperty("--popup-fit-bottom-shift");
            return;
        }

        element.style.setProperty("--popup-fit-bottom-shift", "0px");

        const rect = element.getBoundingClientRect();
        const viewportHeight = getViewportHeight();
        const overflowBottom = rect.bottom + viewportPadding - viewportHeight;

        if (overflowBottom <= 0) {
            return;
        }

        const availableTopShift = Math.max(0, rect.top - viewportPadding);
        const shift = Math.min(overflowBottom, availableTopShift);
        element.style.setProperty("--popup-fit-bottom-shift", String(shift) + "px");
    }

    function refreshPopupPositions() {
        document.querySelectorAll(popupSelector).forEach(repositionPopup);
    }

    const refreshPopupPositionsDeferred = () => {
        window.requestAnimationFrame(refreshPopupPositions);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", refreshPopupPositionsDeferred, { once: true });
    } else {
        refreshPopupPositionsDeferred();
    }

    window.addEventListener("resize", refreshPopupPositionsDeferred);
    window.addEventListener("scroll", refreshPopupPositionsDeferred, true);

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", refreshPopupPositionsDeferred);
        window.visualViewport.addEventListener("scroll", refreshPopupPositionsDeferred);
    }

    const observer = new MutationObserver(refreshPopupPositionsDeferred);
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden", "class", "style", "aria-hidden"],
    });
})();
