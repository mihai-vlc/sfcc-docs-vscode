import * as vscode from "vscode";
import DetailsViewPanel from "./DetailsViewPanel";
import SearchViewProvider from "./SearchViewProvider";
import { DocItem, DocumentationTreeProvider } from "./TreeViewProvider";

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

    const searchProvider = new SearchViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SearchViewProvider.viewId, searchProvider)
    );

    const docTreeProvider = new DocumentationTreeProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(DocumentationTreeProvider.viewId, docTreeProvider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("sfcc-docs-vscode.treeItemOpen", (node: DocItem) => {
            DetailsViewPanel.createOrShow(context.extensionUri, node.topic);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sfcc-docs-vscode.treeItemCopyUrl", (node) =>
            vscode.window.showInformationMessage(`Successfully called copy url on ${node.label}.`)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("sfcc-docs-vscode.treeItemOpenInBrowser", (node) =>
            vscode.window.showInformationMessage(
                `Successfully called open in browser ${node.label}.`
            )
        )
    );
}

export function deactivate() {}
