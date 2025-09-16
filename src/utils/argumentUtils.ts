"use strict";

/**
 * Utility functions for parsing and manipulating predicate/non-terminal arguments
 */
export class ArgumentUtils {

  /**
   * Parse arguments from a string, handling nested parentheses and commas
   * @param argsText The text containing the arguments (without outer parentheses)
   * @returns Array of argument strings
   */
  static parseArguments(argsText: string): string[] {
    if (!argsText || argsText.trim() === '') {
      return [];
    }

    const args: string[] = [];
    let currentArg = '';
    let parenDepth = 0;
    let bracketDepth = 0;
    let inQuotes = false;
    let inSingleQuotes = false;
    let escapeNext = false;

    for (let i = 0; i < argsText.length; i++) {
      const char = argsText[i];

      if (escapeNext) {
        currentArg += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        currentArg += char;
        escapeNext = true;
        continue;
      }

      if (char === '"' && !inSingleQuotes) {
        inQuotes = !inQuotes;
        currentArg += char;
        continue;
      }

      if (char === "'" && !inQuotes) {
        inSingleQuotes = !inSingleQuotes;
        currentArg += char;
        continue;
      }

      if (inQuotes || inSingleQuotes) {
        currentArg += char;
        continue;
      }

      if (char === '(') {
        parenDepth++;
        currentArg += char;
      } else if (char === ')') {
        parenDepth--;
        currentArg += char;
      } else if (char === '[') {
        bracketDepth++;
        currentArg += char;
      } else if (char === ']') {
        bracketDepth--;
        currentArg += char;
      } else if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
        // Found a top-level comma - end of current argument
        args.push(currentArg.trim());
        currentArg = '';
      } else {
        currentArg += char;
      }
    }

    // Add the last argument
    if (currentArg.trim() !== '') {
      args.push(currentArg.trim());
    }

