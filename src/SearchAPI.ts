import fetch from "cross-fetch";
import * as vscode from "vscode";
import lunr from "lunr";

const INDEX_URL = "https://salesforcecommercecloud.github.io/b2c-dev-doc/search.json";

interface SearchItem {
    content: string;
    deprecated: boolean;
    badge: string;
    title: string;
    url: string;
}

interface SearchResult {
    total: number;
    results: SearchItem[];
    version: string;
}

interface IndexRecord {
    title: string;
    url: string;
    content: string;
    badge: string;
}

interface PageData {
    [key: string]: IndexRecord;
}

export default class SearchAPI {
    private globalStorageUri: vscode.Uri;
    private globalState: vscode.Memento;
    private lunrIndex?: lunr.Index;
    public pageData: PageData;

    constructor(globalStorageUri: vscode.Uri, globalState: vscode.Memento) {
        this.globalStorageUri = globalStorageUri;
        this.globalState = globalState;
        this.pageData = {};
    }

    async search(query: string): Promise<SearchResult> {
        if (!this.lunrIndex) {
            await this.initializeIndex();
        }

        const searchResultItems: SearchItem[] = [];
        if (this.lunrIndex) {
            const results = this.lunrIndex.search(query);
            results.forEach((item) => {
                const record = this.pageData[item.ref];
                let content = record.content;
                let simpleQuery = query.replace(/ -(upcoming|current)/g, "");
                let firstMatchIndex = content.toLowerCase().indexOf(simpleQuery.toLowerCase());
                let start = Math.max(0, firstMatchIndex - 150);
                let end = Math.min(content.length, firstMatchIndex + query.length + 150);
                content = content.slice(start, end);

                searchResultItems.push({
                    content: content,
                    deprecated: false,
                    badge: record.badge,
                    title: record.title,
                    url: record.url,
                });
            });
        }

        return {
            total: searchResultItems.length,
            results: searchResultItems,
            version: "v1",
        };
    }

    async initializeIndex() {
        const indexFile = vscode.Uri.joinPath(this.globalStorageUri, "search.json");
        const lunrIndexFile = vscode.Uri.joinPath(this.globalStorageUri, "lunr-index.json");

        if (await this.isIndexExpired(indexFile)) {
            const response = await fetch(INDEX_URL);
            if (response.status !== 200) {
                throw new Error("Failed to fetch the index file");
            }

            let data = await response.text();
            data = data.replace(/&nbsp;/g, " ");
            data = data.replace(/Overview API Versioning Deprecated/g, " ");

            const content = new TextEncoder().encode(data);
            await vscode.workspace.fs.writeFile(indexFile, content);
            console.log("SFCC Docs: Updating the search index file completed successfully !");
        }

        const dataText = await this.readFileText(indexFile);
        const data = JSON.parse(dataText) as IndexRecord[];

        data.forEach((page) => {
            this.pageData[page.url] = page;
        });

        if (await this.isIndexExpired(lunrIndexFile)) {
            this.lunrIndex = lunr(function () {
                this.field("title", { boost: 10 });
                this.field("content");
                this.field("badge");
                this.ref("url");
                this.metadataWhitelist = ["position"];

                data.forEach((page) => {
                    if (page.url && page.title && page.content) {
                        page.badge = "";

                        if (page.url.indexOf("/current/") > -1) {
                            page.badge = "current";
                        }

                        if (page.url.indexOf("/upcoming/") > -1) {
                            page.badge = "upcoming";
                        }

                        this.add(page);
                    }
                });
            });

            await vscode.workspace.fs.writeFile(
                lunrIndexFile,
                new TextEncoder().encode(JSON.stringify(this.lunrIndex))
            );
        } else {
            const preComputedIndex = await this.readFileText(lunrIndexFile);
            this.lunrIndex = lunr.Index.load(JSON.parse(preComputedIndex));
        }

        await this.globalState.update("sfccDocs.lastIndexTimestamp", new Date().getTime());
    }

    async isIndexExpired(indexFile: vscode.Uri) {
        if (!(await this.fileExists(indexFile))) {
            return true;
        }

        const timestamp = this.globalState.get<number | undefined>("sfccDocs.lastIndexTimestamp");

        if (!timestamp) {
            return true;
        }

        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (timestamp < new Date().getTime() - ONE_DAY) {
            return true;
        }

        return false;
    }

    async fileExists(folderOrFile: vscode.Uri, filePath?: string): Promise<boolean> {
        try {
            const file = filePath ? vscode.Uri.joinPath(folderOrFile, filePath) : folderOrFile;
            await vscode.workspace.fs.stat(file);
            return true;
        } catch (error) {
            return false;
        }
    }

    async readFileText(folderOrFile: vscode.Uri, filePath?: string): Promise<string> {
        if (!(await this.fileExists(folderOrFile, filePath))) {
            return "";
        }

        const file = filePath ? vscode.Uri.joinPath(folderOrFile, filePath) : folderOrFile;
        const buffer = await vscode.workspace.fs.readFile(file);
        return new TextDecoder().decode(buffer);
    }
}
