# saveto.me Next-Gen AI Bookmark Manager extension

AI Bookmark Manager saves the active page, a right-clicked link, or selected
text through saveto.me's first-party capture page. It adds smart organization
and search while keeping account credentials out of the extension.

## Build all browser packages

Run `npm run build:extensions`. Downloadable packages are created in
`public/extensions/` and copied into the production site by Vite.

## Chrome, Edge, Brave, and Opera

1. Download and unzip `saveto-me-chrome-edge-brave-opera.zip`.
2. Open `chrome://extensions`, `edge://extensions`, `brave://extensions`, or
   `opera://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the unzipped folder.
5. Pin saveto.me to the toolbar. Use the toolbar, right-click menu, or the
   `Command+Shift+S` / `Alt+Shift+S` shortcut.

## Firefox

For development, open `about:debugging#/runtime/this-firefox`, choose **Load
Temporary Add-on**, and select the built `manifest.json`. Firefox removes
temporary add-ons when the browser restarts.

Production releases must be submitted to Mozilla Add-ons and distributed as a
Mozilla-signed XPI. Do not offer the locally generated unsigned XPI as a normal
end-user installation.

## Safari

Unzip `saveto-me-safari-web-extension-source.zip`, then run Apple's converter on
a Mac with full Xcode installed:

`xcrun safari-web-extension-converter /path/to/unzipped-extension --project-location ./Safari --app-name "saveto.me" --bundle-identifier me.saveto.extension`

Run the generated macOS wrapper directly from Xcode and enable the extension in
Safari Settings. No App Store publication is needed. Apple still requires local
code signing; a free Personal Team can be used for development on your Mac.
