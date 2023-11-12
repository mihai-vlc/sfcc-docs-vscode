import fetch from "cross-fetch";

const SEARCH_API_URL = "https://sfccdocs.com/api/search";

interface SearchItem {
    content: string;
    deprecated: boolean;
    description: string;
    embed: string;
    keywords: string[];
    title: string;
    url: string;
}

interface SearchResult {
    total: number;
    results: SearchItem[];
    version: string;
}

export default class SearchAPI {
    constructor() {}

    async search(query: string) {
        const url = new URL(SEARCH_API_URL);
        url.searchParams.append("query", query);

        const response = await fetch(url);

        if (response.status !== 200) {
            throw new Error(`Failed to fetch the search results for query: ${query}`);
        }

        return response.json() as Promise<SearchResult>;
    }
}
