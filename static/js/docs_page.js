(function () {
    "use strict";

    // 문서 페이지 루트 요소 확인
    const root = document.querySelector("[data-ide-page]");
    if (!root) {
        return;
    }

    const pageType = root.dataset.idePage;

    // CSRF 토큰을 가져오는 함수
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta && meta.content) {
            return meta.content;
        }
        return "";
    }

    // 경로를 정규화하는 함수
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

    // 경로 세그먼트를 인코딩하는 함수
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

    // 목록 URL을 구축하는 함수
    function buildListUrl(baseUrl, relativePath) {
        const encoded = encodePathSegments(relativePath);
        if (!encoded) {
            return baseUrl;
        }
        return baseUrl + "/" + encoded + "/list";
    }

    // 보기 URL을 구축하는 함수
    function buildViewUrl(baseUrl, slugPath) {
        const encoded = encodePathSegments(slugPath);
        if (!encoded) {
            return baseUrl;
        }
        return baseUrl + "/" + encoded;
    }

    // 쓰기 URL을 구축하는 함수
    function buildWriteUrl(writeBaseUrl, params) {
        const search = new URLSearchParams(params || {});
        const query = search.toString();
        return query ? writeBaseUrl + "?" + query : writeBaseUrl;
    }

    // JSON 요청을 보내는 비동기 함수
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

    // POST 요청 옵션을 구축하는 함수
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

    // JSON 스크립트 데이터를 가져오는 함수
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

    const i18n = getJsonScriptData("ide-i18n", {});

    // 다국어 텍스트를 가져오는 함수
    function t(key, fallbackValue) {
        if (Object.prototype.hasOwnProperty.call(i18n, key) && typeof i18n[key] === "string") {
            return i18n[key];
        }
        return fallbackValue;
    }

    // 템플릿을 포맷팅하는 함수
    function formatTemplate(template, values) {
        return String(template || "").replace(/\{(\w+)\}/g, function (_, token) {
            if (values && Object.prototype.hasOwnProperty.call(values, token)) {
                return String(values[token]);
            }
            return "";
        });
    }

    // 에러를 알림창으로 표시하는 함수
    function alertError(error) {
        window.alert(
            error && error.message
                ? error.message
                : t("js_error_processing_failed", "처리 중 오류가 발생했습니다.")
        );
    }

    // 문서 렌더링 콘텐츠 모드 클래스를 적용하는 함수
    function applyDocsRenderedContentModeClass(targetElement, renderMode, renderClass) {
        if (!targetElement || !(targetElement instanceof Element)) {
            return;
        }
        targetElement.classList.remove("ide-markdown", "ide-plain-text", "ide-json", "ide-html", "ide-css", "ide-js", "ide-py");
        if (renderClass === "ide-json" || renderClass === "ide-html" || renderClass === "ide-css" || renderClass === "ide-js" || renderClass === "ide-py") {
            targetElement.classList.add(renderClass);
            return;
        }
        if (renderMode === "markdown") {
            targetElement.classList.add("ide-markdown");
            return;
        }
        targetElement.classList.add("ide-plain-text");
    }

    // HTML을 이스케이프하는 함수
    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function calculateCursorPosition(textarea, position) {
        const text = textarea.value;
        const textBeforeCursor = text.substring(0, position);
        const lines = textBeforeCursor.split("\n");
        const currentLine = lines.length - 1;
        const currentColumn = lines[currentLine].length;
        const textareaStyles = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(textareaStyles.lineHeight) || 20;
        const paddingLeft = parseFloat(textareaStyles.paddingLeft) || 0;
        const paddingTop = parseFloat(textareaStyles.paddingTop) || 0;
        const borderLeft = parseFloat(textareaStyles.borderLeftWidth) || 0;
        const borderTop = parseFloat(textareaStyles.borderTopWidth) || 0;
        const scrollLeft = textarea.scrollLeft;
        const scrollTop = textarea.scrollTop;

        const textareaRect = textarea.getBoundingClientRect();

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        context.font = textareaStyles.font;

        const textLine = lines[currentLine] || "";
        const lineWidth = context.measureText(textLine.substring(0, currentColumn)).width;

        const left = textareaRect.left + paddingLeft + borderLeft + lineWidth - scrollLeft;
        const top = textareaRect.top + paddingTop + borderTop + (currentLine * lineHeight) - scrollTop;

        return {
            left: left,
            top: top,
            lineHeight: lineHeight
        };
    }

    if (!window.__docsCalculateCursorPosition) {
        window.__docsCalculateCursorPosition = calculateCursorPosition;
    }

    if (!window.__docsEditorCompletionMap) {
        window.__docsEditorCompletionMap = {
            ".md": [
                { trigger: "head", insertText: "## ", label: "## Heading", priority: 100 },
                { trigger: "head1", insertText: "# ", label: "# Heading 1", priority: 99 },
                { trigger: "head3", insertText: "### ", label: "### Heading 3", priority: 97 },
                { trigger: "bold", insertText: "**text**", label: "**bold**", cursorBack: 6, priority: 93 },
                { trigger: "italic", insertText: "*text*", label: "*italic*", cursorBack: 5, priority: 92 },
                { trigger: "link", insertText: "[text](url)", label: "[text](url)", cursorBack: 4, priority: 94 },
                { trigger: "code", insertText: "```\n\n```", label: "code block", cursorBack: 4, priority: 91 },
            ],
            ".py": [
                { trigger: "def", insertText: "def function_name():\n    pass", label: "def ...", cursorBack: 8, priority: 98 },
                { trigger: "class", insertText: "class ClassName:\n    def __init__(self):\n        pass", label: "class ...", cursorBack: 39, priority: 97 },
                { trigger: "ifmain", insertText: "if __name__ == \"__main__\":\n    main()", label: "if __name__...", cursorBack: 6 },
                { trigger: "import", insertText: "import ", label: "import ", priority: 100 },
                { trigger: "from", insertText: "from ", label: "from ", priority: 99 },
                { trigger: "return", insertText: "return ", label: "return ", priority: 96 },
                { trigger: "string", insertText: "str()", label: "str()", cursorBack: 1, priority: 88 },
                { trigger: "str", insertText: "str()", label: "str()", cursorBack: 1, priority: 88 },
                { trigger: "int", insertText: "int()", label: "int()", cursorBack: 1, priority: 89 },
                { trigger: "float", insertText: "float()", label: "float()", cursorBack: 1 },
                { trigger: "bool", insertText: "bool()", label: "bool()", cursorBack: 1 },
                { trigger: "list", insertText: "list()", label: "list()", cursorBack: 1, priority: 87 },
                { trigger: "dict", insertText: "dict()", label: "dict()", cursorBack: 1, priority: 86 },
                { trigger: "set", insertText: "set()", label: "set()", cursorBack: 1 },
                { trigger: "tuple", insertText: "tuple()", label: "tuple()", cursorBack: 1 },
                { trigger: "if", insertText: "if :\n    ", label: "if :", cursorBack: 1, priority: 95 },
                { trigger: "elif", insertText: "elif :\n    ", label: "elif :", cursorBack: 1 },
                { trigger: "else", insertText: "else:\n    ", label: "else:" },
                { trigger: "for", insertText: "for  in :\n    ", label: "for ... in ...", cursorBack: 6, priority: 94 },
                { trigger: "while", insertText: "while :\n    ", label: "while :", cursorBack: 1, priority: 93 },
                { trigger: "try", insertText: "try:\n    \nexcept Exception as e:\n    ", label: "try/except", cursorBack: 14, priority: 92 },
                { trigger: "with", insertText: "with  as :\n    ", label: "with ... as ...", cursorBack: 6, priority: 91 },
                { trigger: "pass", insertText: "pass", label: "pass" },
                { trigger: "break", insertText: "break", label: "break" },
                { trigger: "continue", insertText: "continue", label: "continue" },
                { trigger: "print", insertText: "print()", label: "print()", cursorBack: 1, priority: 90 },
                { trigger: "len", insertText: "len()", label: "len()", cursorBack: 1, priority: 85 },
                { trigger: "range", insertText: "range()", label: "range()", cursorBack: 1, priority: 84 },
                { trigger: "isinstance", insertText: "isinstance()", label: "isinstance()", cursorBack: 1 },
            ],
            ".js": [
                { trigger: "function", insertText: "function functionName(params) {\n    \n}", label: "function ...", cursorBack: 3, priority: 98 },
                { trigger: "if", insertText: "if (condition) {\n    \n}", label: "if (...) { }", cursorBack: 3, priority: 97 },
            ],
            ".css": [
                { trigger: "rule", insertText: ".selector {\n    property: value;\n}", label: ".selector { }", cursorBack: 23, priority: 100 },
                { trigger: "media", insertText: "@media (max-width: 768px) {\n    \n}", label: "@media ...", cursorBack: 3, priority: 89 },
                { trigger: "var", insertText: ":root {\n    --color-name: #000;\n}", label: ":root vars", cursorBack: 17 },
            ],
            ".json": [
                { trigger: "pair", insertText: "\"key\": \"value\"", label: "\"key\": \"value\"", cursorBack: 10, priority: 98 },
                { trigger: "object", insertText: "{\n  \"key\": \"value\"\n}", label: "{ ... }", cursorBack: 5, priority: 100 },
            ],
            ".html": [
                { trigger: "doctype", insertText: "<!doctype html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title></title>\n</head>\n<body>\n  \n</body>\n</html>", label: "HTML boilerplate", cursorBack: 92, priority: 95 },
                { trigger: "div", insertText: "<div class=\"\">\n  \n</div>", label: "<div>", cursorBack: 12, priority: 100 },
            ]
        };
    }

    function extractEditorCompletionToken(sourceText, cursorIndex) {
        const text = String(sourceText || "");
        const cursor = Math.max(0, Number(cursorIndex || 0));
        const prefix = text.slice(0, cursor);
        const match = prefix.match(/([A-Za-z0-9_][A-Za-z0-9_-]*)$/);
        if (!match || !match[1]) {
            return null;
        }
        const token = match[1];
        return {
            token: token,
            start: cursor - token.length,
            end: cursor,
        };
    }

    function findBestEditorCompletionItem(completionItems, tokenText) {
        const matches = findEditorCompletionItems(completionItems, tokenText, 1);
        return matches.length ? matches[0] : null;
    }

    function findEditorCompletionItems(completionItems, tokenText, limit) {
        const normalizedToken = String(tokenText || "").toLowerCase();
        if (!normalizedToken || !Array.isArray(completionItems) || completionItems.length === 0) {
            return [];
        }

        const candidates = [];
        for (let i = 0; i < completionItems.length; i += 1) {
            const item = completionItems[i] || {};
            const trigger = String(item.trigger || "").toLowerCase();
            if (!trigger || !trigger.startsWith(normalizedToken)) {
                continue;
            }
            candidates.push({
                item: item,
                trigger: trigger,
            });
        }

        if (candidates.length === 0) {
            return [];
        }

        candidates.sort(function (a, b) {
            const aExact = a.trigger === normalizedToken ? 1 : 0;
            const bExact = b.trigger === normalizedToken ? 1 : 0;
            if (aExact !== bExact) {
                return bExact - aExact;
            }
            const aPriority = Number((a.item && a.item.priority) || 0);
            const bPriority = Number((b.item && b.item.priority) || 0);
            if (aPriority !== bPriority) {
                return bPriority - aPriority;
            }
            if (a.trigger.length !== b.trigger.length) {
                return a.trigger.length - b.trigger.length;
            }
            return a.trigger.localeCompare(b.trigger);
        });

        const maxItems = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : candidates.length;
        return candidates.slice(0, maxItems).map(function (candidate) {
            return candidate.item;
        });
    }

    // JavaScript 코드를 하이라이팅하는 함수
    function highlightJavaScriptCode(source) {
        const placeholders = [];

        const putPlaceholder = function (tokenHtml) {
            const token = "@@DOCS_JS_TOKEN_" + String(placeholders.length) + "@@";
            placeholders.push(tokenHtml);
            return token;
        };

        const restorePlaceholders = function (text) {
            return text.replace(/@@DOCS_JS_TOKEN_(\d+)@@/g, function (_, indexText) {
                const index = Number(indexText);
                if (Number.isNaN(index) || index < 0 || index >= placeholders.length) {
                    return "";
                }
                return placeholders[index];
            });
        };

        let text = escapeHtml(source);

        text = text.replace(/\/\*[\s\S]*?\*\//g, function (match) {
            return putPlaceholder('<span class="ide-js-token-comment">' + match + "</span>");
        });
        text = text.replace(/(^|[^\S\r\n])\/\/[^\r\n]*/g, function (match) {
            return putPlaceholder('<span class="ide-js-token-comment">' + match + "</span>");
        });
        text = text.replace(/(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, function (match) {
            return putPlaceholder('<span class="ide-js-token-string">' + match + "</span>");
        });

        text = text.replace(/\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '<span class="ide-js-token-number">$1</span>');
        text = text.replace(
            /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|from|export|default|try|catch|finally|throw|async|await|typeof|instanceof|in|of|void|delete)\b/g,
            '<span class="ide-js-token-keyword">$1</span>'
        );
        text = text.replace(/\b(true|false|null|undefined|this|super)\b/g, '<span class="ide-js-token-literal">$1</span>');
        text = text.replace(
            /\b(Array|Object|String|Number|Boolean|Date|Math|JSON|Promise|Map|Set|RegExp|Error|console|window|document)\b/g,
            '<span class="ide-js-token-builtin">$1</span>'
        );
        text = text.replace(/(\b[a-zA-Z_$][\w$]*)(\s*\()/g, '<span class="ide-js-token-function">$1</span>$2');

        return restorePlaceholders(text);
    }

    // CSS 코드를 하이라이팅하는 함수
    function highlightCssCode(source) {
        const placeholders = [];

        const putPlaceholder = function (tokenHtml) {
            const token = "@@DOCS_CSS_TOKEN_" + String(placeholders.length) + "@@";
            placeholders.push(tokenHtml);
            return token;
        };

        const restorePlaceholders = function (text) {
            return text.replace(/@@DOCS_CSS_TOKEN_(\d+)@@/g, function (_, indexText) {
                const index = Number(indexText);
                if (Number.isNaN(index) || index < 0 || index >= placeholders.length) {
                    return "";
                }
                return placeholders[index];
            });
        };

        let text = escapeHtml(source);

        text = text.replace(/\/\*[\s\S]*?\*\//g, function (match) {
            return putPlaceholder('<span class="ide-css-token-comment">' + match + "</span>");
        });
        text = text.replace(/(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, function (match) {
            return putPlaceholder('<span class="ide-css-token-string">' + match + "</span>");
        });

        text = text.replace(/(^|[}\s])([#.:\w\-\[\]=\*>\+\~,]+)(\s*\{)/g, function (_, p1, selectorText, p3) {
            return p1 + '<span class="ide-css-token-selector">' + selectorText + "</span>" + p3;
        });
        text = text.replace(/(--[\w-]+)(\s*:)/g, '<span class="ide-css-token-variable">$1</span>$2');
        text = text.replace(/([a-z-]+)(\s*:)/gi, '<span class="ide-css-token-property">$1</span>$2');
        text = text.replace(/(:\s*)(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b[a-zA-Z]+\b)/g, '$1<span class="ide-css-token-value">$2</span>');
        text = text.replace(/(-?\d+(?:\.\d+)?)(px|em|rem|vh|vw|%|deg|s|ms)?\b/g, '<span class="ide-css-token-number">$1$2</span>');

        return restorePlaceholders(text);
    }

    // JSON 코드를 하이라이팅하는 함수
    function highlightJsonCode(source) {
        const placeholders = [];

        const putPlaceholder = function (tokenHtml) {
            const token = "@@DOCS_JSON_TOKEN_" + String(placeholders.length) + "@@";
            placeholders.push(tokenHtml);
            return token;
        };

        const restorePlaceholders = function (text) {
            return text.replace(/@@DOCS_JSON_TOKEN_(\d+)@@/g, function (_, indexText) {
                const index = Number(indexText);
                if (Number.isNaN(index) || index < 0 || index >= placeholders.length) {
                    return "";
                }
                return placeholders[index];
            });
        };

        let text = escapeHtml(source);

        text = text.replace(/"(?:\\.|[^"\\])*"(?=\s*:)/g, function (match) {
            return putPlaceholder('<span class="ide-json-token-key">' + match + "</span>");
        });
        text = text.replace(/"(?:\\.|[^"\\])*"/g, function (match) {
            return putPlaceholder('<span class="ide-json-token-string">' + match + "</span>");
        });
        text = text.replace(/\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '<span class="ide-json-token-number">$1</span>');
        text = text.replace(/\b(true|false|null)\b/g, '<span class="ide-json-token-literal">$1</span>');
        text = text.replace(/([{}\[\],:])/g, '<span class="ide-json-token-punctuation">$1</span>');

        return restorePlaceholders(text);
    }

    // Python 코드를 하이라이팅하는 함수
    function highlightPythonCode(source) {
        const placeholders = [];

        const putPlaceholder = function (tokenHtml) {
            const token = "@@DOCS_PY_TOKEN_" + String(placeholders.length) + "@@";
            placeholders.push(tokenHtml);
            return token;
        };

        const restorePlaceholders = function (text) {
            return text.replace(/@@DOCS_PY_TOKEN_(\d+)@@/g, function (_, indexText) {
                const index = Number(indexText);
                if (Number.isNaN(index) || index < 0 || index >= placeholders.length) {
                    return "";
                }
                return placeholders[index];
            });
        };

        let text = escapeHtml(source);

        text = text.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, function (match) {
            return putPlaceholder('<span class="ide-py-token-string">' + match + "</span>");
        });
        text = text.replace(/#[^\r\n]*/g, function (match) {
            return putPlaceholder('<span class="ide-py-token-comment">' + match + "</span>");
        });
        text = text.replace(/(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, function (match) {
            return putPlaceholder('<span class="ide-py-token-string">' + match + "</span>");
        });

        text = text.replace(/(^|\s)(@[a-zA-Z_][\w.]*)/g, '$1<span class="ide-py-token-decorator">$2</span>');
        text = text.replace(/\b(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/gi, '<span class="ide-py-token-number">$1</span>');
        text = text.replace(
            /\b(def|class|return|if|elif|else|for|while|break|continue|try|except|finally|raise|import|from|as|with|pass|yield|lambda|global|nonlocal|assert|del|in|is|and|or|not|async|await|match|case)\b/g,
            '<span class="ide-py-token-keyword">$1</span>'
        );
        text = text.replace(/\b(True|False|None)\b/g, '<span class="ide-py-token-literal">$1</span>');
        text = text.replace(
            /\b(len|range|str|int|float|dict|list|set|tuple|print|open|type|isinstance|enumerate|zip|map|filter|sum|min|max|abs|sorted|reversed|any|all)\b/g,
            '<span class="ide-py-token-builtin">$1</span>'
        );
        text = text.replace(/\b(def)\s+([a-zA-Z_][\w]*)/g, '$1 <span class="ide-py-token-function">$2</span>');
        text = text.replace(/\b(class)\s+([a-zA-Z_][\w]*)/g, '$1 <span class="ide-py-token-class">$2</span>');

        return restorePlaceholders(text);
    }

    // HTML 코드를 하이라이팅하는 함수
    function highlightHtmlCode(source) {
        const placeholders = [];

        const putPlaceholder = function (tokenHtml) {
            const token = "@@DOCS_HTML_TOKEN_" + String(placeholders.length) + "@@";
            placeholders.push(tokenHtml);
            return token;
        };

        const restorePlaceholders = function (text) {
            return text.replace(/@@DOCS_HTML_TOKEN_(\d+)@@/g, function (_, indexText) {
                const index = Number(indexText);
                if (Number.isNaN(index) || index < 0 || index >= placeholders.length) {
                    return "";
                }
                return placeholders[index];
            });
        };

        let text = escapeHtml(source);

        text = text.replace(/&lt;!--[\s\S]*?--&gt;/g, function (match) {
            return putPlaceholder('<span class="ide-html-token-comment">' + match + "</span>");
        });
        text = text.replace(/(["'])(?:\\[\s\S]|(?!\1)[^\\])*\1/g, function (match) {
            return putPlaceholder('<span class="ide-html-token-string">' + match + "</span>");
        });
        text = text.replace(
            /(&lt;\/?)([a-zA-Z][\w:-]*)([\s\S]*?)(&gt;)/g,
            function (_, open, tagName, attributes, close) {
                let highlightedAttributes = attributes;
                highlightedAttributes = highlightedAttributes.replace(
                    /(\s)([a-zA-Z_:][\w:.-]*)(\s*=\s*)/g,
                    '$1<span class="ide-html-token-attr">$2</span>$3'
                );
                return (
                    '<span class="ide-html-token-punctuation">' + open + "</span>" +
                    '<span class="ide-html-token-tag">' + tagName + "</span>" +
                    highlightedAttributes +
                    '<span class="ide-html-token-punctuation">' + close + "</span>"
                );
            }
        );

        return restorePlaceholders(text);
    }

    // 마크다운 소스 코드를 하이라이팅하는 함수
    function highlightMarkdownSourceCode(source) {
        const placeholders = [];

        const putPlaceholder = function (tokenHtml) {
            const token = "@@DOCS_MD_SRC_TOKEN_" + String(placeholders.length) + "@@";
            placeholders.push(tokenHtml);
            return token;
        };

        const restorePlaceholders = function (text) {
            return text.replace(/@@DOCS_MD_SRC_TOKEN_(\d+)@@/g, function (_, indexText) {
                const index = Number(indexText);
                if (Number.isNaN(index) || index < 0 || index >= placeholders.length) {
                    return "";
                }
                return placeholders[index];
            });
        };

        let text = escapeHtml(source);

        text = text.replace(/```[\s\S]*?```/g, function (match) {
            return putPlaceholder('<span class="ide-md-src-token-codeblock">' + match + "</span>");
        });
        text = text.replace(/`[^`\r\n]+`/g, function (match) {
            return putPlaceholder('<span class="ide-md-src-token-code">' + match + "</span>");
        });
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, url) {
            return (
                '<span class="ide-md-src-token-link">[' +
                label +
                "](" +
                url +
                ")</span>"
            );
        });
        text = text.replace(/^(\s{0,3}#{1,6}\s+)/gm, '<span class="ide-md-src-token-heading">$1</span>');
        text = text.replace(/^(\s{0,3}(?:[-*+]|\d+\.)\s+)/gm, '<span class="ide-md-src-token-list">$1</span>');
        text = text.replace(/^(\s{0,3}&gt;\s?)/gm, '<span class="ide-md-src-token-quote">$1</span>');
        text = text.replace(/^(\s{0,3}(?:[-*_])(?:\s*[-*_]){2,}\s*)$/gm, '<span class="ide-md-src-token-hr">$1</span>');
        text = text.replace(/(\*\*|__)(.+?)\1/g, '<span class="ide-md-src-token-strong">$1$2$1</span>');
        text = text.replace(/(\*|_)([^*_][^]*?)\1/g, '<span class="ide-md-src-token-em">$1$2$1</span>');

        return restorePlaceholders(text);
    }

    // 코드 언어 클래스를 감지하는 함수
    function detectCodeLanguageClass(codeNode) {
        if (!codeNode || !(codeNode instanceof Element)) {
            return "";
        }
        const classes = Array.from(codeNode.classList || []);
        const languageClass = classes.find(function (className) {
            return /^language-/i.test(className);
        });
        const languageValue = languageClass ? languageClass.replace(/^language-/i, "") : "";
        const normalized = String(languageValue || "").toLowerCase();
        if (normalized === "js" || normalized === "javascript" || normalized === "mjs" || normalized === "cjs") {
            return "ide-js";
        }
        if (normalized === "css") {
            return "ide-css";
        }
        if (normalized === "json" || normalized === "jsonc") {
            return "ide-json";
        }
        if (normalized === "py" || normalized === "python" || normalized === "py3" || normalized === "pyi") {
            return "ide-py";
        }
        return "";
    }

    // 문서 코드 하이라이팅을 적용하는 함수
    function applyDocsCodeHighlighting(targetElement, renderClass) {
        if (!targetElement || !(targetElement instanceof Element)) {
            return;
        }
        if (
            renderClass !== "ide-js" &&
            renderClass !== "ide-css" &&
            renderClass !== "ide-json" &&
            renderClass !== "ide-py" &&
            renderClass !== "ide-markdown"
        ) {
            return;
        }

        const codeNodes = targetElement.querySelectorAll("pre code");
        codeNodes.forEach(function (codeNode) {
            if (!(codeNode instanceof HTMLElement)) {
                return;
            }
            if (codeNode.dataset.ideCodeHighlighted === "1") {
                return;
            }
            const effectiveRenderClass = renderClass === "ide-markdown"
                ? detectCodeLanguageClass(codeNode)
                : renderClass;
            if (!effectiveRenderClass) {
                return;
            }
            const source = codeNode.textContent || "";
            if (effectiveRenderClass === "ide-js") {
                codeNode.innerHTML = highlightJavaScriptCode(source);
            } else if (effectiveRenderClass === "ide-css") {
                codeNode.innerHTML = highlightCssCode(source);
            } else if (effectiveRenderClass === "ide-py") {
                codeNode.innerHTML = highlightPythonCode(source);
            } else {
                codeNode.innerHTML = highlightJsonCode(source);
            }
            codeNode.dataset.ideCodeHighlighted = "1";
        });
    }

    // 열린 문서 모달이 있는지 확인하는 함수
    function hasOpenDocsModal() {
        return Boolean(
            document.querySelector(
                ".ide-rename-modal:not([hidden]), .ide-save-modal:not([hidden]), .ide-help-modal:not([hidden]), .ide-folder-modal:not([hidden])"
            )
        );
    }

    // 문서 모달 바디 상태를 동기화하는 함수
    function syncDocsModalBodyState() {
        document.body.classList.toggle("ide-modal-open", hasOpenDocsModal());
    }

    // 문서 확인 다이얼로그를 생성하는 함수
    function createDocsConfirmDialog() {
        const confirmModal = document.getElementById("ide-confirm-modal");
        const confirmBackdrop = document.getElementById("ide-confirm-modal-backdrop");
        const confirmTitle = document.getElementById("ide-confirm-title");
        const confirmMessage = document.getElementById("ide-confirm-message");
        const confirmCancelButton = document.getElementById("ide-confirm-cancel-btn");
        const confirmConfirmButton = document.getElementById("ide-confirm-confirm-btn");

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

        // 다이얼로그를 닫는 함수
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

        // 확인 다이얼로그를 요청하는 함수
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

    // 문서 페이지 도움말 모달을 초기화하는 함수
    function initializeDocsPageHelpModal() {
        const pageHelpButton = document.getElementById("ide-page-help-btn");
        const pageHelpModal = document.getElementById("ide-page-help-modal");
        const pageHelpBackdrop = document.getElementById("ide-page-help-backdrop");
        if (!pageHelpButton || !pageHelpModal || !pageHelpBackdrop) {
            return;
        }

        let lastFocusedElement = null;

        // 페이지 도움말 모달 열림 상태를 설정하는 함수
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

    // 문서 인증 상호작용을 초기화하는 함수
    function initializeDocsAuthInteraction() {
        const logoutTrigger = document.querySelector("[data-ide-logout-trigger]");
        const logoutForm = document.getElementById("ide-auth-logout-form");
        if (!logoutTrigger || !logoutForm) {
            return;
        }

        const logoutModal = document.getElementById("ide-auth-logout-modal");
        const logoutModalBackdrop = document.getElementById("ide-auth-logout-modal-backdrop");
        const logoutCancelButton = document.getElementById("ide-auth-logout-cancel-btn");
        const logoutConfirmButton = document.getElementById("ide-auth-logout-confirm-btn");
        const logoutMessage = document.getElementById("ide-auth-logout-message");

        let lastFocusedElement = null;

        // 로그아웃 모달 열림 상태를 설정하는 함수
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

    // 문서 툴바 자동 축소를 초기화하는 함수
    function initializeDocsToolbarAutoCollapse() {
        const toolbar = document.querySelector(".ide-toolbar-wrap .ide-toolbar");
        if (!toolbar) {
            return;
        }

        const toolbarChildren = Array.from(toolbar.children).filter(function (child) {
            return child && child.nodeType === 1 && !child.hasAttribute("data-ide-auth-account");
        });
        if (toolbarChildren.length < 2) {
            toolbar.classList.remove("ide-toolbar-auto-collapsed");
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

        // 툴바 모드를 업데이트하는 함수
        const updateToolbarMode = function () {
            rafId = null;

            toolbar.classList.remove("ide-toolbar-auto-collapsed");

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

            toolbar.classList.toggle("ide-toolbar-auto-collapsed", shouldCollapse);
        };

        // 툴바 모드 업데이트를 스케줄링하는 함수
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
        const ideBaseUrl = root.dataset.ideBaseUrl || "/ide";
        const listApiUrl = root.dataset.listApiUrl;
        const saveApiUrl = root.dataset.saveApiUrl;
        const renameApiUrl = root.dataset.renameApiUrl;
        const deleteApiUrl = root.dataset.deleteApiUrl;
        const mkdirApiUrl = root.dataset.mkdirApiUrl;
        const moveApiUrl = root.dataset.moveApiUrl;
        const downloadApiUrl = root.dataset.downloadApiUrl;
        const previewApiUrl = root.dataset.previewApiUrl;
        const aclApiUrl = root.dataset.aclApiUrl;
        const aclOptionsApiUrl = root.dataset.aclOptionsApiUrl;
        const writeUrl = root.dataset.writeUrl || "/ide/write";
        const pathBreadcrumbs = document.querySelector(".ide-path-breadcrumbs");
        const listLayout = document.getElementById("ide-list-layout");
        const listContainer = document.getElementById("ide-list");
        const previewPanel = document.getElementById("ide-list-preview");
        const previewHead = previewPanel ? previewPanel.querySelector(".ide-list-preview-head") : null;
        const previewTitle = document.getElementById("ide-list-preview-title");
        const previewContent = document.getElementById("ide-list-preview-content");
        const previewDownloadButton = document.getElementById("ide-list-preview-download-btn");
        const previewEditButton = document.getElementById("ide-list-preview-edit-btn");
        const previewDeleteButton = document.getElementById("ide-list-preview-delete-btn");
        
        // 편집기 관련 요소들
        const editorPanel = document.getElementById("ide-list-editor");
        const editorHead = editorPanel ? editorPanel.querySelector(".ide-list-editor-head") : null;
        const editorFilenameInput = document.getElementById("ide-list-filename-input");
        const editorContentInput = document.getElementById("ide-list-content-input");
        const editorCancelButton = document.getElementById("ide-list-cancel-btn");
        const editorSaveButton = document.getElementById("ide-list-save-btn");
        const editorHighlightCode = document.getElementById("ide-list-editor-highlight-code");
        const editorSurface = document.getElementById("ide-list-editor-surface");
        const editorHighlight = document.getElementById("ide-list-editor-highlight");
        const editorSuggest = document.getElementById("ide-list-editor-suggest");
        const editorSuggestLabel = document.getElementById("ide-list-editor-suggest-label");
        
        // API URL들
        const ideApiPreviewUrl = previewApiUrl;
        const scopedHomeDir = normalizePath(root.dataset.scopedHomeDir || "", true);
        const initialBreadcrumbNode = pathBreadcrumbs
            ? pathBreadcrumbs.querySelector(".ide-path-link, .ide-path-current")
            : null;
        const breadcrumbRootLabel = (initialBreadcrumbNode && initialBreadcrumbNode.textContent
            ? initialBreadcrumbNode.textContent
            : "ide").trim() || "ide";
        const contextMenu = document.getElementById("ide-context-menu");
        const contextOpenButton = contextMenu ? contextMenu.querySelector('button[data-action="open"]') : null;
        const contextDownloadButton = contextMenu ? contextMenu.querySelector('button[data-action="download"]') : null;
        const contextEditButton = contextMenu ? contextMenu.querySelector('button[data-action="edit"]') : null;
        const contextRenameButton = contextMenu ? contextMenu.querySelector('button[data-action="rename"]') : null;
        const contextDeleteButton = contextMenu ? contextMenu.querySelector('button[data-action="delete"]') : null;
        const contextNewFolderButton = contextMenu ? contextMenu.querySelector('button[data-action="new-folder"]') : null;
        const contextNewDocButton = contextMenu ? contextMenu.querySelector('button[data-action="new-doc"]') : null;
        const contextPermissionsButton = contextMenu ? contextMenu.querySelector('button[data-action="permissions"]') : null;
        const renameModal = document.getElementById("ide-rename-modal");
        const renameModalBackdrop = document.getElementById("ide-rename-modal-backdrop");
        const renameInput = document.getElementById("ide-rename-input");
        const renameTarget = document.getElementById("ide-rename-target");
        const renameCancelButton = document.getElementById("ide-rename-cancel-btn");
        const renameConfirmButton = document.getElementById("ide-rename-confirm-btn");
        const folderCreateModal = document.getElementById("ide-folder-create-modal");
        const folderCreateModalBackdrop = document.getElementById("ide-folder-create-modal-backdrop");
        const folderCreateTarget = document.getElementById("ide-folder-create-target");
        const folderCreateInput = document.getElementById("ide-folder-create-input");
        const folderCreateCancelButton = document.getElementById("ide-folder-create-cancel-btn");
        const folderCreateConfirmButton = document.getElementById("ide-folder-create-confirm-btn");
        const permissionModal = document.getElementById("ide-permission-modal");
        const permissionModalBackdrop = document.getElementById("ide-permission-modal-backdrop");
        const permissionTarget = document.getElementById("ide-permission-target");
        const permissionReadUsersList = document.getElementById("ide-permission-read-users-list");
        const permissionReadGroupsList = document.getElementById("ide-permission-read-groups-list");
        const permissionWriteUsersList = document.getElementById("ide-permission-write-users-list");
        const permissionWriteGroupsList = document.getElementById("ide-permission-write-groups-list");
        const permissionCancelButton = document.getElementById("ide-permission-cancel-btn");
        const permissionSaveButton = document.getElementById("ide-permission-save-btn");

        const currentDir = normalizePath(root.dataset.currentDir || "", true);
        const currentDirCanEdit = root.dataset.currentDirCanEdit === "1";
        const currentDirCanWriteChildren =
            root.dataset.currentDirCanWriteChildren === "1" || currentDirCanEdit;
        const initialEntries = getJsonScriptData("ide-initial-entries", []);

        const state = {
            selectedPath: "",
            selectedPaths: new Set(),
            selectionAnchorPath: "",
            contextTarget: null,
            contextEntries: [],
            renameTargetEntry: null,
            folderCreateParentEntry: null,
            permissionTargetEntry: null,
            permissionTargetEntries: [],
            expandedFolders: new Set(),
            openingFolderPath: "",
            openingAnimationOrder: 0,
            directoryCache: new Map(),
            aclOptionsLoaded: false,
            aclOptions: {
                users: [],
                groups: [],
            },
            draggingEntries: [],
            draggingRowPaths: new Set(),
            entryByPath: new Map(),
            visibleEntryPaths: [],
            dragOverElement: null,
            previewCache: new Map(),
            previewRequestToken: 0,
            activePreviewPath: "",
        };

        let activeListEditorSuggestions = [];
        let activeListEditorSuggestionIndex = -1;
        let activeListEditorEntry = null;
        let listSuggestEventsBound = false;

        function resolveListEditorExtension() {
            const entryPath = activeListEditorEntry && activeListEditorEntry.path
                ? String(activeListEditorEntry.path)
                : "";
            const entryMatch = entryPath.match(/\.[A-Za-z0-9]+$/);
            if (entryMatch) {
                return entryMatch[0].toLowerCase();
            }

            const raw = (editorFilenameInput && editorFilenameInput.value ? editorFilenameInput.value : "").trim();
            const match = raw.match(/\.[A-Za-z0-9]+$/);
            return match ? match[0].toLowerCase() : "";
        }

        function clearListEditorSuggestion() {
            activeListEditorSuggestions = [];
            activeListEditorSuggestionIndex = -1;
            if (editorSuggest) {
                editorSuggest.hidden = true;
                editorSuggest.style.left = "";
                editorSuggest.style.top = "";
                editorSuggest.innerHTML = "";
            }
            if (editorSuggestLabel) {
                editorSuggestLabel.textContent = "";
            }
        }

        function findListEditorSuggestions(extension, tokenText) {
            const completionMap = window.__docsEditorCompletionMap || {};
            const items = completionMap[extension] || [];
            return findEditorCompletionItems(items, tokenText, 8);
        }

        function renderListEditorSuggestDropdown() {
            if (!editorSuggest) {
                return;
            }
            editorSuggest.innerHTML = "";

            const list = document.createElement("div");
            list.className = "ide-editor-suggest-list";

            for (let i = 0; i < activeListEditorSuggestions.length; i += 1) {
                const item = activeListEditorSuggestions[i] || {};
                const option = document.createElement("button");
                option.type = "button";
                option.className = "ide-editor-suggest-item" + (i === activeListEditorSuggestionIndex ? " is-active" : "");
                option.setAttribute("data-suggest-index", String(i));

                const labelNode = document.createElement("span");
                labelNode.className = "ide-editor-suggest-item-label";
                labelNode.textContent = item.label || item.insertText || "";

                const triggerNode = document.createElement("span");
                triggerNode.className = "ide-editor-suggest-item-trigger";
                triggerNode.textContent = item.trigger || "";

                option.appendChild(labelNode);
                option.appendChild(triggerNode);
                list.appendChild(option);
            }

            const footer = document.createElement("div");
            footer.className = "ide-editor-suggest-footer";
            footer.textContent = "↑↓ 이동 · Enter/Tab 적용";

            editorSuggest.appendChild(list);
            editorSuggest.appendChild(footer);
        }

        function moveListEditorSuggestion(step) {
            if (!activeListEditorSuggestions.length) {
                return;
            }
            const count = activeListEditorSuggestions.length;
            activeListEditorSuggestionIndex = (activeListEditorSuggestionIndex + step + count) % count;
            renderListEditorSuggestDropdown();
        }

        function syncListEditorHighlightScroll() {
            if (!editorContentInput || !editorHighlight) {
                return;
            }
            editorHighlight.scrollTop = editorContentInput.scrollTop;
            editorHighlight.scrollLeft = editorContentInput.scrollLeft;
        }

        function renderListEditorHighlight() {
            if (!editorContentInput || !editorHighlight || !editorHighlightCode) {
                return;
            }

            const extension = resolveListEditorExtension();
            const source = editorContentInput.value || "";
            let renderClass = "ide-plain-text";
            let highlightedHtml = escapeHtml(source);

            if (extension === ".js") {
                renderClass = "ide-js";
                highlightedHtml = highlightJavaScriptCode(source);
            } else if (extension === ".md") {
                renderClass = "ide-editor-md";
                highlightedHtml = escapeHtml(source);
            } else if (extension === ".css") {
                renderClass = "ide-css";
                highlightedHtml = highlightCssCode(source);
            } else if (extension === ".json") {
                renderClass = "ide-json";
                highlightedHtml = highlightJsonCode(source);
            } else if (extension === ".py") {
                renderClass = "ide-py";
                highlightedHtml = highlightPythonCode(source);
            } else if (extension === ".html") {
                renderClass = "ide-editor-html";
                highlightedHtml = highlightHtmlCode(source);
            }

            editorHighlight.classList.remove(
                "ide-plain-text",
                "ide-editor-md",
                "ide-js",
                "ide-css",
                "ide-json",
                "ide-py",
                "ide-editor-html"
            );
            editorHighlight.classList.add(renderClass);
            editorHighlightCode.innerHTML = highlightedHtml + (source.endsWith("\n") ? "\u200b" : "");
            syncListEditorHighlightScroll();
            updateListEditorSuggestion();
        }

        function updateListEditorSuggestion() {
            if (!editorContentInput || !editorSuggest) {
                return;
            }

            const start = editorContentInput.selectionStart || 0;
            const end = editorContentInput.selectionEnd || 0;
            if (start !== end) {
                clearListEditorSuggestion();
                return;
            }

            const extension = resolveListEditorExtension();
            const tokenInfo = extractEditorCompletionToken(editorContentInput.value || "", start);
            if (!tokenInfo) {
                clearListEditorSuggestion();
                return;
            }

            const suggestions = findListEditorSuggestions(extension, tokenInfo.token);
            if (!suggestions.length) {
                clearListEditorSuggestion();
                return;
            }

            activeListEditorSuggestions = suggestions.map(function (suggestion) {
                return {
                    start: tokenInfo.start,
                    end: tokenInfo.end,
                    insertText: suggestion.insertText,
                    cursorBack: Number(suggestion.cursorBack || 0),
                    label: suggestion.label || suggestion.insertText,
                    trigger: suggestion.trigger || "",
                };
            });
            activeListEditorSuggestionIndex = 0;
            renderListEditorSuggestDropdown();
            editorSuggest.hidden = false;

            const calc = window.__docsCalculateCursorPosition;
            const cursorPosition = typeof calc === "function" ? calc(editorContentInput, start) : null;
            if (cursorPosition) {
                const surfaceRect = editorSurface ? editorSurface.getBoundingClientRect() : null;

                let left = cursorPosition.left + 12;
                let top = cursorPosition.top + (cursorPosition.lineHeight || 20) + 6;

                if (surfaceRect) {
                    left = (cursorPosition.left + 12) - surfaceRect.left;
                    top = (cursorPosition.top + (cursorPosition.lineHeight || 20) + 6) - surfaceRect.top;
                }

                const suggestRect = editorSuggest.getBoundingClientRect();
                if (surfaceRect) {
                    const minLeft = 8;
                    const minTop = 8;
                    const maxLeft = Math.max(minLeft, surfaceRect.width - suggestRect.width - 8);
                    const maxTop = Math.max(minTop, surfaceRect.height - suggestRect.height - 8);
                    left = Math.min(Math.max(minLeft, left), maxLeft);
                    top = Math.min(Math.max(minTop, top), maxTop);
                }

                editorSuggest.style.left = String(left) + "px";
                editorSuggest.style.top = String(top) + "px";
            }
        }

        function acceptListEditorSuggestion(index) {
            if (!editorContentInput) {
                return false;
            }
            const resolvedIndex = Number.isInteger(index) ? index : activeListEditorSuggestionIndex;
            const suggestion = activeListEditorSuggestions[resolvedIndex] || null;
            if (!suggestion) {
                return false;
            }
            editorContentInput.setRangeText(suggestion.insertText, suggestion.start, suggestion.end, "end");
            const cursorPos = (suggestion.start + suggestion.insertText.length) - Math.max(0, suggestion.cursorBack);
            editorContentInput.setSelectionRange(cursorPos, cursorPos);
            editorContentInput.focus();
            editorContentInput.dispatchEvent(new Event("input", { bubbles: true }));
            clearListEditorSuggestion();
            return true;
        }

        state.directoryCache.set(currentDir, initialEntries);

        function closeContextMenu() {
            if (!contextMenu) {
                return;
            }
            contextMenu.hidden = true;
            state.contextTarget = null;
            state.contextEntries = [];
        }

        function setContextButtonVisible(button, visible) {
            if (!button) {
                return;
            }
            button.style.display = visible ? "" : "none";
        }

        function isEntryDeletable(entry) {
            if (!entry || entry.isCurrentFolder) {
                return false;
            }
            if (!entry.can_edit) {
                return false;
            }
            return !(entry.type === "file" && entry.is_public_write);
        }

        function getSelectedEntries() {
            return state.visibleEntryPaths
                .filter(function (pathValue) {
                    return state.selectedPaths.has(pathValue);
                })
                .map(function (pathValue) {
                    return state.entryByPath.get(pathValue) || null;
                })
                .filter(function (entry) {
                    return Boolean(entry);
                });
        }

        function updateListLayoutMode() {
            if (!listLayout) {
                return;
            }
            // 강제로 리플로우 트리거
            void listLayout.offsetWidth;
            
            const isLandscape = window.innerWidth > window.innerHeight;
            listLayout.classList.toggle("is-landscape", isLandscape);
            listLayout.classList.toggle("is-portrait", !isLandscape);
            
            // 레이아웃 변경 후 동기화
            setTimeout(function() {
                scheduleSyncCurrentDirRowHeightWithSideHead();
            }, 10);
        }

        // 디바운싱된 레이아웃 업데이트 함수
        let layoutUpdateTimeout = null;
        function debouncedUpdateListLayoutMode() {
            if (layoutUpdateTimeout) {
                clearTimeout(layoutUpdateTimeout);
            }
            layoutUpdateTimeout = setTimeout(updateListLayoutMode, 50);
        }

        let currentDirRowSyncRafId = null;

        function scheduleSyncCurrentDirRowHeightWithSideHead() {
            if (currentDirRowSyncRafId !== null) {
                return;
            }
            currentDirRowSyncRafId = window.requestAnimationFrame(function () {
                currentDirRowSyncRafId = null;
                syncCurrentDirRowHeightWithSideHead();
                window.requestAnimationFrame(function () {
                    syncCurrentDirRowHeightWithSideHead();
                });
            });
        }

        function syncCurrentDirRowHeightWithSideHead() {
            if (!listContainer) {
                return;
            }
            const currentDirRow = listContainer.querySelector(".ide-current-dir-row");
            if (!currentDirRow) {
                return;
            }

            const isLandscape = Boolean(listLayout && listLayout.classList.contains("is-landscape"));
            if (!isLandscape) {
                currentDirRow.style.minHeight = "";
                return;
            }

            const hasVisibleEditor = Boolean(
                listLayout &&
                listLayout.classList.contains("has-editor") &&
                editorPanel &&
                !editorPanel.hidden &&
                editorHead
            );
            const hasVisiblePreview = Boolean(
                listLayout &&
                listLayout.classList.contains("has-preview") &&
                previewPanel &&
                !previewPanel.hidden &&
                previewHead
            );

            const activeHead = hasVisibleEditor ? editorHead : (hasVisiblePreview ? previewHead : null);
            if (!activeHead) {
                currentDirRow.style.minHeight = "";
                return;
            }

            const headHeight = Math.ceil(activeHead.getBoundingClientRect().height);
            if (headHeight > 0) {
                currentDirRow.style.minHeight = String(headHeight) + "px";
                return;
            }
            currentDirRow.style.minHeight = "";
        }

        function setPreviewVisibility(isVisible) {
            if (!previewPanel) {
                return;
            }
            const visible = Boolean(isVisible);
            previewPanel.hidden = !visible;
            previewPanel.setAttribute("aria-hidden", visible ? "false" : "true");
            if (listLayout) {
                listLayout.classList.toggle("has-preview", visible);
            }
            scheduleSyncCurrentDirRowHeightWithSideHead();
        }

        function scrollPreviewIntoViewIfPortrait() {
            if (!previewPanel || previewPanel.hidden) {
                return;
            }
            const isPortrait = window.innerHeight > window.innerWidth;
            if (!isPortrait) {
                return;
            }
            const scrollToPreviewTop = function () {
                const previewTop = previewPanel.getBoundingClientRect().top + window.pageYOffset;
                window.scrollTo({
                    top: Math.max(0, Math.floor(previewTop)),
                    behavior: "smooth",
                });
            };
            window.requestAnimationFrame(function () {
                window.requestAnimationFrame(function () {
                    scrollToPreviewTop();
                });
            });
        }

        function isPreviewableFileEntry(entry) {
            return Boolean(entry && entry.type === "file" && !entry.isCurrentFolder);
        }

        function applyRenderedContentModeClass(targetElement, renderMode, renderClass) {
            applyDocsRenderedContentModeClass(targetElement, renderMode, renderClass);
        }

        function setPreviewActionTargets(entry) {
            const isFileEntry = isPreviewableFileEntry(entry);
            const canEdit = Boolean(entry && entry.can_edit);

            if (previewDownloadButton) {
                if (!isFileEntry) {
                    previewDownloadButton.hidden = true;
                    previewDownloadButton.removeAttribute("href");
                } else {
                    const downloadUrl = buildDownloadUrl(entry.path);
                    previewDownloadButton.hidden = !downloadUrl;
                    if (downloadUrl) {
                        previewDownloadButton.href = downloadUrl;
                    } else {
                        previewDownloadButton.removeAttribute("href");
                    }
                }
            }

            if (previewEditButton) {
                previewEditButton.hidden = !(isFileEntry && canEdit);
                if (!previewEditButton.hidden) {
                    // 편집 버튼 클릭 시 미리보기에서 편집기로 전환
                    const editButtonClickHandler = function(e) {
                        e.preventDefault();
                        if (typeof switchToEditor === 'function') {
                            switchToEditor(entry);
                        }
                    };
                    
                    // 기존 이벤트 리스너가 있다면 교체
                    previewEditButton.onclick = editButtonClickHandler;
                } else {
                    previewEditButton.removeAttribute("href");
                    previewEditButton.onclick = null;
                }
            }

            if (previewDeleteButton) {
                previewDeleteButton.hidden = !(isFileEntry && canEdit);
            }
        }

        function setPreviewPlaceholder(message) {
            if (!previewContent) {
                return;
            }
            previewContent.innerHTML = '<p class="ide-list-preview-placeholder">' + escapeHtml(message) + '</p>';
        }

        function updateEditorHighlight() {
            if (!editorContentInput || !editorHighlightCode) {
                return;
            }
            
            const content = editorContentInput.value;
            const escapedContent = escapeHtml(content);
            editorHighlightCode.textContent = content;
        }

        function switchToEditor(entry) {
            if (!editorPanel || !editorFilenameInput || !editorContentInput) {
                return;
            }

            activeListEditorEntry = entry || null;
            clearListEditorSuggestion();
            
            // 현재 선택된 파일 정보를 편집기에 설정
            editorFilenameInput.value = entry.name || '';
            
            // 파일 내용이 없으면 API로 불러오기
            if (!entry.content) {
                const targetUrl = downloadApiUrl
                    ? downloadApiUrl + '?path=' + encodeURIComponent(entry.path)
                    : '';

                if (!targetUrl) {
                    console.error('Error loading file content: download API URL is missing');
                    entry.content = '';
                    editorContentInput.value = '';
                    renderListEditorHighlight();
                } else {
                    fetch(targetUrl)
                        .then(function (response) {
                            if (!response.ok) {
                                throw new Error('Download API request failed: ' + String(response.status));
                            }
                            return response.text();
                        })
                        .then(function (text) {
                            entry.content = typeof text === 'string' ? text : '';
                            editorContentInput.value = entry.content;
                            renderListEditorHighlight();
                        })
                        .catch(function (error) {
                            console.error('Error loading file content:', error);
                            entry.content = '';
                            editorContentInput.value = '';
                            renderListEditorHighlight();
                        });
                }
            } else {
                editorContentInput.value = entry.content;
                renderListEditorHighlight();
            }
            
            // 미리보기 숨기고 편집기 표시
            if (previewPanel) {
                previewPanel.hidden = true;
                previewPanel.setAttribute("aria-hidden", "true");
            }
            
            if (editorPanel) {
                editorPanel.hidden = false;
                editorPanel.setAttribute("aria-hidden", "false");
            }
            
            // 레이아웃 클래스 업데이트 (preview 제거, editor 추가)
            if (listLayout) {
                listLayout.classList.remove("has-preview");
                listLayout.classList.add("has-editor");
                setPreviewVisibility(false); // preview visibility를 false로 설정
            }

            scheduleSyncCurrentDirRowHeightWithSideHead();
            
            // 편집기에 포커스
            editorContentInput.focus();
            
            // 저장 및 취소 버튼 이벤트 설정
            setupEditorEvents(entry);
        }

        function switchToPreview() {
            // 편집기 숨기고 미리보기 표시
            if (editorPanel) {
                editorPanel.hidden = true;
                editorPanel.setAttribute("aria-hidden", "true");
            }
            
            if (previewPanel) {
                previewPanel.hidden = false;
                previewPanel.setAttribute("aria-hidden", "false");
            }
            
            // 레이아웃 클래스 업데이트
            if (listLayout) {
                listLayout.classList.remove("has-editor");
                listLayout.classList.add("has-preview");
            }

            scheduleSyncCurrentDirRowHeightWithSideHead();
            
            // 편집기 이벤트 정리
            cleanupEditorEvents();
            activeListEditorEntry = null;
        }

        function setupEditorEvents(entry) {
            if (!editorSaveButton || !editorCancelButton) {
                return;
            }
            
            // 기존 이벤트 정리
            cleanupEditorEvents();
            
            if (editorContentInput) {
                editorContentInput.addEventListener("input", renderListEditorHighlight);
                editorContentInput.addEventListener("scroll", syncListEditorHighlightScroll, { passive: true });
                editorContentInput.addEventListener("click", updateListEditorSuggestion);
                editorContentInput.addEventListener("keyup", function (event) {
                    if (
                        event.key === "Tab" ||
                        event.key === "ArrowDown" ||
                        event.key === "ArrowUp" ||
                        event.key === "Enter" ||
                        event.key === "Escape"
                    ) {
                        return;
                    }
                    updateListEditorSuggestion();
                });
                editorContentInput.addEventListener("keydown", function (event) {
                    if (event.key === "Escape") {
                        clearListEditorSuggestion();
                        return;
                    }
                    if (!editorSuggest.hidden && event.key === "ArrowDown") {
                        event.preventDefault();
                        moveListEditorSuggestion(1);
                        return;
                    }
                    if (!editorSuggest.hidden && event.key === "ArrowUp") {
                        event.preventDefault();
                        moveListEditorSuggestion(-1);
                        return;
                    }
                    if (!editorSuggest.hidden && event.key === "Enter") {
                        if (acceptListEditorSuggestion()) {
                            event.preventDefault();
                        }
                        return;
                    }
                    if (event.key === "Tab" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
                        if (acceptListEditorSuggestion()) {
                            event.preventDefault();
                        }
                    }
                });
            }

            if (editorFilenameInput) {
                editorFilenameInput.addEventListener("input", function () {
                    renderListEditorHighlight();
                });
            }
            if (editorSuggest && !listSuggestEventsBound) {
                listSuggestEventsBound = true;
                editorSuggest.addEventListener("mousedown", function (event) {
                    event.preventDefault();
                });
                editorSuggest.addEventListener("click", function (event) {
                    const target = event.target instanceof Element
                        ? event.target.closest("[data-suggest-index]")
                        : null;
                    if (!target) {
                        return;
                    }
                    const index = Number(target.getAttribute("data-suggest-index"));
                    if (Number.isInteger(index) && acceptListEditorSuggestion(index)) {
                        event.preventDefault();
                    }
                });
            }
            
            // 저장/취소 버튼 이벤트를 현재 편집 대상(entry)에 바인딩
            editorSaveButton.onclick = function (event) {
                event.preventDefault();
                saveEditorContent(entry).catch(alertError);
            };
            editorCancelButton.onclick = function (event) {
                event.preventDefault();
                switchToPreview();
            };
        }

        function cleanupEditorEvents() {
            clearListEditorSuggestion();
            if (editorSaveButton) {
                editorSaveButton.onclick = null;
            }
            if (editorCancelButton) {
                editorCancelButton.onclick = null;
            }
        }

        // 입력된 파일명(확장자 포함 가능)을 API 저장 형식(filename + extension)으로 분리
        function resolveListEditorFilenameAndExtension(rawFilename, sourcePath) {
            const fallbackMatch = String(sourcePath || "").match(/\.([A-Za-z0-9]+)$/);
            const fallbackExtension = fallbackMatch ? ("." + fallbackMatch[1].toLowerCase()) : ".md";
            const trimmed = String(rawFilename || "").trim();
            if (!trimmed) {
                throw new Error(t("js_filename_required", "파일명을 입력해주세요."));
            }
            if (trimmed.includes("/") || trimmed.includes("\\")) {
                throw new Error(t("js_error_path_required", "경로를 입력해주세요."));
            }

            const extMatch = trimmed.match(/^(.*?)(\.[A-Za-z0-9]+)$/);
            if (extMatch && extMatch[1] && !extMatch[1].endsWith(".")) {
                return {
                    filename: extMatch[1].trim(),
                    extension: extMatch[2].toLowerCase(),
                };
            }

            if (trimmed.endsWith(".")) {
                throw new Error(t("js_extension_invalid", "확장자 형식이 올바르지 않습니다. 예: .md"));
            }

            return {
                filename: trimmed,
                extension: fallbackExtension,
            };
        }

        async function saveEditorContent(entry) {
            if (!editorContentInput || !editorFilenameInput) {
                return;
            }

            if (!saveApiUrl) {
                throw new Error(t("js_error_request_failed", "요청 처리 중 오류가 발생했습니다."));
            }

            const content = editorContentInput.value;
            const resolved = resolveListEditorFilenameAndExtension(editorFilenameInput.value, entry.path);
            const sourcePath = normalizePath(entry.path, false);
            const targetDir = getParentDirectory(sourcePath);

            // 중복 저장 방지를 위해 저장 중 버튼 비활성화
            if (editorSaveButton) {
                editorSaveButton.disabled = true;
            }
            try {
                // 쓰기 화면 저장 버튼과 동일한 docs_api_save payload로 저장
                const payload = {
                    original_path: sourcePath,
                    target_dir: targetDir,
                    filename: resolved.filename,
                    extension: resolved.extension,
                    content: content,
                };
                const data = await requestJson(saveApiUrl, buildPostOptions(payload));

                // 저장 후에는 취소 버튼 동작처럼 편집기를 닫고, 해당 파일 미리보기를 다시 연다.
                const savedPath = data && typeof data.path === "string" && data.path.trim()
                    ? normalizePath(data.path, true)
                    : sourcePath;
                // 저장 직후에는 캐시를 무효화해 미리보기가 항상 최신 내용을 다시 불러오도록 한다.
                state.previewCache.delete(sourcePath);
                state.previewCache.delete(savedPath);
                await refreshCurrentDirectory();
                switchToPreview();

                const savedEntryFromList = state.entryByPath.get(savedPath) || null;
                const savedEntry = savedEntryFromList || {
                    type: "file",
                    isCurrentFolder: false,
                    can_edit: Boolean(entry && entry.can_edit),
                    path: savedPath,
                    name: savedPath.split("/").pop() || (entry && entry.name) || "",
                };

                if (savedEntryFromList) {
                    applySelection([savedPath], {
                        primaryPath: savedPath,
                        anchorPath: savedPath,
                    });
                } else {
                    setPreviewVisibility(true);
                }

                await loadPreviewForEntry(savedEntry);
            } finally {
                if (editorSaveButton) {
                    editorSaveButton.disabled = false;
                }
            }
        }

        function clearPreviewPane() {
            state.activePreviewPath = "";
            state.previewRequestToken += 1;
            setPreviewVisibility(false);
            
            // 편집기가 열려있으면 닫기
            if (editorPanel && !editorPanel.hidden) {
                switchToPreview();
            }
            
            if (previewTitle) {
                previewTitle.textContent = t("list_preview_title", "파일 미리보기");
            }
            setPreviewActionTargets(null);
            applyRenderedContentModeClass(previewContent, "plain_text", "ide-plain-text");
            setPreviewPlaceholder(
                t("list_preview_empty", "파일을 선택하면 미리보기가 표시됩니다.")
            );
        }

        function renderPreviewHtml(entry, html, renderMode, renderClass) {
            if (!previewContent) {
                return;
            }
            const safeHtml = typeof html === "string" ? html : "";
            const normalizedRenderMode = renderMode === "markdown" ? "markdown" : "plain_text";
            const normalizedRenderClass =
                renderClass === "ide-json" ||
                renderClass === "ide-html" ||
                renderClass === "ide-css" ||
                renderClass === "ide-js" ||
                renderClass === "ide-py"
                    ? renderClass
                    : "";
            applyRenderedContentModeClass(previewContent, normalizedRenderMode, normalizedRenderClass);
            if (!safeHtml.trim()) {
                setPreviewPlaceholder(
                    t("list_preview_empty", "파일을 선택하면 미리보기가 표시됩니다.")
                );
                return;
            }
            previewContent.innerHTML = safeHtml;
            applyDocsCodeHighlighting(previewContent, normalizedRenderClass || "ide-markdown");
            setPreviewActionTargets(entry);
            scheduleSyncCurrentDirRowHeightWithSideHead();
        }

        async function loadPreviewForEntry(entry) {
            if (!previewPanel || !previewContent) {
                return;
            }
            if (!isPreviewableFileEntry(entry) || !previewApiUrl) {
                clearPreviewPane();
                return;
            }

            if (editorPanel && !editorPanel.hidden) {
                switchToPreview();
            }

            setPreviewVisibility(true);

            const pathValue = normalizePath(entry.path, true);
            state.activePreviewPath = pathValue;
            if (previewTitle) {
                previewTitle.textContent = entry.name || t("list_preview_title", "파일 미리보기");
            }
            setPreviewActionTargets(entry);

            if (state.previewCache.has(pathValue)) {
                const cached = state.previewCache.get(pathValue);
                if (cached && typeof cached === "object") {
                    renderPreviewHtml(entry, cached.html, cached.renderMode, cached.renderClass);
                    scrollPreviewIntoViewIfPortrait();
                    return;
                }
                renderPreviewHtml(entry, cached, "markdown", "ide-markdown");
                scrollPreviewIntoViewIfPortrait();
                return;
            }

            setPreviewPlaceholder(t("list_preview_loading", "미리보기를 불러오는 중..."));
            const requestToken = state.previewRequestToken + 1;
            state.previewRequestToken = requestToken;
            try {
                const data = await requestJson(
                    previewApiUrl,
                    buildPostOptions({ path: pathValue })
                );
                if (requestToken !== state.previewRequestToken || state.activePreviewPath !== pathValue) {
                    return;
                }
                const html = data && typeof data.html === "string" ? data.html : "";
                const renderMode = data && data.render_mode === "markdown" ? "markdown" : "plain_text";
                const renderClass = data && typeof data.render_class === "string" ? data.render_class : "";
                state.previewCache.set(pathValue, {
                    html: html,
                    renderMode: renderMode,
                    renderClass: renderClass,
                });
                if (previewTitle && data && typeof data.title === "string" && data.title.trim()) {
                    previewTitle.textContent = data.title;
                }
                renderPreviewHtml(entry, html, renderMode, renderClass);
                scrollPreviewIntoViewIfPortrait();
            } catch (error) {
                if (requestToken !== state.previewRequestToken || state.activePreviewPath !== pathValue) {
                    return;
                }
                state.previewCache.delete(pathValue);
                setPreviewPlaceholder(
                    error && error.message
                        ? error.message
                        : t("list_preview_error", "미리보기를 불러오지 못했습니다.")
                );
                scrollPreviewIntoViewIfPortrait();
            }
        }

        function syncPreviewFromSelection() {
            if (!previewPanel) {
                return;
            }
            const selectedEntries = getSelectedEntries();
            if (selectedEntries.length !== 1) {
                clearPreviewPane();
                return;
            }
            const entry = selectedEntries[0];
            if (!isPreviewableFileEntry(entry)) {
                clearPreviewPane();
                return;
            }
            loadPreviewForEntry(entry).catch(alertError);
        }

        function syncContextMenuByEntries(entries) {
            const targets = Array.isArray(entries) ? entries.filter(Boolean) : [];
            const targetEntry = targets.length > 0 ? targets[0] : null;
            const isMultiSelection = targets.length > 1;
            const isDirectory = Boolean(targetEntry && targetEntry.type === "dir");
            const isCurrentFolder = Boolean(targetEntry && targetEntry.isCurrentFolder);
            const canEditEntry = Boolean(targetEntry && targetEntry.can_edit);
            const canWriteChildren = Boolean(
                targetEntry && targetEntry.type === "dir" && targetEntry.can_write_children
            );
            const canDownloadAllFiles = targets.length > 0 && targets.every(function (entry) {
                return Boolean(entry) && !entry.isCurrentFolder && entry.type === "file";
            });
            const isPublicWriteFile = Boolean(targetEntry && targetEntry.type === "file" && targetEntry.is_public_write);

            if (isMultiSelection) {
                const canDeleteAll = targets.every(function (entry) {
                    return isEntryDeletable(entry);
                });
                setContextButtonVisible(contextOpenButton, true);
                setContextButtonVisible(contextDownloadButton, canDownloadAllFiles);
                setContextButtonVisible(contextEditButton, false);
                setContextButtonVisible(contextRenameButton, false);
                setContextButtonVisible(contextDeleteButton, canDeleteAll);
                setContextButtonVisible(contextNewFolderButton, false);
                setContextButtonVisible(contextNewDocButton, false);
                setContextButtonVisible(contextPermissionsButton, true);
                return;
            }

            setContextButtonVisible(contextOpenButton, !isCurrentFolder);
            setContextButtonVisible(contextDownloadButton, !isCurrentFolder && !isDirectory);
            setContextButtonVisible(contextEditButton, !isDirectory && canEditEntry);
            setContextButtonVisible(contextRenameButton, !isCurrentFolder && canEditEntry && !isPublicWriteFile);
            setContextButtonVisible(contextDeleteButton, isEntryDeletable(targetEntry));
            setContextButtonVisible(contextNewFolderButton, isDirectory && canWriteChildren);
            setContextButtonVisible(contextNewDocButton, isDirectory && canWriteChildren);
            setContextButtonVisible(contextPermissionsButton, true);
        }

        function resolveContextEntries(entry) {
            if (!entry) {
                return [];
            }
            if (state.selectedPaths.size > 1 && state.selectedPaths.has(entry.path)) {
                return getSelectedEntries();
            }
            return [entry];
        }

        function applySelection(pathValues, options) {
            const settings = options || {};
            const nextSelectedPaths = new Set();
            (Array.isArray(pathValues) ? pathValues : []).forEach(function (pathValue) {
                try {
                    nextSelectedPaths.add(normalizePath(pathValue, true));
                } catch (error) {}
            });

            state.selectedPaths = nextSelectedPaths;
            if (nextSelectedPaths.size === 0) {
                state.selectedPath = "";
                if (!settings.keepAnchor) {
                    state.selectionAnchorPath = "";
                }
            } else {
                const normalizedPrimaryPath = normalizePath(
                    settings.primaryPath !== undefined ? settings.primaryPath : Array.from(nextSelectedPaths)[0],
                    true
                );
                state.selectedPath = nextSelectedPaths.has(normalizedPrimaryPath)
                    ? normalizedPrimaryPath
                    : Array.from(nextSelectedPaths)[0];

                const normalizedAnchorPath = normalizePath(
                    settings.anchorPath !== undefined ? settings.anchorPath : state.selectedPath,
                    true
                );
                if (!settings.keepAnchor) {
                    state.selectionAnchorPath = normalizedAnchorPath;
                } else if (
                    !state.selectionAnchorPath ||
                    !nextSelectedPaths.has(state.selectionAnchorPath)
                ) {
                    state.selectionAnchorPath = state.selectedPath;
                }
            }

            if (settings.render === false) {
                return;
            }
            renderPathBreadcrumbs(state.selectedPath || currentDir);
            renderList();
        }

        function getSelectionRangeTo(entryPath) {
            const anchorPath = state.selectionAnchorPath;
            if (!anchorPath) {
                return [entryPath];
            }
            const startIndex = state.visibleEntryPaths.indexOf(anchorPath);
            const endIndex = state.visibleEntryPaths.indexOf(entryPath);
            if (startIndex < 0 || endIndex < 0) {
                return [entryPath];
            }
            const from = Math.min(startIndex, endIndex);
            const to = Math.max(startIndex, endIndex);
            return state.visibleEntryPaths.slice(from, to + 1);
        }

        function selectEntry(entryPath, options) {
            applySelection([entryPath || ""], options);
        }

        function selectEntriesByRowClick(entry, event) {
            if (!entry) {
                return;
            }
            const entryPath = normalizePath(entry.path, true);
            const hasToggleModifier = Boolean(event && (event.metaKey || event.ctrlKey));
            const hasRangeModifier = Boolean(event && event.shiftKey);

            if (hasRangeModifier) {
                const rangePaths = getSelectionRangeTo(entryPath);
                if (hasToggleModifier) {
                    const merged = new Set(state.selectedPaths);
                    rangePaths.forEach(function (pathValue) {
                        merged.add(pathValue);
                    });
                    applySelection(Array.from(merged), {
                        primaryPath: entryPath,
                        anchorPath: state.selectionAnchorPath || entryPath,
                    });
                    return;
                }
                applySelection(rangePaths, {
                    primaryPath: entryPath,
                    anchorPath: state.selectionAnchorPath || entryPath,
                });
                return;
            }

            if (hasToggleModifier) {
                const nextSelected = new Set(state.selectedPaths);
                if (nextSelected.has(entryPath)) {
                    nextSelected.delete(entryPath);
                } else {
                    nextSelected.add(entryPath);
                }
                applySelection(Array.from(nextSelected), {
                    primaryPath: entryPath,
                    anchorPath: entryPath,
                });
                return;
            }

            applySelection([entryPath], {
                primaryPath: entryPath,
                anchorPath: entryPath,
            });
        }

        function openContextMenuAt(entry, x, y) {
            if (!contextMenu) {
                return;
            }
            const contextEntries = resolveContextEntries(entry);
            if (contextEntries.length === 0) {
                closeContextMenu();
                return;
            }
            state.contextTarget = contextEntries[0];
            state.contextEntries = contextEntries;
            syncContextMenuByEntries(contextEntries);

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
            contextMenu.style.left = "0px";
            contextMenu.style.top = "0px";

            const rect = contextMenu.getBoundingClientRect();
            const viewportPadding = 8;
            const maxLeft = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
            const minTop = viewportPadding;
            const maxTop = Math.max(minTop, window.innerHeight - rect.height - viewportPadding);

            let left = Math.min(Math.max(viewportPadding, x), maxLeft);
            let top = Math.max(minTop, y);

            if (y + rect.height + viewportPadding > window.innerHeight) {
                const overflowBottom = y + rect.height + viewportPadding - window.innerHeight;
                top = y - overflowBottom - 10;
            }

            top = Math.min(Math.max(minTop, top), maxTop);

            contextMenu.style.left = String(left) + "px";
            contextMenu.style.top = String(top) + "px";
        }

        function buildBreadcrumbItems(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (scopedHomeDir) {
                const homeParts = scopedHomeDir.split("/").filter(Boolean);
                const homeLabel = homeParts.length ? homeParts[homeParts.length - 1] : scopedHomeDir;
                const effectivePath = normalized && (
                    normalized === scopedHomeDir || normalized.startsWith(scopedHomeDir + "/")
                )
                    ? normalized
                    : scopedHomeDir;

                const crumbs = [{
                    label: homeLabel,
                    path: scopedHomeDir,
                    isCurrent: effectivePath === scopedHomeDir
                }];
                if (effectivePath === scopedHomeDir) {
                    return crumbs;
                }

                const parts = effectivePath.split("/").filter(Boolean);
                for (let index = homeParts.length; index < parts.length; index += 1) {
                    const composedPath = parts.slice(0, index + 1).join("/");
                    crumbs.push({
                        label: parts[index],
                        path: composedPath,
                        isCurrent: index === parts.length - 1
                    });
                }
                return crumbs;
            }

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
                    separator.className = "ide-path-sep";
                    separator.textContent = "/";
                    fragment.appendChild(separator);
                }

                if (crumb.isCurrent) {
                    const current = document.createElement("span");
                    current.className = "ide-path-current";
                    current.setAttribute("data-ide-dir", crumb.path);
                    current.textContent = crumb.label;
                    fragment.appendChild(current);
                    return;
                }

                const link = document.createElement("a");
                link.className = "ide-path-link";
                link.href = buildListUrl(ideBaseUrl, crumb.path);
                link.setAttribute("data-ide-dir", crumb.path);
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
            const expandedBeforeRefresh = Array.from(state.expandedFolders);
            const data = await requestJson(
                listApiUrl + "?path=" + encodeURIComponent(currentDir)
            );
            state.directoryCache.set(currentDir, Array.isArray(data.entries) ? data.entries : []);

            const preserved = new Map();
            preserved.set(currentDir, state.directoryCache.get(currentDir));
            state.directoryCache = preserved;

            const restoredExpandedFolders = new Set();
            for (let index = 0; index < expandedBeforeRefresh.length; index += 1) {
                const expandedPath = normalizePath(expandedBeforeRefresh[index], true);
                if (!expandedPath || expandedPath === currentDir) {
                    continue;
                }
                try {
                    await loadDirectory(expandedPath);
                    restoredExpandedFolders.add(expandedPath);
                } catch (error) {}
            }
            state.expandedFolders = restoredExpandedFolders;
            renderList();
        }

        function remapExpandedFoldersForRename(fromPath, toPath) {
            const normalizedFromPath = normalizePath(fromPath, true);
            const normalizedToPath = normalizePath(toPath, true);
            if (!normalizedFromPath || !normalizedToPath || normalizedFromPath === normalizedToPath) {
                return;
            }
            const remapped = new Set();
            state.expandedFolders.forEach(function (folderPath) {
                const normalizedFolderPath = normalizePath(folderPath, true);
                if (!normalizedFolderPath) {
                    return;
                }
                if (normalizedFolderPath === normalizedFromPath) {
                    remapped.add(normalizedToPath);
                    return;
                }
                if (normalizedFolderPath.startsWith(normalizedFromPath + "/")) {
                    remapped.add(normalizedToPath + normalizedFolderPath.slice(normalizedFromPath.length));
                    return;
                }
                remapped.add(normalizedFolderPath);
            });
            state.expandedFolders = remapped;
        }

        function removeExpandedFoldersByDeletedPaths(pathValues) {
            const targets = (Array.isArray(pathValues) ? pathValues : [])
                .map(function (value) {
                    return normalizePath(value, true);
                })
                .filter(function (value) {
                    return Boolean(value);
                });
            if (targets.length === 0) {
                return;
            }

            const nextExpandedFolders = new Set();
            state.expandedFolders.forEach(function (folderPath) {
                const normalizedFolderPath = normalizePath(folderPath, true);
                if (!normalizedFolderPath) {
                    return;
                }
                const shouldRemove = targets.some(function (targetPath) {
                    return normalizedFolderPath === targetPath || normalizedFolderPath.startsWith(targetPath + "/");
                });
                if (!shouldRemove) {
                    nextExpandedFolders.add(normalizedFolderPath);
                }
            });
            state.expandedFolders = nextExpandedFolders;
        }

        function getEntryEditableName(entry) {
            if (!entry) {
                return "";
            }
            if (entry.type === "file") {
                const fileName = String(entry.name || "");
                const dotIndex = fileName.lastIndexOf(".");
                if (dotIndex > 0) {
                    return fileName.slice(0, dotIndex);
                }
            }
            return entry.name;
        }

        function syncModalBodyState() {
            syncDocsModalBodyState();
        }

        function getDocsPathLabel(pathValue) {
            const normalized = normalizePath(pathValue, true);
            return normalized ? "/ide/" + normalized : "/ide";
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
            if (!moveApiUrl || !Array.isArray(state.draggingEntries) || state.draggingEntries.length === 0) {
                return false;
            }

            const targetPath = normalizePath(targetDirPath, true);
            const allowSameParent = Boolean(options && options.allowSameParent);
            let hasMovableSource = false;

            for (let index = 0; index < state.draggingEntries.length; index += 1) {
                const dragEntry = state.draggingEntries[index];
                if (!dragEntry) {
                    return false;
                }
                const sourcePath = normalizePath(dragEntry.path, false);
                const sourceType = dragEntry.type;

                if (!sourcePath || sourcePath === targetPath) {
                    return false;
                }
                if (!allowSameParent && getParentDirectory(sourcePath) === targetPath) {
                    return false;
                }
                if (sourceType === "dir" && targetPath && targetPath.startsWith(sourcePath + "/")) {
                    return false;
                }
                hasMovableSource = true;
            }
            return hasMovableSource;
        }

        async function moveEntriesToDirectory(sourceEntries, targetDirPath) {
            if (!Array.isArray(sourceEntries) || sourceEntries.length === 0 || !moveApiUrl) {
                return;
            }

            const movedPaths = [];
            for (let index = 0; index < sourceEntries.length; index += 1) {
                const sourceEntry = sourceEntries[index];
                const data = await requestJson(
                    moveApiUrl,
                    buildPostOptions({
                        source_path: sourceEntry.path,
                        target_dir: targetDirPath
                    })
                );
                movedPaths.push(data && data.path ? data.path : sourceEntry.path);
            }

            applySelection(movedPaths, {
                primaryPath: movedPaths[0] || "",
                anchorPath: movedPaths[0] || "",
                render: false,
            });
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
                moveEntriesToDirectory(state.draggingEntries.slice(), targetDirPath).catch(alertError);
            });
        }

        function pruneNestedDragEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return [];
            }
            const uniqueEntries = [];
            const seenPaths = new Set();
            entries.forEach(function (entry) {
                if (!entry || !entry.path || seenPaths.has(entry.path)) {
                    return;
                }
                seenPaths.add(entry.path);
                uniqueEntries.push(entry);
            });

            const directoryPaths = uniqueEntries
                .filter(function (entry) {
                    return entry.type === "dir";
                })
                .map(function (entry) {
                    return entry.path;
                })
                .sort(function (left, right) {
                    if (left.length !== right.length) {
                        return left.length - right.length;
                    }
                    return left.localeCompare(right);
                });

            return uniqueEntries.filter(function (entry) {
                return !directoryPaths.some(function (directoryPath) {
                    return directoryPath !== entry.path && entry.path.startsWith(directoryPath + "/");
                });
            });
        }

        function resolveDraggingEntriesFromRow(entry) {
            if (!entry) {
                return [];
            }
            const baseEntries =
                state.selectedPaths.size > 1 && state.selectedPaths.has(entry.path)
                    ? getSelectedEntries()
                    : [entry];
            const movableEntries = baseEntries.filter(function (candidate) {
                if (!candidate) {
                    return false;
                }
                if (candidate.isCurrentFolder) {
                    return false;
                }
                if (!candidate.can_edit) {
                    return false;
                }
                return !(candidate.type === "file" && candidate.is_public_write);
            });

            const normalized = pruneNestedDragEntries(movableEntries);
            normalized.sort(function (left, right) {
                const leftDepth = left.path.split("/").length;
                const rightDepth = right.path.split("/").length;
                if (leftDepth !== rightDepth) {
                    return leftDepth - rightDepth;
                }
                return left.path.localeCompare(right.path);
            });
            return normalized;
        }

        function getCurrentFolderName(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "ide";
            }
            const parts = normalized.split("/");
            return parts[parts.length - 1] || "ide";
        }

        function addCurrentDirectoryNode(fragment) {
            const currentFolderEntry = {
                path: currentDir,
                type: "dir",
                isCurrentFolder: true,
                can_edit: currentDirCanEdit,
                can_write_children: currentDirCanWriteChildren
            };

            const item = document.createElement("li");
            item.className = "ide-item ide-current-dir-item";

            const row = document.createElement("button");
            row.type = "button";
            row.className = "ide-item-row ide-current-dir-row";
            row.setAttribute("data-entry-path", currentFolderEntry.path);
            row.draggable = false;
            if (state.selectedPaths.has(currentFolderEntry.path)) {
                row.classList.add("is-selected");
            }

            const typeMarker = document.createElement("span");
            typeMarker.className = "ide-item-type-icon is-dir";
            typeMarker.setAttribute("aria-hidden", "true");

            const name = document.createElement("span");
            name.className = "ide-item-name ide-current-dir-name";
            name.textContent = getCurrentFolderName(currentDir);

            row.appendChild(typeMarker);
            row.appendChild(name);

            row.addEventListener("click", function (event) {
                event.preventDefault();
                closeContextMenu();
                selectEntriesByRowClick(currentFolderEntry, event);
            });

            row.addEventListener("contextmenu", function (event) {
                event.preventDefault();
                openContextMenuForEntry(currentFolderEntry, event.clientX, event.clientY);
            });

            if (currentFolderEntry.can_write_children) {
                bindDropTarget(row, currentFolderEntry.path, { allowSameParent: true });
            }

            state.entryByPath.set(currentFolderEntry.path, currentFolderEntry);
            state.visibleEntryPaths.push(currentFolderEntry.path);
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

        function renderPermissionItems(container, items, selectedIdSet, emptyMessage, options) {
            if (!container) {
                return;
            }
            container.innerHTML = "";
            const settings = options || {};
            const isItemDisabled = typeof settings.isItemDisabled === "function"
                ? settings.isItemDisabled
                : function () { return false; };

            if (!Array.isArray(items) || items.length === 0) {
                const emptyNode = document.createElement("div");
                emptyNode.className = "ide-permission-empty";
                emptyNode.textContent = emptyMessage;
                container.appendChild(emptyNode);
                return;
            }

            items.forEach(function (item) {
                const row = document.createElement("label");
                row.className = "ide-permission-item";
                const disabled = Boolean(isItemDisabled(item));

                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = String(item.id);
                checkbox.disabled = disabled;
                checkbox.checked = !disabled && selectedIdSet.has(Number(item.id));

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
            return Array.from(container.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)'))
                .map(function (input) {
                    return Number(input.value);
                })
                .filter(function (value) {
                    return Number.isInteger(value) && value > 0;
                });
        }

        function setPermissionModalOpen(opened, entryOrEntries) {
            if (!permissionModal) {
                return;
            }
            permissionModal.hidden = !opened;
            syncModalBodyState();
            if (!opened) {
                state.permissionTargetEntry = null;
                state.permissionTargetEntries = [];
                return;
            }
            const entries = Array.isArray(entryOrEntries)
                ? entryOrEntries.filter(Boolean)
                : (entryOrEntries ? [entryOrEntries] : []);
            state.permissionTargetEntries = entries;
            state.permissionTargetEntry = entries[0] || null;
            if (permissionTarget) {
                if (entries.length > 1) {
                    permissionTarget.textContent = formatTemplate(
                        t("js_permission_target_multiple", "{count}개 항목"),
                        { count: entries.length }
                    );
                } else {
                    permissionTarget.textContent = entries[0] ? entries[0].path : "";
                }
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

        async function openPermissionModal(entryOrEntries) {
            const entries = Array.isArray(entryOrEntries)
                ? entryOrEntries.filter(Boolean)
                : (entryOrEntries ? [entryOrEntries] : []);
            if (entries.length === 0 || !aclApiUrl || !aclOptionsApiUrl) {
                return;
            }

            setPermissionModalOpen(true, entries);
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
            let selectedReadUserIds = new Set();
            let selectedReadGroupIds = new Set();
            let selectedWriteUserIds = new Set();
            let selectedWriteGroupIds = new Set();

            if (entries.length === 1) {
                const data = await requestJson(aclApiUrl + "?path=" + encodeURIComponent(entries[0].path));
                selectedReadUserIds = new Set(
                    Array.isArray(data.read_user_ids) ? data.read_user_ids.map(Number) : []
                );
                selectedReadGroupIds = new Set(
                    Array.isArray(data.read_group_ids) ? data.read_group_ids.map(Number) : []
                );
                selectedWriteUserIds = new Set(
                    Array.isArray(data.write_user_ids) ? data.write_user_ids.map(Number) : []
                );
                selectedWriteGroupIds = new Set(
                    Array.isArray(data.write_group_ids) ? data.write_group_ids.map(Number) : []
                );
            }

            const includesDirectory = entries.some(function (entry) {
                return entry.type === "dir";
            });
            renderPermissionItems(
                permissionReadUsersList,
                state.aclOptions.users,
                selectedReadUserIds,
                t("permission_empty_users", "표시할 사용자가 없습니다.")
            );
            renderPermissionItems(
                permissionReadGroupsList,
                state.aclOptions.groups,
                selectedReadGroupIds,
                t("permission_empty_groups", "표시할 그룹이 없습니다."),
                {
                    isItemDisabled: function (group) {
                        return includesDirectory && Boolean(group && group.isPublicAll);
                    }
                }
            );
            renderPermissionItems(
                permissionWriteUsersList,
                state.aclOptions.users,
                selectedWriteUserIds,
                t("permission_empty_users", "표시할 사용자가 없습니다.")
            );
            renderPermissionItems(
                permissionWriteGroupsList,
                state.aclOptions.groups,
                selectedWriteGroupIds,
                t("permission_empty_groups", "표시할 그룹이 없습니다."),
                {
                    isItemDisabled: function (group) {
                        return includesDirectory && Boolean(group && group.isPublicAll);
                    }
                }
            );
        }

        async function submitPermissionSettings() {
            const entries = state.permissionTargetEntries.length > 0
                ? state.permissionTargetEntries.slice()
                : (state.permissionTargetEntry ? [state.permissionTargetEntry] : []);
            if (entries.length === 0) {
                return;
            }

            const readUserIds = readCheckedIds(permissionReadUsersList);
            const readGroupIds = readCheckedIds(permissionReadGroupsList);
            const writeUserIds = readCheckedIds(permissionWriteUsersList);
            const writeGroupIds = readCheckedIds(permissionWriteGroupsList);
            await requestJson(
                aclApiUrl,
                buildPostOptions({
                    path: entries.length === 1 ? entries[0].path : undefined,
                    paths: entries.length > 1
                        ? entries.map(function (entry) {
                            return entry.path;
                        })
                        : undefined,
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
            const renamedPath = data && data.path ? data.path : "";
            if (entry.type === "dir" && renamedPath) {
                remapExpandedFoldersForRename(entry.path, renamedPath);
            }
            applySelection([data && data.path ? data.path : ""], {
                primaryPath: data && data.path ? data.path : "",
                anchorPath: data && data.path ? data.path : "",
                render: false,
            });
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

        async function deleteEntries(entriesOrEntry) {
            const entries = Array.isArray(entriesOrEntry)
                ? entriesOrEntry.filter(Boolean)
                : (entriesOrEntry ? [entriesOrEntry] : []);
            if (entries.length === 0) {
                return;
            }

            const isMultiple = entries.length > 1;
            const targetPaths = entries.map(function (entry) {
                return entry.path;
            });
            const confirmed = await requestConfirmDialog({
                title: t("delete_button", "삭제"),
                message: isMultiple
                    ? formatTemplate(
                        t("js_confirm_delete_entries", "선택한 {count}개 항목을 삭제할까요?"),
                        { count: entries.length }
                    )
                    : formatTemplate(
                        t("js_confirm_delete_entry", "정말 삭제할까요?\n{path}"),
                        { path: targetPaths[0] }
                    ),
                cancelText: t("cancel", "취소"),
                confirmText: t("delete_button", "삭제")
            });
            if (!confirmed) {
                return;
            }

            await requestJson(
                deleteApiUrl,
                buildPostOptions({
                    path: isMultiple ? undefined : targetPaths[0],
                    paths: isMultiple ? targetPaths : undefined,
                })
            );
            removeExpandedFoldersByDeletedPaths(targetPaths);
            applySelection([], { render: false });
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
            state.openingFolderPath = folderPath;
            renderList();
        }

        function openEntry(entry) {
            if (!entry) {
                return;
            }
            if (entry.type === "dir") {
                window.location.href = buildListUrl(ideBaseUrl, entry.path);
                return;
            }
            window.location.href = buildViewUrl(ideBaseUrl, entry.slug_path || entry.path);
        }

        function openEntriesInNewTabs(entries) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return;
            }
            entries.forEach(function (entry) {
                const targetUrl = entry.type === "dir"
                    ? buildListUrl(ideBaseUrl, entry.path)
                    : buildViewUrl(ideBaseUrl, entry.slug_path || entry.path);
                window.open(targetUrl, "_blank", "noopener");
            });
        }

        function buildDownloadUrl(pathValue) {
            if (!downloadApiUrl) {
                return "";
            }
            const query = new URLSearchParams({ path: pathValue || "" }).toString();
            return query ? downloadApiUrl + "?" + query : downloadApiUrl;
        }

        function downloadEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0 || !downloadApiUrl) {
                return;
            }
            const fileEntries = entries.filter(function (entry) {
                return Boolean(entry) && entry.type === "file" && !entry.isCurrentFolder;
            });
            fileEntries.forEach(function (entry) {
                const targetUrl = buildDownloadUrl(entry.path);
                if (!targetUrl) {
                    return;
                }
                window.open(targetUrl, "_blank", "noopener");
            });
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
            prefix.className = "ide-item-tree-prefix";
            prefix.setAttribute("aria-hidden", "true");

            const ancestorFlags = ancestorHasNextSiblings || [];
            ancestorFlags.forEach(function (hasNextSibling) {
                const segment = document.createElement("span");
                segment.className = "ide-tree-segment" + (hasNextSibling ? " has-next" : "");
                prefix.appendChild(segment);
            });

            const branch = document.createElement("span");
            branch.className = "ide-tree-segment ide-tree-branch " + (isLastSibling ? "is-last" : "is-middle");
            prefix.appendChild(branch);

            if (ancestorFlags.length === 0) {
                prefix.classList.add("is-root-depth");
            }

            return prefix;
        }

        function addEntryNode(entry, fragment, ancestorHasNextSiblings, isLastSibling) {
            const item = document.createElement("li");
            item.className = "ide-item";
            const openingFolderPath = state.openingFolderPath;
            if (
                openingFolderPath &&
                entry.path &&
                entry.path !== openingFolderPath &&
                entry.path.startsWith(openingFolderPath + "/")
            ) {
                item.classList.add("is-entering");
                item.style.animationDelay = String(Math.min(140, state.openingAnimationOrder * 14)) + "ms";
                state.openingAnimationOrder += 1;
            }

            const row = document.createElement("button");
            row.type = "button";
            row.className = "ide-item-row has-tree-prefix";
            row.setAttribute("data-entry-path", entry.path);
            const isPublicWriteFile = Boolean(entry.type === "file" && entry.is_public_write);
            row.draggable = Boolean(moveApiUrl && entry.can_edit && !isPublicWriteFile);
            if (state.selectedPaths.has(entry.path)) {
                row.classList.add("is-selected");
            }

            const treePrefix = buildTreePrefixElement(ancestorHasNextSiblings, Boolean(isLastSibling));

            const typeMarker = document.createElement("span");
            typeMarker.className = "ide-item-type-icon " + (entry.type === "dir" ? "is-dir" : "is-file");
            typeMarker.setAttribute("aria-hidden", "true");

            const aclLabels = Array.isArray(entry.write_acl_labels) ? entry.write_acl_labels : [];
            const aclLabelLimit = 3;

            const name = document.createElement("span");
            name.className = "ide-item-name";
            name.textContent = entry.name;

            row.appendChild(typeMarker);
            row.appendChild(name);

            if (aclLabels.length > 0) {
                const aclWrap = document.createElement("span");
                aclWrap.className = "ide-item-acl-list";
                aclLabels.slice(0, aclLabelLimit).forEach(function (labelText) {
                    const aclBadge = document.createElement("span");
                    aclBadge.className = "ide-item-acl-badge";
                    aclBadge.textContent = String(labelText || "");
                    aclWrap.appendChild(aclBadge);
                });
                if (aclLabels.length > aclLabelLimit) {
                    const overflowBadge = document.createElement("span");
                    overflowBadge.className = "ide-item-acl-badge ide-item-acl-badge-overflow";
                    overflowBadge.textContent = "+" + String(aclLabels.length - aclLabelLimit);
                    aclWrap.appendChild(overflowBadge);
                }
                row.appendChild(aclWrap);
            }

            if (entry.type === "file" && entry.is_public_write) {
                const publicBadge = document.createElement("span");
                publicBadge.className = "ide-item-public-badge";
                publicBadge.textContent = t("public_write_badge", "전체 허용");
                row.appendChild(publicBadge);
            }

            row.addEventListener("click", function (event) {
                event.preventDefault();
                closeContextMenu();
                selectEntriesByRowClick(entry, event);
                if (entry.type === "dir") {
                    if (event.detail === 1 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
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
                openContextMenuForEntry(entry, event.clientX, event.clientY);
            });

            if (moveApiUrl) {
                row.addEventListener("dragstart", function (event) {
                    const draggingEntries = resolveDraggingEntriesFromRow(entry);
                    if (draggingEntries.length === 0) {
                        if (event.dataTransfer) {
                            event.dataTransfer.effectAllowed = "none";
                        }
                        event.preventDefault();
                        return;
                    }
                    state.draggingEntries = draggingEntries;
                    state.draggingRowPaths = new Set(
                        draggingEntries.map(function (item) {
                            return item.path;
                        })
                    );
                    row.classList.add("is-dragging");
                    clearDragOverTarget();
                    closeContextMenu();
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                            "text/plain",
                            draggingEntries.map(function (item) {
                                return item.path;
                            }).join("\n")
                        );
                    }
                });

                row.addEventListener("dragend", function () {
                    row.classList.remove("is-dragging");
                    state.draggingEntries = [];
                    state.draggingRowPaths = new Set();
                    clearDragOverTarget();
                });
            }

            if (entry.type === "dir") {
                const canWriteChildren = Boolean(entry.can_write_children);
                if (canWriteChildren) {
                    bindDropTarget(row, entry.path);
                }
            }

            item.appendChild(treePrefix);
            item.appendChild(row);
            fragment.appendChild(item);
            state.entryByPath.set(entry.path, entry);
            state.visibleEntryPaths.push(entry.path);

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
            state.openingAnimationOrder = 0;
            state.entryByPath = new Map();
            state.visibleEntryPaths = [];
            const fragment = document.createDocumentFragment();
            const entries = getCachedEntries(currentDir);
            addCurrentDirectoryNode(fragment);

            if (entries.length === 0) {
                const emptyItem = document.createElement("li");
                emptyItem.className = "ide-item";
                const emptyRow = document.createElement("div");
                emptyRow.className = "ide-item-row is-empty";
                emptyRow.textContent = t("js_empty_documents", "문서가 없습니다.");
                emptyItem.appendChild(emptyRow);
                fragment.appendChild(emptyItem);
                const filteredSelection = Array.from(state.selectedPaths).filter(function (pathValue) {
                    return state.entryByPath.has(pathValue);
                });
                state.selectedPaths = new Set(filteredSelection);
                state.selectedPath = state.selectedPaths.has(state.selectedPath) ? state.selectedPath : (filteredSelection[0] || "");
                state.selectionAnchorPath = state.selectedPaths.has(state.selectionAnchorPath)
                    ? state.selectionAnchorPath
                    : (state.selectedPath || "");
                listContainer.appendChild(fragment);
                syncPreviewFromSelection();
                state.openingFolderPath = "";
                return;
            }
            entries.forEach(function (entry, index) {
                const isLastRootEntry = index === entries.length - 1;
                addEntryNode(entry, fragment, [], isLastRootEntry);
            });
            const filteredSelection = Array.from(state.selectedPaths).filter(function (pathValue) {
                return state.entryByPath.has(pathValue);
            });
            state.selectedPaths = new Set(filteredSelection);
            state.selectedPath = state.selectedPaths.has(state.selectedPath) ? state.selectedPath : (filteredSelection[0] || "");
            state.selectionAnchorPath = state.selectedPaths.has(state.selectionAnchorPath)
                ? state.selectionAnchorPath
                : (state.selectedPath || "");
            listContainer.appendChild(fragment);
            syncPreviewFromSelection();
            scheduleSyncCurrentDirRowHeightWithSideHead();
            state.openingFolderPath = "";
        }

        function openContextMenuForEntry(entry, x, y) {
            if (!entry) {
                return;
            }
            if (!state.selectedPaths.has(entry.path)) {
                applySelection([entry.path], {
                    primaryPath: entry.path,
                    anchorPath: entry.path,
                });
            }
            openContextMenuAt(entry, x, y);
        }

        function bindDocsPathDropTargets() {
            if (!moveApiUrl) {
                return;
            }
            const pathTargets = document.querySelectorAll(".ide-path-link[data-ide-dir], .ide-path-current[data-ide-dir]");
            pathTargets.forEach(function (target) {
                const targetDirPath = normalizePath(target.getAttribute("data-ide-dir") || "", true);
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
                const entries = state.contextEntries.length > 0
                    ? state.contextEntries.slice()
                    : [entry];
                closeContextMenu();

                if (action === "open") {
                    if (entries.length > 1) {
                        openEntriesInNewTabs(entries);
                    } else {
                        openEntry(entry);
                    }
                    return;
                }
                if (action === "download") {
                    downloadEntries(entries);
                    return;
                }
                if (action === "rename") {
                    renameEntry(entry);
                    return;
                }
                if (action === "permissions") {
                    openPermissionModal(entries.length > 1 ? entries : entry).catch(alertError);
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
                    deleteEntries(entries.length > 1 ? entries : entry).catch(alertError);
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

        if (previewDeleteButton) {
            previewDeleteButton.addEventListener("click", function () {
                const selectedEntries = getSelectedEntries();
                if (selectedEntries.length !== 1) {
                    return;
                }
                const selectedEntry = selectedEntries[0];
                if (!isPreviewableFileEntry(selectedEntry) || !selectedEntry.can_edit) {
                    return;
                }
                deleteEntries(selectedEntry).catch(alertError);
            });
        }

        if (listContainer) {
            listContainer.addEventListener("contextmenu", function (event) {
                if (event.defaultPrevented) {
                    return;
                }
                const targetElement = event.target instanceof Element ? event.target : null;
                if (!targetElement) {
                    return;
                }
                const row = targetElement.closest(".ide-item-row");
                if (!row || !listContainer.contains(row)) {
                    return;
                }
                const entryPath = normalizePath(row.getAttribute("data-entry-path") || "", true);
                const entry = state.entryByPath.get(entryPath) || null;
                if (!entry) {
                    return;
                }
                event.preventDefault();
                openContextMenuForEntry(entry, event.clientX, event.clientY);
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
        window.addEventListener("resize", debouncedUpdateListLayoutMode, { passive: true });
        window.addEventListener("orientationchange", debouncedUpdateListLayoutMode, { passive: true });

        if (window.ResizeObserver && previewHead) {
            const previewHeadResizeObserver = new ResizeObserver(function () {
                scheduleSyncCurrentDirRowHeightWithSideHead();
            });
            previewHeadResizeObserver.observe(previewHead);
        }

        if (pathBreadcrumbs) {
            renderPathBreadcrumbs(currentDir);
        } else {
            bindDocsPathDropTargets();
        }
        
        // 초기화 시 약간의 지연 후 레이아웃 업데이트
        setTimeout(function() {
            updateListLayoutMode();
        }, 100);
        
        clearPreviewPane();
        renderList();
    }

    function initializeViewPage() {
        const ideBaseUrl = root.dataset.ideBaseUrl || "/ide";
        const deleteApiUrl = root.dataset.deleteApiUrl;
        const docPath = root.dataset.docPath || "";
        const parentDir = root.dataset.parentDir || "";
        const deleteButton = document.getElementById("ide-delete-btn");
        const contentArticle = document.querySelector(".ide-content > article");

        if (contentArticle && contentArticle.classList.contains("ide-js")) {
            applyDocsCodeHighlighting(contentArticle, "ide-js");
        } else if (contentArticle && contentArticle.classList.contains("ide-css")) {
            applyDocsCodeHighlighting(contentArticle, "ide-css");
        } else if (contentArticle && contentArticle.classList.contains("ide-json")) {
            applyDocsCodeHighlighting(contentArticle, "ide-json");
        } else if (contentArticle && contentArticle.classList.contains("ide-py")) {
            applyDocsCodeHighlighting(contentArticle, "ide-py");
        } else if (contentArticle && contentArticle.classList.contains("ide-markdown")) {
            applyDocsCodeHighlighting(contentArticle, "ide-markdown");
        }

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
                window.location.href = buildListUrl(ideBaseUrl, parentDir);
            } catch (error) {
                alertError(error);
            }
        });
    }

    function initializeWritePage() {
        const ideBaseUrl = root.dataset.ideBaseUrl || "/ide";
        const saveApiUrl = root.dataset.saveApiUrl;
        const previewApiUrl = root.dataset.previewApiUrl;
        const mkdirApiUrl = root.dataset.mkdirApiUrl;
        const originalPath = root.dataset.originalPath || "";
        const initialDir = root.dataset.initialDir || "";
        const isPublicWriteDirectSave = root.dataset.publicWriteDirectSave === "1";

        const filenameInput = document.getElementById("ide-filename-input");
        const saveFilenameInput = document.getElementById("ide-save-filename-input");
        const saveExtensionSelect = document.getElementById("ide-save-extension-select");
        const contentInput = document.getElementById("ide-content-input");
        const editorSurface = document.getElementById("ide-editor-surface");
        const editorHighlight = document.getElementById("ide-editor-highlight");
        const editorHighlightCode = document.getElementById("ide-editor-highlight-code");
        const editorSuggest = document.getElementById("ide-editor-suggest");
        const editorSuggestLabel = document.getElementById("ide-editor-suggest-label");
        const markdownHelpButton = document.getElementById("ide-markdown-help-btn");
        const markdownHelpModal = document.getElementById("ide-markdown-help-modal");
        const markdownHelpBackdrop = document.getElementById("ide-markdown-help-backdrop");
        const markdownPreviewButton = document.getElementById("ide-markdown-preview-btn");
        const markdownPreviewModal = document.getElementById("ide-markdown-preview-modal");
        const markdownPreviewBackdrop = document.getElementById("ide-markdown-preview-backdrop");
        const markdownPreviewContent = document.getElementById("ide-markdown-preview-content");
        const cancelButton = document.getElementById("ide-cancel-btn");
        const saveButton = document.getElementById("ide-save-btn");
        const createFolderButton = document.getElementById("ide-create-folder-btn");
        const saveModal = document.getElementById("ide-save-modal");
        const saveModalBackdrop = document.getElementById("ide-save-modal-backdrop");
        const saveCloseButton = document.getElementById("ide-save-close-btn");
        const saveCancelButton = document.getElementById("ide-save-cancel-btn");
        const saveConfirmButton = document.getElementById("ide-save-confirm-btn");
        const saveUpButton = document.getElementById("ide-save-up-btn");
        const saveBreadcrumb = document.getElementById("ide-save-breadcrumb");
        const saveQuickList = document.getElementById("ide-save-quick-list");
        const saveFolderList = document.getElementById("ide-save-folder-list");
        const folderModal = document.getElementById("ide-folder-modal");
        const folderModalBackdrop = document.getElementById("ide-folder-modal-backdrop");
        const folderNameInput = document.getElementById("ide-folder-name-input");
        const folderTargetPath = document.getElementById("ide-folder-target-path");
        const folderCancelButton = document.getElementById("ide-folder-cancel-btn");
        const folderCreateButton = document.getElementById("ide-folder-create-btn");
        const unsavedModal = document.getElementById("ide-unsaved-modal");
        const unsavedModalBackdrop = document.getElementById("ide-unsaved-modal-backdrop");
        const unsavedMessage = document.getElementById("ide-unsaved-message");
        const unsavedCancelButton = document.getElementById("ide-unsaved-cancel-btn");
        const unsavedLeaveButton = document.getElementById("ide-unsaved-leave-btn");
        const unsavedSaveButton = document.getElementById("ide-unsaved-save-btn");
        const directoryOptions = document.getElementById("ide-directory-options");
        const markdownSnippetMenu = document.getElementById("ide-markdown-snippet-menu");
        const markdownSnippetButtons = Array.from(
            document.querySelectorAll("button[data-editor-snippet]")
        );
        const DOCS_CUSTOM_EXTENSION_OPTION_VALUE = "__custom__";
        const extensionPresetValues = saveExtensionSelect
            ? Array.from(saveExtensionSelect.options)
                .map(function (option) {
                    return String(option.value || "").trim().toLowerCase();
                })
                .filter(function (value) {
                    return Boolean(value) && value !== DOCS_CUSTOM_EXTENSION_OPTION_VALUE;
                })
            : [".md"];
        const extensionPresetSet = new Set(extensionPresetValues);

        const rawDirectories = getJsonScriptData("ide-directory-data", []);
        const directories = [];
        const directorySet = new Set();
        const DOCS_DEFAULT_EXTENSION = ".md";
        let customExtensionValue = DOCS_DEFAULT_EXTENSION;
        const state = {
            browserDir: "",
            selectedDir: "",
        };
        let contentHeightRafId = null;
        let savedFilenameValue = filenameInput ? filenameInput.value : "";
        let savedContentValue = contentInput ? contentInput.value : "";
        let bypassUnsavedBeforeUnload = false;
        let pendingSaveThenLeaveAction = null;
        let resolveUnsavedChoice = null;
        let unsavedModalOpen = false;
        let lastUnsavedFocusedElement = null;
        let activeEditorSuggestions = [];
        let activeEditorSuggestionIndex = -1;
        let writeSuggestEventsBound = false;
        // 자동완성 단어 리스트는 전역 단일 맵(window.__docsEditorCompletionMap)만 사용
        const editorCompletionMap = window.__docsEditorCompletionMap || {};

        function markCurrentAsSaved() {
            savedFilenameValue = filenameInput ? filenameInput.value : "";
            savedContentValue = contentInput ? contentInput.value : "";
        }

        function hasUnsavedWriteChanges() {
            const currentFilename = filenameInput ? filenameInput.value : "";
            const currentContent = contentInput ? contentInput.value : "";
            return currentFilename !== savedFilenameValue || currentContent !== savedContentValue;
        }

        function runWithBeforeUnloadBypass(action) {
            if (typeof action !== "function") {
                return;
            }
            bypassUnsavedBeforeUnload = true;
            action();
            window.setTimeout(function () {
                bypassUnsavedBeforeUnload = false;
            }, 1200);
        }

        function setUnsavedModalOpen(opened) {
            if (!unsavedModal) {
                return;
            }
            unsavedModal.hidden = !opened;
            unsavedModalOpen = opened;
            syncModalBodyState();
            if (!opened && lastUnsavedFocusedElement && typeof lastUnsavedFocusedElement.focus === "function") {
                lastUnsavedFocusedElement.focus();
            }
            if (!opened) {
                lastUnsavedFocusedElement = null;
            }
        }

        function closeUnsavedModal(choice) {
            if (!unsavedModalOpen) {
                return;
            }
            setUnsavedModalOpen(false);
            if (resolveUnsavedChoice) {
                resolveUnsavedChoice(choice || "cancel");
                resolveUnsavedChoice = null;
            }
        }

        function requestUnsavedLeaveDecision() {
            if (
                !unsavedModal ||
                !unsavedModalBackdrop ||
                !unsavedCancelButton ||
                !unsavedLeaveButton ||
                !unsavedSaveButton
            ) {
                return requestConfirmDialog({
                    title: t("unsaved_changes_title", "수정 사항이 있습니다"),
                    message: t("unsaved_changes_message", "저장되지 않은 변경 사항이 있습니다. 이동 전에 저장할까요?"),
                    cancelText: t("cancel", "취소"),
                    confirmText: t("unsaved_changes_leave_button", "확인")
                }).then(function (confirmed) {
                    return confirmed ? "leave" : "cancel";
                });
            }

            if (resolveUnsavedChoice) {
                resolveUnsavedChoice("cancel");
                resolveUnsavedChoice = null;
            }

            if (unsavedMessage) {
                unsavedMessage.textContent = t(
                    "unsaved_changes_message",
                    "저장되지 않은 변경 사항이 있습니다. 이동 전에 저장할까요?"
                );
            }

            lastUnsavedFocusedElement = document.activeElement;
            setUnsavedModalOpen(true);
            unsavedCancelButton.focus();

            return new Promise(function (resolve) {
                resolveUnsavedChoice = resolve;
            });
        }

        function submitSaveThenLeave() {
            if (!pendingSaveThenLeaveAction) {
                return;
            }

            submitSave({
                redirectOnSuccess: false,
                onSuccess: function () {
                    const nextAction = pendingSaveThenLeaveAction;
                    pendingSaveThenLeaveAction = null;
                    if (typeof nextAction === "function") {
                        runWithBeforeUnloadBypass(nextAction);
                    }
                }
            });
        }

        function attemptLeaveWithUnsavedGuard(action) {
            if (typeof action !== "function") {
                return;
            }
            if (!hasUnsavedWriteChanges()) {
                runWithBeforeUnloadBypass(action);
                return;
            }

            requestUnsavedLeaveDecision().then(function (choice) {
                if (choice === "leave") {
                    runWithBeforeUnloadBypass(action);
                    return;
                }
                if (choice === "save") {
                    pendingSaveThenLeaveAction = action;
                    if (isPublicWriteDirectSave || !saveModal) {
                        submitSaveThenLeave();
                        return;
                    }
                    setSaveModalOpen(true);
                }
            });
        }

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

        function getCurrentEditorExtension() {
            const extension = resolveWriteFilenameExtension();
            return extension || DOCS_DEFAULT_EXTENSION;
        }

        function syncSnippetMenuItemsByExtension(extension) {
            if (!markdownSnippetMenu) {
                return 0;
            }
            const currentExtension = String(extension || "").trim().toLowerCase();
            let visibleCount = 0;
            markdownSnippetButtons.forEach(function (button) {
                const rawExtensions = String(button.getAttribute("data-editor-extensions") || "").trim();
                if (!rawExtensions) {
                    button.hidden = false;
                    visibleCount += 1;
                    return;
                }
                const allowed = rawExtensions
                    .split(",")
                    .map(function (value) { return String(value || "").trim().toLowerCase(); })
                    .filter(Boolean);
                const visible = allowed.includes(currentExtension);
                button.hidden = !visible;
                if (visible) {
                    visibleCount += 1;
                }
            });
            return visibleCount;
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

        function insertLanguageSnippet(snippetType, extension) {
            if (!contentInput) {
                return false;
            }

            let snippet = null;
            if (extension === ".py") {
                if (snippetType === "py_def") {
                    const body = "def function_name(params):\n    pass";
                    snippet = { text: body, selectStart: 4, selectEnd: 17 };
                } else if (snippetType === "py_class") {
                    const body = "class ClassName:\n    def __init__(self):\n        pass";
                    snippet = { text: body, selectStart: 6, selectEnd: 15 };
                } else if (snippetType === "py_ifmain") {
                    snippet = { text: "if __name__ == \"__main__\":\n    main()", selectStart: 29, selectEnd: 33 };
                } else if (snippetType === "py_comment") {
                    snippet = buildPrefixedLinesSnippet("# ", t("markdown_placeholder_list_item", "item"));
                }
            } else if (extension === ".js") {
                if (snippetType === "js_function") {
                    const body = "function functionName(params) {\n    \n}";
                    snippet = { text: body, selectStart: 9, selectEnd: 21 };
                } else if (snippetType === "js_if") {
                    snippet = { text: "if (condition) {\n    \n}", selectStart: 4, selectEnd: 13 };
                } else if (snippetType === "js_comment") {
                    snippet = buildPrefixedLinesSnippet("// ", t("markdown_placeholder_list_item", "item"));
                }
            } else if (extension === ".css") {
                if (snippetType === "css_rule") {
                    snippet = { text: ".selector {\n    property: value;\n}", selectStart: 1, selectEnd: 9 };
                } else if (snippetType === "css_media") {
                    snippet = { text: "@media (max-width: 768px) {\n    \n}", selectStart: 8, selectEnd: 23 };
                } else if (snippetType === "css_var") {
                    snippet = { text: ":root {\n    --color-name: #000;\n}", selectStart: 14, selectEnd: 24 };
                }
            } else if (extension === ".json") {
                if (snippetType === "json_pair") {
                    snippet = { text: "\"key\": \"value\"", selectStart: 1, selectEnd: 4 };
                } else if (snippetType === "json_object") {
                    snippet = { text: "{\n  \"key\": \"value\"\n}", selectStart: 5, selectEnd: 8 };
                }
            } else if (extension === ".html") {
                if (snippetType === "html_basic") {
                    snippet = {
                        text: "<!doctype html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>File</title>\n</head>\n<body>\n  \n</body>\n</html>",
                        selectStart: 82,
                        selectEnd: 90
                    };
                } else if (snippetType === "html_div") {
                    snippet = { text: "<div class=\"box\">\n  \n</div>", selectStart: 12, selectEnd: 15 };
                }
            }

            if (!snippet) {
                return false;
            }
            replaceTextareaSelection(snippet.text, snippet.selectStart, snippet.selectEnd);
            return true;
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
            if (editorSurface) {
                editorSurface.style.height = contentInput.style.height;
            }
            if (editorHighlight) {
                editorHighlight.style.height = contentInput.style.height;
            }
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
            return normalizePath(state.selectedDir || state.browserDir || "", true);
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

        function getCancelTargetDirectory() {
            if (originalPath) {
                return getParentPath(originalPath);
            }
            return normalizePath(state.selectedDir || state.browserDir || initialDir || "", true);
        }

        function getPathFileExtension(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "";
            }
            const segments = normalized.split("/");
            const fileName = segments[segments.length - 1] || "";
            const dotIndex = fileName.lastIndexOf(".");
            if (dotIndex <= 0) {
                return "";
            }
            return fileName.slice(dotIndex).toLowerCase();
        }

        function getPathFileStem(pathValue) {
            const normalized = normalizePath(pathValue, true);
            if (!normalized) {
                return "";
            }
            const segments = normalized.split("/");
            const fileName = segments[segments.length - 1] || "";
            const dotIndex = fileName.lastIndexOf(".");
            if (dotIndex > 0) {
                return fileName.slice(0, dotIndex);
            }
            return fileName;
        }

        function normalizeFileExtensionValue(rawValue, allowEmpty) {
            const candidate = String(rawValue || "").trim().toLowerCase();
            if (!candidate) {
                if (allowEmpty) {
                    return "";
                }
                throw new Error(t("js_extension_required", "확장자를 입력해주세요."));
            }

            const normalized = candidate.startsWith(".") ? candidate : "." + candidate;
            if (!/^\.[a-z0-9][a-z0-9._-]{0,15}$/.test(normalized)) {
                throw new Error(t("js_extension_invalid", "확장자 형식이 올바르지 않습니다. 예: .md"));
            }
            return normalized;
        }

        function parseFileNameWithExtension(rawValue) {
            const trimmed = String(rawValue || "").trim();
            if (!trimmed) {
                return { filename: "", extension: "" };
            }

            const dotIndex = trimmed.lastIndexOf(".");
            if (dotIndex > 0 && dotIndex < trimmed.length - 1) {
                return {
                    filename: trimmed.slice(0, dotIndex).trim(),
                    extension: trimmed.slice(dotIndex).toLowerCase()
                };
            }
            return { filename: trimmed, extension: "" };
        }

        function syncExtensionSelectFromValue(extensionValue) {
            if (!saveExtensionSelect) {
                return;
            }
            let normalized = "";
            try {
                normalized = normalizeFileExtensionValue(extensionValue, true);
            } catch (error) {
                normalized = "";
            }
            if (!normalized) {
                normalized = DOCS_DEFAULT_EXTENSION;
            }
            if (extensionPresetSet.has(normalized)) {
                saveExtensionSelect.value = normalized;
                customExtensionValue = DOCS_DEFAULT_EXTENSION;
                return;
            }
            customExtensionValue = normalized;
            if (saveExtensionSelect.querySelector('option[value="' + DOCS_CUSTOM_EXTENSION_OPTION_VALUE + '"]')) {
                saveExtensionSelect.value = DOCS_CUSTOM_EXTENSION_OPTION_VALUE;
                return;
            }
            saveExtensionSelect.value = DOCS_DEFAULT_EXTENSION;
        }

        function getSelectedExtensionOrDefault() {
            if (!saveExtensionSelect) {
                return DOCS_DEFAULT_EXTENSION;
            }
            const selected = String(saveExtensionSelect.value || "").trim();
            if (!selected) {
                return DOCS_DEFAULT_EXTENSION;
            }
            if (selected === DOCS_CUSTOM_EXTENSION_OPTION_VALUE) {
                try {
                    return normalizeFileExtensionValue(customExtensionValue, false);
                } catch (error) {
                    return DOCS_DEFAULT_EXTENSION;
                }
            }
            return normalizeFileExtensionValue(selected, false);
        }

        function getSaveModalFilenameAndExtension() {
            const parsed = parseFileNameWithExtension(saveFilenameInput ? saveFilenameInput.value : "");
            const finalFilename = String(parsed.filename || "").trim();
            if (!finalFilename) {
                throw new Error(t("js_filename_required", "파일명을 입력해주세요."));
            }

            let extensionCandidate = parsed.extension;
            if (!extensionCandidate) {
                extensionCandidate = getSelectedExtensionOrDefault();
            }
            const targetExtension = normalizeFileExtensionValue(extensionCandidate, false);
            return {
                filename: finalFilename,
                extension: targetExtension,
            };
        }

        function resolveWriteFilenameExtension() {
            const parsed = parseFileNameWithExtension(filenameInput ? filenameInput.value : "");
            if (!parsed.extension) {
                return "";
            }
            try {
                return normalizeFileExtensionValue(parsed.extension, false);
            } catch (error) {
                return "";
            }
        }

        function resolveWriteEditorRenderClass() {
            const extension = resolveWriteFilenameExtension();
            if (extension === ".md") {
                return "ide-editor-md";
            }
            if (extension === ".js") {
                return "ide-js";
            }
            if (extension === ".css") {
                return "ide-css";
            }
            if (extension === ".json") {
                return "ide-json";
            }
            if (extension === ".py") {
                return "ide-py";
            }
            if (extension === ".html") {
                return "ide-editor-html";
            }
            return "ide-plain-text";
        }

        function syncEditorHighlightScroll() {
            if (!contentInput || !editorHighlight) {
                return;
            }
            editorHighlight.scrollTop = contentInput.scrollTop;
            editorHighlight.scrollLeft = contentInput.scrollLeft;
        }

        function clearEditorSuggestion() {
            activeEditorSuggestions = [];
            activeEditorSuggestionIndex = -1;
            if (editorSuggest) {
                editorSuggest.hidden = true;
                // 위치 스타일 초기화
                editorSuggest.style.left = '';
                editorSuggest.style.top = '';
                editorSuggest.innerHTML = "";
            }
            if (editorSuggestLabel) {
                editorSuggestLabel.textContent = "";
            }
        }

        function findEditorSuggestions(extension, tokenText) {
            const items = editorCompletionMap[extension] || [];
            return findEditorCompletionItems(items, tokenText, 8);
        }

        function renderWriteEditorSuggestDropdown() {
            if (!editorSuggest) {
                return;
            }
            editorSuggest.innerHTML = "";
            const list = document.createElement("div");
            list.className = "ide-editor-suggest-list";
            for (let i = 0; i < activeEditorSuggestions.length; i += 1) {
                const item = activeEditorSuggestions[i] || {};
                const option = document.createElement("button");
                option.type = "button";
                option.className = "ide-editor-suggest-item" + (i === activeEditorSuggestionIndex ? " is-active" : "");
                option.setAttribute("data-suggest-index", String(i));

                const labelNode = document.createElement("span");
                labelNode.className = "ide-editor-suggest-item-label";
                labelNode.textContent = item.label || item.insertText || "";

                const triggerNode = document.createElement("span");
                triggerNode.className = "ide-editor-suggest-item-trigger";
                triggerNode.textContent = item.trigger || "";

                option.appendChild(labelNode);
                option.appendChild(triggerNode);
                list.appendChild(option);
            }
            const footer = document.createElement("div");
            footer.className = "ide-editor-suggest-footer";
            footer.textContent = "↑↓ 이동 · Enter/Tab 적용";
            editorSuggest.appendChild(list);
            editorSuggest.appendChild(footer);
        }

        function moveWriteEditorSuggestion(step) {
            if (!activeEditorSuggestions.length) {
                return;
            }
            const count = activeEditorSuggestions.length;
            activeEditorSuggestionIndex = (activeEditorSuggestionIndex + step + count) % count;
            renderWriteEditorSuggestDropdown();
        }

        function updateEditorSuggestion() {
            if (!contentInput || !editorSuggest) {
                return;
            }
            const start = contentInput.selectionStart || 0;
            const end = contentInput.selectionEnd || 0;
            if (start !== end) {
                clearEditorSuggestion();
                return;
            }

            const extension = getCurrentEditorExtension();
            const tokenInfo = extractEditorCompletionToken(contentInput.value || "", start);
            if (!tokenInfo) {
                clearEditorSuggestion();
                return;
            }
            const suggestions = findEditorSuggestions(extension, tokenInfo.token);
            if (!suggestions.length) {
                clearEditorSuggestion();
                return;
            }

            activeEditorSuggestions = suggestions.map(function (suggestion) {
                return {
                    start: tokenInfo.start,
                    end: tokenInfo.end,
                    insertText: suggestion.insertText,
                    cursorBack: Number(suggestion.cursorBack || 0),
                    label: suggestion.label || suggestion.insertText,
                    trigger: suggestion.trigger || "",
                };
            });
            activeEditorSuggestionIndex = 0;
            renderWriteEditorSuggestDropdown();
            
            // 커서 위치 계산
            const cursorPosition = calculateCursorPosition(contentInput, start);
            if (cursorPosition) {
                // 에디터 서페이스 내에서의 상대 위치 계산
                const editorRect = contentInput.getBoundingClientRect();
                const surfaceRect = editorSurface ? editorSurface.getBoundingClientRect() : null;
                
                // 커서 기준으로 오른쪽 12픽셀, 아래 6픽셀
                let left = cursorPosition.left + 12;
                let top = cursorPosition.top + (cursorPosition.lineHeight || 20) + 6;
                
                // 에디터 서페이스가 있으면 상대 위치 조정
                if (surfaceRect) {
                    left = (cursorPosition.left + 12) - surfaceRect.left;
                    top = (cursorPosition.top + (cursorPosition.lineHeight || 20) + 6) - surfaceRect.top;
                }

                const suggestRect = editorSuggest.getBoundingClientRect();
                if (surfaceRect) {
                    const minLeft = 8;
                    const minTop = 8;
                    const maxLeft = Math.max(minLeft, surfaceRect.width - suggestRect.width - 8);
                    const maxTop = Math.max(minTop, surfaceRect.height - suggestRect.height - 8);
                    left = Math.min(Math.max(minLeft, left), maxLeft);
                    top = Math.min(Math.max(minTop, top), maxTop);
                }
                
                editorSuggest.style.left = left + 'px';
                editorSuggest.style.top = top + 'px';
            }
            editorSuggest.hidden = false;
        }

        function calculateCursorPosition(textarea, position) {
            // 텍스트 영역에서 커서의 픽셀 위치 계산
            const text = textarea.value;
            const textBeforeCursor = text.substring(0, position);
            const lines = textBeforeCursor.split('\n');
            const currentLine = lines.length - 1;
            const currentColumn = lines[lines.length - 1].length;
            
            // textarea의 스타일 정보 가져오기
            const styles = window.getComputedStyle(textarea);
            const fontSize = parseFloat(styles.fontSize);
            const lineHeight = parseFloat(styles.lineHeight) || fontSize * 1.2;
            const fontFamily = styles.fontFamily;
            const paddingLeft = parseFloat(styles.paddingLeft) || 0;
            const paddingTop = parseFloat(styles.paddingTop) || 0;
            const borderLeft = parseFloat(styles.borderLeftWidth) || 0;
            const borderTop = parseFloat(styles.borderTopWidth) || 0;
            
            // 캔버스를 사용해서 텍스트 너비 계산
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = `${fontSize}px ${fontFamily}`;
            
            // 현재 라인의 텍스트 너비 계산
            const lineWidth = context.measureText(lines[lines.length - 1]).width;
            
            // textarea의 실제 위치
            const textareaRect = textarea.getBoundingClientRect();
            
            // 스크롤 위치 고려
            const scrollTop = textarea.scrollTop;
            const scrollLeft = textarea.scrollLeft;
            
            // 커서의 절대 위치 계산
            const left = textareaRect.left + paddingLeft + borderLeft + lineWidth - scrollLeft;
            const top = textareaRect.top + paddingTop + borderTop + (currentLine * lineHeight) - scrollTop;
            
            return {
                left: left,
                top: top,
                lineHeight: lineHeight
            };
        }

        window.__docsCalculateCursorPosition = calculateCursorPosition;

        function acceptEditorSuggestion() {
            if (!contentInput) {
                return false;
            }
            const suggestion = activeEditorSuggestions[activeEditorSuggestionIndex] || null;
            if (!suggestion) {
                return false;
            }
            contentInput.setRangeText(suggestion.insertText, suggestion.start, suggestion.end, "end");
            const cursorPos = (suggestion.start + suggestion.insertText.length) - Math.max(0, suggestion.cursorBack);
            contentInput.setSelectionRange(cursorPos, cursorPos);
            contentInput.focus();
            contentInput.dispatchEvent(new Event("input", { bubbles: true }));
            clearEditorSuggestion();
            return true;
        }

        function renderWriteEditorHighlight() {
            if (!contentInput || !editorHighlight || !editorHighlightCode) {
                return;
            }

            const renderClass = resolveWriteEditorRenderClass();
            const source = contentInput.value || "";
            let highlightedHtml = escapeHtml(source);
            
            // .md 파일일 때는 마크다운 렌더링을 하지 않음
            if (renderClass === "ide-js") {
                highlightedHtml = highlightJavaScriptCode(source);
            } else if (renderClass === "ide-editor-md") {
                // .md 파일은 plain text로 표시
                highlightedHtml = escapeHtml(source);
            } else if (renderClass === "ide-css") {
                highlightedHtml = highlightCssCode(source);
            } else if (renderClass === "ide-json") {
                highlightedHtml = highlightJsonCode(source);
            } else if (renderClass === "ide-py") {
                highlightedHtml = highlightPythonCode(source);
            } else if (renderClass === "ide-editor-html") {
                highlightedHtml = highlightHtmlCode(source);
            }

            editorHighlight.classList.remove("ide-plain-text", "ide-editor-md", "ide-js", "ide-css", "ide-json", "ide-py", "ide-editor-html");
            editorHighlight.classList.add(renderClass);
            editorHighlightCode.innerHTML = highlightedHtml + (source.endsWith("\n") ? "\u200b" : "");
            syncEditorHighlightScroll();
            updateEditorSuggestion();
        }

        function syncMarkdownHelpButtonVisibility() {
            if (!markdownHelpButton && !markdownPreviewButton) {
                renderWriteEditorHighlight();
                return;
            }
            const resolvedExtension = resolveWriteFilenameExtension();
            const isMarkdownTarget = resolvedExtension === DOCS_DEFAULT_EXTENSION;
            if (markdownHelpButton) {
                markdownHelpButton.hidden = !isMarkdownTarget;
                markdownHelpButton.disabled = !isMarkdownTarget;
            }
            if (markdownPreviewButton) {
                markdownPreviewButton.hidden = !isMarkdownTarget;
                markdownPreviewButton.disabled = !isMarkdownTarget;
            }
            renderWriteEditorHighlight();
        }

        function buildFilenameWithExtension(filenameValue, extensionValue) {
            const baseName = String(filenameValue || "").trim();
            if (!baseName) {
                return "";
            }
            const normalizedExtension = normalizeFileExtensionValue(extensionValue, false);
            return baseName + normalizedExtension;
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
                crumbButton.className = "ide-save-crumb-btn";
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

            const currentPath = normalizePath(state.selectedDir || state.browserDir, true);
            addCrumb("/ide", "", !currentPath);

            if (currentPath) {
                const parts = currentPath.split("/");
                const accumulated = [];
                parts.forEach(function (part) {
                    const separator = document.createElement("span");
                    separator.className = "ide-save-crumb-sep";
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
                button.className = "ide-save-side-row";
                if (pathValue === state.browserDir) {
                    button.classList.add("is-active");
                }
                button.textContent = pathValue ? pathValue.split("/").slice(-1)[0] : "IDE 루트";
                if (!pathValue) {
                    button.textContent = t("js_docs_root_label", "IDE 루트");
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
                emptyItem.className = "ide-save-folder-empty";
                emptyItem.textContent = t("js_no_child_folders", "하위 폴더가 없습니다.");
                saveFolderList.appendChild(emptyItem);
                return;
            }

            childDirs.forEach(function (dirPath) {
                const item = document.createElement("li");
                const row = document.createElement("button");
                row.type = "button";
                row.className = "ide-save-folder-row";
                if (dirPath === state.selectedDir) {
                    row.classList.add("is-selected");
                }

                const icon = document.createElement("span");
                icon.className = "ide-save-folder-icon";
                icon.setAttribute("aria-hidden", "true");

                const name = document.createElement("span");
                name.className = "ide-save-folder-name";
                name.textContent = dirPath.split("/").slice(-1)[0];

                row.appendChild(icon);
                row.appendChild(name);

                row.addEventListener("click", function () {
                    updateSelectedDir(dirPath);
                    renderBreadcrumb();
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
            return normalized ? "/ide/" + normalized : "/ide";
        }

        function getFolderCreateBasePath() {
            return normalizeDirectoryInput();
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

            applyDocsRenderedContentModeClass(markdownPreviewContent, "plain_text", "ide-plain-text");
            markdownPreviewContent.innerHTML = "<p>" + t("markdown_preview_loading", "Loading preview...") + "</p>";
            setMarkdownPreviewModalOpen(true);

            if (!previewApiUrl) {
                markdownPreviewContent.innerHTML = "<p>" + t("js_error_request_failed", "요청 처리 중 오류가 발생했습니다.") + "</p>";
                return;
            }

            try {
                let previewExtension = getPathFileExtension(originalPath) || DOCS_DEFAULT_EXTENSION;
                if (!originalPath && saveFilenameInput) {
                    const parsed = parseFileNameWithExtension(saveFilenameInput.value);
                    if (parsed.extension) {
                        previewExtension = parsed.extension;
                    } else if (saveExtensionSelect) {
                        previewExtension = getSelectedExtensionOrDefault();
                    }
                }
                const data = await requestJson(
                    previewApiUrl,
                    buildPostOptions({
                        original_path: originalPath,
                        extension: previewExtension,
                        content: contentInput ? contentInput.value : "",
                    })
                );
                const renderMode = data && data.render_mode === "markdown" ? "markdown" : "plain_text";
                const renderClass = data && typeof data.render_class === "string" ? data.render_class : "";
                applyDocsRenderedContentModeClass(markdownPreviewContent, renderMode, renderClass);
                markdownPreviewContent.innerHTML = data && typeof data.html === "string" ? data.html : "";
                applyDocsCodeHighlighting(markdownPreviewContent, renderClass || "ide-markdown");
            } catch (error) {
                applyDocsRenderedContentModeClass(markdownPreviewContent, "plain_text", "ide-plain-text");
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

            let modalInitialDir = "";
            try {
                modalInitialDir = normalizeDirectoryInput();
            } catch (error) {
                modalInitialDir = "";
            }
            if (!modalInitialDir) {
                modalInitialDir = normalizePath(initialDir, true);
            }
            if (!hasDirectory(modalInitialDir)) {
                modalInitialDir = "";
            }
            state.browserDir = modalInitialDir;
            updateSelectedDir(modalInitialDir);
            renderBrowser();

            const parsedMainFilename = parseFileNameWithExtension(filenameInput ? filenameInput.value : "");
            const extensionCandidate = parsedMainFilename.extension || getPathFileExtension(originalPath) || DOCS_DEFAULT_EXTENSION;
            syncExtensionSelectFromValue(extensionCandidate);
            const filenameCandidate = String(parsedMainFilename.filename || "").trim();

            if (saveFilenameInput) {
                saveFilenameInput.value = buildFilenameWithExtension(filenameCandidate, extensionCandidate);
            }

            if (saveFilenameInput) {
                saveFilenameInput.focus();
                saveFilenameInput.select();
            }
        }

        async function submitSave(options) {
            const settings = options || {};
            const redirectOnSuccess = settings.redirectOnSuccess !== false;
            const onSuccess = typeof settings.onSuccess === "function" ? settings.onSuccess : null;

            let finalFilename = String(filenameInput ? filenameInput.value : "").trim();
            let targetExtension = DOCS_DEFAULT_EXTENSION;
            let targetDir = "";
            if (isPublicWriteDirectSave && originalPath) {
                targetDir = getParentPath(originalPath);
                finalFilename = getPathFileStem(originalPath) || finalFilename;
                targetExtension = getPathFileExtension(originalPath) || DOCS_DEFAULT_EXTENSION;
            } else {
                try {
                    targetDir = normalizeDirectoryInput();
                    if (saveModal && !saveModal.hidden && saveFilenameInput) {
                        const saveTarget = getSaveModalFilenameAndExtension();
                        finalFilename = saveTarget.filename;
                        targetExtension = saveTarget.extension;
                    } else {
                        if (!finalFilename) {
                            throw new Error(t("js_filename_required", "파일명을 입력해주세요."));
                        }
                        targetExtension = getSelectedExtensionOrDefault();
                    }
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
            if (filenameInput) {
                filenameInput.value = finalFilename;
            }
            if (saveFilenameInput) {
                saveFilenameInput.value = buildFilenameWithExtension(finalFilename, targetExtension);
            }

            try {
                const payload = {
                    original_path: originalPath,
                    target_dir: targetDir,
                    filename: finalFilename,
                    extension: targetExtension,
                    content: contentInput ? contentInput.value : ""
                };
                const data = await requestJson(saveApiUrl, buildPostOptions(payload));
                markCurrentAsSaved();

                if (saveModal && !saveModal.hidden) {
                    setSaveModalOpen(false);
                }

                if (onSuccess) {
                    onSuccess(data || {});
                    return data || {};
                }

                if (!redirectOnSuccess) {
                    return data || {};
                }

                if (data && data.slug_path) {
                    runWithBeforeUnloadBypass(function () {
                        window.location.href = buildViewUrl(ideBaseUrl, data.slug_path);
                    });
                    return data || {};
                }
                runWithBeforeUnloadBypass(function () {
                    window.location.href = ideBaseUrl;
                });
                return data || {};
            } catch (error) {
                alertError(error);
            }
        }

        rawDirectories.forEach(function (pathValue) {
            upsertDirectory(pathValue);
        });
        upsertDirectory("");
        upsertDirectory(initialDir || "");
        renderDirectoryOptions();
        if (saveExtensionSelect) {
            const initialExtension = getPathFileExtension(originalPath) || DOCS_DEFAULT_EXTENSION;
            syncExtensionSelectFromValue(initialExtension);
        }
        syncMarkdownHelpButtonVisibility();

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

        if (cancelButton) {
            cancelButton.addEventListener("click", function () {
                const targetDir = getCancelTargetDirectory();
                attemptLeaveWithUnsavedGuard(function () {
                    window.location.assign(buildListUrl(ideBaseUrl, targetDir));
                });
            });
        }

        if (saveExtensionSelect && saveFilenameInput) {
            saveExtensionSelect.addEventListener("change", function () {
                const selectedValue = String(saveExtensionSelect.value || "").trim().toLowerCase();
                let selectedExtension = DOCS_DEFAULT_EXTENSION;
                if (selectedValue === DOCS_CUSTOM_EXTENSION_OPTION_VALUE) {
                    const parsedCurrent = parseFileNameWithExtension(saveFilenameInput.value);
                    if (parsedCurrent.extension) {
                        customExtensionValue = parsedCurrent.extension;
                    }
                    try {
                        selectedExtension = getSelectedExtensionOrDefault();
                    } catch (error) {
                        selectedExtension = DOCS_DEFAULT_EXTENSION;
                    }
                } else {
                    try {
                        selectedExtension = getSelectedExtensionOrDefault();
                    } catch (error) {
                        alertError(error);
                        return;
                    }
                }

                const parsed = parseFileNameWithExtension(saveFilenameInput.value);
                const baseName = parsed.filename || String(filenameInput ? filenameInput.value : "").trim();
                saveFilenameInput.value = buildFilenameWithExtension(baseName, selectedExtension);
                saveFilenameInput.focus();
                syncMarkdownHelpButtonVisibility();
            });

            saveFilenameInput.addEventListener("input", function () {
                try {
                    const parsed = parseFileNameWithExtension(saveFilenameInput.value);
                    if (parsed.extension && extensionPresetSet.has(parsed.extension)) {
                        saveExtensionSelect.value = parsed.extension;
                        return;
                    }
                    if (parsed.extension) {
                        customExtensionValue = parsed.extension;
                        if (saveExtensionSelect.querySelector('option[value="' + DOCS_CUSTOM_EXTENSION_OPTION_VALUE + '"]')) {
                            saveExtensionSelect.value = DOCS_CUSTOM_EXTENSION_OPTION_VALUE;
                        }
                    }
                } catch (error) {
                    // Ignore extension auto-sync errors while typing.
                }
            });
        }

        if (filenameInput) {
            const refreshMarkdownButtonVisibility = function () {
                syncMarkdownHelpButtonVisibility();
            };
            filenameInput.addEventListener("input", refreshMarkdownButtonVisibility);
            filenameInput.addEventListener("change", refreshMarkdownButtonVisibility);
        }

        if (contentInput) {
            contentInput.addEventListener("input", renderWriteEditorHighlight);
            contentInput.addEventListener("scroll", syncEditorHighlightScroll, { passive: true });
            contentInput.addEventListener("click", updateEditorSuggestion);
            contentInput.addEventListener("keyup", function (event) {
                if (
                    event.key === "Tab" ||
                    event.key === "ArrowDown" ||
                    event.key === "ArrowUp" ||
                    event.key === "Enter" ||
                    event.key === "Escape"
                ) {
                    return;
                }
                updateEditorSuggestion();
            });
            contentInput.addEventListener("keydown", function (event) {
                if (event.key === "Escape") {
                    clearEditorSuggestion();
                    return;
                }
                if (!editorSuggest.hidden && event.key === "ArrowDown") {
                    event.preventDefault();
                    moveWriteEditorSuggestion(1);
                    return;
                }
                if (!editorSuggest.hidden && event.key === "ArrowUp") {
                    event.preventDefault();
                    moveWriteEditorSuggestion(-1);
                    return;
                }
                if (!editorSuggest.hidden && event.key === "Enter") {
                    if (acceptEditorSuggestion()) {
                        event.preventDefault();
                    }
                    return;
                }
                if (event.key !== "Tab" || event.shiftKey) {
                    return;
                }
                if (acceptEditorSuggestion()) {
                    event.preventDefault();
                    return;
                }
                event.preventDefault();
                replaceTextareaSelection("    ", 4, 4);
            });
        }

        if (editorSuggest && !writeSuggestEventsBound) {
            writeSuggestEventsBound = true;
            editorSuggest.addEventListener("mousedown", function (event) {
                event.preventDefault();
            });
            editorSuggest.addEventListener("click", function (event) {
                const target = event.target instanceof Element
                    ? event.target.closest("[data-suggest-index]")
                    : null;
                if (!target) {
                    return;
                }
                const index = Number(target.getAttribute("data-suggest-index"));
                if (!Number.isInteger(index)) {
                    return;
                }
                activeEditorSuggestionIndex = index;
                if (acceptEditorSuggestion()) {
                    event.preventDefault();
                }
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
                const snippetType = button.getAttribute("data-editor-snippet") || "";
                const currentExtension = getCurrentEditorExtension();
                if (currentExtension === DOCS_DEFAULT_EXTENSION) {
                    insertMarkdownSnippet(snippetType);
                } else if (!insertLanguageSnippet(snippetType, currentExtension)) {
                    insertMarkdownSnippet(snippetType);
                }
                closeMarkdownSnippetMenu();
            });
        });

        if (contentInput && markdownSnippetMenu) {
            contentInput.addEventListener("contextmenu", function (event) {
                const visibleCount = syncSnippetMenuItemsByExtension(getCurrentEditorExtension());
                if (visibleCount <= 0) {
                    return;
                }
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

        if (unsavedModalBackdrop) {
            unsavedModalBackdrop.addEventListener("click", function () {
                closeUnsavedModal("cancel");
            });
        }

        if (unsavedCancelButton) {
            unsavedCancelButton.addEventListener("click", function () {
                closeUnsavedModal("cancel");
            });
        }

        if (unsavedLeaveButton) {
            unsavedLeaveButton.addEventListener("click", function () {
                closeUnsavedModal("leave");
            });
        }

        if (unsavedSaveButton) {
            unsavedSaveButton.addEventListener("click", function () {
                closeUnsavedModal("save");
            });
        }

        if (saveModalBackdrop) {
            saveModalBackdrop.addEventListener("click", function () {
                pendingSaveThenLeaveAction = null;
                setSaveModalOpen(false);
            });
        }

        if (saveCloseButton) {
            saveCloseButton.addEventListener("click", function () {
                pendingSaveThenLeaveAction = null;
                setSaveModalOpen(false);
            });
        }

        if (saveCancelButton) {
            saveCancelButton.addEventListener("click", function () {
                pendingSaveThenLeaveAction = null;
                setSaveModalOpen(false);
            });
        }

        if (saveConfirmButton) {
            saveConfirmButton.addEventListener("click", function () {
                if (pendingSaveThenLeaveAction) {
                    submitSaveThenLeave();
                    return;
                }
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
            if (unsavedModal && !unsavedModal.hidden) {
                closeUnsavedModal("cancel");
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

        window.addEventListener("beforeunload", function (event) {
            if (bypassUnsavedBeforeUnload || !hasUnsavedWriteChanges()) {
                return;
            }
            event.preventDefault();
            event.returnValue = "";
        });

        document.addEventListener("click", function (event) {
            if (event.defaultPrevented || !hasUnsavedWriteChanges()) {
                return;
            }
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }
            if (!(event.target instanceof Element)) {
                return;
            }

            const anchor = event.target.closest("a[href]");
            if (!anchor) {
                return;
            }
            if (anchor.hasAttribute("download")) {
                return;
            }

            const targetAttr = String(anchor.getAttribute("target") || "").toLowerCase();
            if (targetAttr && targetAttr !== "_self") {
                return;
            }

            const hrefAttr = String(anchor.getAttribute("href") || "").trim();
            if (!hrefAttr || hrefAttr === "#" || hrefAttr.startsWith("javascript:")) {
                return;
            }

            if (hrefAttr.startsWith("#")) {
                return;
            }

            event.preventDefault();
            attemptLeaveWithUnsavedGuard(function () {
                window.location.assign(anchor.href);
            });
        }, true);

        document.addEventListener("submit", function (event) {
            if (event.defaultPrevented || !hasUnsavedWriteChanges()) {
                return;
            }
            if (!(event.target instanceof HTMLFormElement)) {
                return;
            }
            const form = event.target;
            event.preventDefault();
            attemptLeaveWithUnsavedGuard(function () {
                form.submit();
            });
        }, true);

        document.addEventListener("keydown", function (event) {
            const key = String(event.key || "");
            const loweredKey = key.toLowerCase();
            const isReloadHotkey = key === "F5" || ((event.metaKey || event.ctrlKey) && loweredKey === "r");
            if (!isReloadHotkey || !hasUnsavedWriteChanges()) {
                return;
            }
            event.preventDefault();
            attemptLeaveWithUnsavedGuard(function () {
                window.location.reload();
            });
        }, true);

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
            const toolbarWrap = document.querySelector(".ide-toolbar-wrap");
            if (toolbarWrap) {
                autoHeightObserver.observe(toolbarWrap);
            }
        }

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleContentInputAutoHeight).catch(function () {});
        }

        scheduleContentInputAutoHeight();
        renderWriteEditorHighlight();
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