    return args;
  }

  /**
   * Find the matching closing parenthesis for an opening parenthesis
   * @param text The text to search in
   * @param openParenPos The position of the opening parenthesis
   * @returns The position of the matching closing parenthesis, or -1 if not found
   */
  static findMatchingCloseParen(text: string, openParenPos: number): number {
    if (openParenPos >= text.length || text[openParenPos] !== '(') {
      return -1;
    }

    let parenDepth = 1;
    let inQuotes = false;
    let inSingleQuotes = false;
    let escapeNext = false;

    for (let i = openParenPos + 1; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !inSingleQuotes) {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === "'" && !inQuotes) {
        inSingleQuotes = !inSingleQuotes;
        continue;
      }

      if (inQuotes || inSingleQuotes) {
        continue;
      }

      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        parenDepth--;
        if (parenDepth === 0) {
          return i;
        }
      }
    }

    return -1; // No matching closing parenthesis found
  }

  /**
   * Insert an argument at a specific position in an argument list
   * @param args Array of existing arguments
   * @param newArg The new argument to insert
   * @param position The position to insert at (1-based)
   * @returns New array with the argument inserted
   */
  static insertArgumentAtPosition(args: string[], newArg: string, position: number): string[] {
    const newArgs = [...args];
    const insertIndex = Math.max(0, Math.min(position - 1, args.length));
    newArgs.splice(insertIndex, 0, newArg);
    return newArgs;
  }

  /**
   * Validate that a position is valid for inserting an argument
   * @param position The position to validate (1-based)
   * @param currentArity The current arity of the predicate/non-terminal
   * @returns true if the position is valid
   */
  static isValidArgumentPosition(position: number, currentArity: number): boolean {
    return position >= 1 && position <= currentArity + 1;
  }

  /**
   * Validate that a string is a valid Logtalk variable name
   * @param name The name to validate
   * @returns true if the name is a valid variable name
   */
  static isValidVariableName(name: string): boolean {
    if (!name || name.trim() === '') {
      return false;
    }

    const trimmed = name.trim();
    
    // Variable names must start with uppercase letter or underscore
    if (!/^[A-Z_]/.test(trimmed)) {
      return false;
    }

    // Variable names can contain letters, digits, and underscores
    if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
      return false;
    }

    return true;
  }

  /**
   * Generate a default variable name that doesn't conflict with existing arguments
   * @param existingArgs Array of existing argument strings
   * @param baseName Base name for the variable (default: "Arg")
   * @returns A unique variable name
   */
  static generateUniqueVariableName(existingArgs: string[], baseName: string = "Arg"): string {
    const existingNames = new Set(existingArgs.map(arg => arg.trim()));
    
    // Try the base name first
    if (!existingNames.has(baseName)) {
      return baseName;
    }

    // Try numbered variations
    let counter = 1;
    let candidate = `${baseName}${counter}`;
    while (existingNames.has(candidate)) {
      counter++;
      candidate = `${baseName}${counter}`;
    }

    return candidate;
  }

  /**
   * Count the number of arguments in a predicate/non-terminal call
   * @param text The text containing the call
   * @param nameEndPos The position after the predicate/non-terminal name
   * @returns The number of arguments, or 0 if no parentheses found
   */
  static countArgumentsAtPosition(text: string, nameEndPos: number): number {
    const afterName = text.substring(nameEndPos);
    const argsMatch = afterName.match(/^\s*\(([^)]*)\)/);
    
    if (!argsMatch) {
      return 0; // No parentheses, so no arguments
    }

    const argsText = argsMatch[1];
    if (!argsText || argsText.trim() === '') {
      return 0; // Empty parentheses
    }

    const args = this.parseArguments(argsText);
    return args.length;
  }

  /**
   * Extract the arguments from a predicate/non-terminal call
   * @param text The text containing the call
   * @param nameEndPos The position after the predicate/non-terminal name
   * @returns Array of argument strings, or empty array if no arguments
   */
  static extractArgumentsAtPosition(text: string, nameEndPos: number): string[] {
    const afterName = text.substring(nameEndPos);
    const argsMatch = afterName.match(/^\s*\(([^)]*)\)/);

    if (!argsMatch) {
      return []; // No parentheses, so no arguments
    }

    const argsText = argsMatch[1];
    if (!argsText || argsText.trim() === '') {
      return []; // Empty parentheses
    }

    return this.parseArguments(argsText);
  }

  /**
   * Extract arguments from a complete predicate call text
   * @param callText The complete predicate call text (e.g., "predicate(arg1, arg2, arg3)")
   * @returns Array of argument strings, or empty array if no arguments
   */
  static extractArgumentsFromCall(callText: string): string[] {
    if (!callText || callText.trim() === '') {
      return [];
    }

    // Find the opening parenthesis
    const openParenPos = callText.indexOf('(');
    if (openParenPos === -1) {
      return []; // No parentheses, so no arguments
    }

    // Find the matching closing parenthesis
    const closeParenPos = this.findMatchingCloseParen(callText, openParenPos);
    if (closeParenPos === -1) {
      return []; // No matching closing parenthesis
    }

    // Extract the arguments text
    const argsText = callText.substring(openParenPos + 1, closeParenPos);
    if (!argsText || argsText.trim() === '') {
      return []; // Empty parentheses
    }

    return this.parseArguments(argsText);
  }

  /**
   * Reconstruct a predicate call with a subset of arguments
   * @param callText The original predicate call text
   * @param keepLastN Number of arguments to keep from the end (negative to remove from end)
   * @returns Object with the reconstructed call and the removed arguments
   */
  static splitCallArguments(callText: string, keepLastN: number): {
    mainCall: string,
    removedArgs: string[]
  } {
    if (!callText || callText.trim() === '') {
      return { mainCall: callText, removedArgs: [] };
    }

    // Find the predicate name
    const openParenPos = callText.indexOf('(');
    if (openParenPos === -1) {
      return { mainCall: callText, removedArgs: [] };
    }

    const predicateName = callText.substring(0, openParenPos);
    const args = this.extractArgumentsFromCall(callText);

    if (args.length === 0) {
      return { mainCall: callText, removedArgs: [] };
    }

    let mainArgs: string[];
    let removedArgs: string[];

    if (keepLastN < 0) {
      // Remove N arguments from the end
      const removeCount = Math.min(-keepLastN, args.length);
      mainArgs = args.slice(0, args.length - removeCount);
      removedArgs = args.slice(args.length - removeCount);
    } else {
      // Keep only the last N arguments
      const keepCount = Math.min(keepLastN, args.length);
      mainArgs = args.slice(-keepCount);
      removedArgs = args.slice(0, args.length - keepCount);
    }

    // Reconstruct the main call
    const mainCall = mainArgs.length > 0
      ? `${predicateName}(${mainArgs.join(', ')})`
      : predicateName;

    return { mainCall, removedArgs };
  }
}
