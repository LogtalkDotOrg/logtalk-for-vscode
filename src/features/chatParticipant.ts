"use strict";

import * as vscode from "vscode";
import { DocumentationCache } from "../utils/documentationCache";
import { getLogger } from "../utils/logger";

interface LogtalkChatResult {
  metadata: {
    command?: string;
    source?: string;
    query?: string;
  };
}

export class LogtalkChatParticipant {
  private participant: vscode.ChatParticipant;
  private documentationCache: DocumentationCache;
  private logger = getLogger();

  constructor(context: vscode.ExtensionContext) {
    this.documentationCache = DocumentationCache.getInstance(context);
    
    // Create the chat participant
    this.participant = vscode.chat.createChatParticipant(
      "logtalk-for-vscode.logtalk",
      this.handleChatRequest.bind(this)
    );

    // Set participant properties
    this.participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "images", "logtalk.png");
    
    // Set up follow-up provider
    this.participant.followupProvider = {
      provideFollowups: this.provideFollowups.bind(this)
    };

    context.subscriptions.push(this.participant);
  }

  /**
   * Dispose of the chat participant and clean up resources
   */
  public dispose(): void {
    if (this.participant) {
      this.participant.dispose();
    }
  }

  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<LogtalkChatResult> {

    const result: LogtalkChatResult = {
      metadata: {
        command: request.command,
        query: request.prompt.trim()
      }
    };

    try {
      // Show progress
      stream.progress("Searching Logtalk documentation...");

      if (request.command === "handbook") {
        await this.handleHandbookCommand(request, stream, token);
        result.metadata.source = "handbook";
      } else if (request.command === "apis") {
        await this.handleApisCommand(request, stream, token);
        result.metadata.source = "apis";
      } else if (request.command === "examples") {
        await this.handleExamplesCommand(request, stream, token);
        result.metadata.source = "examples";
      } else {
        await this.handleGeneralQuery(request, stream, token);
        result.metadata.source = "general";
      }

    } catch (error) {
      stream.markdown(`❌ **Error:** ${error instanceof Error ? error.message : String(error)}`);
      
      // Provide helpful fallback information
      stream.markdown(`\n\n**Helpful resources:**\n`);
      stream.markdown(`- [Logtalk website](https://logtalk.org/)\n`);
      stream.markdown(`- [Logtalk documentation](https://logtalk.org/documentation.html)\n`);
      stream.markdown(`- [Logtalk repo](https://github.com/LogtalkDotOrg/logtalk3)\n`);
    }

    return result;
  }

  private async handleHandbookCommand(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();
    if (!query) {
      stream.markdown("Please provide a search term for the Logtalk Handbook.");
      return;
    }

    try {
      const results = await this.documentationCache.searchDocumentation(query, "handbook");

      if (results.length === 0) {
        stream.markdown(`No results found in the Logtalk Handbook for "${query}".`);
        await this.suggestAlternatives(stream, query);
        return;
      }

      // Use RAG with the handbook documentation
      await this.useLanguageModelWithHandbookContext(request, stream, token, query, results);

    } catch (error) {
      this.logger.warn("Failed to search Logtalk Handbook for handbook command:", error);
      // Note: DocumentationCache handles session-based warnings internally
    }
  }

  private async handleApisCommand(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();
    if (!query) {
      stream.markdown("Please provide a search term for the Logtalk APIs documentation.");
      return;
    }

    try {
      const results = await this.documentationCache.searchDocumentation(query, "apis");

      if (results.length === 0) {
        stream.markdown(`No results found in the Logtalk APIs documentation for "${query}".`);
        await this.suggestAlternatives(stream, query);
        return;
      }

      // Use RAG with the APIs documentation
      await this.useLanguageModelWithApisContext(request, stream, token, query, results);

    } catch (error) {
      this.logger.warn("Failed to search Logtalk APIs for apis command:", error);
      // Note: DocumentationCache handles session-based warnings internally
    }
  }

  private async handleExamplesCommand(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    // Use the language model to provide examples and explanations
    await this.useLanguageModelForExamples(request, stream, token, query);
  }

  private async handleGeneralQuery(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    // Search both Handbook and APIs documentation separately for comprehensive coverage
    let handbookResults: string[] = [];
    let apisResults: string[] = [];

    try {
      this.logger.debug("Searching Handbook documentation for general query...");
      handbookResults = await this.documentationCache.searchDocumentation(query, 'handbook');
      this.logger.debug(`Found ${handbookResults.length} Handbook results`);

      this.logger.debug("Searching APIs documentation for general query...");
      apisResults = await this.documentationCache.searchDocumentation(query, 'apis');
      this.logger.debug(`Found ${apisResults.length} APIs results`);
    } catch (error) {
      this.logger.warn("Failed to search documentation for general query:", error);
      // Note: DocumentationCache handles session-based warnings internally
      // Continue without documentation context
    }

    // Intelligently balance results to use up to 8 total results
    const combinedResults: string[] = [];
    const targetTotal = 8;

    // Calculate optimal distribution
    let handbookCount = Math.min(handbookResults.length, 4); // Start with up to 4 from Handbook
    let apisCount = Math.min(apisResults.length, 4); // Start with up to 4 from APIs

    const currentTotal = handbookCount + apisCount;

    // If we have fewer than 8 total, try to use more from the source that has more available
    if (currentTotal < targetTotal) {
      const remaining = targetTotal - currentTotal;

      // Try to get more from Handbook if APIs is limited
      if (apisCount < 4 && handbookResults.length > handbookCount) {
        const additionalHandbook = Math.min(remaining, handbookResults.length - handbookCount);
        handbookCount += additionalHandbook;
      }

      // Try to get more from APIs if Handbook is limited
      if (handbookCount < 4 && apisResults.length > apisCount) {
        const additionalApis = Math.min(remaining - (handbookCount - Math.min(handbookResults.length, 3)), apisResults.length - apisCount);
        apisCount += additionalApis;
      }
    }

    // Add Handbook results
    if (handbookResults.length > 0 && handbookCount > 0) {
      const topHandbookResults = handbookResults.slice(0, handbookCount);
      combinedResults.push(...topHandbookResults.map(result => `**From Logtalk Handbook:**\n${result}`));
      this.logger.debug(`Using top ${topHandbookResults.length} Handbook results`);
    }

    // Add APIs results
    if (apisResults.length > 0 && apisCount > 0) {
      const topApisResults = apisResults.slice(0, apisCount);
      combinedResults.push(...topApisResults.map(result => `**From Logtalk APIs:**\n${result}`));
      this.logger.debug(`Using top ${topApisResults.length} APIs results`);
    }

    this.logger.debug(`Combined ${combinedResults.length} total results for general query (target: ${targetTotal})`);

    // Use the language model with combined search results context
    await this.useLanguageModelWithContext(request, stream, token, query, combinedResults);
  }

  private async useLanguageModelForExamples(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string
  ): Promise<void> {
    try {
      // Use the model from the request context (user's selected model)
      const model = request.model;

      if (!model) {
        stream.markdown("❌ No language model available. Please ensure GitHub Copilot is installed and authenticated.");
        return;
      }

      // Try to get examples from multiple sources
      let examplesContext = "";
      let handbookResults: string[] = [];
      let apisResults: string[] = [];

      // Search local documentation first
      try {
        this.logger.debug("Searching Handbook documentation for examples...");
        handbookResults = await this.documentationCache.searchDocumentation(query, 'handbook');
        this.logger.debug(`Found ${handbookResults.length} Handbook results`);

        this.logger.debug("Searching APIs documentation for examples...");
        apisResults = await this.documentationCache.searchDocumentation(query, 'apis');
        this.logger.debug(`Found ${apisResults.length} APIs results`);
      } catch (searchError) {
        this.logger.warn("Error searching local documentation:", searchError);
        // Note: DocumentationCache handles session-based warnings internally
      }

      // Try to get examples from Context7 MCP server
      try {
        this.logger.debug("Attempting to use Context7 MCP server for examples...");

        // Get library documentation focused on examples
        // Use the Logtalk library ID directly
        const docsResult = await vscode.lm.invokeTool(
          "mcp_context7_get-library-docs",
          {
            input: {
              context7CompatibleLibraryID: "/logtalkdotorg/logtalk3",
              topic: `examples ${query}`,
              tokens: 5000
            },
            toolInvocationToken: undefined
          },
          token
        );

        if (docsResult?.content?.length) {
          // Extract text from the tool result content parts
          const docsContent = docsResult.content
            .map((part: any) => (typeof part === 'string' ? part : part.value || ''))
            .join('\n\n');

          examplesContext = `\n\nRelevant Logtalk examples and documentation:\n${docsContent}`;
          this.logger.debug("Successfully retrieved Context7 documentation");
        } else {
          this.logger.debug("No content in docs result");
        }
      } catch (mcpError) {
        this.logger.debug("Context7 MCP server error details:", mcpError);
        this.logger.debug("Error type:", typeof mcpError);
        this.logger.debug("Error message:", mcpError instanceof Error ? mcpError.message : String(mcpError));

        if (mcpError instanceof Error) {
          if (mcpError.message.includes("was not contributed")) {
            this.logger.info("Context7 MCP server tools are not registered with VSCode. Please ensure the Context7 MCP server is properly configured in VSCode settings.");
          } else if (mcpError.message.includes("not found")) {
            this.logger.info("Context7 MCP server tools not found. Please check the tool names and MCP server configuration.");
          } else {
            this.logger.info("Context7 MCP server encountered an error. Falling back to standard examples generation.");
          }
        }
        // Continue without MCP context
      }

      // Combine all documentation sources
      let combinedContext = "";
      const documentationSources: string[] = [];

      if (handbookResults.length > 0) {
        combinedContext += `\n\nFrom Logtalk Handbook:\n${handbookResults.slice(0, 3).join('\n\n')}`;
        documentationSources.push("Logtalk Handbook");
        this.logger.debug(`Using top ${Math.min(handbookResults.length, 3)} Handbook results for examples`);
      }

      if (apisResults.length > 0) {
        combinedContext += `\n\nFrom Logtalk APIs:\n${apisResults.slice(0, 3).join('\n\n')}`;
        documentationSources.push("Logtalk APIs");
        this.logger.debug(`Using top ${Math.min(apisResults.length, 3)} APIs results for examples`);
      }

      if (examplesContext) {
        combinedContext += examplesContext;
        documentationSources.push("Context7 documentation");
      }

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert. Provide helpful examples and explanations for Logtalk programming concepts.${combinedContext}

The user is asking about: ${query}

Please provide:
1. A clear explanation of the concept
2. Practical code examples in Logtalk
3. Common use cases or patterns
4. Any important notes or best practices

${combinedContext ? `Use the provided documentation context from ${documentationSources.join(", ")} to enhance your examples with accurate, up-to-date information.` : ""}

Format your response in Markdown with proper code blocks using \`\`\`logtalk for Logtalk code.`)
      ];

      const chatResponse = await model.sendRequest(messages, {}, token);

      stream.markdown(`## Logtalk Examples: ${query}\n\n`);

      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }

      // Add source attribution for all documentation sources used
      if (documentationSources.length > 0) {
        stream.markdown(`\n\n---\n\n**📚 Enhanced with**: ${documentationSources.join(", ")}`);
      }

    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        stream.markdown(`❌ Language model error: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  private async useLanguageModelWithContext(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    documentationResults: string[]
  ): Promise<void> {
    try {
      // Use the model from the request context (user's selected model)
      const model = request.model;

      if (!model) {
        // Fallback to showing documentation results only
        if (documentationResults.length > 0) {
          stream.markdown(`## Documentation Search Results\n\n`);
          for (const result of documentationResults) {
            stream.markdown(result + "\n---\n\n");
          }
        } else {
          stream.markdown("❌ No language model available and no documentation results found.");
        }
        return;
      }

      // Prepare context from documentation
      const context = documentationResults.length > 0
        ? `\n\nRelevant documentation context:\n${documentationResults.join('\n\n')}`
        : "";

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant. Answer questions about the Logtalk programming language using the provided documentation context as the source of truth when available.

