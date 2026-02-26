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

        const currentDir = normalizePath(root.dataset.currentDir || "", true);
        const initialEntries = getJsonScriptData("docs-initial-entries", []);

        const state = {
            selectedPath: "",
            renameTimerId: null,
            contextTarget: null,
            expandedFolders: new Set(),
            directoryCache: new Map()
        };

        state.directoryCache.set(currentDir, initialEntries);

        function clearRenameTimer() {
            if (state.renameTimerId !== null) {
                window.clearTimeout(state.renameTimerId);
                state.renameTimerId = null;
            }
        }

        function closeContextMenu() {
            if (!contextMenu) {
                return;
            }
            contextMenu.hidden = true;
            state.contextTarget = null;
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

        async function renameEntry(entry) {
            if (!entry) {
                return;
            }
            const currentName = entry.type === "file" && entry.name.toLowerCase().endsWith(".md")
                ? entry.name.slice(0, -3)
                : entry.name;
            const nextName = window.prompt("새 이름", currentName);
            if (nextName === null) {
                return;
            }

            const trimmed = nextName.trim();
            if (!trimmed || trimmed === currentName) {
                return;
            }

            await requestJson(renameApiUrl, buildPostOptions({
                path: entry.path,
                new_name: trimmed
            }));
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
            depthMarker.style.marginLeft = String(depth * 16) + "px";

            const typeMarker = document.createElement("span");
            typeMarker.className = "docs-item-type";
            typeMarker.textContent = entry.type === "dir" ? "DIR" : "MD";

            const name = document.createElement("span");
            name.className = "docs-item-name";
            name.textContent = entry.name;

            row.appendChild(depthMarker);
            row.appendChild(typeMarker);
            row.appendChild(name);

            row.addEventListener("click", function (event) {
                event.preventDefault();
                closeContextMenu();

                if (state.selectedPath === entry.path) {
                    clearRenameTimer();
                    state.renameTimerId = window.setTimeout(function () {
                        renameEntry(entry).catch(alertError);
                    }, 220);
                } else {
                    clearRenameTimer();
                    selectEntry(entry.path);
                }
            });

            row.addEventListener("dblclick", function (event) {
                event.preventDefault();
                clearRenameTimer();
                if (entry.type === "dir") {
                    toggleFolderExpansion(entry).catch(alertError);
                    return;
                }
                openEntry(entry);
            });

            row.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                clearRenameTimer();
                selectEntry(entry.path);
                if (!contextMenu) {
                    return;
                }
                state.contextTarget = entry;
                contextMenu.hidden = false;
                contextMenu.style.left = String(event.clientX) + "px";
                contextMenu.style.top = String(event.clientY) + "px";
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
                emptyRow.className = "docs-item-row";
                emptyRow.textContent = "문서가 없습니다.";
                emptyRow.style.cursor = "default";
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
                    renameEntry(entry).catch(alertError);
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
                clearRenameTimer();
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
        const directoryOptions = document.getElementById("docs-directory-options");

        const directories = getJsonScriptData("docs-directory-data", []);

        function normalizeDirectoryInput() {
            return normalizePath(directoryInput ? directoryInput.value : "", true);
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

        function addDirectory(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!directories.includes(normalized)) {
                directories.push(normalized);
            }
            renderDirectoryOptions();
        }

        renderDirectoryOptions();

        if (createFolderButton) {
            createFolderButton.addEventListener("click", async function () {
                const folderName = window.prompt("새 폴더 이름");
                if (folderName === null) {
                    return;
                }
                const trimmed = folderName.trim();
                if (!trimmed) {
                    return;
                }

                try {
                    const data = await requestJson(
                        mkdirApiUrl,
                        buildPostOptions({
                            parent_dir: normalizeDirectoryInput(),
                            folder_name: trimmed
                        })
                    );
                    addDirectory(data.path || "");
                    if (directoryInput) {
                        directoryInput.value = data.path || "";
                    }
                } catch (error) {
                    alertError(error);
                }
            });
        }

        if (saveButton) {
            saveButton.addEventListener("click", async function () {
                const filename = (filenameInput ? filenameInput.value : "").trim();
                if (!filename) {
                    window.alert("파일명을 입력해주세요.");
                    return;
                }

                try {
                    const payload = {
                        original_path: originalPath,
                        target_dir: normalizeDirectoryInput(),
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
            });
        }
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
