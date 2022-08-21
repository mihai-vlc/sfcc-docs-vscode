import fetch from "cross-fetch";
import * as vscode from "vscode";

export default class SearchViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "sfcc-vscode-docs.searchView";

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
                case "colorSelected": {
                    vscode.window.activeTextEditor?.insertSnippet(
                        new vscode.SnippetString(`#${data.value}`)
                    );
                    break;
                }
            }
        });
        this.getData();
    }

    public async getData() {
        const response = await fetch(
            "https://documentation.b2c.commercecloud.salesforce.com/DOC2/advanced/searchView.jsp?searchWord=product&maxHits=500"
        );
        const text = await response.text();

        return text;
    }

    public addColor() {
        if (this._view) {
            this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
            this._view.webview.postMessage({ type: "addColor" });
        }
    }

    public clearColors() {
        if (this._view) {
            this._view.webview.postMessage({ type: "clearColors" });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const mainJsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "resources",
                "searchview",
                "main.js"
            )
        );

        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "resources",
                "searchview",
                "styles.css"
            )
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <link href="${stylesUri}" rel="stylesheet" />
                
                <title>Cat Colors</title>
            </head>
            <body>
                <ul class="color-list">
                </ul>
                <button class="add-color-button">Add Color</button>

                <script nonce="${nonce}" src="${mainJsUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = "";
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
