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
  public async showProfilingData(entity?: string, predicate?: string, previousEntity?: string): Promise<void> {
    if (!this.profilingEnabled) {
      vscode.window.showWarningMessage("Profiling is not enabled. Please toggle profiling on first.");
      return;
    }

    this.logger.info("Showing profiling data", entity ? `for entity: ${entity}` : "", predicate ? `predicate: ${predicate}` : "");

    try {
      // Get profiling data from Logtalk
      const profilingData = await this.getProfilingData(entity, predicate);

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

        // Handle messages from the webview
        this.webviewPanel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case 'focusEntity':
                await this.showProfilingData(message.entity, undefined, undefined);
                break;
              case 'focusPredicate':
                await this.showProfilingData(message.entity, message.predicate, message.previousEntity);
                break;
              case 'showAll':
                await this.showProfilingData();
                break;
              case 'backToEntity':
                await this.showProfilingData(message.entity);
                break;
            }
          },
          undefined,
          this.context.subscriptions
        );
      }

      // Update webview content
      this.webviewPanel.webview.html = this.getWebviewContent(profilingData, entity, predicate, previousEntity);
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
  private async getProfilingData(entity?: string, predicate?: string): Promise<string> {
    const logtalkUser = vscode.workspace.getConfiguration("logtalk").get<string>("user.path", "");
    if (!logtalkUser) {
      throw new Error("Logtalk user path not configured");
    }

    const profilingDataFile = path.join(logtalkUser, "scratch", ".vscode_profiling_data");

    // Remove old file if it exists
    await fsp.rm(profilingDataFile, { force: true });

    // Build the appropriate goal based on parameters
    let goal: string;
    if (entity && predicate) {
      // Focus on specific predicate: ports_profiler::data(Entity, Indicator)
      goal = `ports_profiler::data(${entity}, ${predicate})`;
    } else if (entity) {
      // Focus on specific entity: ports_profiler::data(Entity)
      goal = `ports_profiler::data(${entity})`;
    } else {
      // Show all data: ports_profiler::data
      goal = `ports_profiler::data`;
    }

    // Redirect output to file
    const normalizedPath = path.resolve(profilingDataFile).split(path.sep).join("/");
    LogtalkTerminal.sendString(`open('${normalizedPath}', write, Stream), set_output(Stream), ${goal}, close(Stream).\r`, false);

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
  private getWebviewContent(profilingData: string, entity?: string, predicate?: string, previousEntity?: string): string {
    // Parse the profiling data table
    const tableData = this.parseProfilingData(profilingData, entity, predicate);

    // Build title based on focus
    let title = 'Logtalk Profiling Data';
    if (entity && predicate) {
      title += ` - ${entity}::${predicate}`;
    } else if (entity) {
      title += ` - ${entity}`;
    }

    // Show appropriate back button
    let backButton = '';
    if (entity && predicate && previousEntity) {
      // We came from entity view, show back to entity button
      backButton = `<button id="backToEntityButton" data-entity="${this.escapeHtml(previousEntity)}" style="margin-bottom: 10px; padding: 5px 10px; cursor: pointer;">← Back to ${this.escapeHtml(previousEntity)} Data</button>`;
    } else if (entity || predicate) {
      // Show back to all data button
      backButton = '<button id="backButton" style="margin-bottom: 10px; padding: 5px 10px; cursor: pointer;">← Back to All Data</button>';
    }

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
        .clickable {
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: underline;
        }
        .clickable:hover {
            color: var(--vscode-textLink-activeForeground);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${backButton}
    <table id="profilingTable">
        ${tableData}
    </table>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            const table = document.getElementById('profilingTable');
            const headers = table.querySelectorAll('th');
            const backButton = document.getElementById('backButton');
            const backToEntityButton = document.getElementById('backToEntityButton');
            let sortColumn = -1;
            let sortAscending = true;

            // Handle back to all button
            if (backButton) {
                backButton.addEventListener('click', () => {
                    vscode.postMessage({ command: 'showAll' });
                });
            }

            // Handle back to entity button
            if (backToEntityButton) {
                backToEntityButton.addEventListener('click', () => {
                    const entity = backToEntityButton.dataset.entity;
                    vscode.postMessage({
                        command: 'backToEntity',
                        entity: entity
                    });
                });
            }

            // Handle header clicks for sorting
            headers.forEach((header, index) => {
                header.addEventListener('click', () => {
                    sortTable(index);
                });
            });

            // Handle clicks on entity and predicate cells
            const tbody = table.querySelector('tbody');
            if (tbody) {
                tbody.addEventListener('click', (e) => {
                    const cell = e.target.closest('td');
                    if (!cell) return;

                    // Only handle clicks on clickable cells
                    if (!cell.classList.contains('clickable')) return;

                    const row = cell.parentElement;
                    const cellIndex = Array.from(row.cells).indexOf(cell);
                    const cellText = cell.textContent.trim();

                    // Check if this cell has a data-entity attribute (entity view, predicate column)
                    if (cell.dataset.entity) {
                        // We're in entity view, clicking on predicate (column 0)
                        const entity = cell.dataset.entity;
                        vscode.postMessage({
                            command: 'focusPredicate',
                            entity: entity,
                            predicate: cellText,
                            previousEntity: entity
                        });
                    } else if (cellIndex === 0) {
                        // All data view, clicking on entity (column 0)
                        vscode.postMessage({
                            command: 'focusEntity',
                            entity: cellText
                        });
                    } else if (cellIndex === 1) {
                        // All data view, clicking on predicate (column 1)
                        const entity = row.cells[0].textContent.trim();
                        vscode.postMessage({
                            command: 'focusPredicate',
                            entity: entity,
                            predicate: cellText,
                            previousEntity: undefined
                        });
                    }
                });
            }

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
  private parseProfilingData(data: string, focusedEntity?: string, focusedPredicate?: string): string {
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

    // Determine view mode
    const isAllDataView = !focusedEntity && !focusedPredicate;
    const isEntityView = focusedEntity && !focusedPredicate;
    const isPredicateView = focusedEntity && focusedPredicate;

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
      cells.forEach((cell, index) => {
        let cellHtml = '';

        if (isAllDataView) {
          // All data view: Entity in column 0, Predicate in column 1
          if (index === 0) {
            cellHtml = `<td class="clickable">${this.escapeHtml(cell)}</td>`;
          } else if (index === 1) {
            cellHtml = `<td class="clickable">${this.escapeHtml(cell)}</td>`;
          } else {
            cellHtml = `<td>${this.escapeHtml(cell)}</td>`;
          }
        } else if (isEntityView) {
          // Entity view: Predicate in column 0, store entity context
          if (index === 0) {
            cellHtml = `<td class="clickable" data-entity="${this.escapeHtml(focusedEntity)}">${this.escapeHtml(cell)}</td>`;
          } else {
            cellHtml = `<td>${this.escapeHtml(cell)}</td>`;
          }
        } else {
          // Predicate view: No clickable cells
          cellHtml = `<td>${this.escapeHtml(cell)}</td>`;
        }

        html += cellHtml;
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

