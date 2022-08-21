//@ts-check

(function () {
    const vscode = acquireVsCodeApi();
    const pageUrlElement = document.querySelector(".js-page-url");

    if (
        pageUrlElement &&
        pageUrlElement.textContent &&
        pageUrlElement.textContent.indexOf("#") > -1
    ) {
        const selector = pageUrlElement.textContent.split("#")[1];
        scrollToElement("#" + selector);
    } else {
        setTimeout(() => {
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        }, 100);
    }

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case "searchResult": {
                break;
            }
        }
    });

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

        event.preventDefault();
        vscode.postMessage({
            type: "updateTopic",
            topic: href,
        });
    });

    function scrollToElement(selector) {
        const section = document.querySelector(`a[name=${selector.substring(1)}]`);

        if (section) {
            section.scrollIntoView();
        }
    }

    let lastSelection = "";

    // @ts-ignore
    new VanillaContextMenu({
        scope: document.querySelector("body"),
        menuItems: [
            {
                label: "Copy",
                callback: () => {
                    if (lastSelection) {
                        navigator.clipboard.writeText(lastSelection);
                    }
                },
            },
        ],
    });

    document.addEventListener("selectionchange", () => {
        const text = getSelectionText();
        if (text) {
            lastSelection = text;
        }
    });

    function getSelectionText() {
        var text = "";
        if (window.getSelection) {
            text = window.getSelection().toString();
        } else if (document.selection && document.selection.type != "Control") {
            text = document.selection.createRange().text;
        }
        return text;
    }
})();
