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
        const element = /** @type HTMLElement */ (event.target);

        if (element.tagName !== "A") {
            return;
        }
        const href = element.getAttribute("href");
        if (!href) {
            return;
        }

        if (href.startsWith("https:")) {
            return;
        }

        event.preventDefault();
        vscode.postMessage({
            type: "updateTopic",
            topic: href,
        });
    });
})();
