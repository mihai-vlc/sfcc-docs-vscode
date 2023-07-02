import fetch from "cross-fetch";
import * as vscode from "vscode";
import lunr from "lunr";

const INDEX_URL = "https://salesforcecommercecloud.github.io/b2c-dev-doc/search.json";

interface IndexRecord {
    title: string;
    url: string;
    content: string;
}

interface PageData {
    [key: string]: IndexRecord;
}

export default class IndexedSearch {
    private globalStorageUri: vscode.Uri;
    private globalState: vscode.Memento;
    private lunrIndex?: lunr.Index;
    public pageData: PageData;

    constructor(globalStorageUri: vscode.Uri, globalState: vscode.Memento) {
        this.globalStorageUri = globalStorageUri;
        this.globalState = globalState;
        this.pageData = {};
    }

    async search(query: string) {
        if (!this.lunrIndex) {
            await this.initializeIndex();
        }

        const results = this.lunrIndex?.search(query);
        return results || [];
    }

    async initializeIndex() {
        const indexFile = vscode.Uri.joinPath(this.globalStorageUri, "search.json");

        if (await this.isIndexExpired(indexFile)) {
            const response = await fetch(INDEX_URL);
            if (response.status !== 200) {
                throw new Error("Failed to fetch the index file");
            }

            const data = await response.text();
            const content = new TextEncoder().encode(data);
            await vscode.workspace.fs.writeFile(indexFile, content);
            console.log("SFCC Docs: Updating the search index file completed successfully !");
        }

        const dataText = await this.readFileText(indexFile);
        const data = JSON.parse(dataText) as IndexRecord[];

        const self = this;
        this.lunrIndex = lunr(function () {
            this.field("title", { boost: 10 });
            this.field("content");
            this.ref("url");
            this.metadataWhitelist = ["position"];

            data.forEach((page) => {
                if (page.url && page.title && page.content) {
                    this.add(page);
                    self.pageData[page.url] = page;
                }
            });
        });

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
