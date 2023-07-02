//@ts-check

(function () {
    const vscode = acquireVsCodeApi();

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

    // Handle messages sent from the extension to the webview
    // window.addEventListener("message", (event) => {
    //     const message = event.data; // The json data that the extension sent
    //     switch (message.type) {
    //         case "searchResult": {
    //             break;
    //         }
    //     }
    // });

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

        if (href.startsWith("https:")) {
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

        event.preventDefault();
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
})();
