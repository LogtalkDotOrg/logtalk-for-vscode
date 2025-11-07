"use strict";

import {
  CancellationToken,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  CompletionList,
  Position,
  ProviderResult,
  TextDocument
} from "vscode";
import { getLogger } from "../utils/logger";

/**
 * CompletionItemProvider for Logtalk list patterns
 * Provides automatic tail variable suggestions when typing "|" in list patterns
 */
export class LogtalkListCompletionProvider implements CompletionItemProvider {
  private logger = getLogger();

  /**
   * Provide completion items for the given position and document
   * @param document The document in which the command was invoked
   * @param position The position at which the command was invoked
   * @param token A cancellation token
   * @param context How the completion was triggered
   * @returns An array of completion items or null
   */
  public provideCompletionItems(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
    context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList> {
    this.logger.debug(`Completion triggered at position ${position.line}:${position.character}`);

    // Only trigger when "|" was just typed
    if (context.triggerCharacter === '|') {
      return this.handlePipeCharacter(document, position);
    }

    return null;
  }

  /**
   * Handle completion when "|" is typed in a list pattern
   * Suggests a tail variable name based on the head variable
   * @param document The document
   * @param position The position where "|" was typed
   * @returns An array of completion items or null
   */
  private handlePipeCharacter(document: TextDocument, position: Position): CompletionItem[] | null {
    try {
      const line = document.lineAt(position.line);
      const lineText = line.text;

      // Get text before the pipe character
      const textBeforePipe = lineText.substring(0, position.character);

      this.logger.debug(`Text before pipe: "${textBeforePipe}"`);

      // Find the variable before the pipe
      // Look for pattern like [Variable| or [_Variable| or [Variable | (with optional spaces)
      // Match variables starting with uppercase letter OR underscore followed by uppercase letter
      const variableMatch = textBeforePipe.match(/\[([A-Z_][A-Za-z0-9_]*)\s*\|$/);

      if (!variableMatch) {
        this.logger.debug('No valid variable pattern found before pipe');
        return null;
      }

      const headVariable = variableMatch[1];
      this.logger.debug(`Found head variable: "${headVariable}"`);

      // Collect completion items
      const completionItems: CompletionItem[] = [];

      // Handle special case: Head -> Tail
      if (headVariable === 'Head') {
        const completionItem = new CompletionItem(` Tail`, CompletionItemKind.Variable);
        completionItem.detail = 'List tail variable';
        completionItem.documentation = `Suggested tail variable for list pattern [${headVariable}|...]`;
        completionItem.insertText = ` Tail`;
        completionItems.push(completionItem);
      }
      // Handle variables starting with underscore (but not just "_")
      else if (headVariable.startsWith('_') && headVariable.length > 1) {
        // Get the variable name without the leading underscore
        const withoutUnderscore = headVariable.substring(1);

        // Offer pluralized version with underscore
        const pluralizedWithUnderscore = '_' + this.pluralize(withoutUnderscore);
        const item1 = new CompletionItem(` ${pluralizedWithUnderscore}`, CompletionItemKind.Variable);
        item1.detail = 'List tail variable (with underscore)';
        item1.documentation = `Suggested tail variable for list pattern [${headVariable}|...]`;
        item1.insertText = ` ${pluralizedWithUnderscore}`;
        item1.sortText = '1'; // Show this first
        completionItems.push(item1);

        // Offer pluralized version without underscore
        const pluralizedWithoutUnderscore = this.pluralize(withoutUnderscore);
        const item2 = new CompletionItem(` ${pluralizedWithoutUnderscore}`, CompletionItemKind.Variable);
        item2.detail = 'List tail variable (without underscore)';
        item2.documentation = `Alternative tail variable for list pattern [${headVariable}|...]`;
        item2.insertText = ` ${pluralizedWithoutUnderscore}`;
        item2.sortText = '2'; // Show this second
        completionItems.push(item2);
      }
      // Handle regular variables (starting with uppercase letter)
      else {
        const tailVariable = this.pluralize(headVariable);
        const completionItem = new CompletionItem(` ${tailVariable}`, CompletionItemKind.Variable);
        completionItem.detail = 'List tail variable';
        completionItem.documentation = `Suggested tail variable for list pattern [${headVariable}|...]`;
        completionItem.insertText = ` ${tailVariable}`;
        completionItems.push(completionItem);
      }

      this.logger.debug(`Suggesting ${completionItems.length} tail variable(s): ${completionItems.map(item => item.label).join(', ')}`);

      return completionItems;
    } catch (error: any) {
      this.logger.error(`Error in handlePipeCharacter: ${error.message}`);
      return null;
    }
  }

  /**
   * Pluralize a variable name using simple English pluralization rules
   * @param singular The singular form of the variable name
   * @returns The plural form of the variable name
   */
  private pluralize(singular: string): string {
    // Handle common special cases
    const specialCases: { [key: string]: string } = {
      'Child': 'Children',
      'Person': 'Persons',
      'Man': 'Men',
      'Woman': 'Women',
      'Tooth': 'Teeth',
      'Foot': 'Feet',
      'Mouse': 'Mice',
      'Goose': 'Geese',
      'Ox': 'Oxen',
      'Datum': 'Data',
      'Index': 'Indices',
      'Matrix': 'Matrices',
      'Vertex': 'Vertices',
      'Axis': 'Axes',
      'Analysis': 'Analyses',
      'Basis': 'Bases',
      'Crisis': 'Crises',
      'Diagnosis': 'Diagnoses',
      'Hypothesis': 'Hypotheses',
      'Oasis': 'Oases',
      'Parenthesis': 'Parentheses',
      'Synthesis': 'Syntheses',
      'Thesis': 'Theses'
    };

    if (specialCases[singular]) {
      return specialCases[singular];
    }

    // Apply standard pluralization rules
    
    // Words ending in 'y' preceded by a consonant: change 'y' to 'ies'
    if (/[^aeiou]y$/i.test(singular)) {
      return singular.slice(0, -1) + 'ies';
    }

    // Words ending in 's', 'ss', 'sh', 'ch', 'x', 'z': add 'es'
    if (/(?:s|ss|sh|ch|x|z)$/i.test(singular)) {
      return singular + 'es';
    }

    // Words ending in 'f' or 'fe': change to 'ves'
    if (/f$/i.test(singular)) {
      return singular.slice(0, -1) + 'ves';
    }
    if (/fe$/i.test(singular)) {
      return singular.slice(0, -2) + 'ves';
    }

    // Words ending in 'o' preceded by a consonant: add 'es'
    // (but there are many exceptions, so we'll just add 's' for simplicity)
    if (/[^aeiou]o$/i.test(singular)) {
      // Common exceptions that just add 's': photo, piano, halo
      const oExceptions = ['Photo', 'Piano', 'Halo', 'Solo', 'Memo', 'Logo'];
      if (oExceptions.includes(singular)) {
        return singular + 's';
      }
      return singular + 'es';
    }

    // Default: just add 's'
    return singular + 's';
  }
}

