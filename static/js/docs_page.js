(function () {
    "use strict";

    const root = document.querySelector("[data-docs-page]");
    if (!root) {
        return;
    }

    const pageType = root.dataset.docsPage;

    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) {
            return meta.content;
        }
        return "";
    }

    function normalizePath(raw, allowEmpty = true) {
        const source = String(raw || "").replace(/\\/g, "/").trim();
        const trimmed = source.replace(/^\/+|\/+$/g, "");
        if (!trimmed) {
            if (allowEmpty) {
                return "";
            }
            throw new Error(t("js_error_path_required", "경로를 입력해주세요."));
        }
        const parts = trimmed
            .split("/")
            .map(function (part) {
                return part.trim();
            })
            .filter(function (part) {
                return Boolean(part) && part !== ".";
            });

        if (parts.some(function (part) {
            return part === "..";
        })) {
            throw new Error(t("js_error_parent_path_not_allowed", "상위 경로(..)는 사용할 수 없습니다."));
        }

        return parts.join("/");
    }

    function encodePathSegments(pathValue) {
        const normalized = normalizePath(pathValue, true);
        if (!normalized) {
            return "";
        }
        return normalized
            .split("/")
            .map(function (segment) {
                return encodeURIComponent(segment);
            })
            .join("/");
    }

    function buildListUrl(baseUrl, relativePath) {
        const encoded = encodePathSegments(relativePath);
        if (!encoded) {
            return baseUrl;
        }
        return baseUrl + "/" + encoded + "/list";
    }

    function buildViewUrl(baseUrl, slugPath) {
        const encoded = encodePathSegments(slugPath);
        if (!encoded) {
            return baseUrl;
        }
        return baseUrl + "/" + encoded;
    }

    function buildWriteUrl(writeBaseUrl, params) {
        const search = new URLSearchParams(params || {});
        const query = search.toString();
        return query ? writeBaseUrl + "?" + query : writeBaseUrl;
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options || {});
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload && payload.error
                ? payload.error
                : t("js_error_request_failed", "요청 처리 중 오류가 발생했습니다.");
            throw new Error(message);
        }

        return payload;
    }

    function buildPostOptions(body) {
        return {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCsrfToken()
            },
            body: JSON.stringify(body || {})
        };
    }

    function getJsonScriptData(id, fallbackValue) {
        const element = document.getElementById(id);
        if (!element) {
            return fallbackValue;
        }
        try {
            return JSON.parse(element.textContent || "null") || fallbackValue;
        } catch (error) {
            return fallbackValue;
        }
    }

    const i18n = getJsonScriptData("docs-i18n", {});

    function t(key, fallbackValue) {
        if (Object.prototype.hasOwnProperty.call(i18n, key) && typeof i18n[key] === "string") {
            return i18n[key];
        }
        return fallbackValue;
    }

    function formatTemplate(template, values) {
        return String(template || "").replace(/\{(\w+)\}/g, function (_, token) {
            if (values && Object.prototype.hasOwnProperty.call(values, token)) {
                return String(values[token]);
            }
            return "";
        });
    }

    function alertError(error) {
        window.alert(
            error && error.message
                ? error.message
                : t("js_error_processing_failed", "처리 중 오류가 발생했습니다.")
        );
    }

    function hasOpenDocsModal() {
        return Boolean(
            document.querySelector(
                ".docs-rename-modal:not([hidden]), .docs-save-modal:not([hidden]), .docs-help-modal:not([hidden]), .docs-folder-modal:not([hidden])"
            )
        );
    }

    function syncDocsModalBodyState() {
        document.body.classList.toggle("docs-modal-open", hasOpenDocsModal());
    }

    function createDocsConfirmDialog() {
        const confirmModal = document.getElementById("docs-confirm-modal");
        const confirmBackdrop = document.getElementById("docs-confirm-modal-backdrop");
        const confirmTitle = document.getElementById("docs-confirm-title");
        const confirmMessage = document.getElementById("docs-confirm-message");
        const confirmCancelButton = document.getElementById("docs-confirm-cancel-btn");
        const confirmConfirmButton = document.getElementById("docs-confirm-confirm-btn");

        if (
            !confirmModal ||
            !confirmBackdrop ||
            !confirmTitle ||
            !confirmMessage ||
            !confirmCancelButton ||
            !confirmConfirmButton
        ) {
            return async function () {
                return false;
            };
        }

        let resolvePending = null;
        let isOpen = false;
        let lastFocusedElement = null;

        const close = function (confirmed) {
            if (!isOpen) {
                return;
            }

            confirmModal.hidden = true;
            isOpen = false;

            if (resolvePending) {
                resolvePending(Boolean(confirmed));
                resolvePending = null;
            }

            if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
                lastFocusedElement.focus();
            }
            lastFocusedElement = null;
        };

        confirmBackdrop.addEventListener("click", function () {
            close(false);
        });

        confirmCancelButton.addEventListener("click", function () {
            close(false);
        });

        confirmConfirmButton.addEventListener("click", function () {
            close(true);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" || !isOpen) {
                return;
            }
            event.preventDefault();
            close(false);
        });

        return function requestConfirmDialog(options) {
            const settings = options || {};
            const titleText = settings.title || t("js_confirm_title", "확인");
            const messageText = settings.message || "";
            const cancelText = settings.cancelText || t("cancel", "취소");
            const confirmText = settings.confirmText || t("js_confirm_ok", "확인");

            if (resolvePending) {
                resolvePending(false);
                resolvePending = null;
            }

            confirmTitle.textContent = titleText;
            confirmMessage.textContent = messageText;
            confirmCancelButton.textContent = cancelText;
            confirmConfirmButton.textContent = confirmText;

            confirmModal.hidden = false;
            isOpen = true;
            lastFocusedElement = document.activeElement;
            confirmConfirmButton.focus();

            return new Promise(function (resolve) {
                resolvePending = resolve;
            });
        };
    }

    const requestConfirmDialog = createDocsConfirmDialog();

    function initializeDocsPageHelpModal() {
        const pageHelpButton = document.getElementById("docs-page-help-btn");
        const pageHelpModal = document.getElementById("docs-page-help-modal");
        const pageHelpBackdrop = document.getElementById("docs-page-help-backdrop");
        if (!pageHelpButton || !pageHelpModal || !pageHelpBackdrop) {
            return;
        }

        let lastFocusedElement = null;

        function setPageHelpModalOpen(opened) {
            pageHelpModal.hidden = !opened;
            pageHelpButton.setAttribute("aria-expanded", opened ? "true" : "false");
            syncDocsModalBodyState();
            if (opened) {
                lastFocusedElement = document.activeElement;
                return;
            }
            if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
                lastFocusedElement.focus();
            }
            lastFocusedElement = null;
        }

        pageHelpButton.addEventListener("click", function (event) {
            event.preventDefault();
            setPageHelpModalOpen(true);
        });

        pageHelpBackdrop.addEventListener("click", function () {
            setPageHelpModalOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" || pageHelpModal.hidden) {
                return;
            }
            event.preventDefault();
            setPageHelpModalOpen(false);
        });
    }

    function initializeDocsAuthInteraction() {
        const logoutTrigger = document.querySelector("[data-docs-logout-trigger]");
        const logoutForm = document.getElementById("docs-auth-logout-form");
        if (!logoutTrigger || !logoutForm) {
            return;
        }

        const logoutModal = document.getElementById("docs-auth-logout-modal");
        const logoutModalBackdrop = document.getElementById("docs-auth-logout-modal-backdrop");
        const logoutCancelButton = document.getElementById("docs-auth-logout-cancel-btn");
        const logoutConfirmButton = document.getElementById("docs-auth-logout-confirm-btn");
        const logoutMessage = document.getElementById("docs-auth-logout-message");

        let lastFocusedElement = null;

        function setLogoutModalOpen(opened) {
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
            if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
                lastFocusedElement.focus();
            }
        }

        logoutTrigger.addEventListener("click", async function () {
            const message =
                logoutTrigger.getAttribute("data-confirm-message") ||
                t("auth_logout_confirm", "로그아웃 하시겠습니까?");
            if (!logoutModal || !logoutModalBackdrop || !logoutCancelButton || !logoutConfirmButton || !logoutMessage) {
                const confirmed = await requestConfirmDialog({
                    title: t("auth_logout_button", "로그아웃"),
                    message: message,
                    cancelText: t("cancel", "취소"),
                    confirmText: t("auth_logout_button", "로그아웃")
                });
                if (!confirmed) {
                    return;
                }
                logoutForm.submit();
                return;
            }

            lastFocusedElement = document.activeElement;
            logoutMessage.textContent = message;
            setLogoutModalOpen(true);
        });

        if (logoutModalBackdrop) {
            logoutModalBackdrop.addEventListener("click", function () {
                setLogoutModalOpen(false);
            });
        }

        if (logoutCancelButton) {
            logoutCancelButton.addEventListener("click", function () {
                setLogoutModalOpen(false);
            });
        }

        if (logoutConfirmButton) {
            logoutConfirmButton.addEventListener("click", function () {
                logoutForm.submit();
            });
        }

        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" || !logoutModal || logoutModal.hidden) {
                return;
            }
            event.preventDefault();
            setLogoutModalOpen(false);
        });
    }

    function initializeDocsToolbarAutoCollapse() {
        const toolbar = document.querySelector(".docs-toolbar-wrap .docs-toolbar");
        if (!toolbar) {
            return;
        }

        const toolbarChildren = Array.from(toolbar.children).filter(function (child) {
            return child && child.nodeType === 1 && !child.hasAttribute("data-docs-auth-account");
        });
        if (toolbarChildren.length < 2) {
            toolbar.classList.remove("docs-toolbar-auto-collapsed");
            return;
        }

        let rafId = null;

        const toolbarItemsMeasure = document.createElement("div");
        toolbarItemsMeasure.setAttribute("aria-hidden", "true");
        Object.assign(toolbarItemsMeasure.style, {
            position: "fixed",
            left: "-99999px",
            top: "-99999px",
            visibility: "hidden",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            flexWrap: "nowrap",
            width: "auto",
            maxWidth: "none",
            margin: "0",
            padding: "0"
        });

        toolbarChildren.forEach(function (child) {
            const clone = child.cloneNode(true);
            Object.assign(clone.style, {
                flex: "0 0 auto",
                width: "max-content",
                minWidth: "max-content",
                maxWidth: "none",
                margin: "0",
                whiteSpace: "nowrap"
            });

            clone.querySelectorAll("*").forEach(function (node) {
                if (!(node instanceof window.HTMLElement)) {
                    return;
                }
                node.style.whiteSpace = "nowrap";
                node.style.flexWrap = "nowrap";
            });

            toolbarItemsMeasure.appendChild(clone);
        });

        document.body.appendChild(toolbarItemsMeasure);

        const updateToolbarMode = function () {
            rafId = null;

            toolbar.classList.remove("docs-toolbar-auto-collapsed");

            const toolbarStyle = window.getComputedStyle(toolbar);
            const gapValue = parseFloat(toolbarStyle.columnGap || toolbarStyle.gap || "0");
            const horizontalGap = Number.isFinite(gapValue) ? gapValue : 0;
            toolbarItemsMeasure.style.gap = horizontalGap + "px";

            const paddingLeftValue = parseFloat(toolbarStyle.paddingLeft || "0");
            const paddingRightValue = parseFloat(toolbarStyle.paddingRight || "0");
            const horizontalPadding =
                (Number.isFinite(paddingLeftValue) ? paddingLeftValue : 0) +
                (Number.isFinite(paddingRightValue) ? paddingRightValue : 0);
            const requiredWidth = Math.ceil(toolbarItemsMeasure.getBoundingClientRect().width);
            const availableWidth = Math.max(0, toolbar.clientWidth - horizontalPadding);
            const shouldCollapse = requiredWidth > availableWidth;

            toolbar.classList.toggle("docs-toolbar-auto-collapsed", shouldCollapse);
        };

        const scheduleToolbarModeUpdate = function () {
            if (rafId !== null) {
                return;
            }
            rafId = window.requestAnimationFrame(updateToolbarMode);
        };

        window.addEventListener("resize", scheduleToolbarModeUpdate, { passive: true });
        window.addEventListener("orientationchange", scheduleToolbarModeUpdate, { passive: true });

        if (window.ResizeObserver) {
            const observer = new ResizeObserver(scheduleToolbarModeUpdate);
            observer.observe(toolbar);
            toolbarChildren.forEach(function (child) {
                observer.observe(child);
            });
        }

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleToolbarModeUpdate).catch(function () {});
        }

        scheduleToolbarModeUpdate();
    }

    function initializeListPage() {
        const docsBaseUrl = root.dataset.docsBaseUrl || "/docs";
        const listApiUrl = root.dataset.listApiUrl;
        const renameApiUrl = root.dataset.renameApiUrl;
        const deleteApiUrl = root.dataset.deleteApiUrl;
        const mkdirApiUrl = root.dataset.mkdirApiUrl;
        const moveApiUrl = root.dataset.moveApiUrl;
        const aclApiUrl = root.dataset.aclApiUrl;
        const aclOptionsApiUrl = root.dataset.aclOptionsApiUrl;
        const writeUrl = root.dataset.writeUrl || "/docs/write";
        const listContainer = document.getElementById("docs-list");
        const pathBreadcrumbs = document.querySelector(".docs-path-breadcrumbs");
        const initialBreadcrumbNode = pathBreadcrumbs
            ? pathBreadcrumbs.querySelector(".docs-path-link, .docs-path-current")
            : null;
        const breadcrumbRootLabel = (initialBreadcrumbNode && initialBreadcrumbNode.textContent
            ? initialBreadcrumbNode.textContent
            : "docs").trim() || "docs";
        const contextMenu = document.getElementById("docs-context-menu");
        const contextOpenButton = contextMenu ? contextMenu.querySelector('button[data-action="open"]') : null;
        const contextEditButton = contextMenu ? contextMenu.querySelector('button[data-action="edit"]') : null;
        const contextRenameButton = contextMenu ? contextMenu.querySelector('button[data-action="rename"]') : null;
        const contextDeleteButton = contextMenu ? contextMenu.querySelector('button[data-action="delete"]') : null;
        const contextNewFolderButton = contextMenu ? contextMenu.querySelector('button[data-action="new-folder"]') : null;
        const contextNewDocButton = contextMenu ? contextMenu.querySelector('button[data-action="new-doc"]') : null;
        const contextPermissionsButton = contextMenu ? contextMenu.querySelector('button[data-action="permissions"]') : null;
        const renameModal = document.getElementById("docs-rename-modal");
        const renameModalBackdrop = document.getElementById("docs-rename-modal-backdrop");
        const renameInput = document.getElementById("docs-rename-input");
        const renameTarget = document.getElementById("docs-rename-target");
        const renameCancelButton = document.getElementById("docs-rename-cancel-btn");
        const renameConfirmButton = document.getElementById("docs-rename-confirm-btn");
        const folderCreateModal = document.getElementById("docs-folder-create-modal");
        const folderCreateModalBackdrop = document.getElementById("docs-folder-create-modal-backdrop");
        const folderCreateTarget = document.getElementById("docs-folder-create-target");
        const folderCreateInput = document.getElementById("docs-folder-create-input");
        const folderCreateCancelButton = document.getElementById("docs-folder-create-cancel-btn");
        const folderCreateConfirmButton = document.getElementById("docs-folder-create-confirm-btn");
        const permissionModal = document.getElementById("docs-permission-modal");
        const permissionModalBackdrop = document.getElementById("docs-permission-modal-backdrop");
        const permissionTarget = document.getElementById("docs-permission-target");
        const permissionReadUsersList = document.getElementById("docs-permission-read-users-list");
        const permissionReadGroupsList = document.getElementById("docs-permission-read-groups-list");
        const permissionWriteUsersList = document.getElementById("docs-permission-write-users-list");
        const permissionWriteGroupsList = document.getElementById("docs-permission-write-groups-list");
        const permissionCancelButton = document.getElementById("docs-permission-cancel-btn");
        const permissionSaveButton = document.getElementById("docs-permission-save-btn");

        const currentDir = normalizePath(root.dataset.currentDir || "", true);
        const currentDirCanEdit = root.dataset.currentDirCanEdit === "1";
        const initialEntries = getJsonScriptData("docs-initial-entries", []);

        const state = {
            selectedPath: "",
            contextTarget: null,
            renameTargetEntry: null,
            folderCreateParentEntry: null,
            permissionTargetEntry: null,
            expandedFolders: new Set(),
            directoryCache: new Map(),
            aclOptionsLoaded: false,
            aclOptions: {
                users: [],
                groups: [],
            },
            draggingEntry: null,
            dragOverElement: null,
        };

        state.directoryCache.set(currentDir, initialEntries);

        function closeContextMenu() {
            if (!contextMenu) {
                return;
            }
            contextMenu.hidden = true;
            state.contextTarget = null;
        }

        function setContextButtonVisible(button, visible) {
            if (!button) {
                return;
            }
            button.style.display = visible ? "" : "none";
        }

        function syncContextMenuByEntry(entry) {
            const isDirectory = Boolean(entry && entry.type === "dir");
            const isCurrentFolder = Boolean(entry && entry.isCurrentFolder);
            const canEditEntry = Boolean(entry && entry.can_edit);
            const isPublicWriteFile = Boolean(entry && entry.type === "file" && entry.is_public_write);
            setContextButtonVisible(contextOpenButton, !isCurrentFolder);
            setContextButtonVisible(contextEditButton, !isDirectory && canEditEntry);
            setContextButtonVisible(contextRenameButton, !isCurrentFolder && canEditEntry && !isPublicWriteFile);
            setContextButtonVisible(contextDeleteButton, !isCurrentFolder && canEditEntry && !isPublicWriteFile);
            setContextButtonVisible(contextNewFolderButton, isDirectory && canEditEntry);
            setContextButtonVisible(contextNewDocButton, isDirectory && canEditEntry);
            setContextButtonVisible(contextPermissionsButton, true);
        }

        function openContextMenuAt(entry, x, y) {
            if (!contextMenu) {
                return;
            }
            state.contextTarget = entry;
            syncContextMenuByEntry(entry);

            const hasVisibleAction = Array.from(
                contextMenu.querySelectorAll("button[data-action]")
            ).some(function (button) {
                return button.style.display !== "none";
            });
            if (!hasVisibleAction) {
                closeContextMenu();
                return;
            }

            contextMenu.hidden = false;
            contextMenu.style.left = String(x) + "px";
            contextMenu.style.top = String(y) + "px";
        }

        function selectEntry(entryPath) {
            state.selectedPath = entryPath || "";
            renderPathBreadcrumbs(state.selectedPath || currentDir);
            renderList();
        }

        function buildBreadcrumbItems(pathValue) {
            const normalized = normalizePath(pathValue, true);
            const crumbs = [{
                label: breadcrumbRootLabel,
                path: "",
                isCurrent: normalized === ""
            }];
            if (!normalized) {
                return crumbs;
            }

            const parts = normalized.split("/").filter(Boolean);
            let composedPath = "";
            parts.forEach(function (part, index) {
                composedPath = composedPath ? composedPath + "/" + part : part;
                crumbs.push({
                    label: part,
                    path: composedPath,
                    isCurrent: index === parts.length - 1
                });
            });
            return crumbs;
        }

        function renderPathBreadcrumbs(pathValue) {
            if (!pathBreadcrumbs) {
                return;
            }

            const fragment = document.createDocumentFragment();
            const crumbs = buildBreadcrumbItems(pathValue);
            crumbs.forEach(function (crumb, index) {
                if (index > 0) {
                    const separator = document.createElement("span");
                    separator.className = "docs-path-sep";
                    separator.textContent = "/";
                    fragment.appendChild(separator);
                }

                if (crumb.isCurrent) {
                    const current = document.createElement("span");
                    current.className = "docs-path-current";
                    current.setAttribute("data-docs-dir", crumb.path);
                    current.textContent = crumb.label;
                    fragment.appendChild(current);
                    return;
                }

                const link = document.createElement("a");
                link.className = "docs-path-link";
                link.href = buildListUrl(docsBaseUrl, crumb.path);
                link.setAttribute("data-docs-dir", crumb.path);
                link.textContent = crumb.label;
                fragment.appendChild(link);
            });

            pathBreadcrumbs.replaceChildren(fragment);
            bindDocsPathDropTargets();
        }

        function getCachedEntries(dirPath) {
            return state.directoryCache.get(dirPath) || [];
        }

        async function loadDirectory(dirPath) {
            const normalizedDirPath = normalizePath(dirPath, true);
            if (state.directoryCache.has(normalizedDirPath)) {
                return getCachedEntries(normalizedDirPath);
            }

            const data = await requestJson(
                listApiUrl + "?path=" + encodeURIComponent(normalizedDirPath)
            );
            const entries = Array.isArray(data.entries) ? data.entries : [];
            state.directoryCache.set(normalizedDirPath, entries);
            return entries;
        }

        async function refreshCurrentDirectory() {
            const data = await requestJson(
                listApiUrl + "?path=" + encodeURIComponent(currentDir)
            );
            state.directoryCache.set(currentDir, Array.isArray(data.entries) ? data.entries : []);

            const preserved = new Map();
            preserved.set(currentDir, state.directoryCache.get(currentDir));
            state.directoryCache = preserved;
            state.expandedFolders.clear();
            renderList();
        }

        function getEntryEditableName(entry) {
            if (!entry) {
                return "";
            }
            if (entry.type === "file" && entry.name.toLowerCase().endsWith(".md")) {
                return entry.name.slice(0, -3);
            }
            return entry.name;
        }

        function syncModalBodyState() {
            syncDocsModalBodyState();
        }

        function getDocsPathLabel(pathValue) {
            const normalized = normalizePath(pathValue, true);
            return normalized ? "/docs/" + normalized : "/docs";
        }

        function getParentDirectory(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "";
            }
            const parts = normalized.split("/");
            parts.pop();
            return parts.join("/");
        }

        function clearDragOverTarget() {
            if (state.dragOverElement) {
                state.dragOverElement.classList.remove("is-drop-target");
                state.dragOverElement = null;
            }
        }

        function setDragOverTarget(element) {
            if (!element || state.dragOverElement === element) {
                return;
            }
            clearDragOverTarget();
            state.dragOverElement = element;
            state.dragOverElement.classList.add("is-drop-target");
        }

        function canDropToDirectory(targetDirPath, options) {
            if (!moveApiUrl || !state.draggingEntry) {
                return false;
            }

            const sourcePath = normalizePath(state.draggingEntry.path, false);
            const sourceType = state.draggingEntry.type;
            const isPublicWriteFile = Boolean(state.draggingEntry.isPublicWriteFile);
            const targetPath = normalizePath(targetDirPath, true);
            const allowSameParent = Boolean(options && options.allowSameParent);

            if (!sourcePath || sourcePath === targetPath) {
                return false;
            }
            if (isPublicWriteFile) {
                return false;
            }
            if (!allowSameParent && getParentDirectory(sourcePath) === targetPath) {
                return false;
            }
            if (sourceType === "dir" && targetPath && targetPath.startsWith(sourcePath + "/")) {
                return false;
            }
            return true;
        }

        async function moveEntryToDirectory(sourceEntry, targetDirPath) {
            if (!sourceEntry || !moveApiUrl) {
                return;
            }

            const data = await requestJson(
                moveApiUrl,
                buildPostOptions({
                    source_path: sourceEntry.path,
                    target_dir: targetDirPath
                })
            );
            state.selectedPath = data && data.path ? data.path : "";
            await refreshCurrentDirectory();
        }

        function bindDropTarget(targetElement, targetDirPath, options) {
            if (!targetElement || !moveApiUrl) {
                return;
            }

            targetElement.addEventListener("dragenter", function (event) {
                if (!canDropToDirectory(targetDirPath, options)) {
                    return;
                }
                event.preventDefault();
                setDragOverTarget(targetElement);
            });

            targetElement.addEventListener("dragover", function (event) {
                if (!canDropToDirectory(targetDirPath, options)) {
                    return;
                }
                event.preventDefault();
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = "move";
                }
                setDragOverTarget(targetElement);
            });

            targetElement.addEventListener("dragleave", function (event) {
                if (!state.dragOverElement || state.dragOverElement !== targetElement) {
                    return;
                }
                if (event.relatedTarget && targetElement.contains(event.relatedTarget)) {
                    return;
                }
                clearDragOverTarget();
            });

            targetElement.addEventListener("drop", function (event) {
                if (!canDropToDirectory(targetDirPath, options)) {
                    return;
                }
                event.preventDefault();
                clearDragOverTarget();
                moveEntryToDirectory(state.draggingEntry, targetDirPath).catch(alertError);
            });
        }

        function getCurrentFolderName(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "docs";
            }
            const parts = normalized.split("/");
            return parts[parts.length - 1] || "docs";
        }

        function addCurrentDirectoryNode(fragment) {
            const currentFolderEntry = {
                path: currentDir,
                type: "dir",
                isCurrentFolder: true,
                can_edit: currentDirCanEdit
            };

            const item = document.createElement("li");
            item.className = "docs-item docs-current-dir-item";

            const row = document.createElement("button");
            row.type = "button";
            row.className = "docs-item-row docs-current-dir-row";
            row.draggable = false;
            if (state.selectedPath === currentFolderEntry.path) {
                row.classList.add("is-selected");
            }

            const typeMarker = document.createElement("span");
            typeMarker.className = "docs-item-type-icon is-dir";
            typeMarker.setAttribute("aria-hidden", "true");

            const name = document.createElement("span");
            name.className = "docs-item-name docs-current-dir-name";
            name.textContent = getCurrentFolderName(currentDir);

            row.appendChild(typeMarker);
            row.appendChild(name);

            row.addEventListener("click", function (event) {
                event.preventDefault();
                closeContextMenu();
                if (state.selectedPath !== currentFolderEntry.path) {
                    selectEntry(currentFolderEntry.path);
                }
            });

            row.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                selectEntry(currentFolderEntry.path);
                openContextMenuAt(currentFolderEntry, event.clientX, event.clientY);
            });

            if (currentFolderEntry.can_edit) {
                bindDropTarget(row, currentFolderEntry.path, { allowSameParent: true });
            }

            item.appendChild(row);
            fragment.appendChild(item);
        }

        function setRenameModalOpen(opened, entry) {
            if (!renameModal) {
                return;
            }
            renameModal.hidden = !opened;
            syncModalBodyState();
            if (!opened) {
                state.renameTargetEntry = null;
                return;
            }

            state.renameTargetEntry = entry || null;
            if (renameTarget) {
                renameTarget.textContent = entry ? entry.path : "";
            }
            if (renameInput) {
                renameInput.value = getEntryEditableName(entry);
                renameInput.focus();
                renameInput.select();
            }
        }

        function setFolderCreateModalOpen(opened, entry) {
            if (!folderCreateModal) {
                return;
            }
            folderCreateModal.hidden = !opened;
            syncModalBodyState();
            if (!opened) {
                state.folderCreateParentEntry = null;
                return;
            }

            state.folderCreateParentEntry = entry || null;
            if (folderCreateTarget) {
                const parentPath = entry && entry.path ? entry.path : "";
                folderCreateTarget.textContent = t("create_folder_in_label", "생성 위치") + ": " + getDocsPathLabel(parentPath);
            }
            if (folderCreateInput) {
                folderCreateInput.value = "";
                folderCreateInput.focus();
                folderCreateInput.select();
            }
        }

        function renderPermissionItems(container, items, selectedIdSet, emptyMessage) {
            if (!container) {
                return;
            }
            container.innerHTML = "";

            if (!Array.isArray(items) || items.length === 0) {
                const emptyNode = document.createElement("div");
                emptyNode.className = "docs-permission-empty";
                emptyNode.textContent = emptyMessage;
                container.appendChild(emptyNode);
                return;
            }

            items.forEach(function (item) {
                const row = document.createElement("label");
                row.className = "docs-permission-item";

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = String(item.id);
                checkbox.checked = selectedIdSet.has(Number(item.id));

                const text = document.createElement("span");
                text.textContent = item.label;

                row.appendChild(checkbox);
                row.appendChild(text);
                container.appendChild(row);
            });
        }

        function readCheckedIds(container) {
            if (!container) {
                return [];
            }
            return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(function (input) {
                    return Number(input.value);
                })
                .filter(function (value) {
                    return Number.isInteger(value) && value > 0;
                });
        }

        function setPermissionModalOpen(opened, entry) {
            if (!permissionModal) {
                return;
            }
            permissionModal.hidden = !opened;
            syncModalBodyState();
            if (!opened) {
                state.permissionTargetEntry = null;
                return;
            }
            state.permissionTargetEntry = entry || null;
            if (permissionTarget) {
                permissionTarget.textContent = entry ? entry.path : "";
            }
        }

        async function ensureAclOptionsLoaded() {
            if (state.aclOptionsLoaded || !aclOptionsApiUrl) {
                return;
            }

            const data = await requestJson(aclOptionsApiUrl);
            const users = Array.isArray(data.users) ? data.users : [];
            const groups = Array.isArray(data.groups) ? data.groups : [];
            state.aclOptions = {
                users: users.map(function (user) {
                    return { id: Number(user.id), label: String(user.username || "") };
                }).filter(function (user) {
                    return user.id > 0 && user.label;
                }),
                groups: groups.map(function (group) {
                    return {
                        id: Number(group.id),
                        label: String(group.label || group.name || ""),
                        isPublicAll: Boolean(group.is_public_all)
                    };
                }).filter(function (group) {
                    return group.id > 0 && group.label;
                }),
            };
            state.aclOptionsLoaded = true;
        }

        async function openPermissionModal(entry) {
            if (!entry || !aclApiUrl || !aclOptionsApiUrl) {
                return;
            }

            setPermissionModalOpen(true, entry);
            if (permissionReadUsersList) {
                permissionReadUsersList.textContent = t("permission_loading", "불러오는 중...");
            }
            if (permissionReadGroupsList) {
                permissionReadGroupsList.textContent = t("permission_loading", "불러오는 중...");
            }
            if (permissionWriteUsersList) {
                permissionWriteUsersList.textContent = t("permission_loading", "불러오는 중...");
            }
            if (permissionWriteGroupsList) {
                permissionWriteGroupsList.textContent = t("permission_loading", "불러오는 중...");
            }

            await ensureAclOptionsLoaded();
            const data = await requestJson(aclApiUrl + "?path=" + encodeURIComponent(entry.path));
            const selectedReadUserIds = new Set(
                Array.isArray(data.read_user_ids) ? data.read_user_ids.map(Number) : []
            );
            const selectedReadGroupIds = new Set(
                Array.isArray(data.read_group_ids) ? data.read_group_ids.map(Number) : []
            );
            const selectedWriteUserIds = new Set(
                Array.isArray(data.write_user_ids) ? data.write_user_ids.map(Number) : []
            );
            const selectedWriteGroupIds = new Set(
                Array.isArray(data.write_group_ids) ? data.write_group_ids.map(Number) : []
            );
            const availableGroupItems = entry.type === "dir"
                ? state.aclOptions.groups.filter(function (group) {
                    return !group.isPublicAll;
                })
                : state.aclOptions.groups;

            renderPermissionItems(
                permissionReadUsersList,
                state.aclOptions.users,
                selectedReadUserIds,
                t("permission_empty_users", "표시할 사용자가 없습니다.")
            );
            renderPermissionItems(
                permissionReadGroupsList,
                availableGroupItems,
                selectedReadGroupIds,
                t("permission_empty_groups", "표시할 그룹이 없습니다.")
            );
            renderPermissionItems(
                permissionWriteUsersList,
                state.aclOptions.users,
                selectedWriteUserIds,
                t("permission_empty_users", "표시할 사용자가 없습니다.")
            );
            renderPermissionItems(
                permissionWriteGroupsList,
                availableGroupItems,
                selectedWriteGroupIds,
                t("permission_empty_groups", "표시할 그룹이 없습니다.")
            );
        }

        async function submitPermissionSettings() {
            const entry = state.permissionTargetEntry;
            if (!entry) {
                return;
            }

            const readUserIds = readCheckedIds(permissionReadUsersList);
            const readGroupIds = readCheckedIds(permissionReadGroupsList);
            const writeUserIds = readCheckedIds(permissionWriteUsersList);
            const writeGroupIds = readCheckedIds(permissionWriteGroupsList);
            await requestJson(
                aclApiUrl,
                buildPostOptions({
                    path: entry.path,
                    read_user_ids: readUserIds,
                    read_group_ids: readGroupIds,
                    write_user_ids: writeUserIds,
                    write_group_ids: writeGroupIds,
                })
            );
            setPermissionModalOpen(false);
            await refreshCurrentDirectory();
        }

        function renameEntry(entry) {
            if (!entry) {
                return;
            }
            setRenameModalOpen(true, entry);
        }

        function newDocumentInFolder(entry) {
            if (!entry || entry.type !== "dir") {
                return;
            }
            window.location.href = buildWriteUrl(writeUrl, { dir: entry.path });
        }

        async function submitRename() {
            const entry = state.renameTargetEntry;
            if (!entry) {
                return;
            }

            const currentName = getEntryEditableName(entry);
            const trimmed = String(renameInput ? renameInput.value : "").trim();
            if (!trimmed || trimmed === currentName) {
                setRenameModalOpen(false);
                return;
            }

            const data = await requestJson(renameApiUrl, buildPostOptions({
                path: entry.path,
                new_name: trimmed
            }));
            state.selectedPath = data && data.path ? data.path : "";
            setRenameModalOpen(false);
            await refreshCurrentDirectory();
        }

        async function submitFolderCreate() {
            const parentEntry = state.folderCreateParentEntry;
            if (!parentEntry || parentEntry.type !== "dir") {
                window.alert(t("js_folder_create_requires_folder", "폴더에서만 새 폴더를 만들 수 있습니다."));
                return;
            }

            const folderName = String(folderCreateInput ? folderCreateInput.value : "").trim();
            if (!folderName) {
                window.alert(t("js_folder_name_required", "폴더 이름을 입력해주세요."));
                return;
            }

            await requestJson(
                mkdirApiUrl,
                buildPostOptions({
                    parent_dir: parentEntry.path,
                    folder_name: folderName
                })
            );

            setFolderCreateModalOpen(false);
            await refreshCurrentDirectory();
        }

        async function deleteEntry(entry) {
            if (!entry) {
                return;
            }
            const confirmed = await requestConfirmDialog({
                title: t("delete_button", "삭제"),
                message: formatTemplate(
                    t("js_confirm_delete_entry", "정말 삭제할까요?\n{path}"),
                    { path: entry.path }
                ),
                cancelText: t("cancel", "취소"),
                confirmText: t("delete_button", "삭제")
            });
            if (!confirmed) {
                return;
            }

            await requestJson(deleteApiUrl, buildPostOptions({ path: entry.path }));
            await refreshCurrentDirectory();
        }

        async function toggleFolderExpansion(entry) {
            if (!entry || entry.type !== "dir") {
                return;
            }
            const folderPath = normalizePath(entry.path, false);

            if (state.expandedFolders.has(folderPath)) {
                state.expandedFolders.delete(folderPath);
                renderList();
                return;
            }

            await loadDirectory(folderPath);
            state.expandedFolders.add(folderPath);
            renderList();
        }

        function openEntry(entry) {
            if (!entry) {
                return;
            }
            if (entry.type === "dir") {
                window.location.href = buildListUrl(docsBaseUrl, entry.path);
                return;
            }
            window.location.href = buildViewUrl(docsBaseUrl, entry.slug_path || entry.path);
        }

        function editEntry(entry) {
            if (!entry) {
                return;
            }
            if (entry.type === "dir") {
                window.location.href = buildWriteUrl(writeUrl, { dir: entry.path });
                return;
            }
            window.location.href = buildWriteUrl(writeUrl, { path: entry.path });
        }

        function buildTreePrefixElement(ancestorHasNextSiblings, isLastSibling) {
            const prefix = document.createElement("span");
            prefix.className = "docs-item-tree-prefix";
            prefix.setAttribute("aria-hidden", "true");

            const ancestorFlags = ancestorHasNextSiblings || [];
            ancestorFlags.forEach(function (hasNextSibling) {
                const segment = document.createElement("span");
                segment.className = "docs-tree-segment" + (hasNextSibling ? " has-next" : "");
                prefix.appendChild(segment);
            });

            const branch = document.createElement("span");
            branch.className = "docs-tree-segment docs-tree-branch " + (isLastSibling ? "is-last" : "is-middle");
            prefix.appendChild(branch);

            if (ancestorFlags.length === 0) {
                prefix.classList.add("is-root-depth");
            }

            return prefix;
        }

        function addEntryNode(entry, fragment, ancestorHasNextSiblings, isLastSibling) {
            const item = document.createElement("li");
            item.className = "docs-item";

            const row = document.createElement("button");
            row.type = "button";
            row.className = "docs-item-row has-tree-prefix";
            const isPublicWriteFile = Boolean(entry.type === "file" && entry.is_public_write);
            row.draggable = Boolean(moveApiUrl && entry.can_edit && !isPublicWriteFile);
            if (state.selectedPath === entry.path) {
                row.classList.add("is-selected");
            }

            const treePrefix = buildTreePrefixElement(ancestorHasNextSiblings, Boolean(isLastSibling));

            const typeMarker = document.createElement("span");
            typeMarker.className = "docs-item-type-icon " + (entry.type === "dir" ? "is-dir" : "is-file");
            typeMarker.setAttribute("aria-hidden", "true");

            const aclLabels = Array.isArray(entry.write_acl_labels) ? entry.write_acl_labels : [];
            const aclLabelLimit = 3;

            const name = document.createElement("span");
            name.className = "docs-item-name";
            name.textContent = entry.name;

            row.appendChild(typeMarker);
            row.appendChild(name);

            if (aclLabels.length > 0) {
                const aclWrap = document.createElement("span");
                aclWrap.className = "docs-item-acl-list";
                aclLabels.slice(0, aclLabelLimit).forEach(function (labelText) {
                    const aclBadge = document.createElement("span");
                    aclBadge.className = "docs-item-acl-badge";
                    aclBadge.textContent = String(labelText || "");
                    aclWrap.appendChild(aclBadge);
                });
                if (aclLabels.length > aclLabelLimit) {
                    const overflowBadge = document.createElement("span");
                    overflowBadge.className = "docs-item-acl-badge docs-item-acl-badge-overflow";
                    overflowBadge.textContent = "+" + String(aclLabels.length - aclLabelLimit);
                    aclWrap.appendChild(overflowBadge);
                }
                row.appendChild(aclWrap);
            }

            if (entry.type === "file" && entry.is_public_write) {
                const publicBadge = document.createElement("span");
                publicBadge.className = "docs-item-public-badge";
                publicBadge.textContent = t("public_write_badge", "전체 허용");
                row.appendChild(publicBadge);
            }

            row.addEventListener("click", function (event) {
                event.preventDefault();
                closeContextMenu();
                if (state.selectedPath !== entry.path) {
                    selectEntry(entry.path);
                }
                if (entry.type === "dir") {
                    if (event.detail === 1) {
                        toggleFolderExpansion(entry).catch(alertError);
                    }
                    return;
                }
            });

            row.addEventListener("dblclick", function (event) {
                event.preventDefault();
                if (entry.type === "dir") {
                    return;
                }
                openEntry(entry);
            });

            row.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                selectEntry(entry.path);
                openContextMenuAt(entry, event.clientX, event.clientY);
            });

            if (moveApiUrl) {
                row.addEventListener("dragstart", function (event) {
                    state.draggingEntry = {
                        path: entry.path,
                        type: entry.type,
                        isPublicWriteFile: isPublicWriteFile
                    };
                    row.classList.add("is-dragging");
                    clearDragOverTarget();
                    closeContextMenu();
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", entry.path);
                    }
                });

                row.addEventListener("dragend", function () {
                    row.classList.remove("is-dragging");
                    state.draggingEntry = null;
                    clearDragOverTarget();
                });
            }

            if (entry.type === "dir") {
                bindDropTarget(row, entry.path);
            }

            item.appendChild(treePrefix);
            item.appendChild(row);
            fragment.appendChild(item);

            if (entry.type === "dir" && state.expandedFolders.has(entry.path)) {
                const childEntries = getCachedEntries(entry.path);
                const nextAncestorHasNextSiblings = (ancestorHasNextSiblings || []).slice();
                nextAncestorHasNextSiblings.push(!isLastSibling);
                childEntries.forEach(function (child, index) {
                    const childIsLast = index === childEntries.length - 1;
                    addEntryNode(child, fragment, nextAncestorHasNextSiblings, childIsLast);
                });
            }
        }

        function renderList() {
            if (!listContainer) {
                return;
            }
            listContainer.innerHTML = "";
            const fragment = document.createDocumentFragment();
            const entries = getCachedEntries(currentDir);
            addCurrentDirectoryNode(fragment);
            if (entries.length === 0) {
                const emptyItem = document.createElement("li");
                emptyItem.className = "docs-item";
                const emptyRow = document.createElement("div");
                emptyRow.className = "docs-item-row is-empty";
                emptyRow.textContent = t("js_empty_documents", "문서가 없습니다.");
                emptyItem.appendChild(emptyRow);
                fragment.appendChild(emptyItem);
                listContainer.appendChild(fragment);
                return;
            }
            entries.forEach(function (entry, index) {
                const isLastRootEntry = index === entries.length - 1;
                addEntryNode(entry, fragment, [], isLastRootEntry);
            });
            listContainer.appendChild(fragment);
        }

        function bindDocsPathDropTargets() {
            if (!moveApiUrl) {
                return;
            }
            const pathTargets = document.querySelectorAll(".docs-path-link[data-docs-dir], .docs-path-current[data-docs-dir]");
            pathTargets.forEach(function (target) {
                const targetDirPath = normalizePath(target.getAttribute("data-docs-dir") || "", true);
                bindDropTarget(target, targetDirPath);
            });
        }

        if (contextMenu) {
            contextMenu.addEventListener("click", function (event) {
                const button = event.target.closest("button[data-action]");
                if (!button || !state.contextTarget) {
                    return;
                }

                const action = button.dataset.action;
                const entry = state.contextTarget;
                closeContextMenu();

                if (action === "open") {
                    openEntry(entry);
                    return;
                }
                if (action === "rename") {
                    renameEntry(entry);
                    return;
                }
                if (action === "permissions") {
                    openPermissionModal(entry).catch(alertError);
                    return;
                }
                if (action === "edit") {
                    editEntry(entry);
                    return;
                }
                if (action === "new-folder") {
                    setFolderCreateModalOpen(true, entry);
                    return;
                }
                if (action === "new-doc") {
                    newDocumentInFolder(entry);
                    return;
                }
                if (action === "delete") {
                    deleteEntry(entry).catch(alertError);
                }
            });
        }

        if (renameModalBackdrop) {
            renameModalBackdrop.addEventListener("click", function () {
                setRenameModalOpen(false);
            });
        }

        if (renameCancelButton) {
            renameCancelButton.addEventListener("click", function () {
                setRenameModalOpen(false);
            });
        }

        if (renameConfirmButton) {
            renameConfirmButton.addEventListener("click", function () {
                submitRename().catch(alertError);
            });
        }

        if (renameInput) {
            renameInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitRename().catch(alertError);
                }
            });
        }

        if (folderCreateModalBackdrop) {
            folderCreateModalBackdrop.addEventListener("click", function () {
                setFolderCreateModalOpen(false);
            });
        }

        if (folderCreateCancelButton) {
            folderCreateCancelButton.addEventListener("click", function () {
                setFolderCreateModalOpen(false);
            });
        }

        if (folderCreateConfirmButton) {
            folderCreateConfirmButton.addEventListener("click", function () {
                submitFolderCreate().catch(alertError);
            });
        }

        if (folderCreateInput) {
            folderCreateInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitFolderCreate().catch(alertError);
                }
            });
        }

        if (permissionModalBackdrop) {
            permissionModalBackdrop.addEventListener("click", function () {
                setPermissionModalOpen(false);
            });
        }

        if (permissionCancelButton) {
            permissionCancelButton.addEventListener("click", function () {
                setPermissionModalOpen(false);
            });
        }

        if (permissionSaveButton) {
            permissionSaveButton.addEventListener("click", function () {
                submitPermissionSettings().catch(function (error) {
                    window.alert(
                        error && error.message
                            ? error.message
                            : t("js_permission_save_failed", "권한 저장 중 오류가 발생했습니다.")
                    );
                });
            });
        }

        document.addEventListener("click", function (event) {
            if (!contextMenu || contextMenu.hidden) {
                return;
            }
            if (!contextMenu.contains(event.target)) {
                closeContextMenu();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                if (folderCreateModal && !folderCreateModal.hidden) {
                    setFolderCreateModalOpen(false);
                    return;
                }
                if (renameModal && !renameModal.hidden) {
                    setRenameModalOpen(false);
                    return;
                }
                if (permissionModal && !permissionModal.hidden) {
                    setPermissionModalOpen(false);
                    return;
                }
                closeContextMenu();
            }
        });

        window.addEventListener("scroll", closeContextMenu, { passive: true });
        window.addEventListener("resize", closeContextMenu, { passive: true });

        if (pathBreadcrumbs) {
            renderPathBreadcrumbs(currentDir);
        } else {
            bindDocsPathDropTargets();
        }
        renderList();
    }

    function initializeViewPage() {
        const docsBaseUrl = root.dataset.docsBaseUrl || "/docs";
        const deleteApiUrl = root.dataset.deleteApiUrl;
        const docPath = root.dataset.docPath || "";
        const parentDir = root.dataset.parentDir || "";
        const deleteButton = document.getElementById("docs-delete-btn");

        if (!deleteButton) {
            return;
        }

        deleteButton.addEventListener("click", async function () {
            const confirmed = await requestConfirmDialog({
                title: t("delete_button", "삭제"),
                message: t("js_confirm_delete_doc", "이 문서를 삭제할까요?"),
                cancelText: t("cancel", "취소"),
                confirmText: t("delete_button", "삭제")
            });
            if (!confirmed) {
                return;
            }

            try {
                await requestJson(deleteApiUrl, buildPostOptions({ path: docPath }));
                window.location.href = buildListUrl(docsBaseUrl, parentDir);
            } catch (error) {
                alertError(error);
            }
        });
    }

    function initializeWritePage() {
        const docsBaseUrl = root.dataset.docsBaseUrl || "/docs";
        const saveApiUrl = root.dataset.saveApiUrl;
        const previewApiUrl = root.dataset.previewApiUrl;
        const mkdirApiUrl = root.dataset.mkdirApiUrl;
        const originalPath = root.dataset.originalPath || "";
        const isPublicWriteDirectSave = root.dataset.publicWriteDirectSave === "1";

        const directoryInput = document.getElementById("docs-dir-input");
        const filenameInput = document.getElementById("docs-filename-input");
        const contentInput = document.getElementById("docs-content-input");
        const markdownHelpButton = document.getElementById("docs-markdown-help-btn");
        const markdownHelpModal = document.getElementById("docs-markdown-help-modal");
        const markdownHelpBackdrop = document.getElementById("docs-markdown-help-backdrop");
        const markdownPreviewButton = document.getElementById("docs-markdown-preview-btn");
        const markdownPreviewModal = document.getElementById("docs-markdown-preview-modal");
        const markdownPreviewBackdrop = document.getElementById("docs-markdown-preview-backdrop");
        const markdownPreviewContent = document.getElementById("docs-markdown-preview-content");
        const saveButton = document.getElementById("docs-save-btn");
        const createFolderButton = document.getElementById("docs-create-folder-btn");
        const saveModal = document.getElementById("docs-save-modal");
        const saveModalBackdrop = document.getElementById("docs-save-modal-backdrop");
        const saveCloseButton = document.getElementById("docs-save-close-btn");
        const saveCancelButton = document.getElementById("docs-save-cancel-btn");
        const saveConfirmButton = document.getElementById("docs-save-confirm-btn");
        const saveUpButton = document.getElementById("docs-save-up-btn");
        const saveBreadcrumb = document.getElementById("docs-save-breadcrumb");
        const saveQuickList = document.getElementById("docs-save-quick-list");
        const saveFolderList = document.getElementById("docs-save-folder-list");
        const folderModal = document.getElementById("docs-folder-modal");
        const folderModalBackdrop = document.getElementById("docs-folder-modal-backdrop");
        const folderNameInput = document.getElementById("docs-folder-name-input");
        const folderTargetPath = document.getElementById("docs-folder-target-path");
        const folderCancelButton = document.getElementById("docs-folder-cancel-btn");
        const folderCreateButton = document.getElementById("docs-folder-create-btn");
        const directoryOptions = document.getElementById("docs-directory-options");
        const markdownSnippetMenu = document.getElementById("docs-markdown-snippet-menu");
        const markdownSnippetButtons = Array.from(
            document.querySelectorAll("button[data-md-snippet]")
        );

        const rawDirectories = getJsonScriptData("docs-directory-data", []);
        const directories = [];
        const directorySet = new Set();
        const state = {
            browserDir: "",
            selectedDir: "",
        };
        let contentHeightRafId = null;

        function closeMarkdownSnippetMenu() {
            if (!markdownSnippetMenu) {
                return;
            }
            markdownSnippetMenu.hidden = true;
        }

        function openMarkdownSnippetMenu(clientX, clientY) {
            if (!markdownSnippetMenu) {
                return;
            }

            markdownSnippetMenu.hidden = false;
            markdownSnippetMenu.style.left = "0px";
            markdownSnippetMenu.style.top = "0px";

            const rect = markdownSnippetMenu.getBoundingClientRect();
            const viewportPadding = 8;
            const maxLeft = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
            const maxTop = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
            const left = Math.min(Math.max(viewportPadding, clientX), maxLeft);
            const top = Math.min(Math.max(viewportPadding, clientY), maxTop);

            markdownSnippetMenu.style.left = left + "px";
            markdownSnippetMenu.style.top = top + "px";
        }

        function replaceTextareaSelection(insertText, selectionStartOffset, selectionEndOffset) {
            if (!contentInput) {
                return;
            }
            const start = contentInput.selectionStart || 0;
            const end = contentInput.selectionEnd || 0;
            contentInput.setRangeText(insertText, start, end, "end");

            const nextStart = start + (selectionStartOffset || 0);
            const nextEnd = start + (selectionEndOffset || insertText.length);
            contentInput.setSelectionRange(nextStart, nextEnd);
            contentInput.focus();
            contentInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        function buildWrappedSnippet(prefix, suffix, placeholder) {
            const start = contentInput ? (contentInput.selectionStart || 0) : 0;
            const end = contentInput ? (contentInput.selectionEnd || 0) : 0;
            const selected = contentInput ? contentInput.value.slice(start, end) : "";
            const body = selected || placeholder;
            const text = prefix + body + suffix;

            if (selected) {
                return { text: text, selectStart: text.length, selectEnd: text.length };
            }

            return {
                text: text,
                selectStart: prefix.length,
                selectEnd: prefix.length + body.length,
            };
        }

        function buildPrefixedLinesSnippet(prefix, placeholder) {
            const start = contentInput ? (contentInput.selectionStart || 0) : 0;
            const end = contentInput ? (contentInput.selectionEnd || 0) : 0;
            const selected = contentInput ? contentInput.value.slice(start, end) : "";
            if (!selected) {
                const body = prefix + placeholder;
                return {
                    text: body,
                    selectStart: prefix.length,
                    selectEnd: body.length,
                };
            }

            const lines = selected.split(/\r?\n/);
            const transformed = lines.map(function (line) {
                if (!line.trim()) {
                    return line;
                }
                return prefix + line;
            }).join("\n");
            return { text: transformed, selectStart: transformed.length, selectEnd: transformed.length };
        }

        function buildTableSnippet() {
            const col1 = t("markdown_placeholder_table_col1", "Column 1");
            const col2 = t("markdown_placeholder_table_col2", "Column 2");
            const table = [
                "| " + col1 + " | " + col2 + " |",
                "| --- | --- |",
                "| Value 1 | Value 2 |",
            ].join("\n");
            return {
                text: table,
                selectStart: 2,
                selectEnd: 2 + col1.length,
            };
        }

        function buildNumberedLinesSnippet(placeholder) {
            const start = contentInput ? (contentInput.selectionStart || 0) : 0;
            const end = contentInput ? (contentInput.selectionEnd || 0) : 0;
            const selected = contentInput ? contentInput.value.slice(start, end) : "";
            if (!selected) {
                const body = "1. " + placeholder;
                return {
                    text: body,
                    selectStart: 3,
                    selectEnd: body.length,
                };
            }

            let order = 1;
            const transformed = selected
                .split(/\r?\n/)
                .map(function (line) {
                    if (!line.trim()) {
                        return line;
                    }
                    const row = order + ". " + line;
                    order += 1;
                    return row;
                })
                .join("\n");
            return { text: transformed, selectStart: transformed.length, selectEnd: transformed.length };
        }

        function buildCodeBlockSnippet() {
            const lang = t("markdown_placeholder_code_lang", "text");
            const body = t("markdown_placeholder_code_body", "type your code");
            const text = "```" + lang + "\n" + body + "\n```";
            const bodyStart = ("```" + lang + "\n").length;
            return {
                text: text,
                selectStart: bodyStart,
                selectEnd: bodyStart + body.length,
            };
        }

        function insertMarkdownSnippet(snippetType) {
            if (!contentInput) {
                return;
            }

            let snippet = null;
            if (snippetType === "heading2") {
                snippet = buildWrappedSnippet("## ", "", t("markdown_placeholder_heading", "Heading"));
            } else if (snippetType === "heading3") {
                snippet = buildWrappedSnippet("### ", "", t("markdown_placeholder_heading", "Heading"));
            } else if (snippetType === "bold") {
                snippet = buildWrappedSnippet("**", "**", t("markdown_placeholder_bold", "bold text"));
            } else if (snippetType === "italic") {
                snippet = buildWrappedSnippet("*", "*", t("markdown_placeholder_italic", "italic text"));
            } else if (snippetType === "link") {
                snippet = buildWrappedSnippet("[", "](https://)", t("markdown_placeholder_link_text", "link text"));
            } else if (snippetType === "image") {
                snippet = buildWrappedSnippet("![", "](https://)", t("markdown_placeholder_image_alt", "image description"));
            } else if (snippetType === "code_inline") {
                snippet = buildWrappedSnippet("`", "`", t("markdown_placeholder_inline_code", "code"));
            } else if (snippetType === "code_block") {
                snippet = buildCodeBlockSnippet();
            } else if (snippetType === "list_bullet") {
                snippet = buildPrefixedLinesSnippet("- ", t("markdown_placeholder_list_item", "item"));
            } else if (snippetType === "list_numbered") {
                snippet = buildNumberedLinesSnippet(t("markdown_placeholder_list_item", "item"));
            } else if (snippetType === "list_check") {
                snippet = buildPrefixedLinesSnippet("- [ ] ", t("markdown_placeholder_list_item", "item"));
            } else if (snippetType === "quote") {
                snippet = buildPrefixedLinesSnippet("> ", t("markdown_placeholder_quote", "quote"));
            } else if (snippetType === "divider") {
                snippet = {
                    text: "\n---\n",
                    selectStart: 5,
                    selectEnd: 5,
                };
            } else if (snippetType === "table") {
                snippet = buildTableSnippet();
            }

            if (!snippet) {
                return;
            }
            replaceTextareaSelection(snippet.text, snippet.selectStart, snippet.selectEnd);
        }

        function updateContentInputAutoHeight() {
            contentHeightRafId = null;
            if (!contentInput) {
                return;
            }

            const rootStyle = window.getComputedStyle(root);
            const rootBottomPadding = parseFloat(rootStyle.paddingBottom || "0");
            const paddingBottom = Number.isFinite(rootBottomPadding) ? rootBottomPadding : 0;
            const viewport = window.visualViewport;
            const viewportHeight = viewport ? viewport.height : window.innerHeight;
            const viewportOffsetTop = viewport ? viewport.offsetTop : 0;
            const inputRect = contentInput.getBoundingClientRect();
            const inputStyle = window.getComputedStyle(contentInput);
            const minHeightValue = parseFloat(inputStyle.minHeight || "0");
            const minHeight = Number.isFinite(minHeightValue) ? minHeightValue : 0;
            const availableHeight = viewportHeight + viewportOffsetTop - inputRect.top - paddingBottom;
            const targetHeight = Math.max(minHeight, Math.floor(availableHeight));

            contentInput.style.height = Math.max(0, targetHeight) + "px";
        }

        function scheduleContentInputAutoHeight() {
            if (contentHeightRafId !== null) {
                return;
            }
            contentHeightRafId = window.requestAnimationFrame(updateContentInputAutoHeight);
        }

        function upsertDirectory(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (directorySet.has(normalized)) {
                return normalized;
            }
            directorySet.add(normalized);
            directories.push(normalized);
            return normalized;
        }

        function hasDirectory(pathValue) {
            const normalized = normalizePath(pathValue, true);
            return directorySet.has(normalized);
        }

        function normalizeDirectoryInput() {
            return normalizePath(directoryInput ? directoryInput.value : "", true);
        }

        function getParentPath(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "";
            }
            const parts = normalized.split("/");
            parts.pop();
            return parts.join("/");
        }

        function getPathFileStem(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "";
            }
            const segments = normalized.split("/");
            const fileName = segments[segments.length - 1] || "";
            if (fileName.toLowerCase().endsWith(".md")) {
                return fileName.slice(0, -3);
            }
            return fileName;
        }

        function getChildDirectories(pathValue) {
            const normalized = normalizePath(pathValue, true);
            return directories
                .filter(function (dirPath) {
                    if (!dirPath) {
                        return false;
                    }
                    return getParentPath(dirPath) === normalized;
                })
                .sort(function (a, b) {
                    return a.localeCompare(b);
                });
        }

        function renderDirectoryOptions() {
            if (!directoryOptions) {
                return;
            }
            directoryOptions.innerHTML = "";
            directories
                .slice()
                .sort(function (a, b) {
                    return String(a).localeCompare(String(b));
                })
                .forEach(function (pathValue) {
                    const option = document.createElement("option");
                    option.value = pathValue;
                    directoryOptions.appendChild(option);
                });
        }

        function updateSelectedDir(pathValue) {
            const normalized = normalizePath(pathValue, true);
            state.selectedDir = normalized;
            if (directoryInput) {
                directoryInput.value = normalized;
            }
        }

        function renderBreadcrumb() {
            if (!saveBreadcrumb) {
                return;
            }
            saveBreadcrumb.innerHTML = "";
            const fragment = document.createDocumentFragment();

            function addCrumb(label, pathValue, isCurrent) {
                const crumbButton = document.createElement("button");
                crumbButton.type = "button";
                crumbButton.className = "docs-save-crumb-btn";
                if (isCurrent) {
                    crumbButton.classList.add("is-current");
                }
                crumbButton.textContent = label;
                crumbButton.addEventListener("click", function () {
                    state.browserDir = pathValue;
                    updateSelectedDir(pathValue);
                    renderBrowser();
                });
                fragment.appendChild(crumbButton);
            }

            const currentPath = normalizePath(state.browserDir, true);
            addCrumb("/docs", "", !currentPath);

            if (currentPath) {
                const parts = currentPath.split("/");
                const accumulated = [];
                parts.forEach(function (part) {
                    const separator = document.createElement("span");
                    separator.className = "docs-save-crumb-sep";
                    separator.textContent = "/";
                    fragment.appendChild(separator);

                    accumulated.push(part);
                    const dirPath = accumulated.join("/");
                    addCrumb(part, dirPath, dirPath === currentPath);
                });
            }

            saveBreadcrumb.appendChild(fragment);
        }

        function renderQuickList() {
            if (!saveQuickList) {
                return;
            }
            saveQuickList.innerHTML = "";

            const quickPaths = [""].concat(getChildDirectories(""));
            quickPaths.forEach(function (pathValue) {
                const item = document.createElement("li");
                const button = document.createElement("button");
                button.type = "button";
                button.className = "docs-save-side-row";
                if (pathValue === state.browserDir) {
                    button.classList.add("is-active");
                }
                button.textContent = pathValue ? pathValue.split("/").slice(-1)[0] : "docs 루트";
                if (!pathValue) {
                    button.textContent = t("js_docs_root_label", "docs 루트");
                }
                button.addEventListener("click", function () {
                    state.browserDir = pathValue;
                    updateSelectedDir(pathValue);
                    renderBrowser();
                });
                item.appendChild(button);
                saveQuickList.appendChild(item);
            });
        }

        function renderFolderList() {
            if (!saveFolderList) {
                return;
            }
            saveFolderList.innerHTML = "";

            const childDirs = getChildDirectories(state.browserDir);
            if (childDirs.length === 0) {
                const emptyItem = document.createElement("li");
                emptyItem.className = "docs-save-folder-empty";
                emptyItem.textContent = t("js_no_child_folders", "하위 폴더가 없습니다.");
                saveFolderList.appendChild(emptyItem);
                return;
            }

            childDirs.forEach(function (dirPath) {
                const item = document.createElement("li");
                const row = document.createElement("button");
                row.type = "button";
                row.className = "docs-save-folder-row";
                if (dirPath === state.selectedDir) {
                    row.classList.add("is-selected");
                }

                const icon = document.createElement("span");
                icon.className = "docs-save-folder-icon";
                icon.setAttribute("aria-hidden", "true");

                const name = document.createElement("span");
                name.className = "docs-save-folder-name";
                name.textContent = dirPath.split("/").slice(-1)[0];

                row.appendChild(icon);
                row.appendChild(name);

                row.addEventListener("click", function () {
                    updateSelectedDir(dirPath);
                    renderFolderList();
                });

                row.addEventListener("dblclick", function () {
                    state.browserDir = dirPath;
                    updateSelectedDir(dirPath);
                    renderBrowser();
                });

                item.appendChild(row);
                saveFolderList.appendChild(item);
            });
        }

        function renderBrowser() {
            if (!saveModal || saveModal.hidden) {
                return;
            }
            renderBreadcrumb();
            renderQuickList();
            renderFolderList();
            if (saveUpButton) {
                saveUpButton.disabled = !state.browserDir;
            }
        }

        function getDocsPathLabel(pathValue) {
            const normalized = normalizePath(pathValue, true);
            return normalized ? "/docs/" + normalized : "/docs";
        }

        function getFolderCreateBasePath() {
            try {
                return normalizeDirectoryInput();
            } catch (error) {
                return state.selectedDir || state.browserDir || "";
            }
        }

        function setFolderModalOpen(opened) {
            if (!folderModal) {
                return;
            }
            folderModal.hidden = !opened;
            if (opened) {
                const basePath = getFolderCreateBasePath();
                if (folderTargetPath) {
                    folderTargetPath.textContent = getDocsPathLabel(basePath);
                }
                if (folderNameInput) {
                    folderNameInput.value = "";
                    folderNameInput.focus();
                    folderNameInput.select();
                }
            }
        }

        function syncModalBodyState() {
            syncDocsModalBodyState();
        }

        function setMarkdownHelpModalOpen(opened) {
            if (!markdownHelpModal) {
                return;
            }
            markdownHelpModal.hidden = !opened;
            syncModalBodyState();
        }

        function setMarkdownPreviewModalOpen(opened) {
            if (!markdownPreviewModal) {
                return;
            }
            markdownPreviewModal.hidden = !opened;
            syncModalBodyState();
        }

        async function openMarkdownPreviewModal() {
            if (!markdownPreviewModal || !markdownPreviewContent) {
                return;
            }

            markdownPreviewContent.innerHTML = "<p>" + t("markdown_preview_loading", "Loading preview...") + "</p>";
            setMarkdownPreviewModalOpen(true);

            if (!previewApiUrl) {
                markdownPreviewContent.innerHTML = "<p>" + t("js_error_request_failed", "요청 처리 중 오류가 발생했습니다.") + "</p>";
                return;
            }

            try {
                const data = await requestJson(
                    previewApiUrl,
                    buildPostOptions({
                        original_path: originalPath,
                        content: contentInput ? contentInput.value : "",
                    })
                );
                markdownPreviewContent.innerHTML = data && typeof data.html === "string" ? data.html : "";
            } catch (error) {
                markdownPreviewContent.innerHTML =
                    "<p>" +
                    (error && error.message ? error.message : t("js_error_processing_failed", "처리 중 오류가 발생했습니다.")) +
                    "</p>";
            }
        }

        function setSaveModalOpen(opened) {
            if (!saveModal) {
                return;
            }
            saveModal.hidden = !opened;
            syncModalBodyState();

            if (!opened) {
                setFolderModalOpen(false);
                return;
            }

            let initialDir = "";
            try {
                initialDir = normalizeDirectoryInput();
            } catch (error) {
                initialDir = "";
            }
            if (!hasDirectory(initialDir)) {
                initialDir = "";
            }
            state.browserDir = initialDir;
            updateSelectedDir(initialDir);
            renderBrowser();

            if (directoryInput) {
                directoryInput.focus();
                directoryInput.select();
            }
        }

        async function submitSave() {
            const filename = (filenameInput ? filenameInput.value : "").trim();
            if (!filename) {
                window.alert(t("js_filename_required", "파일명을 입력해주세요."));
                return;
            }

            let finalFilename = filename;
            let targetDir = "";
            if (isPublicWriteDirectSave && originalPath) {
                targetDir = getParentPath(originalPath);
                finalFilename = getPathFileStem(originalPath) || filename;
            } else {
                try {
                    targetDir = normalizeDirectoryInput();
                } catch (error) {
                    alertError(error);
                    return;
                }
            }

            if (!isPublicWriteDirectSave && !hasDirectory(targetDir)) {
                window.alert(
                    t("js_select_or_create_folder", "저장 위치를 선택하거나 폴더를 먼저 생성해주세요.")
                );
                return;
            }

            upsertDirectory(targetDir);
            if (directoryInput) {
                directoryInput.value = targetDir;
            }
            if (filenameInput) {
                filenameInput.value = finalFilename;
            }

            try {
                const payload = {
                    original_path: originalPath,
                    target_dir: targetDir,
                    filename: finalFilename,
                    content: contentInput ? contentInput.value : ""
                };
                const data = await requestJson(saveApiUrl, buildPostOptions(payload));
                if (data && data.slug_path) {
                    window.location.href = buildViewUrl(docsBaseUrl, data.slug_path);
                    return;
                }
                window.location.href = docsBaseUrl;
            } catch (error) {
                alertError(error);
            }
        }

        rawDirectories.forEach(function (pathValue) {
            upsertDirectory(pathValue);
        });
        upsertDirectory("");
        if (directoryInput) {
            upsertDirectory(directoryInput.value || "");
        }
        renderDirectoryOptions();

        async function createFolderFromModal() {
            const folderName = folderNameInput ? folderNameInput.value : "";
            const trimmed = String(folderName || "").trim();
            if (!trimmed) {
                window.alert(t("js_folder_name_required", "폴더 이름을 입력해주세요."));
                return;
            }

            const parentDir = getFolderCreateBasePath();
            if (!hasDirectory(parentDir)) {
                window.alert(
                    t("js_invalid_selected_path", "선택 경로가 유효하지 않습니다. 목록에서 폴더를 선택해주세요.")
                );
                return;
            }

            try {
                const data = await requestJson(
                    mkdirApiUrl,
                    buildPostOptions({
                        parent_dir: parentDir,
                        folder_name: trimmed
                    })
                );
                const createdPath = upsertDirectory(data.path || "");
                renderDirectoryOptions();
                updateSelectedDir(createdPath);
                state.browserDir = parentDir;
                renderBrowser();
                setFolderModalOpen(false);
            } catch (error) {
                alertError(error);
            }
        }

        if (createFolderButton) {
            createFolderButton.addEventListener("click", function () {
                setFolderModalOpen(true);
            });
        }

        if (saveButton) {
            saveButton.addEventListener("click", function () {
                if (isPublicWriteDirectSave) {
                    submitSave();
                    return;
                }
                if (saveModal) {
                    setSaveModalOpen(true);
                    return;
                }
                submitSave();
            });
        }

        if (markdownHelpButton) {
            markdownHelpButton.addEventListener("click", function () {
                setMarkdownHelpModalOpen(true);
            });
            markdownHelpButton.addEventListener("mouseup", function (event) {
                if (event.currentTarget && typeof event.currentTarget.blur === "function") {
                    event.currentTarget.blur();
                }
            });
        }

        if (markdownPreviewButton) {
            markdownPreviewButton.addEventListener("click", function () {
                openMarkdownPreviewModal();
            });
            markdownPreviewButton.addEventListener("mouseup", function (event) {
                if (event.currentTarget && typeof event.currentTarget.blur === "function") {
                    event.currentTarget.blur();
                }
            });
        }

        markdownSnippetButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                insertMarkdownSnippet(button.getAttribute("data-md-snippet") || "");
                closeMarkdownSnippetMenu();
            });
        });

        if (contentInput && markdownSnippetMenu) {
            contentInput.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                openMarkdownSnippetMenu(event.clientX, event.clientY);
            });
        }

        document.addEventListener("click", function (event) {
            if (!markdownSnippetMenu || markdownSnippetMenu.hidden) {
                return;
            }
            if (event.target instanceof Element && markdownSnippetMenu.contains(event.target)) {
                return;
            }
            closeMarkdownSnippetMenu();
        });

        if (markdownHelpBackdrop) {
            markdownHelpBackdrop.addEventListener("click", function () {
                setMarkdownHelpModalOpen(false);
            });
        }

        if (markdownPreviewBackdrop) {
            markdownPreviewBackdrop.addEventListener("click", function () {
                setMarkdownPreviewModalOpen(false);
            });
        }

        if (saveModalBackdrop) {
            saveModalBackdrop.addEventListener("click", function () {
                setSaveModalOpen(false);
            });
        }

        if (saveCloseButton) {
            saveCloseButton.addEventListener("click", function () {
                setSaveModalOpen(false);
            });
        }

        if (saveCancelButton) {
            saveCancelButton.addEventListener("click", function () {
                setSaveModalOpen(false);
            });
        }

        if (saveConfirmButton) {
            saveConfirmButton.addEventListener("click", function () {
                submitSave();
            });
        }

        if (folderModalBackdrop) {
            folderModalBackdrop.addEventListener("click", function () {
                setFolderModalOpen(false);
            });
        }

        if (folderCancelButton) {
            folderCancelButton.addEventListener("click", function () {
                setFolderModalOpen(false);
            });
        }

        if (folderCreateButton) {
            folderCreateButton.addEventListener("click", function () {
                createFolderFromModal();
            });
        }

        if (saveUpButton) {
            saveUpButton.addEventListener("click", function () {
                const parentPath = getParentPath(state.browserDir);
                state.browserDir = parentPath;
                updateSelectedDir(parentPath);
                renderBrowser();
            });
        }

        if (directoryInput) {
            directoryInput.addEventListener("change", function () {
                try {
                    const normalized = normalizeDirectoryInput();
                    updateSelectedDir(normalized);
                    if (hasDirectory(normalized)) {
                        state.browserDir = normalized;
                    }
                    renderBrowser();
                } catch (error) {
                    alertError(error);
                }
            });

            directoryInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    try {
                        const normalized = normalizeDirectoryInput();
                        updateSelectedDir(normalized);
                        if (hasDirectory(normalized)) {
                            state.browserDir = normalized;
                        }
                        renderBrowser();
                    } catch (error) {
                        alertError(error);
                    }
                }
            });
        }

        if (folderNameInput) {
            folderNameInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    createFolderFromModal();
                }
            });
        }

        document.addEventListener("keydown", function (event) {
            if (event.key !== "Escape") {
                return;
            }
            if (markdownSnippetMenu && !markdownSnippetMenu.hidden) {
                closeMarkdownSnippetMenu();
                return;
            }
            if (markdownPreviewModal && !markdownPreviewModal.hidden) {
                setMarkdownPreviewModalOpen(false);
                return;
            }
            if (markdownHelpModal && !markdownHelpModal.hidden) {
                setMarkdownHelpModalOpen(false);
                return;
            }
            if (folderModal && !folderModal.hidden) {
                setFolderModalOpen(false);
                return;
            }
            if (saveModal && !saveModal.hidden) {
                setSaveModalOpen(false);
                return;
            }
        });

        window.addEventListener("resize", scheduleContentInputAutoHeight, { passive: true });
        window.addEventListener("orientationchange", scheduleContentInputAutoHeight, { passive: true });
        window.addEventListener("scroll", closeMarkdownSnippetMenu, { passive: true });
        window.addEventListener("resize", closeMarkdownSnippetMenu, { passive: true });

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", scheduleContentInputAutoHeight, { passive: true });
            window.visualViewport.addEventListener("scroll", scheduleContentInputAutoHeight, { passive: true });
        }

        if (window.ResizeObserver) {
            const autoHeightObserver = new ResizeObserver(scheduleContentInputAutoHeight);
            autoHeightObserver.observe(root);
            const toolbarWrap = document.querySelector(".docs-toolbar-wrap");
            if (toolbarWrap) {
                autoHeightObserver.observe(toolbarWrap);
            }
        }

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleContentInputAutoHeight).catch(function () {});
        }

        scheduleContentInputAutoHeight();
    }

    initializeDocsAuthInteraction();
    initializeDocsPageHelpModal();
    initializeDocsToolbarAutoCollapse();

    if (pageType === "list") {
        initializeListPage();
        return;
    }

    if (pageType === "view") {
        initializeViewPage();
        return;
    }

    if (pageType === "write") {
        initializeWritePage();
    }
})();