User question: ${query}${context}

Please provide a helpful and accurate answer that:
1. If you reference specific Logtalk features, libraries, predicates, or concepts, try to include practical examples when appropriate
2. Format code examples using \`\`\`logtalk code blocks
5. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate; do not use Prolog terms like "module"
6. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
7. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
8. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
9. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
10. When explaining how to load a library, use a REPL query to load the library using the \`logtalk_load/1\` predicate
11. Lookup the \`logtalk_load/1\` call to load a library in the APIs documentation

Answer:`)
      ];

      const chatResponse = await model.sendRequest(messages, {}, token);
      
      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }
      
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        // Fallback to documentation results if language model fails
        if (documentationResults.length > 0) {
          stream.markdown(`## Documentation Search Results\n\n`);
          for (const result of documentationResults) {
            stream.markdown(result + "\n---\n\n");
          }
        } else {
          stream.markdown(`❌ Language model error: ${error.message}`);
        }
      } else {
        throw error;
      }
    }
  }

  private async useLanguageModelWithHandbookContext(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    handbookResults: string[]
  ): Promise<void> {
    try {
      // Use the model from the request context (user's selected model)
      const model = request.model;

      if (!model) {
        // Fallback to showing handbook results only
        stream.markdown(`## Search Results from Logtalk Handbook\n\n`);
        stream.markdown(`Found ${handbookResults.length} result(s) for "${query}":\n\n`);

        for (const result of handbookResults) {
          stream.markdown(result + "\n---\n\n");
        }
        return;
      }

      // Create context from handbook documentation
      const context = handbookResults.slice(0, 8).join('\n\n'); // Limit to top 8 results

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant. Answer the user's question about "${query}" using the provided Logtalk Handbook documentation context as the source of truth.

Context from Logtalk Handbook:
${context}

User Question: ${query}

Please provide a comprehensive answer that:
1. Directly addresses the user's question
2. References the relevant handbook sections
3. Includes practical examples when appropriate
4. Explains concepts clearly for both beginners and experienced users
5. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate; do not use Prolog terms like "module"
6. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
7. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
8. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
9. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
10. When explaining how to load a library, use a REPL query to load the library using the \`logtalk_load/1\` predicate
11. Lookup the \`logtalk_load/1\` call to load a library in the APIs documentation

Answer:`)
      ];

      const chatResponse = await model.sendRequest(messages, {}, token);

      stream.markdown(`## Logtalk Handbook: ${query}\n\n`);

      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }

      // Add reference to source documentation
      stream.markdown(`\n\n---\n\n**📚 Source**: Logtalk Handbook documentation`);

    } catch (error) {
      this.logger.error("Error using language model with handbook context:", error);
      // Fallback to showing documentation results only
      stream.markdown(`## Search Results from Logtalk Handbook\n\n`);
      stream.markdown(`Found ${handbookResults.length} result(s) for "${query}":\n\n`);

      for (const result of handbookResults) {
        stream.markdown(result + "\n---\n\n");
      }
    }
  }

  private async useLanguageModelWithApisContext(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    apisResults: string[]
  ): Promise<void> {
    try {
      // Use the model from the request context (user's selected model)
      const model = request.model;

      if (!model) {
        // Fallback to showing APIs results only
        stream.markdown(`## Search Results from Logtalk APIs\n\n`);
        stream.markdown(`Found ${apisResults.length} result(s) for "${query}":\n\n`);

        for (const result of apisResults) {
          stream.markdown(result + "\n---\n\n");
        }
        return;
      }

      // Create context from APIs documentation
      const context = apisResults.slice(0, 8).join('\n\n'); // Limit to top 8 results

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant. Answer the user's question about "${query}" using the provided Logtalk APIs documentation context as the source of truth.

Context from Logtalk APIs:
${context}

User Question: ${query}

Please provide a comprehensive answer that:
1. Explains the API/predicate/method functionality
2. Shows the correct syntax and parameters
3. Provides practical usage examples
4. Mentions any important notes about behavior or requirements
5. Suggests related APIs when relevant
6. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate; do not use Prolog terms like "module"
7. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
8. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
9. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
10. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
11. When explaining how to load a library, use a REPL query to load the library using the \`logtalk_load/1\` predicate
12. Lookup the \`logtalk_load/1\` call to load a library in the APIs documentation

Answer:`)
      ];

      const chatResponse = await model.sendRequest(messages, {}, token);

      stream.markdown(`## Logtalk APIs: ${query}\n\n`);

      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }

      // Add reference to source documentation
      stream.markdown(`\n\n---\n\n**📚 Source**: Logtalk APIs documentation`);

    } catch (error) {
      this.logger.error("Error using language model with APIs context:", error);
      // Fallback to showing documentation results only
      stream.markdown(`## Search Results from Logtalk APIs\n\n`);
      stream.markdown(`Found ${apisResults.length} result(s) for "${query}":\n\n`);

      for (const result of apisResults) {
        stream.markdown(result + "\n---\n\n");
      }
    }
  }

  private async suggestAlternatives(stream: vscode.ChatResponseStream, query: string): Promise<void> {
    stream.markdown(`\n**Suggestions:**\n`);
    stream.markdown(`- Try different search terms or synonyms\n`);
    stream.markdown(`- Use \`@logtalk /examples ${query}\` for code examples\n`);
    stream.markdown(`- Check the [Logtalk website](https://logtalk.org/) for additional resources\n`);
  }

  private provideFollowups(
    result: LogtalkChatResult,
    _context: vscode.ChatContext,
    _token: vscode.CancellationToken
  ): vscode.ChatFollowup[] {
    const followups: vscode.ChatFollowup[] = [];
    const query = result.metadata.query || "";

    // Provide command-specific followups based on what was just searched
    // Use the same query to search in a different documentation source
    if (result.metadata.command === "handbook" && query) {
      followups.push({
        prompt: query,
        label: "Search APIs",
        command: "apis"
      });
    } else if (result.metadata.command === "apis" && query) {
      followups.push({
        prompt: query,
        label: "Search Handbook",
        command: "handbook"
      });
    } else if (result.metadata.command === "examples" && query) {
      followups.push({
        prompt: query,
        label: "Search Handbook",
        command: "handbook"
      });
    }

    // Always provide these general followups
    followups.push(
      {
        prompt: "getting started",
        label: "Getting Started",
        command: "handbook"
      },
      {
        prompt: "object-oriented programming",
        label: "OOP Examples",
        command: "examples"
      }
    );

    return followups;
  }
}
