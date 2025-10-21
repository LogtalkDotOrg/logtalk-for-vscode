"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import LogtalkTerminal from "./logtalkTerminal";
import { getLogger } from "../utils/logger";

/**
 * Logtalk Profiling Feature
 * 
 * This module provides profiling capabilities for Logtalk code using the ports_profiler tool.
 * It manages profiling state, displays profiling data in a webview, and allows users to
 * toggle profiling on/off and reset profiling data.
 */
export class LogtalkProfiling {
  private static instance: LogtalkProfiling;
  private context: vscode.ExtensionContext;
  private webviewPanel: vscode.WebviewPanel | undefined;
  private profilingEnabled: boolean = false;
  private logger = getLogger();

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public static getInstance(context: vscode.ExtensionContext): LogtalkProfiling {
    if (!LogtalkProfiling.instance) {
      LogtalkProfiling.instance = new LogtalkProfiling(context);
    }
    return LogtalkProfiling.instance;
  }

  /**
   * Toggle profiling on/off
   */
  public async toggleProfiling(): Promise<void> {
    this.profilingEnabled = !this.profilingEnabled;

    if (this.profilingEnabled) {
      // Turn on profiling
      this.logger.info("Enabling Logtalk profiling");
      //LogtalkTerminal.createLogtalkTerm();
      
      // Load the ports_profiler tool and switch to debug mode
      LogtalkTerminal.sendString("logtalk_load(ports_profiler(loader)).\r", false);
      // Wait a bit for the tool to load
      await this.delay(500);
      LogtalkTerminal.sendString("logtalk_make(debug), ports_profiler::start.\r", true);
      
      vscode.window.showInformationMessage("Logtalk profiling enabled. Code will be recompiled in debug mode.");
      
      // Update context for UI
      vscode.commands.executeCommand('setContext', 'logtalk.profilingEnabled', true);
    } else {
      // Turn off profiling
      this.logger.info("Disabling Logtalk profiling");
      //LogtalkTerminal.createLogtalkTerm();
      
      // Switch back to normal mode
      LogtalkTerminal.sendString("ports_profiler::stop, logtalk_make(normal).\r", true);
      
      vscode.window.showInformationMessage("Logtalk profiling disabled. Code will be recompiled in normal mode.");
      
      // Update context for UI
      vscode.commands.executeCommand('setContext', 'logtalk.profilingEnabled', false);
      
      // Close the webview if it's open
      if (this.webviewPanel) {
        this.webviewPanel.dispose();
        this.webviewPanel = undefined;
      }
    }
  }

