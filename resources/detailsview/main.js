//@ts-check

(function () {
    const vscode = acquireVsCodeApi();
    const state = vscode.getState();

    buildQuickLinks(state);

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

    document.addEventListener("click", function (event) {
        let element = /** @type HTMLElement */ (event.target);

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
                            type: "searchText",
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

    function buildQuickLinks(state) {
        if (state && state.quickLinksClosed) {
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

        const menuButton = document.querySelector(".quick-links-menu-button");

        if (menuButton) {
            menuButton.addEventListener("click", function () {
                document.body.classList.toggle("quick-menu-open");

                vscode.setState({
                    quickLinksClosed: !document.body.classList.contains("quick-menu-open"),
                });
            });
        }
    }
})();
