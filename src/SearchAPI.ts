import fetch from "cross-fetch";

const BASE_URL = "https://sfccdocs.com";
const SEARCH_API_URL = BASE_URL + "/api/search";

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

        const searchResult = (await response.json()) as SearchResult;

        searchResult.results = searchResult.results.map((r) => {
            r.embed = r.embed.replace(BASE_URL, "");
            return r;
        });

        return searchResult;
    }
}
