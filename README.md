# SFCC Documentation in VSCode

Browse the SFCC documentation directly from VSCode.

![demo](/screenshots/demo.gif)
![demo](/screenshots/multi-panel.jpg)

## Features

-   Search panel in the activity bar
-   Details panel available as a sideview
-   Search the current selection/word under the cursor
-   Previous/Next page navigation in the documentation details page

## Installation

You can install it from the [marketplace](https://marketplace.visualstudio.com/items?itemName=ionutvmi.sfcc-docs-vscode).  
`ext install sfcc-docs-vscode`

## Keyboard shortcuts

To configure a custom keyboard shortcut for the search current word/selection:

```
    // keybindings.json
    {
        "key": "ctrl+shift+f10",
        "command": "sfcc-docs-vscode.openDocs"
    },
    {
        "key": "ctrl+shift+f11",
        "command": "sfcc-docs-vscode.searchQuery",
        // search a specific keyword
        "args": {
            "query": "ProductMgr"
        }
    }
```

## Release Notes

The release notes are available in the [CHANGELOG.md](./CHANGELOG.md) document.

---

## Author

Mihai Ionut Vilcu

-   [github.com/mihai-vlc](https://github.com/mihai-vlc)
-   [twitter/mihai_vlc](http://twitter.com/mihai_vlc)

**Enjoy!**
