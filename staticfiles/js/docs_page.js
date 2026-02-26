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
            throw new Error("경로를 입력해주세요.");
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
            throw new Error("상위 경로(..)는 사용할 수 없습니다.");
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
            const message = payload && payload.error ? payload.error : "요청 처리 중 오류가 발생했습니다.";
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

    function alertError(error) {
        window.alert(error && error.message ? error.message : "처리 중 오류가 발생했습니다.");
    }

    function initializeListPage() {
        const docsBaseUrl = root.dataset.docsBaseUrl || "/docs";
        const listApiUrl = root.dataset.listApiUrl;
        const renameApiUrl = root.dataset.renameApiUrl;
        const deleteApiUrl = root.dataset.deleteApiUrl;
        const writeUrl = root.dataset.writeUrl || "/docs/write";
        const listContainer = document.getElementById("docs-list");
        const contextMenu = document.getElementById("docs-context-menu");
        const renameModal = document.getElementById("docs-rename-modal");
        const renameModalBackdrop = document.getElementById("docs-rename-modal-backdrop");
        const renameInput = document.getElementById("docs-rename-input");
        const renameTarget = document.getElementById("docs-rename-target");
        const renameCancelButton = document.getElementById("docs-rename-cancel-btn");
        const renameConfirmButton = document.getElementById("docs-rename-confirm-btn");

        const currentDir = normalizePath(root.dataset.currentDir || "", true);
        const initialEntries = getJsonScriptData("docs-initial-entries", []);

        const state = {
            selectedPath: "",
            contextTarget: null,
            renameTargetEntry: null,
            expandedFolders: new Set(),
            directoryCache: new Map()
        };

        state.directoryCache.set(currentDir, initialEntries);

        function closeContextMenu() {
            if (!contextMenu) {
                return;
            }
            contextMenu.hidden = true;
            state.contextTarget = null;
        }

        function openContextMenuAt(entry, x, y) {
            if (!contextMenu) {
                return;
            }
            state.contextTarget = entry;
            contextMenu.hidden = false;
            contextMenu.style.left = String(x) + "px";
            contextMenu.style.top = String(y) + "px";
        }

        function selectEntry(entryPath) {
            state.selectedPath = entryPath || "";
            renderList();
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

        function setRenameModalOpen(opened, entry) {
            if (!renameModal) {
                return;
            }
            renameModal.hidden = !opened;
            document.body.classList.toggle("docs-modal-open", opened);
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

        function renameEntry(entry) {
            if (!entry) {
                return;
            }
            setRenameModalOpen(true, entry);
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

        async function deleteEntry(entry) {
            if (!entry) {
                return;
            }
            const confirmed = window.confirm("정말 삭제할까요?\n" + entry.path);
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

        function addEntryNode(entry, depth, fragment) {
            const item = document.createElement("li");
            item.className = "docs-item";

            const row = document.createElement("button");
            row.type = "button";
            row.className = "docs-item-row";
            if (state.selectedPath === entry.path) {
                row.classList.add("is-selected");
            }

            const depthMarker = document.createElement("span");
            depthMarker.className = "docs-item-depth";
            depthMarker.style.setProperty("--docs-item-depth", String(depth));

            const typeMarker = document.createElement("span");
            typeMarker.className = "docs-item-type-icon " + (entry.type === "dir" ? "is-dir" : "is-file");
            typeMarker.setAttribute("aria-hidden", "true");

            const name = document.createElement("span");
            name.className = "docs-item-name";
            name.textContent = entry.name;

            row.appendChild(depthMarker);
            row.appendChild(typeMarker);
            row.appendChild(name);

            row.addEventListener("click", function (event) {
                event.preventDefault();
                closeContextMenu();
                if (state.selectedPath !== entry.path) {
                    selectEntry(entry.path);
                }
            });

            row.addEventListener("dblclick", function (event) {
                event.preventDefault();
                if (entry.type === "dir") {
                    toggleFolderExpansion(entry).catch(alertError);
                    return;
                }
                openEntry(entry);
            });

            row.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                selectEntry(entry.path);
                openContextMenuAt(entry, event.clientX, event.clientY);
            });

            item.appendChild(row);
            fragment.appendChild(item);

            if (entry.type === "dir" && state.expandedFolders.has(entry.path)) {
                const childEntries = getCachedEntries(entry.path);
                childEntries.forEach(function (child) {
                    addEntryNode(child, depth + 1, fragment);
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
            if (entries.length === 0) {
                const emptyItem = document.createElement("li");
                emptyItem.className = "docs-item";
                const emptyRow = document.createElement("div");
                emptyRow.className = "docs-item-row is-empty";
                emptyRow.textContent = "문서가 없습니다.";
                emptyItem.appendChild(emptyRow);
                fragment.appendChild(emptyItem);
                listContainer.appendChild(fragment);
                return;
            }
            entries.forEach(function (entry) {
                addEntryNode(entry, 0, fragment);
            });
            listContainer.appendChild(fragment);
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
                if (action === "edit") {
                    editEntry(entry);
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
                if (renameModal && !renameModal.hidden) {
                    setRenameModalOpen(false);
                    return;
                }
                closeContextMenu();
            }
        });

        window.addEventListener("scroll", closeContextMenu, { passive: true });
        window.addEventListener("resize", closeContextMenu, { passive: true });

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
            const confirmed = window.confirm("이 문서를 삭제할까요?");
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
        const mkdirApiUrl = root.dataset.mkdirApiUrl;
        const originalPath = root.dataset.originalPath || "";

        const directoryInput = document.getElementById("docs-dir-input");
        const filenameInput = document.getElementById("docs-filename-input");
        const contentInput = document.getElementById("docs-content-input");
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

        const rawDirectories = getJsonScriptData("docs-directory-data", []);
        const directories = [];
        const directorySet = new Set();
        const state = {
            browserDir: "",
            selectedDir: "",
        };

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
                emptyItem.textContent = "하위 폴더가 없습니다.";
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

        function setSaveModalOpen(opened) {
            if (!saveModal) {
                return;
            }
            saveModal.hidden = !opened;
            document.body.classList.toggle("docs-modal-open", opened);

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
                window.alert("파일명을 입력해주세요.");
                return;
            }

            let targetDir = "";
            try {
                targetDir = normalizeDirectoryInput();
            } catch (error) {
                alertError(error);
                return;
            }

            if (!hasDirectory(targetDir)) {
                window.alert("저장 위치를 선택하거나 폴더를 먼저 생성해주세요.");
                return;
            }

            try {
                const payload = {
                    original_path: originalPath,
                    target_dir: targetDir,
                    filename: filename,
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
                window.alert("폴더 이름을 입력해주세요.");
                return;
            }

            const parentDir = getFolderCreateBasePath();
            if (!hasDirectory(parentDir)) {
                window.alert("선택 경로가 유효하지 않습니다. 목록에서 폴더를 선택해주세요.");
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
                if (saveModal) {
                    setSaveModalOpen(true);
                    return;
                }
                submitSave();
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
            if (folderModal && !folderModal.hidden) {
                setFolderModalOpen(false);
                return;
            }
            if (saveModal && !saveModal.hidden) {
                setSaveModalOpen(false);
            }
        });
    }

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