  /**
   * Show profiling data in a webview
   */
  public async showProfilingData(): Promise<void> {
    if (!this.profilingEnabled) {
      vscode.window.showWarningMessage("Profiling is not enabled. Please toggle profiling on first.");
      return;
    }

    this.logger.info("Showing profiling data");

    try {
      // Get profiling data from Logtalk
      const profilingData = await this.getProfilingData();
      
      if (!profilingData || profilingData.trim() === "") {
        vscode.window.showInformationMessage("No profiling data available. Run some queries first.");
        return;
      }

      // Create or show the webview
      if (this.webviewPanel) {
        this.webviewPanel.reveal(vscode.ViewColumn.Two);
      } else {
        this.webviewPanel = vscode.window.createWebviewPanel(
          'logtalkProfiling',
          'Logtalk Profiling Data',
          vscode.ViewColumn.Two,
          {
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );

        // Handle webview disposal
        this.webviewPanel.onDidDispose(() => {
          this.webviewPanel = undefined;
        });
      }

      // Update webview content
      this.webviewPanel.webview.html = this.getWebviewContent(profilingData);
    } catch (error) {
      this.logger.error("Error showing profiling data:", error);
      vscode.window.showErrorMessage(`Failed to show profiling data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset profiling data
   */
  public async resetProfilingData(): Promise<void> {
    if (!this.profilingEnabled) {
      vscode.window.showWarningMessage("Profiling is not enabled.");
      return;
    }

    this.logger.info("Resetting profiling data");
    
    //LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString("ports_profiler::reset.\r", true);
    
    vscode.window.showInformationMessage("Profiling data reset.");
    
    // Close the webview
    if (this.webviewPanel) {
      this.webviewPanel.dispose();
      this.webviewPanel = undefined;
    }
  }

  /**
   * Get profiling data from Logtalk by writing to a file
   */
  private async getProfilingData(): Promise<string> {
    const logtalkUser = vscode.workspace.getConfiguration("logtalk").get<string>("user.path", "");
    if (!logtalkUser) {
      throw new Error("Logtalk user path not configured");
    }

    const profilingDataFile = path.join(logtalkUser, "scratch", ".vscode_profiling_data");
    
    // Remove old file if it exists
    await fsp.rm(profilingDataFile, { force: true });

    // Create the terminal and send the goal to write profiling data to file
    //LogtalkTerminal.createLogtalkTerm();
    
    // Redirect output to file
    const normalizedPath = path.resolve(profilingDataFile).split(path.sep).join("/");
    LogtalkTerminal.sendString(`open('${normalizedPath}', write, Stream), set_output(Stream), ports_profiler::data, close(Stream).\r`, false);
    
    // Wait for the file to be created
    await this.waitForFile(profilingDataFile, 5000);
    
    // Read the file
    const data = await fsp.readFile(profilingDataFile, 'utf-8');
    
    // Clean up
    await fsp.rm(profilingDataFile, { force: true });
    
    return data;
  }

  /**
   * Generate HTML content for the webview
   */
  private getWebviewContent(profilingData: string): string {
    // Parse the profiling data table
    const tableData = this.parseProfilingData(profilingData);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logtalk Profiling Data</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 20px;
        }
        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
            cursor: pointer;
            user-select: none;
        }
        th:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }
        .sort-indicator {
            margin-left: 5px;
            font-size: 0.8em;
        }
        h1 {
            color: var(--vscode-foreground);
        }
    </style>
</head>
<body>
    <h1>Logtalk Profiling Data</h1>
    <table id="profilingTable">
        ${tableData}
    </table>
    <script>
        (function() {
            const table = document.getElementById('profilingTable');
            const headers = table.querySelectorAll('th');
            let sortColumn = -1;
            let sortAscending = true;

            headers.forEach((header, index) => {
                header.addEventListener('click', () => {
                    sortTable(index);
                });
            });

            function sortTable(columnIndex) {
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                
                // Toggle sort direction if clicking the same column
                if (sortColumn === columnIndex) {
                    sortAscending = !sortAscending;
                } else {
                    sortAscending = true;
                    sortColumn = columnIndex;
                }

                // Sort rows
                rows.sort((a, b) => {
                    const aValue = a.cells[columnIndex].textContent.trim();
                    const bValue = b.cells[columnIndex].textContent.trim();
                    
                    // Try to parse as numbers
                    const aNum = parseInt(aValue);
                    const bNum = parseInt(bValue);
                    
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        return sortAscending ? aNum - bNum : bNum - aNum;
                    } else {
                        return sortAscending ? 
                            aValue.localeCompare(bValue) : 
                            bValue.localeCompare(aValue);
                    }
                });

                // Clear and re-append rows
                rows.forEach(row => tbody.appendChild(row));

                // Update sort indicators
                headers.forEach((h, i) => {
                    const indicator = h.querySelector('.sort-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                });
                
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.textContent = sortAscending ? '▲' : '▼';
                headers[columnIndex].appendChild(indicator);
            }
        })();
    </script>
</body>
</html>`;
  }

  /**
   * Parse profiling data from text format to HTML table
   */
  private parseProfilingData(data: string): string {
    const lines = data.split('\n').filter(line => line.length > 0);

    // Find the table boundaries (lines with dashes)
    const dashLineIndices = lines.map((line, index) => line.match(/^-+$/) ? index : -1).filter(i => i !== -1);

    if (dashLineIndices.length < 2) {
      return '<p>No profiling data table found.</p>';
    }

    // The header is BETWEEN the first and second dash lines
    const headerIndex = dashLineIndices[0] + 1;
    const dataStartIndex = dashLineIndices[1] + 1;
    const dataEndIndex = dashLineIndices.length > 2 ? dashLineIndices[2] : lines.length;

    // Parse header - column names are separated by one or more spaces
    const headerLine = lines[headerIndex];
    const headers = headerLine.trim().split(/\s+/).filter(h => h.length > 0);

    // Parse data rows - data columns are separated by two or more spaces
    const dataRows = lines.slice(dataStartIndex, dataEndIndex).filter(line => line.trim().length > 0);

    let html = '<thead><tr>';
    headers.forEach(header => {
      html += `<th>${this.escapeHtml(header)}</th>`;
    });
    html += '</tr></thead><tbody>';

    dataRows.forEach(row => {
      const cells = row.split(/\s{2,}/).filter(c => c.trim().length > 0);
      html += '<tr>';
      cells.forEach(cell => {
        html += `<td>${this.escapeHtml(cell)}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody>';
    return html;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Wait for a file to exist
   */
  private async waitForFile(filePath: string, timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    const delay = 200;

    while (Date.now() - startTime < timeout) {
      try {
        await fsp.stat(filePath);
        return;
      } catch (err) {
        // File doesn't exist yet, wait and try again
      }
      await this.delay(delay);
    }

    throw new Error(`Timeout waiting for file: ${filePath}`);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.webviewPanel) {
      this.webviewPanel.dispose();
    }
  }
}

