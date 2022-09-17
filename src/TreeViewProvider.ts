import * as vscode from "vscode";
import fetch from "cross-fetch";
import * as cheerio from "cheerio";

const SFCC_DOC_BASE =
    "https://documentation.b2c.commercecloud.salesforce.com/DOC2/advanced/tocfragment?toc=";

const rootItem = "/com.demandware.dochelp/help.xml";

export class DocumentationTreeProvider implements vscode.TreeDataProvider<DocItem> {
    public static readonly viewId = "sfcc-docs-vscode.docsTreeView";

    private _onDidChangeTreeData: vscode.EventEmitter<DocItem | undefined | void> =
        new vscode.EventEmitter<DocItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DocItem | undefined | void> =
        this._onDidChangeTreeData.event;

    private topicToNodeMap: Map<string, DocItem> = new Map();

    public getTreeItemByTopic(topic: string) {
        return this.topicToNodeMap.get(topic);
    }

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
                return this.processResponseText(text, element);
            });
    }

    getParent(element: DocItem): vscode.ProviderResult<DocItem> {
        return element.parent;
    }

    private processResponseText(text: string, parent?: DocItem): DocItem[] {
        const result: DocItem[] = [];
        let selector = "node";

        if (parent) {
            selector = `node[id=${parent.recordId}] > node`;
        }

        const $ = cheerio.load(text);
        const $nodes = $(selector);

        $nodes.each((_, el) => {
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

            docItem.parent = parent;

            if (isLeaf) {
                docItem.collapsibleState = vscode.TreeItemCollapsibleState.None;

                docItem.command = {
                    command: "sfcc-docs-vscode.treeItemOpen",
                    arguments: [docItem],
                    title: "Open item",
                };

                docItem.contextValue = "sfccDocItemLeaf";
            }

            const topicUri = vscode.Uri.parse(docItem.topic);
            this.topicToNodeMap.set(topicUri.path, docItem);
            result.push(docItem);
        });

        return result;
    }
}

export class DocItem extends vscode.TreeItem {
    public parent?: DocItem;
    public command?: vscode.Command;
    public contextValue = "sfccDocItem";

    constructor(
        public label: string,
        public recordId: string,
        public topic: string,
        public collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);

        this.tooltip = `${this.label}`;
        this.description = "";
    }
}
