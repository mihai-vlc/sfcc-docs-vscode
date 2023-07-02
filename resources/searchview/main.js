//@ts-check

(function () {
    /**
     * The application state.
     * @typedef {Object} AppState
     * @property {string} query - The search query
     */

    const vscode = acquireVsCodeApi();
    const resultWrapper = document.querySelector(".js-search-result-wrapper");

    /** @type HTMLDivElement|null */
    const loader = document.querySelector(".js-loader");

    /** @type HTMLInputElement|null */
    const queryInput = document.querySelector(".js-query-input");

    if (!resultWrapper || !queryInput) {
        return;
    }

    queryInput.addEventListener("input", debounce(handleQueryChange));

    function handleQueryChange(event) {
        const query = event.target.value;

        if (!query) {
            return;
        }

        vscode.setState({
            query: query,
        });

        performSearch(query);
    }

    // Handle messages sent from the extension to the webview
    window.addEventListener("message", (event) => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case "searchResult": {
                resultWrapper.innerHTML = message.data;

                if (loader) {
                    loader.style.display = "none";
                }
                break;
            }

            case "replaceQuery": {
                queryInput.value = message.query;

                vscode.setState({
                    query: message.query,
                });

                performSearch(message.query);
                break;
            }
        }
    });

    resultWrapper.addEventListener("click", function (event) {
        const clickedLink = /** @type HTMLElement */ (event.target);

        if (!clickedLink) {
            return;
        }

        if (!clickedLink.classList.contains("link")) {
            return;
        }
        let topic = clickedLink.getAttribute("href") || "";

        openDetailsView(topic);
    });

    var appState = /** @type AppState */ (vscode.getState()) || { query: "" };

    if (appState.query) {
        queryInput.value = appState.query;
        performSearch(appState.query);
        queryInput.focus();
        queryInput.select();
    }

    function performSearch(query) {
        if (loader) {
            loader.style.display = "block";
        }

        vscode.postMessage({
            type: "newQuery",
            query: query,
        });

        window.scroll(0, 0);
    }

    function openDetailsView(topic) {
        vscode.postMessage({
            type: "openDetailsView",
            topic: topic,
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
