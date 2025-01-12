import * as vscode from "vscode";
import DetailsViewPanel from "./DetailsViewPanel";
import SearchAPI from "./SearchAPI";

export default class SearchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = "sfcc-docs-vscode.searchView";

    private _view?: vscode.WebviewView;
    private searchAPI: SearchAPI;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        globalStorageUri: vscode.Uri,
        globalState: vscode.Memento
    ) {
        this.searchAPI = new SearchAPI(globalStorageUri, globalState);
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
                    DetailsViewPanel.createOrShow(
                        this._extensionUri,
                        data.topic,
                        data.panelType,
                        this.searchAPI
                    );
                    break;
                }
            }
        });
    }

    public async getData(query: string) {
        try {
            let html = "";
            let search = await this.searchAPI.search(query);

            if (search.results && search.results.length > 0) {
                let content = search.results.map((result) => {
                    const deprecatedClass = result.deprecated ? "deprecated" : "";
                    let badge = "";
                    if (result.badge) {
                        badge = `<span class="badge">${result.badge}</span>`;
                    }

                    return /*html*/ `
                    <li>
                        <a 
                            href="${result.url}"
                            class="link ${deprecatedClass}"
                            title="ctrl click for a new panel"
                        >
                            ${result.title}
                        </a>
                        ${badge}
                        <div class="description">
                            <div>${this.formatDescription(result.content, query)}</div>
                        </div>
                    </li>
                    `;
                });

                html = /*html*/ `
                <ol>
                    <!-- <span class="badge">API v${search.version}</span> -->
                    ${content.join("")}
                </ol>
                `;
            } else {
                html = /*html*/ `<p class='search-result'>No results found.</p>`;
            }

            this.sendResult(html);
        } catch (e) {
            this.sendResult((e as Error).toString());
        }
    }

    private formatDescription(content: string, query: string): string {
        return content;

        // TODO figure out if I still want to do any formatting here
        content = content.replace(
            /^\w* ?\w+\((\s*\w+\s*:\s*\w+,?(\.\.\.)?)*\)\s*:\s*\w+$/gim,
            function (_match) {
                return `<p>${_match}</p>`;
            }
        );

        const words = query
            .replace(/\s+/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .split(" ");

        words.forEach((w) => {
            content = content.replace(new RegExp(w, "ig"), function (match) {
                return `<strong>${match}</strong>`;
            });
        });

        content = content.replace(/ : (\w+)/gi, function (_match, p1: string) {
            return ` : <u>${p1}</u>`;
        });

        return content;
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
                        type="search" 
                        title="Wildcards: query*   s*Model \nFields: title:OrderMgr \nFuzzy:  odrer~1  oderr~2 \nTerm presence: +getContent -pipelet -upcoming"
                        placeholder="Search query* -pipelet +static fuzzy~3" />
                </div>

                <div class="js-search-result-wrapper results"></div>

                Additional resources:
                <ul>
                    <li>
                        <a href="https://salesforcecommercecloud.github.io/b2c-dev-doc/">
                            SFCC Docs
                        </a>
                    </li>
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
                        <a href="https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/xsd/">
                            XML XSD Schema
                        </a>
                    </li>
                    </li>
                    <li>
                        <a href="https://salesforcecommercecloud.github.io/b2c-dev-doc/docs/current/content/">
                            Page Designer JSON Schema
                        </a>
                    </li>
                    <li>
                        <a href="https://help.salesforce.com/s/articleView?id=sf.rn_infocenter_retirement.htm&type=5">
                            Release Notes
                        </a>
                    </li>
                    <li>
                        <a href="https://developer.salesforce.com/docs/commerce/b2c-commerce/references/b2c-commerce-ocapi/get-started-with-ocapi.html">
                            OCAPI Reference
                        </a>
                    </li>
                    <li>
                        <a href="https://developer.salesforce.com/docs/commerce/commerce-api/references/about-commerce-api/about.html">
                            SCAPI Reference
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
