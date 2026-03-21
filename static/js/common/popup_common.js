// Shared popup positioning helper used by multiple pages with viewport-constrained dropdowns/modals.
(function () {
    // Keep a small inset so popups never touch the viewport edge.
    const viewportPadding = 10;
    const popupSelector = "[data-popup-fit-bottom], [data-popup-fit-top]";

    function isVisible(element) {
        // Popups are repositioned only when actually visible; hidden-but-mounted nodes
        // are ignored so style resets do not waste layout work.
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
        // VisualViewport is preferred on mobile because browser UI chrome changes the
        // usable height independently from window.innerHeight.
        if (window.visualViewport && Number.isFinite(window.visualViewport.height)) {
            return window.visualViewport.height;
        }
        return window.innerHeight;
    }

    function repositionPopup(element) {
        // Skin modal popups shift through a parent CSS variable so the child transform stack stays simple.
        const skinModalParent = element.closest(".multiplayer-skin-modal");

        if (!isVisible(element)) {
            element.style.removeProperty("--popup-fit-bottom-shift");
            element.style.removeProperty("--popup-fit-top-shift");
            if (skinModalParent) {
                skinModalParent.style.removeProperty("--popup-fit-child-top-shift");
            }
            return;
        }

        element.style.setProperty("--popup-fit-bottom-shift", "0px");
        element.style.setProperty("--popup-fit-top-shift", "0px");
        if (skinModalParent) {
            skinModalParent.style.setProperty("--popup-fit-child-top-shift", "0px");
        }

        const rect = element.getBoundingClientRect();
        const viewportHeight = getViewportHeight();
        const overflowBottom = rect.bottom + viewportPadding - viewportHeight;
        const overflowTop = viewportPadding - rect.top;

        if (overflowBottom > 0) {
            const availableTopShift = Math.max(0, rect.top - viewportPadding);
            const shift = Math.min(overflowBottom, availableTopShift);
            element.style.setProperty("--popup-fit-bottom-shift", String(shift) + "px");
        }

        if (overflowTop > 0) {
            const shift = overflowTop;
            if (skinModalParent) {
                skinModalParent.style.setProperty("--popup-fit-child-top-shift", String(shift) + "px");
                element.style.setProperty("--popup-fit-top-shift", "0px");
            } else {
                element.style.setProperty("--popup-fit-top-shift", String(shift) + "px");
            }
        }
    }

    function refreshPopupPositions() {
        // Re-evaluate every registered popup because multiple overlays can be open at once.
        document.querySelectorAll(popupSelector).forEach(repositionPopup);
    }

    const refreshPopupPositionsDeferred = () => {
        // Batch repeated DOM/scroll events onto the next frame to avoid layout thrashing.
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
    // Watch for popup visibility/class changes so positioning also updates when menus open without resize/scroll.
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden", "class", "style", "aria-hidden"],
    });
})();
