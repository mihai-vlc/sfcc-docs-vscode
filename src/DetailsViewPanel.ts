import * as vscode from "vscode";
import fetch from "cross-fetch";
import * as cheerio from "cheerio";
import normalizeUrl from "normalize-url";
import PromiseQueue from "./PromiseQueue";
import SearchAPI from "./SearchAPI";

const DOCS_BASE = "https://salesforcecommercecloud.github.io/";

/**
 * Manages cat coding webview panels
 */
export default class DetailsViewPanel {
    /**
     * Track the currently panel. Only allow a single panel to exist at a time.
     */
    public static currentPanel: DetailsViewPanel | undefined;

    public static readonly viewType = "sfcc-docs-vscode.detailsView";

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private currentBaseUrl: string = "";
    private prevHistory: string[] = [];
    private nextHistory: string[] = [];
    private lastContentUrl: string = "";

    private actionsQueue: PromiseQueue;

    private searchAPI: SearchAPI;
    private lastQuery: string;

    public static createOrShow(
        extensionUri: vscode.Uri,
        topic: string,
        panelType: string,
        searchAPI: SearchAPI
    ) {
        // If we already have a panel, show it.
        if (DetailsViewPanel.currentPanel && panelType !== "newPanel") {
            if (!DetailsViewPanel.currentPanel._panel.visible) {
                DetailsViewPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            }

            if (topic) {
                DetailsViewPanel.currentPanel.updateForTopic(topic).then(undefined, console.error);
            }
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            DetailsViewPanel.viewType,
            "SFCC Details View",
            vscode.ViewColumn.Beside,
            {
                // Enable javascript in the webview
                enableScripts: true,
                enableFindWidget: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, "resources", "detailsview")],
            }
        );

        DetailsViewPanel.currentPanel = new DetailsViewPanel(panel, extensionUri, searchAPI);

        if (topic) {
            DetailsViewPanel.currentPanel.updateForTopic(topic).then(undefined, console.error);
        }
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        searchAPI: SearchAPI
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this.searchAPI = searchAPI;
        this.lastQuery = "";

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.type) {
                    case "openDetailsView": {
                        DetailsViewPanel.createOrShow(
                            this._extensionUri,
                            message.topic,
                            "newPanel",
                            this.searchAPI
                        );
                        break;
                    }
                    case "updateTopic": {
                        this.handleHistory(message.isHistoryNavigation, message.historyDirection);
                        this.updateForTopic(
                            message.topic,
                            this.currentBaseUrl,
                            message.isHistoryNavigation
                        );
                        break;
                    }
                    case "searchInSidebarPanel": {
                        vscode.commands.executeCommand("sfcc-docs-vscode.searchQuery", {
                            query: message.query,
                        });
                        break;
                    }
                    case "searchQuery": {
                        this.performSearch(message.query);
                        break;
                    }
                }
            },
            null,
            this._disposables
        );

        this.actionsQueue = new PromiseQueue();
    }

    public async performSearch(query: string) {
        try {
            let html = "";
            let search = await this.searchAPI.search(query);

            if (search.results && search.results.length > 0) {
                this.lastQuery = query;

                let content = search.results.map((result) => {
                    const deprecatedClass = result.deprecated ? "deprecated" : "";
                    return /*html*/ `
                    <li>
                        <a 
                            href="${this.makeRelative(this.currentBaseUrl, result.url)}"
                            class="link ${deprecatedClass}"
                            title="ctrl click for a new panel"
                        >
                            ${result.title}
                        </a>
                        <span>${result.content}</span>
                    </li>
                    `;
                });

                html = /*html*/ `
                <ol>
                    ${content.join("")}
                </ol>
                `;
            } else {
                html = /*html*/ `<div>No results found.</div>`;
            }
            this.sendResult(html);
        } catch (e) {
            this.sendResult((e as Error).toString());
        }
    }

    public sendResult(data: string) {
        this._panel.webview.postMessage({
            type: "searchResult",
            data: data,
        });
    }

    private handleHistory(isHistoryNavigation: boolean, historyDirection: "prev" | "next") {
        if (!isHistoryNavigation) {
            return;
        }

        if (historyDirection === "prev") {
            this.prevHistory.pop()!;
            this.nextHistory.push(this.lastContentUrl);
        } else {
            this.nextHistory.pop()!;
            this.prevHistory.push(this.lastContentUrl);
        }
    }

    public async updateForTopic(topic: string, baseUrl?: string, isHistoryNavigation = false) {
        if (!isHistoryNavigation && this.lastContentUrl) {
            this.prevHistory.push(this.lastContentUrl);
            this.nextHistory = [];
        }

        baseUrl = baseUrl || DOCS_BASE;
        const contentUrl = normalizeUrl(`${baseUrl}/${topic}`);
        const pageUrl = contentUrl;

        this.currentBaseUrl = contentUrl.substring(0, contentUrl.lastIndexOf("/"));
        const response = await fetch(contentUrl);
        const result = await response.text();

        this.lastContentUrl = contentUrl;

        const $ = cheerio.load(result);

        const title = ($("title").text() || "Result").trim();
        const $body = $("body");

        $body.find("script").remove();
        $body.find("head").remove();
        $body.find("header").remove();
        $body.find("link").remove();
        $body.find(`img[src="images/inherit.gif"]`).remove();

        $body.prepend(/*html*/ `<div class="page-url">
            <div>${this.generateNavigationLinks()}</div>
            <a class="js-page-url" href="${pageUrl}">${pageUrl}</a>
        </div>`);

        const content = $body.html() || "No content was found";

        this._panel.title = title;
        this._panel.webview.html = this._getHtmlForWebview(content);
    }

    private generateNavigationLinks() {
        let nav = "";
        if (this.prevHistory.length > 0) {
            const lastIndex = this.prevHistory.length - 1;
            const link = this.makeRelative(this.currentBaseUrl, this.prevHistory[lastIndex]);
            nav += /*html*/ `
                <a 
                    class="js-history-item history-prev" 
                    data-direction="prev" 
                    href="${link}" 
                    title="previous page"
                >
                </a>
            `;
        }

        if (this.nextHistory.length > 0) {
            const lastIndex = this.nextHistory.length - 1;
            const link = this.makeRelative(this.currentBaseUrl, this.nextHistory[lastIndex]);
            nav += /*html*/ `
                <a 
                    class="js-history-item history-next"
                    data-direction="next"
                    href="${link}" 
                    title="next page"
                >
                </a>
            `;
        }

        return nav;
    }

    private makeRelative(from: string, to: string) {
        var fromParts = from.split("/");
        var toParts = to.split("/");

        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break;
            }
        }

        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..");
        }

        outputParts = outputParts.concat(toParts.slice(samePartsLength));

        return outputParts.join("/");
    }

    private _getHtmlForWebview(pageContent: string) {
        let webview = this._panel.webview;

        const mainJsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "resources", "detailsview", "main.js")
        );

        const contextMenuJsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "resources",
                "detailsview",
                "vendor",
                "vanilla-context-menu.js"
            )
        );

        const hotkeysJsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "resources",
                "detailsview",
                "vendor",
                "hotkeys.min.js"
            )
        );

        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "resources", "detailsview", "styles.css")
        );

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src * data:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesUri}" rel="stylesheet" />
                <title>SFCC Details View</title>
            </head>
            <body class="quick-menu-open">
                <div class="search-panel js-search-panel">
                    <input 
                        type="search"
                        placeholder="Search..."
                        value="${this.lastQuery}"
                        title="focus with ctrl+k or /"
                        class="js-search-input search-input" />
                    <div class="js-search-panel-results search-panel-results"></div>
                </div>

                <div class="page-main-content">
                    ${pageContent}
                </div>

                <button class="quick-links-menu-button js-quick-links-menu-button" title="toggle quick links">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><path d="M4 18h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1zm0-5h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1zM3 7c0 .55.45 1 1 1h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1z" fill="currentColor"></path></svg>
                </button>
                <button class="scroll-to-top js-scroll-to-top" title="back to top">
                    <span class="icon"></span>
                </button>
                <script nonce="${nonce}" src="${contextMenuJsUri}"></script>
                <script nonce="${nonce}" src="${hotkeysJsUri}"></script>
                <script nonce="${nonce}" src="${mainJsUri}"></script>
            </body>
            </html>`;
    }
    public dispose() {
        DetailsViewPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
