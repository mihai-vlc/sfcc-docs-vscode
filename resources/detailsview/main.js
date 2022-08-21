//@ts-check

(function () {
    const vscode = acquireVsCodeApi();

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
            const section = document.querySelector(`a[name=${href.substring(1)}]`);

            if (section) {
                section.scrollIntoView();
            }
            return;
        }

        event.preventDefault();
        vscode.postMessage({
            type: "updateTopic",
            topic: href,
        });
    });
})();
