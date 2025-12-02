"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import LogtalkTerminal from "./terminal";
import { getLogger } from "../utils/logger";
import { PredicateUtils } from "../utils/predicateUtils";
import { Utils } from '../utils/utils';
import { StatusBarManager } from "./statusBar";

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

    // Create the Logtalk terminal if it doesn't exist
    LogtalkTerminal.createLogtalkTerm();

    if (this.profilingEnabled) {
      // Turn on profiling
      this.logger.info("Enabling Logtalk profiling");

      // Load the ports_profiler tool and switch to debug mode
      LogtalkTerminal.sendString("logtalk_load(ports_profiler(loader)), logtalk_make(debug), ports_profiler::start.\r", false);
      vscode.window.showInformationMessage("Logtalk profiling enabled. Code will be (re)compiled in debug mode.");

      // Update context for UI
      vscode.commands.executeCommand('setContext', 'logtalk.profilingEnabled', true);

      // Update status bar
      StatusBarManager.getInstance().updateProfilingStatus(true);
    } else {
      // Turn off profiling
      this.logger.info("Disabling Logtalk profiling");

      // Switch back to normal mode
      LogtalkTerminal.sendString("logtalk_load(ports_profiler(loader)), ports_profiler::stop, logtalk_make(normal).\r", true);
      vscode.window.showInformationMessage("Logtalk profiling disabled. Code will be (re)compiled in normal mode.");

      // Update context for UI
      vscode.commands.executeCommand('setContext', 'logtalk.profilingEnabled', false);

      // Update status bar
      StatusBarManager.getInstance().updateProfilingStatus(false);

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
              case 'openEntityDefinition':
                await this.openEntityDefinition(message.entity);
                break;
              case 'openPredicateDefinition':
                await this.openPredicateDefinition(message.entity, message.predicate);
                break;
              case 'openClause':
                await this.openClauseAtPosition(message.entity, message.predicate, message.clauseNumber);
                break;
              case 'openWorkspaceInExplorer':
                await this.openWorkspaceInExplorer();
                break;
              case 'exportCsv':
                await this.exportTableAsCsv(message.csvData, message.title);
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

    // Create the Logtalk terminal if it doesn't exist
    LogtalkTerminal.createLogtalkTerm();

    this.logger.info("Resetting profiling data");
    LogtalkTerminal.sendString("logtalk_load(ports_profiler(loader)), ports_profiler::reset.\r", true);
    
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
    const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
    const profilingDataFile = path.join(wdir, ".vscode_profiling_data");

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

    // Create the Logtalk terminal if it doesn't exist
    LogtalkTerminal.createLogtalkTerm();

    // Redirect output to file
    const normalizedPath = path.resolve(profilingDataFile).split(path.sep).join("/");
    LogtalkTerminal.sendString(`logtalk_load(ports_profiler(loader)), open('${normalizedPath}', write, Stream), set_output(Stream), ${goal}, close(Stream).\r`, false);

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

    // Get workspace folder name
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspaceName = workspaceFolder?.name || 'Logtalk Profiling Data';

    // Build title based on focus
    let title = workspaceName;
    let titleHtml = `<h2><a href="#" id="workspaceLink" class="predicate-link">${this.escapeHtml(workspaceName)}</a></h2>`;

    if (entity && predicate) {
      title = `${entity}::${predicate}`;
      // Make the entity::predicate clickable to open the source file
      titleHtml = `<h2><a href="#" id="predicateLink" class="predicate-link" data-entity="${this.escapeHtml(entity)}" data-predicate="${this.escapeHtml(predicate)}"><code>${this.escapeHtml(entity)}::${this.escapeHtml(predicate)}</code></a></h2>`;
    } else if (entity) {
      title = `${entity}`;
      // Make the entity name clickable to open the source file
      titleHtml = `<h2><a href="#" id="entityLink" class="predicate-link" data-entity="${this.escapeHtml(entity)}"><code>${this.escapeHtml(entity)}</code></a></h2>`;
    }

    // Show appropriate back button and toolbar
    let toolbar = '<div style="margin-bottom: 10px; display: flex; gap: 10px; align-items: center;">';

    if (entity && predicate && previousEntity) {
      // We came from entity view, show back to entity button
      toolbar += `<button id="backToEntityButton" data-entity="${this.escapeHtml(previousEntity)}" style="padding: 5px 10px; cursor: pointer;">← Back to <code>${this.escapeHtml(previousEntity)}</code> Data</button>`;
    } else if (entity || predicate) {
      // Show back to all data button
      toolbar += '<button id="backButton" style="padding: 5px 10px; cursor: pointer;">← Back to All Data</button>';
    }

    // Add export CSV button
    toolbar += '<button id="exportCsvButton" style="padding: 5px 10px; cursor: pointer;">Export as CSV</button>';
    toolbar += '</div>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
            background-color: rgba(128, 128, 128, 0.05);
        }
        .sort-indicator {
            margin-left: 5px;
            font-size: 0.8em;
        }
        h2 {
            color: var(--vscode-foreground);
        }
        code {
            background-color: transparent;
            color: inherit;
            font-family: var(--vscode-editor-font-family);
        }
        .clickable {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        .clickable:hover {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
        .clickable code {
            color: var(--vscode-textLink-foreground);
        }
        .clickable:hover code {
            color: var(--vscode-textLink-activeForeground);
        }
        .predicate-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .predicate-link:hover {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
        .predicate-link code {
            color: var(--vscode-textLink-foreground);
        }
        .predicate-link:hover code {
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
    ${titleHtml}
    ${toolbar}
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
            const exportCsvButton = document.getElementById('exportCsvButton');
            const predicateLink = document.getElementById('predicateLink');
            const entityLink = document.getElementById('entityLink');
            const workspaceLink = document.getElementById('workspaceLink');
            let sortColumn = -1;
            let sortAscending = true;

            // Handle workspace link click (open workspace in Explorer)
            if (workspaceLink) {
                workspaceLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({
                        command: 'openWorkspaceInExplorer'
                    });
                });
            }

            // Handle entity link click (open source file at entity opening directive)
            if (entityLink) {
                entityLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const entity = entityLink.dataset.entity;
                    vscode.postMessage({
                        command: 'openEntityDefinition',
                        entity: entity
                    });
                });
            }

            // Handle predicate link click (open source file)
            if (predicateLink) {
                predicateLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    const entity = predicateLink.dataset.entity;
                    const predicate = predicateLink.dataset.predicate;
                    vscode.postMessage({
                        command: 'openPredicateDefinition',
                        entity: entity,
                        predicate: predicate
                    });
                });
            }

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

            // Handle export CSV button
            if (exportCsvButton) {
                exportCsvButton.addEventListener('click', () => {
                    const csvData = generateCsvData();
                    const title = document.querySelector('h2')?.textContent?.trim() || 'profiling_data';
                    vscode.postMessage({
                        command: 'exportCsv',
                        csvData: csvData,
                        title: title
                    });
                });
            }

            // Generate CSV data from the table
            function generateCsvData() {
                const rows = [];

                // Get headers
                const headerCells = Array.from(table.querySelectorAll('thead th'));
                const headers = headerCells.map(cell => cell.textContent.trim().replace(/[▲▼]/g, '').trim());
                rows.push(headers);

                // Get data rows
                const dataRows = table.querySelectorAll('tbody tr');
                dataRows.forEach(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    const rowData = cells.map(cell => {
                        // Get text content, removing any HTML tags
                        let text = cell.textContent.trim();
                        // Escape quotes and wrap in quotes if contains comma, quote, or newline
                        if (text.includes(',') || text.includes('"') || text.includes('\\n')) {
                            text = '"' + text.replace(/"/g, '""') + '"';
                        }
                        return text;
                    });
                    rows.push(rowData);
                });

                // Convert to CSV string
                return rows.map(row => row.join(',')).join('\\n');
            }

            // Handle header clicks for sorting
            headers.forEach((header, index) => {
                header.addEventListener('click', () => {
                    sortTable(index);
                });
            });

            // Handle clicks on entity, predicate, and clause cells
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

                    // Check if this is a clause link (predicate view)
                    if (cell.classList.contains('clause-link')) {
                        const entity = cell.dataset.entity;
                        const predicate = cell.dataset.predicate;
                        const clauseNumber = parseInt(cell.dataset.clause);
                        vscode.postMessage({
                            command: 'openClause',
                            entity: entity,
                            predicate: predicate,
                            clauseNumber: clauseNumber
                        });
                    }
                    // Check if this cell has a data-entity attribute (entity view, predicate column)
                    else if (cell.dataset.entity && cell.dataset.predicate) {
                        // Predicate view - shouldn't happen as we handle clause-link above
                        return;
                    }
                    else if (cell.dataset.entity) {
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

            function compareValues(aValue, bValue, ascending) {
                // Try to parse as numbers
                const aNum = parseInt(aValue);
                const bNum = parseInt(bValue);

                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return ascending ? aNum - bNum : bNum - aNum;
                } else {
                    return ascending ?
                        aValue.localeCompare(bValue) :
                        bValue.localeCompare(aValue);
                }
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
                    return compareValues(aValue, bValue, sortAscending);
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

            function sortTableMultiColumn(primaryColumn, secondaryColumn) {
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));

                // Sort rows by primary column, then secondary column
                rows.sort((a, b) => {
                    const aPrimary = a.cells[primaryColumn].textContent.trim();
                    const bPrimary = b.cells[primaryColumn].textContent.trim();

                    const primaryCompare = compareValues(aPrimary, bPrimary, true);
                    if (primaryCompare !== 0) {
                        return primaryCompare;
                    }

                    // If primary values are equal, sort by secondary column
                    const aSecondary = a.cells[secondaryColumn].textContent.trim();
                    const bSecondary = b.cells[secondaryColumn].textContent.trim();
                    return compareValues(aSecondary, bSecondary, true);
                });

                // Clear and re-append rows
                rows.forEach(row => tbody.appendChild(row));

                // Update sort indicators for primary column
                sortColumn = primaryColumn;
                sortAscending = true;

                headers.forEach((h, i) => {
                    const indicator = h.querySelector('.sort-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                });

                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.textContent = '▲';
                headers[primaryColumn].appendChild(indicator);
            }

            // Perform initial sort based on view type
            const headerTexts = Array.from(headers).map(h => h.textContent.trim());
            const entityColIndex = headerTexts.indexOf('Entity');
            const predicateColIndex = headerTexts.indexOf('Predicate');

            if (entityColIndex !== -1 && predicateColIndex !== -1) {
                // All data view: sort by Entity first, then Predicate
                sortTableMultiColumn(entityColIndex, predicateColIndex);
            } else if (predicateColIndex !== -1) {
                // Entity view: sort by Predicate
                sortTable(predicateColIndex);
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
    // Normalize line endings to handle both Windows (CRLF) and Unix (LF) formats
    const normalizedData = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedData.split('\n').filter(line => line.length > 0);

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

    // First pass: parse all rows and find max values for numeric columns
    const parsedRows = dataRows.map(row => row.split(/\s{2,}/).filter(c => c.trim().length > 0));
    const maxValues: Map<number, number> = new Map();

    // Identify numeric columns (excluding Entity and Predicate columns)
    headers.forEach((header, colIndex) => {
      if (header !== 'Entity' && header !== 'Predicate') {
        let maxVal = -Infinity;
        parsedRows.forEach(cells => {
          if (cells[colIndex]) {
            const numVal = parseInt(cells[colIndex], 10);
            if (!isNaN(numVal) && numVal > maxVal) {
              maxVal = numVal;
            }
          }
        });
        if (maxVal !== -Infinity) {
          maxValues.set(colIndex, maxVal);
        }
      }
    });

    // Second pass: render the table
    let html = '<thead><tr>';
    headers.forEach(header => {
      html += `<th>${this.escapeHtml(header)}</th>`;
    });
    html += '</tr></thead><tbody>';

    parsedRows.forEach(cells => {
      html += '<tr>';
      cells.forEach((cell, index) => {
        let cellHtml = '';
        const numVal = parseInt(cell, 10);
        const isBold = !isNaN(numVal) && maxValues.has(index) && numVal === maxValues.get(index);
        const cellContent = isBold ? `<strong>${this.escapeHtml(cell)}</strong>` : this.escapeHtml(cell);

        if (isAllDataView) {
          // All data view: Entity in column 0, Predicate in column 1
          if (index === 0) {
            cellHtml = `<td class="clickable"><code>${this.escapeHtml(cell)}</code></td>`;
          } else if (index === 1) {
            cellHtml = `<td class="clickable"><code>${this.escapeHtml(cell)}</code></td>`;
          } else {
            cellHtml = `<td>${cellContent}</td>`;
          }
        } else if (isEntityView) {
          // Entity view: Predicate in column 0, store entity context
          if (index === 0) {
            cellHtml = `<td class="clickable" data-entity="${this.escapeHtml(focusedEntity)}"><code>${this.escapeHtml(cell)}</code></td>`;
          } else {
            cellHtml = `<td>${cellContent}</td>`;
          }
        } else if (isPredicateView) {
          // Predicate view: Clause numbers in column 0 are clickable
          if (index === 0 && headers[0] === 'Clause') {
            cellHtml = `<td class="clickable clause-link" data-entity="${this.escapeHtml(focusedEntity)}" data-predicate="${this.escapeHtml(focusedPredicate)}" data-clause="${this.escapeHtml(cell)}"><code>${this.escapeHtml(cell)}</code></td>`;
          } else {
            cellHtml = `<td>${cellContent}</td>`;
          }
        } else {
          // Other views: No clickable cells
          cellHtml = `<td>${cellContent}</td>`;
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
   * Open the workspace folder in the Explorer pane
   */
  private async openWorkspaceInExplorer(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        // Reveal the workspace folder in the Explorer
        await vscode.commands.executeCommand('revealInExplorer', workspaceFolder.uri);
      }
    } catch (error) {
      this.logger.error("Error opening workspace in Explorer:", error);
    }
  }

  /**
   * Export profiling table data as CSV
   */
  private async exportTableAsCsv(csvData: string, title: string): Promise<void> {
    try {
      this.logger.info("Exporting profiling data as CSV");

      // Clean up the title to create a valid filename
      const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
      const defaultFileName = `${cleanTitle}.csv`;

      // Get the default directory (workspace folder or home directory)
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const defaultDirectory = workspaceFolder?.uri || vscode.Uri.file(process.env.HOME || process.env.USERPROFILE || '');

      // Create default URI with the filename
      const defaultPath = path.join(defaultDirectory.fsPath, defaultFileName);
      const defaultUri = vscode.Uri.file(defaultPath);

      const options: vscode.SaveDialogOptions = {
        defaultUri: defaultUri,
        filters: {
          'CSV Files': ['csv'],
          'All Files': ['*']
        },
        saveLabel: "Save",
        title: "Export Profiling Data as CSV"
      };

      const result = await vscode.window.showSaveDialog(options);

      if (result) {
        // Write the CSV data to the selected file
        await fsp.writeFile(result.fsPath, csvData, 'utf-8');
        vscode.window.showInformationMessage(`Profiling data exported to ${path.basename(result.fsPath)}`);
        this.logger.info(`CSV exported to: ${result.fsPath}`);
      } else {
        this.logger.info("CSV export cancelled by user");
      }
    } catch (error) {
      this.logger.error("Error exporting CSV:", error);
      vscode.window.showErrorMessage(`Failed to export CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Open the source file at the entity opening directive
   */
  private async openEntityDefinition(entity: string): Promise<void> {
    try {
      this.logger.info(`Opening entity definition for ${entity}`);

      // Use LogtalkTerminal to find the entity definition
      await LogtalkTerminal.getEntityDefinition(entity);

      // Read the result from the marker file
      const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
      const resultFile = path.join(wdir, ".vscode_entity_definition");

      this.logger.info(`Looking for result file at: ${resultFile}`);
      this.logger.info(`File exists: ${fs.existsSync(resultFile)}`);

      if (fs.existsSync(resultFile)) {
        const out = fs.readFileSync(resultFile).toString();
        this.logger.info(`Result file content: ${out}`);
        await fsp.rm(resultFile, { force: true });

        const match = out.match(/File:(.+);Line:(\d+)/);
        if (match) {
          const fileName: string = Utils.normalizeDoubleSlashPath(match[1]);
          const lineNum: number = parseInt(match[2]);
          this.logger.info(`Opening file: ${fileName} at line ${lineNum}`);
          const location = new vscode.Location(vscode.Uri.file(fileName), new vscode.Position(lineNum - 1, 0));

          const document = await vscode.workspace.openTextDocument(location.uri);
          await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            selection: new vscode.Range(location.range.start, location.range.start),
            preserveFocus: false
          });
        } else {
          this.logger.warn(`No match found in result file content: ${out}`);
          vscode.window.showWarningMessage(`Could not find definition for entity ${entity}`);
        }
      } else {
        this.logger.warn(`Result file not found at: ${resultFile}`);
        vscode.window.showWarningMessage(`Could not find definition for entity ${entity}`);
      }
    } catch (error) {
      this.logger.error(`Error opening entity definition: ${error}`);
      vscode.window.showErrorMessage(`Failed to open entity definition: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Open the source file at the predicate definition
   */
  private async openPredicateDefinition(entity: string, predicateIndicator: string): Promise<void> {
    try {
      this.logger.info(`Opening predicate definition for ${entity}::${predicateIndicator}`);

      // Use LogtalkTerminal to find the predicate definition
      await LogtalkTerminal.getPredicateDefinition(entity, predicateIndicator);

      // Read the result from the marker file
      const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
      const resultFile = path.join(wdir, ".vscode_predicate_definition");

      this.logger.info(`Looking for result file at: ${resultFile}`);
      this.logger.info(`File exists: ${fs.existsSync(resultFile)}`);

      if (fs.existsSync(resultFile)) {
        const out = fs.readFileSync(resultFile).toString();
        this.logger.info(`Result file content: ${out}`);
        await fsp.rm(resultFile, { force: true });

        const match = out.match(/File:(.+);Line:(\d+)/);
        if (match) {
          const fileName: string = Utils.normalizeDoubleSlashPath(match[1]);
          const lineNum: number = parseInt(match[2]);
          this.logger.info(`Opening file: ${fileName} at line ${lineNum}`);
          const location = new vscode.Location(vscode.Uri.file(fileName), new vscode.Position(lineNum - 1, 0));

          const document = await vscode.workspace.openTextDocument(location.uri);
          await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            selection: new vscode.Range(location.range.start, location.range.start),
            preserveFocus: false
          });
        } else {
          this.logger.warn(`No match found in result file content: ${out}`);
          vscode.window.showWarningMessage(`Could not find definition for ${entity}::${predicateIndicator}`);
        }
      } else {
        this.logger.warn(`Result file not found at: ${resultFile}`);
        vscode.window.showWarningMessage(`Could not find definition for ${entity}::${predicateIndicator}`);
      }
    } catch (error) {
      this.logger.error(`Error opening predicate definition: ${error}`);
      vscode.window.showErrorMessage(`Failed to open predicate definition: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Open the source file at a specific clause position
   */
  private async openClauseAtPosition(entity: string, predicateIndicator: string, clauseNumber: number): Promise<void> {
    try {
      this.logger.info(`Opening clause ${clauseNumber} for ${entity}::${predicateIndicator}`);

      // Find all clauses of the predicate
      const clauses = await this.findPredicateClauses(entity, predicateIndicator);

      if (clauses && clauseNumber > 0 && clauseNumber <= clauses.length) {
        const clauseLocation = clauses[clauseNumber - 1]; // Convert 1-based to 0-based index
        const document = await vscode.workspace.openTextDocument(clauseLocation.uri);
        await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(clauseLocation.range.start, clauseLocation.range.start),
          preserveFocus: false
        });
      } else {
        vscode.window.showWarningMessage(`Could not find clause ${clauseNumber} for ${entity}::${predicateIndicator}`);
      }
    } catch (error) {
      this.logger.error(`Error opening clause: ${error}`);
      vscode.window.showErrorMessage(`Failed to open clause: ${error instanceof Error ? error.message : String(error)}`);
    }
  }



  /**
   * Find all clause locations for a predicate in an entity
   * First finds the first clause using LogtalkTerminal, then uses PredicateUtils to find consecutive clauses
   */
  private async findPredicateClauses(entity: string, predicateIndicator: string): Promise<vscode.Location[]> {
    try {
      // Use LogtalkTerminal to find the first clause
      await LogtalkTerminal.getPredicateDefinition(entity, predicateIndicator);

      // Read the result from the marker file
      const wdir = LogtalkTerminal.getFirstWorkspaceFolder();
      const resultFile = path.join(wdir, ".vscode_predicate_definition");

      if (!fs.existsSync(resultFile)) {
        return [];
      }

      const out = fs.readFileSync(resultFile).toString();
      await fsp.rm(resultFile, { force: true });

      const match = out.match(/File:(.+);Line:(\d+)/);
      if (!match) {
        return [];
      }

      const fileName: string = Utils.normalizeDoubleSlashPath(match[1]);
      const lineNum: number = parseInt(match[2]);
      const fileUri = vscode.Uri.file(fileName);
      const startLine = lineNum - 1; // Convert to 0-based

      // Open the document
      const document = await vscode.workspace.openTextDocument(fileUri);

      // Use PredicateUtils to find all consecutive clause ranges
      const clauseRanges = PredicateUtils.findConsecutivePredicateClauseRanges(
        document,
        predicateIndicator,
        startLine
      );

      // Convert ranges to locations
      const locations = clauseRanges.map(range => new vscode.Location(fileUri, range));

      return locations;
    } catch (error) {
      this.logger.error(`Error finding predicate clauses: ${error}`);
      return [];
    }
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

