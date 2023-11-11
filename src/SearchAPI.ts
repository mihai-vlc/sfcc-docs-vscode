import fetch from "cross-fetch";

const SEARCH_API = "https://sfccdocs.com/api/search?query=";

export default class SearchAPI {
    
    constructor() {}

    async search(query: string) {
        const response = await fetch(`${SEARCH_API}${query}`);
        if (response.status !== 200) {
            throw new Error(`Failed to fetch the search results for query: ${query}`);
        }

        const results = await response.json();

        return results || [];
    }
}
