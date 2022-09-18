import * as vscode from "vscode";
import fetch from "cross-fetch";
import * as cheerio from "cheerio";
import normalizeUrl from "normalize-url";
import PromiseQueue from "./PromiseQueue";

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

    public static createOrShow(extensionUri: vscode.Uri, topic?: string) {
        // If we already have a panel, show it.
        if (DetailsViewPanel.currentPanel) {
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
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, "resources", "detailsview")],
            }
        );

        DetailsViewPanel.currentPanel = new DetailsViewPanel(panel, extensionUri);

        if (topic) {
            DetailsViewPanel.currentPanel.updateForTopic(topic).then(undefined, console.error);
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.type) {
                    case "updateTopic":
                        this.handleHistory(message.isHistoryNavigation, message.historyDirection);
                        this.updateForTopic(
                            message.topic,
                            this.currentBaseUrl,
                            message.isHistoryNavigation
                        );
                        break;
                    case "searchText":
                        vscode.commands.executeCommand("sfcc-docs-vscode.searchQuery", {
                            query: message.query,
                        });
                        break;
                }
            },
            null,
            this._disposables
        );

        this.actionsQueue = new PromiseQueue();
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

        baseUrl = baseUrl || "https://documentation.b2c.commercecloud.salesforce.com/DOC2/topic";
        const contentUrl = normalizeUrl(`${baseUrl}/${topic}`);

        this.currentBaseUrl = contentUrl.substring(0, contentUrl.lastIndexOf("/"));
        const response = await fetch(contentUrl);
        const result = await response.text();

        this.lastContentUrl = contentUrl;

        const $ = cheerio.load(result);

        const title = ($("h1").text() || $(".className").text() || "Result").trim();
        const $body = $("body");

        $body.find("script").remove();
        $body.find("#cookieConsent").remove();
        $body.find(".copyright_table td[align='right']").remove();

        $body.find("img").each((_, el) => {
            let src = $(el).attr("src");

            $(el).attr("src", this.currentBaseUrl + "/" + src);
        });

        $body.prepend(`<div class="page-url">
            <div>${this.generateNavigationLinks(this.currentBaseUrl)}</div>
            <a class="js-page-url" href="${contentUrl}">${contentUrl}</a>
        </div>`);

        const content = $body.html() || "No content was found";

        this._panel.title = title;
        this._panel.webview.html = this._getHtmlForWebview(content);

        const $breadcrumbs = $body.find(".help_breadcrumbs a");

        // we need to first open the parent nodes before we can docus on the current page
        if ($breadcrumbs.length > 1) {
            $breadcrumbs.slice(1).each((_, el) => {
                const currentTopic = $(el).attr("href");
                const topicUrl = normalizeUrl(`${this.currentBaseUrl}/${currentTopic}`);
                this.synchWithSidebar(topicUrl);
            });
        }
        this.synchWithSidebar(contentUrl, true);
    }

    private synchWithSidebar(contentUrl: string, forceReveal?: boolean) {
        const topicUri = vscode.Uri.parse(contentUrl);
        const topic = topicUri.path.replace("/DOC2/topic", "");

        this.actionsQueue.add(() => {
            return vscode.commands.executeCommand(
                "sfcc-docs-vscode.treeItemRevealByTopic",
                topic,
                forceReveal
            );
        });
    }

    private generateNavigationLinks(baseUrl: string) {
        let result = "";
        if (this.prevHistory.length > 0) {
            const lastIndex = this.prevHistory.length - 1;
            const link = this.makeRelative(baseUrl, this.prevHistory[lastIndex]);
            result += `<a 
                class="js-history-item history-prev" 
                data-direction="prev"
                href="${link}" 
                title="previous page"></a>`;
        }

        if (this.nextHistory.length > 0) {
            const lastIndex = this.nextHistory.length - 1;
            const link = this.makeRelative(baseUrl, this.nextHistory[lastIndex]);
            result += `<a 
                class="js-history-item history-next" 
                data-direction="next"
                href="${link}"
                title="next page"></a>`;
        }

        return result;
    }

    makeRelative(from: string, to: string) {
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
            <body>
                ${pageContent}

                <button class="scroll-to-top js-scroll-to-top">
                    <span class="icon"></span>
                </button>
                <script nonce="${nonce}" src="${contextMenuJsUri}"></script>
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
