import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Provider for SVG webview with navigation and link handling
 */
interface HistoryEntry {
  path: string;
  zoomLevel: number;
  type: 'svg' | 'html';
}

export class SvgViewerProvider {
  private static readonly viewType = 'logtalk.svgViewer';
  private static panels = new Map<string, vscode.WebviewPanel>();
  private static history = new Map<string, HistoryEntry[]>();
  private static historyIndex = new Map<string, number>();
  private static currentZoomLevel = new Map<string, number>();
  private static extensionContext: vscode.ExtensionContext | undefined;

  /**
   * Go back in navigation history (called from command)
   */
  public static goBack() {
    // Find the active panel
    const activeEntry = Array.from(this.panels.entries()).find(([_, panel]) => panel.active);
    if (activeEntry && this.extensionContext) {
      const [panelKey, panel] = activeEntry;
      this.handleBack(panelKey, panel, this.extensionContext);
    }
  }

  /**
   * Reload current content (called from command)
   */
  public static reload() {
    // Find the active panel
    const activeEntry = Array.from(this.panels.entries()).find(([_, panel]) => panel.active);
    if (activeEntry && this.extensionContext) {
      const [panelKey, panel] = activeEntry;
      this.handleReload(panelKey, panel, this.extensionContext);
    }
  }

  /**
   * Zoom in (called from command)
   */
  public static zoomIn() {
    const activeEntry = Array.from(this.panels.entries()).find(([_, panel]) => panel.active);
    if (activeEntry) {
      const [_, panel] = activeEntry;
      panel.webview.postMessage({ command: 'zoomIn' });
    }
  }

  /**
   * Zoom out (called from command)
   */
  public static zoomOut() {
    const activeEntry = Array.from(this.panels.entries()).find(([_, panel]) => panel.active);
    if (activeEntry) {
      const [_, panel] = activeEntry;
      panel.webview.postMessage({ command: 'zoomOut' });
    }
  }

  /**
   * Reset zoom (called from command)
   */
  public static zoomReset() {
    const activeEntry = Array.from(this.panels.entries()).find(([_, panel]) => panel.active);
    if (activeEntry) {
      const [_, panel] = activeEntry;
      panel.webview.postMessage({ command: 'zoomReset' });
    }
  }

  /**
   * Open an SVG file in a webview
   */
  public static openSvgFile(uri: vscode.Uri, context: vscode.ExtensionContext) {
    this.extensionContext = context;
    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);
    const panelKey = filePath;

    // Check if we already have a panel for this file
    let panel = this.panels.get(panelKey);
    
    if (panel) {
      // If panel exists, reveal it in column Two and update content
      panel.reveal(vscode.ViewColumn.Two);
      this.updateWebviewContent(panel, filePath, context);
    } else {
      // Create a new panel
      // Use workspace folders as localResourceRoots to allow loading resources from any location
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const localResourceRoots = workspaceFolders.map(folder => folder.uri);
      // Also add the file's directory and extension media folder
      localResourceRoots.push(
        vscode.Uri.file(path.dirname(filePath)),
        vscode.Uri.joinPath(context.extensionUri, 'media')
      );

      // Always open webview in Column Two (right side)
      // This creates a persistent split where the webview stays on the right
      panel = vscode.window.createWebviewPanel(
        this.viewType,
        `SVG: ${fileName}`,
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: localResourceRoots
        }
      );

      this.panels.set(panelKey, panel);
      this.history.set(panelKey, [{ path: filePath, zoomLevel: 1.0, type: 'svg' }]);
      this.historyIndex.set(panelKey, 0);
      this.currentZoomLevel.set(panelKey, 1.0);

