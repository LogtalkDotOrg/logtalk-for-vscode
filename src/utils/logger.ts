"use strict";

import * as vscode from "vscode";

export enum LogLevel {
  OFF = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

/**
 * Centralized logger for the Logtalk extension with configurable log levels.
 * Particularly useful for controlling verbosity of the chat participant and documentation cache.
 */
export class Logger {
  private static instance: Logger;
  private currentLevel: LogLevel = LogLevel.WARN;
  private outputChannel: vscode.OutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Logtalk Extension");
    this.updateLogLevel();
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("logtalk.logging.level")) {
        this.updateLogLevel();
      }
    });
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private updateLogLevel(): void {
    const config = vscode.workspace.getConfiguration("logtalk");
    const levelString = config.get<string>("logging.level", "warn").toLowerCase();
    
    switch (levelString) {
      case "off":
        this.currentLevel = LogLevel.OFF;
        break;
      case "error":
        this.currentLevel = LogLevel.ERROR;
        break;
      case "warn":
        this.currentLevel = LogLevel.WARN;
        break;
      case "info":
        this.currentLevel = LogLevel.INFO;
        break;
      case "debug":
        this.currentLevel = LogLevel.DEBUG;
        break;
      default:
        this.currentLevel = LogLevel.WARN;
        // Use console.warn directly here to avoid infinite recursion during logger initialization
        console.warn(`[Logtalk Extension] Unknown log level: ${levelString}, defaulting to 'warn'`);
    }
  }

  private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
    if (this.currentLevel >= level) {
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [${levelName}] ${message}`;
      
      // Log to console for immediate visibility during development
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage, ...args);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage, ...args);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage, ...args);
          break;
        case LogLevel.DEBUG:
          console.log(formattedMessage, ...args);
          break;
      }
      
      // Also log to output channel for user visibility
      if (args.length > 0) {
        this.outputChannel.appendLine(`${formattedMessage} ${args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')}`);
      } else {
        this.outputChannel.appendLine(formattedMessage);
      }
    }
  }

  public error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, "ERROR", message, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, "WARN", message, ...args);
  }

  public info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, "INFO", message, ...args);
  }

  public debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, "DEBUG", message, ...args);
  }

  /**
   * Check if a specific log level is enabled
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return this.currentLevel >= level;
  }

  /**
   * Get the current log level
   */
  public getCurrentLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Get the current log level as a string
   */
  public getCurrentLevelString(): string {
    switch (this.currentLevel) {
      case LogLevel.OFF: return "off";
      case LogLevel.ERROR: return "error";
      case LogLevel.WARN: return "warn";
      case LogLevel.INFO: return "info";
      case LogLevel.DEBUG: return "debug";
      default: return "unknown";
    }
  }

  /**
   * Show the output channel to the user
   */
  public show(): void {
    this.outputChannel.show();
  }

  /**
   * Dispose of the logger resources
   */
  public dispose(): void {
    this.outputChannel.dispose();
  }
}

/**
 * Convenience function to get the logger instance
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}
