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

        const href = element.getAttribute("href");

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
                topic: href,
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
        const elements = document.querySelectorAll("h1[id], h2[id], h3[id]");

        elements.forEach((el) => {
            let prefix = "";
            if (el.nodeName === "H3") {
                prefix = "&nbsp;".repeat(6);
            }
            navContent += `
            <li>
                <a 
                href="#${el.id}"
                    title="${el.innerText}" 
                    data-section-id="${el.id}"
                    >
                    ${prefix} ${el.innerText}
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
        calculateHeadersPosition();
        window.addEventListener("resize", function () {
            calculateHeadersPosition();
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

        const menuButton = document.querySelector(".quick-links-menu-button");

        if (menuButton) {
            menuButton.addEventListener("click", function () {
                document.body.classList.toggle("quick-menu-open");

                state.quickLinksClosed = !document.body.classList.contains("quick-menu-open");
                vscode.setState(state);
            });
        }

        function calculateHeadersPosition() {
            /** @type {NodeListOf<HTMLElement>} */
            const elements = document.querySelectorAll("h1[id], h2[id], h3[id]");

            headerPositions = [];
            elements.forEach((el) => {
                headerPositions.push({
                    id: el.id,
                    top: el.getBoundingClientRect().y + window.scrollY,
                });
            });
        }
    }

    function initSearchPanel() {
        const searchInput = document.querySelector(".js-search-input");

        if (!searchInput) {
            return;
        }

        searchInput.addEventListener("input", debounce(handleSearch));

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
