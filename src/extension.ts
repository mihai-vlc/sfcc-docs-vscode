import * as vscode from "vscode";
import DetailsViewPanel from "./DetailsViewPanel";
import SearchViewProvider from "./SearchViewProvider";

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("sfcc-vscode-docs.openDocs", () => {
            DetailsViewPanel.createOrShow(context.extensionUri);
        })
    );

    const searchProvider = new SearchViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SearchViewProvider.viewType,
            searchProvider
        )
    );
}

export function deactivate() {}
