"use strict";

import * as vscode from "vscode";
import { getLogger } from "../utils/logger";

/**
 * Manages status bar items for the Logtalk extension.
 * Provides status indicators for profiling and CodeLens features.
 */
export class StatusBarManager {
  private static instance: StatusBarManager;
  private profilingStatusBarItem: vscode.StatusBarItem | undefined;
  private codeLensStatusBarItem: vscode.StatusBarItem | undefined;
  private logger = getLogger();

  private constructor() {}

  public static getInstance(): StatusBarManager {
    if (!StatusBarManager.instance) {
      StatusBarManager.instance = new StatusBarManager();
    }
    return StatusBarManager.instance;
  }

  /**
   * Initialize status bar items
   */
  public initialize(context: vscode.ExtensionContext): void {
    // Create CodeLens status bar item (right side)
    // Priority: Lower numbers appear more to the right
    // Language mode is typically around 10, so we use lower values to appear after it
    this.codeLensStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      2
    );
    this.codeLensStatusBarItem.command = "logtalk.toggle.codeLens";
    this.codeLensStatusBarItem.tooltip = "Click to toggle Logtalk CodeLens";
    context.subscriptions.push(this.codeLensStatusBarItem);

    // Create profiling status bar item (right side - appears after CodeLens)
    this.profilingStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1
    );
    this.profilingStatusBarItem.command = "logtalk.profiling.toggle";
    this.profilingStatusBarItem.tooltip = "Click to toggle Logtalk profiling";
    context.subscriptions.push(this.profilingStatusBarItem);

    // Initialize states
    this.updateProfilingStatus(false);
    this.updateCodeLensStatus();

    // Listen for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("logtalk.enableCodeLens")) {
          this.updateCodeLensStatus();
        }
      })
    );

    // Show/hide status bar items based on active editor
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateVisibility(editor);
      })
    );

    // Initial visibility check
    this.updateVisibility(vscode.window.activeTextEditor);

    this.logger.debug("Status bar items initialized");
  }

  /**
   * Update profiling status bar item
   */
  public updateProfilingStatus(enabled: boolean): void {
    if (!this.profilingStatusBarItem) {
      return;
    }

    if (enabled) {
      this.profilingStatusBarItem.text = "$(pulse~spin) Profiling: on";
      this.profilingStatusBarItem.tooltip = "Logtalk profiling is enabled. Click to disable.";
    } else {
      this.profilingStatusBarItem.text = "$(pulse) Profiling: off";
      this.profilingStatusBarItem.tooltip = "Logtalk profiling is disabled. Click to enable.";
    }

    // Visibility is controlled by updateVisibility() based on active editor
    this.logger.debug(`Profiling status bar updated: ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Update CodeLens status bar item based on configuration
   */
  public updateCodeLensStatus(): void {
    if (!this.codeLensStatusBarItem) {
      return;
    }

    const config = vscode.workspace.getConfiguration("logtalk");
    const enabled = config.get<boolean>("enableCodeLens", true);

    if (enabled) {
      this.codeLensStatusBarItem.text = "$(info) CodeLens: on";
      this.codeLensStatusBarItem.tooltip = "Logtalk CodeLens is enabled. Click to disable.";
    } else {
      this.codeLensStatusBarItem.text = "$(info) CodeLens: off";
      this.codeLensStatusBarItem.tooltip = "Logtalk CodeLens is disabled. Click to enable.";
    }

    this.logger.debug(`CodeLens status bar updated: ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Update status bar items visibility based on active editor
   * Only show when editing Logtalk files
   */
  private updateVisibility(editor: vscode.TextEditor | undefined): void {
    if (!this.codeLensStatusBarItem || !this.profilingStatusBarItem) {
      return;
    }

    // Only show status bar items when a Logtalk file is active
    const isLogtalkFile = editor && (editor.document.languageId === "logtalk" ||
                                      editor.document.fileName.endsWith(".lgt") ||
                                      editor.document.fileName.endsWith(".logtalk"));

    if (isLogtalkFile) {
      this.codeLensStatusBarItem.show();
      this.profilingStatusBarItem.show();
    } else {
      this.codeLensStatusBarItem.hide();
      this.profilingStatusBarItem.hide();
    }
  }

  /**
   * Dispose of status bar items
   */
  public dispose(): void {
    if (this.profilingStatusBarItem) {
      this.profilingStatusBarItem.dispose();
      this.profilingStatusBarItem = undefined;
    }
    if (this.codeLensStatusBarItem) {
      this.codeLensStatusBarItem.dispose();
      this.codeLensStatusBarItem = undefined;
    }
    this.logger.debug("Status bar items disposed");
  }
}

