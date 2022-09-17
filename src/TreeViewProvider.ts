import * as vscode from "vscode";
import fetch from "cross-fetch";
import * as cheerio from "cheerio";

const SFCC_DOC_BASE =
    "https://documentation.b2c.commercecloud.salesforce.com/DOC1/advanced/tocfragment?toc=";

const rootItem = "/com.demandware.dochelp/help.xml";

export class DocumentationTreeProvider implements vscode.TreeDataProvider<DocItem> {
    public static readonly viewId = "sfcc-docs-vscode.docsTreeView";

    private _onDidChangeTreeData: vscode.EventEmitter<DocItem | undefined | void> =
        new vscode.EventEmitter<DocItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DocItem | undefined | void> =
        this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DocItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DocItem): Thenable<DocItem[]> {
        if (!element) {
            return fetch(SFCC_DOC_BASE + rootItem)
                .then((response) => response.text())
                .then((text) => {
                    return this.processResponseText(text);
                });
        }

        const subItem = "/com.demandware.dochelp/help.xml&path=" + element.recordId;

        return fetch(SFCC_DOC_BASE + subItem)
            .then((response) => response.text())
            .then((text) => {
                return this.processResponseText(text, element.recordId);
            });
    }

    processResponseText(text: string, parentId?: string): DocItem[] {
        const result: DocItem[] = [];
        let selector = "node";

        if (parentId) {
            selector = `node[id=${parentId}] > node`;
        }

        const $ = cheerio.load(text);
        const $nodes = $(selector);

        $nodes.each(function (_, el) {
            const $el = $(el);

            const recordId = $el.attr("id") || "";

            if (recordId === rootItem) {
                return;
            }

            const title = $el.attr("title") || "";
            const topic = ($el.attr("href") || "").replace("../topic/", "/");
            const isLeaf = $el.attr("is_leaf") === "true";

            const docItem = new DocItem(
                title,
                recordId,
                topic,
                vscode.TreeItemCollapsibleState.Collapsed
            );

            if (isLeaf) {
                docItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

                docItem.command = {
                    command: "sfcc-docs-vscode.treeItemOpen",
                    arguments: [docItem],
                    title: "Open item",
                };

                docItem.contextValue = "sfccDocItemLeaf";
            }

            result.push(docItem);
        });

        return result;
    }
}

export class DocItem extends vscode.TreeItem {
    constructor(
        public label: string,
        public recordId: string,
        public topic: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        public command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = `${this.label}`;
        this.description = "";
    }
    contextValue = "sfccDocItem";
}
