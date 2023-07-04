import fetch from "cross-fetch";
import * as vscode from "vscode";
import * as cheerio from "cheerio";
import DetailsViewPanel from "./DetailsViewPanel";
import IndexedSearch from "./IndexedSearch";

export default class SearchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = "sfcc-docs-vscode.searchView";

    private _view?: vscode.WebviewView;
    private indexedSearch: IndexedSearch;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        globalStorageUri: vscode.Uri,
        globalState: vscode.Memento
    ) {
        this.indexedSearch = new IndexedSearch(globalStorageUri, globalState);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.type) {
                case "newQuery": {
                    this.getData(data.query);
                    break;
                }
                case "openDetailsView": {
                    DetailsViewPanel.createOrShow(this._extensionUri, data.topic);
                    break;
                }
            }
        });
    }

    public async getData(query: string) {
        try {
            let resultHtml = "";
            let results = await this.indexedSearch.search(query);

            if (results.length > 0) {
                resultHtml += "<ol>";

                for (var i = 0; i < results.length; i++) {
                    var result = results[i];
                    let resultPage = this.indexedSearch.pageData[result.ref];
                    let { url, title, content, badge } = resultPage;

                    let firstMatchIndex = content.toLowerCase().indexOf(query.toLowerCase());
                    let start = Math.max(0, firstMatchIndex - 150);
                    let end = Math.min(content.length, firstMatchIndex + query.length + 150);
                    content = content.slice(start, end);

                    if (start > 0) {
                        content = "..." + content;
                    }
                    if (end < resultPage.content.length) {
                        content = content + "...";
                    }

                    let escapedSearchQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
                    let re = new RegExp("(" + escapedSearchQuery + ")", "gi");
                    content = content.replace(re, "<b>$&</b>");

                    if (badge) {
                        badge = `<span class="badge">${badge}</span>`;
                    }

                    resultHtml += /*html*/ `
                        <li>
                            <a href='${url}' class="link">${title}</a> ${badge}
                            <div class="description">${content}</div>
                        </li>
                    `;
                }

                resultHtml += "</ol>";
            } else {
                resultHtml += "<p class='search-result'>No results found.</p>";
            }

            this.sendResult(resultHtml);
        } catch (e) {
            this.sendResult("Error: " + e);
        }
    }

    public openWithQuery(query: string) {
        vscode.commands.executeCommand("sfcc-docs-vscode.searchView.focus").then(() => {
            setTimeout(() => {
                this._view?.webview.postMessage({
                    type: "replaceQuery",
                    query: query,
                });
            }, 1000);
        });
    }

    public sendResult(data: string) {
        if (!this._view) {
            return;
        }
        this._view.webview.postMessage({
            type: "searchResult",
            data: data,
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const mainJsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "resources", "searchview", "main.js")
        );

        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "resources", "searchview", "styles.css")
        );

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return /*html*/ `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src *; script-src 'nonce-${nonce}';" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link href="${stylesUri}" rel="stylesheet" />
                
                <title>SFCC Docs</title>
            </head>
            <body>
                <div class="sticky-banner">
                    <div class="loader js-loader">
                        <div class="loaderBar"></div>
                    </div>
                    <div class="filters">
                        <label>
                            <input type="radio" name="filterBy" value="upcoming" checked class="js-filter" />
                            current
                        </label>
                        <label>
                            <input type="radio" name="filterBy" value="current" class="js-filter" />
                            upcoming
                        </label>
                    </div>
                    <input 
                        class="js-query-input" 
                        type="text" 
                        title="Wildcards: query*   s*Model \nFields: title:OrderMgr \nFuzzy:  odrer~1  oderr~2 \nTerm presence: +getContent -pipelet -upcoming"
                        placeholder="Search *query -pipelet +static fuzzy~3" />
                </div>

                <div class="js-search-result-wrapper results"></div>

                Additional resources:
                <ul>
                    <li>
                        <a href="https://help.salesforce.com/s/articleView?id=cc.b2c_getting_started.htm">
                            Salesforce B2C Help
                        </a>
                    </li>
                    <li>
                        <a href="https://developer.salesforce.com/docs/commerce/b2c-commerce/overview">
                            Developer Center
                        </a>
                    </li>
                    <li>
                        <a href="https://salesforcecommercecloud.github.io/b2c-dev-doc">
                            Developer Documentation
                        </a>
                    </li>
                    <li>
                        <a href="https://help.salesforce.com/s/articleView?id=sf.rn_infocenter_retirement.htm&type=5">
                            Release Notes
                        </a>
                    </li>
                </ul>

                <script nonce="${nonce}" src="${mainJsUri}"></script>
            </body>
            </html>`;
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
