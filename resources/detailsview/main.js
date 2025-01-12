//@ts-check

/**
 * @typedef {Object} AppState
 * @property {boolean} quickLinksClosed
 */

(function () {
    /** @type {import('vscode-webview').WebviewApi<AppState>} */
    const vscode = acquireVsCodeApi();

    /** @type {AppState} */
    const state = vscode.getState() || {
        quickLinksClosed: false,
    };

    buildQuickLinks();
    initSearchPanel();

    listenWebviewMessages();

    /** @type HTMLAnchorElement|null */
    const pageUrlElement = document.querySelector(".js-page-url");
    const currentPageURL = (pageUrlElement && pageUrlElement.href) || "";

    if (currentPageURL && currentPageURL.indexOf("#") > -1) {
        const selector = currentPageURL.split("#")[1];
        scrollToElement("#" + selector);
    } else {
        setTimeout(() => {
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        }, 100);
    }

    const scrollToTopEl = document.querySelector(".js-scroll-to-top");

    if (scrollToTopEl) {
        scrollToTopEl.addEventListener("click", () => {
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        });
    }

    document.addEventListener("click", function (_event) {
        const event = /** @type {MouseEvent} */ (_event);
        let element = /** @type {HTMLElement} */ (event.target);

        if (element.tagName !== "A") {
            const closestLink = element.closest("a");

            if (!closestLink) {
                return;
            }

            element = closestLink;
        }

        let href = element.getAttribute("href");

        if (!href) {
            return;
        }

        if (href.startsWith("https:") || element.classList.contains("js-page-url")) {
            return;
        }

        if (href.startsWith("#")) {
            scrollToElement(href);
            return;
        }
        if (href.endsWith(".json") || href.endsWith(".xsd")) {
            const linkUrl = new URL(href || "", currentPageURL + "/");
            element.setAttribute("href", linkUrl.toString());
            return;
        }

        // Prevent opening links in the browser
        event.preventDefault();
        event.stopPropagation();

        if (event.ctrlKey) {
            vscode.postMessage({
                type: "openDetailsView",
                topic: new URL(currentPageURL + "/..").pathname + href,
            });
            return;
        }

        vscode.postMessage({
            type: "updateTopic",
            topic: href,
            isHistoryNavigation: element.classList.contains("js-history-item"),
            historyDirection: element.getAttribute("data-direction") || "",
        });
    });

    function scrollToElement(selector) {
        let section = document.querySelector(`a[name=${selector.substring(1)}]`);
        section = section || document.querySelector(selector);

        if (!section) {
            const needle = selector.substr(1);
            document.querySelectorAll("[id]").forEach((el) => {
                let id = el.id;
                id = id.replace(/-/g, "");
                if (needle === id) {
                    section = el;
                }
            });
        }

        if (section) {
            section.scrollIntoView();
        }
    }

    let lastSelection = "";

    // @ts-ignore
    new VanillaContextMenu({
        scope: document.querySelector("body"),
        customClass: "context-menu",
        transitionDuration: 0,
        menuItems: [
            {
                label: "Copy",
                callback: function (event) {
                    let element = event.target && event.target.closest("a");
                    if (element) {
                        const linkUrl = new URL(element.getAttribute("href") || "", currentPageURL);
                        navigator.clipboard.writeText(linkUrl.href);
                    } else if (lastSelection) {
                        navigator.clipboard.writeText(lastSelection);
                    }
                },
            },
            {
                label: "Search selection",
                callback: function () {
                    if (lastSelection) {
                        vscode.postMessage({
                            type: "searchInSidebarPanel",
                            query: lastSelection,
                        });
                    }
                },
            },
        ],
    });

    document.addEventListener("selectionchange", () => {
        const text = (window.getSelection() || "").toString();
        if (text) {
            lastSelection = text;
        }
    });

    function buildQuickLinks() {
        if (state.quickLinksClosed) {
            document.body.classList.remove("quick-menu-open");
        }

        let navContent = "";

        /** @type {NodeListOf<HTMLElement>} */
        const elements = document.querySelectorAll("a[name]");
        const quickLinksElements = [];

        elements.forEach((el) => {
            let prefix = "";
            let label = el.innerText;

            let nextElement = /** @type {HTMLElement|null} */ (el.nextElementSibling);
            if (!label && nextElement) {
                if (nextElement.classList.contains("detailName")) {
                    label = nextElement.innerText;
                } else {
                    return;
                }
            }
            quickLinksElements.push(el);
            navContent += `
            <li>
                <a 
                href="#${el.getAttribute("name")}"
                    title="${el.innerText}" 
                    data-section-id="${el.getAttribute("name")}"
                    >
                    ${prefix} ${label}
                </a>
            </li>
            `;
        });

        const container = document.createElement("div");
        container.classList.add("quick-links-menu");

        container.innerHTML = `
            <ul class="list-none">
                ${navContent}
            </ul>
        `;

        document.body.appendChild(container);

        let headerPositions = [];
        calculateHeadersPosition(quickLinksElements);
        window.addEventListener("resize", function () {
            calculateHeadersPosition(quickLinksElements);
        });

        window.addEventListener("scroll", function () {
            if (state.quickLinksClosed) {
                return;
            }

            const currentScroll = window.scrollY + 100;
            let lastId = "";
            for (let i = 0; i < headerPositions.length; i++) {
                if (headerPositions[i].top < currentScroll) {
                    lastId = headerPositions[i].id;
                }
            }

            /** @type {HTMLElement|null} */
            const lastActive = document.querySelector(`.quick-links-menu a.active`);
            if (lastActive) {
                lastActive.classList.remove("active");
            }

            if (lastId) {
                /** @type {HTMLElement|null} */
                const menuItem = document.querySelector(
                    `.quick-links-menu [data-section-id="${lastId}"]`
                );
                if (menuItem) {
                    menuItem.classList.add("active");
                    menuItem.scrollIntoView({
                        block: "center",
                    });
                }
            }
        });

        const menuButton = document.querySelector(".js-quick-links-menu-button");

        if (menuButton) {
            menuButton.addEventListener("click", function () {
                document.body.classList.toggle("quick-menu-open");

                state.quickLinksClosed = !document.body.classList.contains("quick-menu-open");
                vscode.setState(state);
            });
        }

        function calculateHeadersPosition(quickLinksElements) {
            headerPositions = [];
            quickLinksElements.forEach((el) => {
                headerPositions.push({
                    id: el.getAttribute("name"),
                    top: el.getBoundingClientRect().y + window.scrollY,
                });
            });
        }
    }

    function initSearchPanel() {
        /**@type HTMLInputElement|null */
        const searchInput = document.querySelector(".js-search-input");

        if (!searchInput) {
            return;
        }

        searchInput.addEventListener("input", debounce(handleSearch));
        searchInput.addEventListener("focus", function () {
            if (searchInput.value) {
                vscode.postMessage({
                    type: "searchQuery",
                    query: searchInput.value,
                });
            }
        });

        function handleSearch(event) {
            if (event.target.value) {
                vscode.postMessage({
                    type: "searchQuery",
                    query: event.target.value,
                });
            } else {
                updateSearchResults("");
            }
        }

        // @ts-ignore
        hotkeys("ctrl+k,/", function (event, handler) {
            switch (handler.key) {
                case "/":
                case "ctrl+k":
                    event.preventDefault();
                    event.stopPropagation();
                    searchInput.focus();
                    searchInput.select();
                    break;
            }
        });

        document.body.addEventListener("click", function (event) {
            const clickedElement = /**@type HTMLInputElement|null */ (event && event.target);
            if (clickedElement && clickedElement.closest(".js-search-panel")) {
                return;
            }

            updateSearchResults("");
        });
    }

    function updateSearchResults(content) {
        /**@type HTMLDivElement|null */
        const searchResultElement = document.querySelector(".js-search-panel-results");
        if (!searchResultElement) {
            return;
        }
        searchResultElement.innerHTML = content;
        searchResultElement.style.display = content === "" ? "none" : "block";
    }

    function listenWebviewMessages() {
        window.addEventListener("message", (event) => {
            const message = event.data;
            switch (message.type) {
                case "searchResult": {
                    updateSearchResults(message.data);
                    break;
                }
            }
        });
    }

    function debounce(func, timeout = 500) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                func.apply(this, args);
            }, timeout);
        };
    }
})();
