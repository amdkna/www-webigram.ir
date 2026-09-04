# Webigram Website Doctor — Chrome Extension

Manifest V3 extension for `webigram.ir/tools/website-doctor/`.

## What it does

- Uses `activeTab` only after the user opens the extension.
- Reads the current public HTTP/HTTPS tab URL.
- Sends that URL to `https://webigram.ir/api/website-doctor` for an on-demand scan.
- Shows the score and the most important findings in the popup.
- Opens the full Website Doctor report on webigram.ir.

## Permissions

- `activeTab`: temporary access to the tab the user explicitly invokes the extension on.
- `https://webigram.ir/*`: required for calling the Website Doctor API.

The extension does not request access to browsing history and does not inject scripts into websites.

## Local installation

1. Download and extract the extension ZIP from the Website Doctor page, or use this folder directly.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extension/website-doctor` folder.

## Chrome Web Store

Before publishing, add PNG extension icons and the required Chrome Web Store listing assets/screenshots. The extension code itself is Manifest V3 and uses no remote executable code.