      // Handle panel disposal
      panel.onDidDispose(() => {
        this.panels.delete(panelKey);
        this.history.delete(panelKey);
        this.historyIndex.delete(panelKey);
        this.currentZoomLevel.delete(panelKey);
      }, null, context.subscriptions);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'openFile':
              this.handleOpenFile(message.filePath, message.line, message.column, panelKey, panel!, context);
              break;
            case 'openSvg':
              this.handleOpenSvg(message.path, panelKey, panel!, context);
              break;
            case 'openHtml':
              this.handleOpenHtml(message.path, panelKey, panel!, context);
              break;
            case 'openUrl':
              // Open HTTP/HTTPS URLs in external browser
              if (message.url) {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
              }
              break;
            case 'back':
              this.handleBack(panelKey, panel!, context);
              break;
            case 'reload':
              this.handleReload(panelKey, panel!, context);
              break;
            case 'zoomChanged':
              // Track zoom level changes from the webview
              if (typeof message.zoomLevel === 'number') {
                this.currentZoomLevel.set(panelKey, message.zoomLevel);
              }
              break;
          }
        },
        null,
        context.subscriptions
      );

      this.updateWebviewContent(panel, filePath, context);
    }
  }

  /**
   * Handle opening a file at a specific line
   */
  private static async handleOpenFile(filePath: string, line?: number, column?: number, panelKey?: string, panel?: vscode.WebviewPanel, context?: vscode.ExtensionContext) {
    try {
      // Expand ${workspaceFolder} variable
      let expandedPath = filePath;
      if (filePath.includes('${workspaceFolder}')) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          expandedPath = filePath.replace(/\$\{workspaceFolder\}/g, workspaceFolder.uri.fsPath);
        }
      }

      // If path is relative, resolve it relative to workspace folder
      if (!path.isAbsolute(expandedPath)) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          expandedPath = path.resolve(workspaceFolder.uri.fsPath, expandedPath);
        }
      }

      // Check if this is an HTML file - if so, open in webview
      if ((expandedPath.endsWith('.html') || expandedPath.endsWith('.htm')) && panelKey && panel && context) {
        this.handleOpenHtml(expandedPath, panelKey, panel, context);
        return;
      }

      // Create URI from file path
      const uri = vscode.Uri.file(expandedPath);
      const document = await vscode.workspace.openTextDocument(uri);

      // Always open in Column One (left side) and preserve focus on the webview (Column Two)
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: true,
        preview: false
      });

      // Navigate to the specified line or first line if no line specified
      const targetLine = (line !== undefined && line > 0) ? line - 1 : 0;
      const col = (column !== undefined && column > 0) ? column - 1 : 0;
      const position = new vscode.Position(targetLine, col);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  /**
   * Handle opening another SVG file
   */
  private static handleOpenSvg(svgPath: string, panelKey: string, panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const currentHistory = this.history.get(panelKey) || [];
    const currentIndex = this.historyIndex.get(panelKey) || 0;
    const currentEntry = currentHistory[currentIndex];
    const currentPath = currentEntry.path;

    // Save current zoom level to history
    const currentZoom = this.currentZoomLevel.get(panelKey) || 1.0;
    currentEntry.zoomLevel = currentZoom;

    // Separate file path from anchor (e.g., "file.svg#anchor")
    const hashIndex = svgPath.indexOf('#');
    const filePathOnly = hashIndex >= 0 ? svgPath.substring(0, hashIndex) : svgPath;
    const anchor = hashIndex >= 0 ? svgPath.substring(hashIndex) : '';

    // Resolve relative path
    let absolutePath: string;
    if (path.isAbsolute(filePathOnly)) {
      absolutePath = filePathOnly;
    } else {
      // Resolve relative to current SVG file's directory
      // Strip anchor from currentPath before getting directory
      const currentPathWithoutAnchor = currentPath.split('#')[0];
      const currentDir = path.dirname(currentPathWithoutAnchor);
      absolutePath = path.resolve(currentDir, filePathOnly);
    }

    // Add anchor back to the path
    const fullPath = absolutePath + anchor;

    // Add to history (remove any forward history)
    const newHistory = currentHistory.slice(0, currentIndex + 1);
    newHistory.push({ path: fullPath, zoomLevel: 1.0, type: 'svg' });
    this.history.set(panelKey, newHistory);
    this.historyIndex.set(panelKey, newHistory.length - 1);
    this.currentZoomLevel.set(panelKey, 1.0);

    // Update panel title (without anchor)
    panel.title = `SVG: ${path.basename(absolutePath)}`;

    // Update content
    this.updateWebviewContent(panel, fullPath, context);
  }

  /**
   * Handle opening an HTML file
   */
  private static handleOpenHtml(htmlPath: string, panelKey: string, panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const currentHistory = this.history.get(panelKey) || [];
    const currentIndex = this.historyIndex.get(panelKey) || 0;
    const currentEntry = currentHistory[currentIndex];
    const currentPath = currentEntry.path;

    // Save current zoom level to history
    const currentZoom = this.currentZoomLevel.get(panelKey) || 1.0;
    currentEntry.zoomLevel = currentZoom;

    // Separate file path from anchor (e.g., "file.html#anchor")
    const hashIndex = htmlPath.indexOf('#');
    const filePathOnly = hashIndex >= 0 ? htmlPath.substring(0, hashIndex) : htmlPath;
    const anchor = hashIndex >= 0 ? htmlPath.substring(hashIndex) : '';

    // Resolve relative path
    let absolutePath: string;
    if (path.isAbsolute(filePathOnly)) {
      absolutePath = filePathOnly;
    } else {
      // Resolve relative to current file's directory
      // Strip anchor from currentPath before getting directory
      const currentPathWithoutAnchor = currentPath.split('#')[0];
      const currentDir = path.dirname(currentPathWithoutAnchor);
      absolutePath = path.resolve(currentDir, filePathOnly);
    }

    // Add anchor back to the path
    const fullPath = absolutePath + anchor;

    // Add to history (remove any forward history)
    const newHistory = currentHistory.slice(0, currentIndex + 1);
    newHistory.push({ path: fullPath, zoomLevel: 1.0, type: 'html' });
    this.history.set(panelKey, newHistory);
    this.historyIndex.set(panelKey, newHistory.length - 1);
    this.currentZoomLevel.set(panelKey, 1.0);

    // Update panel title (without anchor)
    panel.title = `HTML: ${path.basename(absolutePath)}`;

    // Update content
    this.updateWebviewContentHtml(panel, fullPath, context);
  }

  /**
   * Handle back navigation
   */
  private static handleBack(panelKey: string, panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const currentHistory = this.history.get(panelKey) || [];
    const currentIndex = this.historyIndex.get(panelKey) || 0;

    if (currentIndex > 0) {
      // Save current zoom level before navigating back
      const currentEntry = currentHistory[currentIndex];
      const currentZoom = this.currentZoomLevel.get(panelKey) || 1.0;
      currentEntry.zoomLevel = currentZoom;

      const newIndex = currentIndex - 1;
      this.historyIndex.set(panelKey, newIndex);
      const entry = currentHistory[newIndex];
      const filePath = entry.path;

      // Restore zoom level for the previous page
      this.currentZoomLevel.set(panelKey, entry.zoomLevel);

      // Check if it's an HTML file or SVG file
      const isHtml = filePath.endsWith('.html') || filePath.endsWith('.htm');

      // Update panel title
      panel.title = `${isHtml ? 'HTML' : 'SVG'}: ${path.basename(filePath)}`;

      // Update content with appropriate method
      if (isHtml) {
        this.updateWebviewContentHtml(panel, filePath, context);
      } else {
        this.updateWebviewContent(panel, filePath, context);
      }
    }
  }

  /**
   * Handle reload
   */
  private static handleReload(panelKey: string, panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    const currentHistory = this.history.get(panelKey) || [];
    const currentIndex = this.historyIndex.get(panelKey) || 0;
    const entry = currentHistory[currentIndex];

    if (entry) {
      const filePath = entry.path;
      // Check if it's an HTML file or SVG file
      const isHtml = filePath.endsWith('.html') || filePath.endsWith('.htm');

      // Update content with appropriate method (keep current zoom level)
      if (isHtml) {
        this.updateWebviewContentHtml(panel, filePath, context);
      } else {
        this.updateWebviewContent(panel, filePath, context);
      }
    }
  }

  /**
   * Update the webview content with an SVG file
   */
  private static updateWebviewContent(panel: vscode.WebviewPanel, filePath: string, context: vscode.ExtensionContext) {
    const panelKey = Array.from(this.panels.entries()).find(([_, p]) => p === panel)?.[0];
    const currentIndex = panelKey ? this.historyIndex.get(panelKey) || 0 : 0;
    const canGoBack = currentIndex > 0;
    const zoomLevel = panelKey ? this.currentZoomLevel.get(panelKey) || 1.0 : 1.0;

    // Separate file path from anchor (e.g., "file.svg#anchor")
    const hashIndex = filePath.indexOf('#');
    const filePathOnly = hashIndex >= 0 ? filePath.substring(0, hashIndex) : filePath;
    const anchor = hashIndex >= 0 ? filePath.substring(hashIndex + 1) : '';

    if (!fs.existsSync(filePathOnly)) {
      panel.webview.html = this.getErrorHtml('File not found');
      return;
    }

    try {
      const svgContent = fs.readFileSync(filePathOnly, 'utf8');
      const svgDir = path.dirname(filePathOnly);
      const svgDirUri = panel.webview.asWebviewUri(vscode.Uri.file(svgDir));

      panel.webview.html = this.getWebviewContent(svgContent, svgDirUri.toString(), svgDir, canGoBack, zoomLevel);

      // Send zoom level and scroll to anchor after a short delay to ensure DOM is ready
      setTimeout(() => {
        panel.webview.postMessage({ command: 'setZoom', zoomLevel });
        if (anchor) {
          panel.webview.postMessage({ command: 'scrollToAnchor', anchor });
        }
      }, 100);
    } catch (error) {
      panel.webview.html = this.getErrorHtml(`Failed to load SVG: ${error}`);
    }
  }

  /**
   * Update the webview content with an HTML file
   */
  private static updateWebviewContentHtml(panel: vscode.WebviewPanel, filePath: string, context: vscode.ExtensionContext) {
    const panelKey = Array.from(this.panels.entries()).find(([_, p]) => p === panel)?.[0];
    const currentIndex = panelKey ? this.historyIndex.get(panelKey) || 0 : 0;
    const canGoBack = currentIndex > 0;
    const zoomLevel = panelKey ? this.currentZoomLevel.get(panelKey) || 1.0 : 1.0;

    // Separate file path from anchor (e.g., "file.html#anchor")
    const hashIndex = filePath.indexOf('#');
    const filePathOnly = hashIndex >= 0 ? filePath.substring(0, hashIndex) : filePath;
    const anchor = hashIndex >= 0 ? filePath.substring(hashIndex + 1) : '';

    if (!fs.existsSync(filePathOnly)) {
      panel.webview.html = this.getErrorHtml('File not found');
      return;
    }

    try {
      const htmlContent = fs.readFileSync(filePathOnly, 'utf8');
      const htmlDir = path.dirname(filePathOnly);
      const htmlDirUri = panel.webview.asWebviewUri(vscode.Uri.file(htmlDir));

      panel.webview.html = this.getHtmlWebviewContent(htmlContent, htmlDirUri.toString(), htmlDir, canGoBack, panel, zoomLevel);

      // Send zoom level and scroll to anchor after a short delay to ensure DOM is ready
      setTimeout(() => {
        panel.webview.postMessage({ command: 'setZoom', zoomLevel });
        if (anchor) {
          panel.webview.postMessage({ command: 'scrollToAnchor', anchor });
        }
      }, 100);
    } catch (error) {
      panel.webview.html = this.getErrorHtml(`Failed to load HTML: ${error}`);
    }
  }

  /**
   * Generate the HTML content for the webview
   */
  private static getWebviewContent(svgContent: string, baseUri: string, svgDir: string, canGoBack: boolean, zoomLevel: number): string {
    // Process SVG content to handle links
    const processedSvg = this.processSvgLinks(svgContent, baseUri);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https://*.vscode-cdn.net;">
  <title>SVG Viewer</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      overflow: auto;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    #svg-wrapper {
      transform-origin: top left;
      transition: transform 0.1s ease-out;
    }
    #svg-wrapper svg {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div id="svg-wrapper">
    ${processedSvg}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let zoomLevel = 1.0;
    const zoomStep = 0.1;
    const minZoom = 0.1;
    const maxZoom = 5.0;

    function updateZoom() {
      const wrapper = document.getElementById('svg-wrapper');
      wrapper.style.transform = 'scale(' + zoomLevel + ')';
      // Notify extension of zoom level change
      vscode.postMessage({ command: 'zoomChanged', zoomLevel: zoomLevel });
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'setZoom':
          // Restore zoom level from history
          if (typeof message.zoomLevel === 'number') {
            zoomLevel = message.zoomLevel;
            updateZoom();
          }
          break;
        case 'zoomIn':
          if (zoomLevel < maxZoom) {
            zoomLevel = Math.min(maxZoom, zoomLevel + zoomStep);
            updateZoom();
          }
          break;
        case 'zoomOut':
          if (zoomLevel > minZoom) {
            zoomLevel = Math.max(minZoom, zoomLevel - zoomStep);
            updateZoom();
          }
          break;
        case 'zoomReset':
          zoomLevel = 1.0;
          updateZoom();
          break;
        case 'scrollToAnchor':
          // Scroll to element with the specified ID
          if (message.anchor) {
            const element = document.getElementById(message.anchor);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
          break;
      }
    });

    // Handle clicks on links in the SVG
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a');
      if (target) {
        const href = target.getAttribute('href') || target.getAttribute('xlink:href');
        if (href) {
          e.preventDefault();
          e.stopPropagation();
          handleLink(href);
          return false;
        }
      }
    }, true);

    function handleLink(href) {
      // Handle HTTP/HTTPS URLs first (before checking file extensions)
      if (href.startsWith('http://') || href.startsWith('https://')) {
        vscode.postMessage({
          command: 'openUrl',
          url: href
        });
      }
      // Handle vscode://file/ URLs
      else if (href.startsWith('vscode://file/')) {
        const pathPart = href.substring('vscode://file/'.length);
        const urlParts = pathPart.split(':');

        // On Windows, paths start with drive letter (e.g., C:/path)
        // So urlParts would be ['C', '/path/to/file', 'line', 'column']
        // On Unix, paths start with / (e.g., /path/to/file)
        // So urlParts would be ['', '/path/to/file', 'line', 'column'] or ['/path/to/file', 'line', 'column']
        let filePath, line, column;

        if (urlParts.length >= 2 && urlParts[0].length === 1 && urlParts[0].match(/[a-zA-Z]/)) {
          // Windows path: C:/path/to/file:line:column
          filePath = urlParts[0] + ':' + urlParts[1];
          line = urlParts[2] ? parseInt(urlParts[2], 10) : undefined;
          column = urlParts[3] ? parseInt(urlParts[3], 10) : undefined;
        } else {
          // Unix path: /path/to/file:line:column
          filePath = urlParts[0];
          line = urlParts[1] ? parseInt(urlParts[1], 10) : undefined;
          column = urlParts[2] ? parseInt(urlParts[2], 10) : undefined;
        }

        vscode.postMessage({
          command: 'openFile',
          filePath: filePath,
          line: line,
          column: column
        });
      }
      // Handle relative SVG file links (may include anchor #fragment)
      else if (href.includes('.svg')) {
        vscode.postMessage({
          command: 'openSvg',
          path: href
        });
      }
      // Handle relative HTML file links (may include anchor #fragment)
      else if (href.includes('.html') || href.includes('.htm')) {
        vscode.postMessage({
          command: 'openHtml',
          path: href
        });
      }
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate the HTML content for displaying HTML files in the webview
   */
  private static getHtmlWebviewContent(htmlContent: string, baseUri: string, htmlDir: string, canGoBack: boolean, panel: vscode.WebviewPanel, zoomLevel: number): string {
    // Process HTML to convert relative URLs to webview URIs
    let processedHtml = this.processHtmlContent(htmlContent, htmlDir, panel);

    // Remove any existing CSP meta tags from the HTML
    processedHtml = processedHtml.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

    // Inject a permissive CSP and zoom styles
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://*.vscode-cdn.net; script-src 'unsafe-inline' https://*.vscode-cdn.net; img-src data: https://*.vscode-cdn.net https: http:; font-src https://*.vscode-cdn.net data:;">`;

    const zoomStyles = `
    <style>
      #vscode-html-wrapper {
        transform-origin: top left;
        transition: transform 0.1s ease-out;
      }
    </style>`;

    const linkHandlerScript = `
    <script>
      (function() {
        const vscode = acquireVsCodeApi();
        let zoomLevel = 1.0;
        const zoomStep = 0.1;
        const minZoom = 0.1;
        const maxZoom = 5.0;

        // Wrap body content in a zoom wrapper
        function wrapBodyContent() {
          const body = document.body;
          const wrapper = document.createElement('div');
          wrapper.id = 'vscode-html-wrapper';
          while (body.firstChild) {
            wrapper.appendChild(body.firstChild);
          }
          body.appendChild(wrapper);
        }

        function updateZoom() {
          const wrapper = document.getElementById('vscode-html-wrapper');
          if (wrapper) {
            wrapper.style.transform = 'scale(' + zoomLevel + ')';
          }
          // Notify extension of zoom level change
          vscode.postMessage({ command: 'zoomChanged', zoomLevel: zoomLevel });
        }

        // Listen for messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.command) {
            case 'setZoom':
              // Restore zoom level from history
              if (typeof message.zoomLevel === 'number') {
                zoomLevel = message.zoomLevel;
                updateZoom();
              }
              break;
            case 'zoomIn':
              if (zoomLevel < maxZoom) {
                zoomLevel = Math.min(maxZoom, zoomLevel + zoomStep);
                updateZoom();
              }
              break;
            case 'zoomOut':
              if (zoomLevel > minZoom) {
                zoomLevel = Math.max(minZoom, zoomLevel - zoomStep);
                updateZoom();
              }
              break;
            case 'zoomReset':
              zoomLevel = 1.0;
              updateZoom();
              break;
            case 'scrollToAnchor':
              // Scroll to element with the specified ID
              if (message.anchor) {
                const element = document.getElementById(message.anchor);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }
              break;
          }
        });

        // Fix CSS inheritance for elements with 'background-color: inherit'
        // VSCode webview breaks inheritance, so we need to manually resolve it
        function fixBackgroundInheritance() {
          const elementsWithInherit = document.querySelectorAll('*');
          elementsWithInherit.forEach(el => {
            const computed = window.getComputedStyle(el);
            const bgColor = computed.backgroundColor;

            // If background is transparent or not set, and CSS says inherit, resolve it
            if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
              // Walk up the tree to find first non-transparent background
              let parent = el.parentElement;
              while (parent) {
                const parentBg = window.getComputedStyle(parent).backgroundColor;
                if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
                  el.style.backgroundColor = parentBg;
                  break;
                }
                parent = parent.parentElement;
              }
            }
          });
        }

        // Run after DOM is loaded
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            wrapBodyContent();
            fixBackgroundInheritance();
          });
        } else {
          wrapBodyContent();
          fixBackgroundInheritance();
        }

        document.addEventListener('click', (e) => {
          const target = e.target.closest('a');
          if (target) {
            const href = target.getAttribute('href');
            if (href) {
              e.preventDefault();
              e.stopPropagation();

              // Handle HTTP/HTTPS URLs first (before checking file extensions)
              if (href.startsWith('http://') || href.startsWith('https://')) {
                vscode.postMessage({ command: 'openUrl', url: href });
              } else if (href.startsWith('vscode://file/')) {
                const pathPart = href.substring('vscode://file/'.length);
                const urlParts = pathPart.split(':');

                // On Windows, paths start with drive letter (e.g., C:/path)
                // So urlParts would be ['C', '/path/to/file', 'line', 'column']
                // On Unix, paths start with / (e.g., /path/to/file)
                // So urlParts would be ['', '/path/to/file', 'line', 'column'] or ['/path/to/file', 'line', 'column']
                let filePath, line, column;

                if (urlParts.length >= 2 && urlParts[0].length === 1 && urlParts[0].match(/[a-zA-Z]/)) {
                  // Windows path: C:/path/to/file:line:column
                  filePath = urlParts[0] + ':' + urlParts[1];
                  line = urlParts[2] ? parseInt(urlParts[2], 10) : undefined;
                  column = urlParts[3] ? parseInt(urlParts[3], 10) : undefined;
                } else {
                  // Unix path: /path/to/file:line:column
                  filePath = urlParts[0];
                  line = urlParts[1] ? parseInt(urlParts[1], 10) : undefined;
                  column = urlParts[2] ? parseInt(urlParts[2], 10) : undefined;
                }

                vscode.postMessage({
                  command: 'openFile',
                  filePath: filePath,
                  line: line,
                  column: column
                });
              } else if (href.includes('.svg')) {
                vscode.postMessage({ command: 'openSvg', path: href });
              } else if (href.includes('.html') || href.includes('.htm')) {
                vscode.postMessage({ command: 'openHtml', path: href });
              }
            }
          }
        }, true);
      })();
    </script>`;

    // Inject CSP and zoom styles into head
    if (processedHtml.includes('<head>')) {
      processedHtml = processedHtml.replace('<head>', `<head>\n${cspMeta}\n${zoomStyles}`);
    } else if (processedHtml.includes('<head ')) {
      processedHtml = processedHtml.replace(/<head([^>]*)>/, `<head$1>\n${cspMeta}\n${zoomStyles}`);
    } else {
      processedHtml = processedHtml.replace(/<html[^>]*>/i, `$&\n<head>\n${cspMeta}\n${zoomStyles}\n</head>`);
    }

    // Inject link handler at end of body
    if (processedHtml.includes('</body>')) {
      processedHtml = processedHtml.replace('</body>', `${linkHandlerScript}\n</body>`);
    }

    return processedHtml;
  }

  /**
   * Process HTML content to make it work in the webview
   */
  private static processHtmlContent(htmlContent: string, htmlDir: string, panel: vscode.WebviewPanel): string {
    // Convert relative URLs in link, script, and img tags to webview URIs
    let processed = htmlContent;

    // Remove any previously injected VSCode toolbar elements (in case of reload)
    processed = processed.replace(/<style id="vscode-toolbar-styles">[\s\S]*?<\/style>/g, '');
    processed = processed.replace(/<div id="vscode-toolbar">[\s\S]*?<\/div>/g, '');
    processed = processed.replace(/<script id="vscode-toolbar-script">[\s\S]*?<\/script>/g, '');

    // Remove or update existing CSP meta tags to allow webview resources
    processed = processed.replace(
      /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
      ''
    );

    // Process XML stylesheet processing instructions: <?xml-stylesheet href="..." type="text/css"?>
    processed = processed.replace(
      /<\?xml-stylesheet\s+href=["']([^"']+)["'][^?]*\?>/gi,
      (match, href) => {
        if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('vscode://')) {
          const absolutePath = path.resolve(htmlDir, href);
          const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absolutePath));
          return match.replace(href, webviewUri.toString());
        }
        return match;
      }
    );

    // Process CSS links: <link href="..." rel="stylesheet"> or <link ... />
    processed = processed.replace(
      /<link\s+([^>]*href=["']([^"']+)["'][^>]*)\/?>/gi,
      (match, attrs, href) => {
        if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('vscode://')) {
          const absolutePath = path.resolve(htmlDir, href);
          const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absolutePath));
          return match.replace(href, webviewUri.toString());
        }
        return match;
      }
    );

    // Process script sources: <script src="..."> or <script ... />
    processed = processed.replace(
      /<script\s+([^>]*src=["']([^"']+)["'][^>]*)\/?>/gi,
      (match, attrs, src) => {
        if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('vscode://')) {
          const absolutePath = path.resolve(htmlDir, src);
          const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absolutePath));
          return match.replace(src, webviewUri.toString());
        }
        return match;
      }
    );

    // Process images: <img src="..."> or <img ... />
    processed = processed.replace(
      /<img\s+([^>]*src=["']([^"']+)["'][^>]*)\/?>/gi,
      (match, attrs, src) => {
        if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:') && !src.startsWith('vscode://')) {
          const absolutePath = path.resolve(htmlDir, src);
          const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absolutePath));
          return match.replace(src, webviewUri.toString());
        }
        return match;
      }
    );

    return processed;
  }

  /**
   * Process SVG content to make links work in the webview
   */
  private static processSvgLinks(svgContent: string, baseUri: string): string {
    // The SVG content is embedded directly, so links will be handled by the click event listener
    return svgContent;
  }

  /**
   * Generate error HTML
   */
  private static getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      padding: 20px;
    }
    .error {
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <h2 class="error">Error</h2>
  <p>${message}</p>
</body>
</html>`;
  }
}

