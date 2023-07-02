import * as vscode from "vscode";
import SearchViewProvider from "./SearchViewProvider";

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand("sfcc-docs-vscode.openDocs", () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            let cursorPosition = editor.selection.start;
            let selectedText = editor.document.getText(editor.selection);

            if (!selectedText) {
                let wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
                selectedText = editor.document.getText(wordRange);
            }

            if (selectedText) {
                searchProvider.openWithQuery(selectedText);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sfcc-docs-vscode.searchQuery", (data) => {
            if (data && data.query) {
                searchProvider.openWithQuery(data.query);
            }
        })
    );

    const searchProvider = new SearchViewProvider(
        context.extensionUri,
        context.globalStorageUri,
        context.globalState
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SearchViewProvider.viewId, searchProvider)
    );
}

export function deactivate() {}
