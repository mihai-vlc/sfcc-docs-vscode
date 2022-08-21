import fetch from "cross-fetch";
import * as vscode from "vscode";
import * as cheerio from "cheerio";
import DetailsViewPanel from "./DetailsViewPanel";

export default class SearchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "sfcc-docs-vscode.searchView";

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

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
        const finalQuery = encodeURIComponent(query);
        const baseUrl = "https://documentation.b2c.commercecloud.salesforce.com/DOC2/advanced";
        const response = await fetch(
            `${baseUrl}/searchView.jsp?searchWord=${finalQuery}&maxHits=500`
        );
        const text = await response.text();
        const $ = cheerio.load(text);
        const $results = $("table.results");
        const $allLinks = $results.find("a");

        $allLinks.removeAttr("onmouseover");
        $allLinks.removeAttr("onmouseout");

        $results.find("td.icon").remove();

        const resultHtml = $results.html();

        if (resultHtml) {
            this.sendResult(resultHtml);
        }

        return text;
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
                <div class="loader js-loader">
                    <div class="loaderBar"></div>
                </div>
                <input 
                    class="js-query-input" 
                    type="text" 
                    placeholder="Search" />

                <table class="js-search-result-wrapper results"></table>

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
