"use strict";

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DocumentationCache } from "../utils/documentationCache";
import { getLogger } from "../utils/logger";
const Fuse: any = require("fuse.js");

interface LogtalkChatResult {
  metadata: {
    command?: string;
    source?: string;
    query?: string;
  };
}

interface WorkspaceDocSection {
  header: string;
  content: string;
  source: string;
  filePath: string;
}

interface FuseOptions {
  keys?: Array<{
    name: string;
    weight?: number;
  } | string>;
  threshold?: number;
  distance?: number;
  minMatchCharLength?: number;
  includeScore?: boolean;
  includeMatches?: boolean;
  ignoreLocation?: boolean;
  findAllMatches?: boolean;
}

interface FuseResult<T> {
  item: T;
  score?: number;
  matches?: Array<{
    indices: Array<[number, number]>;
    key?: string;
    value?: string;
  }>;
}

export class LogtalkChatParticipant {
  private participant: vscode.ChatParticipant;
  private documentationCache: DocumentationCache;
  private logger = getLogger();

  /**
   * Extract the last N conversation pairs from chat history and convert them to language model messages.
   * Each pair consists of a user prompt followed by an assistant reply.
   * @param context The chat context containing the history
   * @param pairCount Number of recent conversation pairs to extract (default: 5)
   * @returns Array of language model chat messages (user + assistant pairs)
   */
  private getChatHistory(context: vscode.ChatContext, pairCount: number = 5): vscode.LanguageModelChatMessage[] {
    const history: vscode.LanguageModelChatMessage[] = [];

    // We need to extract complete pairs (user request + assistant response)
    // Work backwards through the history to find complete pairs
    const pairs: Array<{ request: vscode.ChatRequestTurn; response: vscode.ChatResponseTurn }> = [];

    for (let i = context.history.length - 1; i >= 0 && pairs.length < pairCount; i--) {
      const item = context.history[i];

      // Look for response turns and find their corresponding request
      if (item instanceof vscode.ChatResponseTurn) {
        // Find the preceding request turn
        for (let j = i - 1; j >= 0; j--) {
          const prevItem = context.history[j];
          if (prevItem instanceof vscode.ChatRequestTurn) {
            pairs.unshift({ request: prevItem, response: item });
            i = j; // Skip to the request position
            break;
          }
        }
      }
    }

    // Convert pairs to language model messages
    for (const pair of pairs) {
      // Add user message
      history.push(vscode.LanguageModelChatMessage.User(pair.request.prompt));

      // Add assistant message - combine all response parts
      const responseText = pair.response.response
        .map(part => {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            return part.value.value;
          }
          return '';
        })
        .filter(text => text.length > 0)
        .join('\n');

      if (responseText) {
        history.push(vscode.LanguageModelChatMessage.Assistant(responseText));
      }
    }

    return history;
  }

  /**
   * Add chat history to the messages array for context.
   * @param messages The messages array to append history to
   * @param context The chat context containing the history
   * @param pairCount Number of recent conversation pairs (user + assistant) to include (default: 5)
   */
  private addChatHistoryToMessages(
    messages: vscode.LanguageModelChatMessage[],
    context: vscode.ChatContext,
    pairCount: number = 5
  ): void {
    const history = this.getChatHistory(context, pairCount);
    if (history.length > 0) {
      messages.push(vscode.LanguageModelChatMessage.User("\n\nPrevious conversation context for reference:\n\n"));
      messages.push(...history);
    }
  }

  /**
   * Resolve a concrete language model to use for requests.
   * Some UI-selected models (for example an "auto" placeholder) are not valid
   * to call sendRequest on. In that case ask the language-model subsystem to
   * pick concrete candidates using a selector derived from the selected model.
   */
  private async resolveConcreteModel(
    model: vscode.LanguageModelChat | undefined,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChat | undefined> {
    if (!model) {
      return undefined;
    }

    // If the model id looks like a placeholder (e.g. 'auto') prefer to select
    // a concrete model from the lm subsystem. If it's already concrete, return it.
    const id = model.id?.toLowerCase?.() ?? "";
    if (id && !id.includes("auto") && !id.includes("default")) {
      return model;
    }

    // Build a selector preferring family, then vendor, then id as a fallback.
    const selector: vscode.LanguageModelChatSelector = {};
    try {
      // @ts-ignore - family and vendor may be present on the runtime model
      if ((model as any).family) {
        // prefer a concrete family selection
        // @ts-ignore
        selector.family = (model as any).family;
      } else if ((model as any).vendor) {
        // @ts-ignore
        selector.vendor = (model as any).vendor;
      } else if (model.id) {
        selector.id = model.id;
      }

      const candidates = await vscode.lm.selectChatModels(selector);
      if (candidates && candidates.length > 0) {
        return candidates[0];
      }
    } catch (err) {
      this.logger.debug("Failed to select concrete language model, falling back to request.model:", err instanceof Error ? err.message : String(err));
    }

    // If selection failed, return the original model (best-effort) so caller can
    // decide to fallback to documentation-only behavior.
    return model;
  }

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
      // Handle different commands
      if (request.command === "handbook") {
        stream.progress("Searching the Logtalk Handbook...");
        await this.handleHandbookCommand(request, context, stream, token);
        result.metadata.source = "handbook";
      } else if (request.command === "apis") {
        stream.progress("Searching the Logtalk APIs...");
        await this.handleApisCommand(request, context, stream, token);
        result.metadata.source = "apis";
      } else if (request.command === "examples") {
        stream.progress("Searching for relevant examples...");
        await this.handleExamplesCommand(request, context, stream, token);
        result.metadata.source = "examples";
      } else if (request.command === "workspace") {
        stream.progress("Searching the workspace documentation...");
        await this.handleWorkspaceCommand(request, context, stream, token);
        result.metadata.source = "workspace";
      } else if (request.command === "tests") {
        stream.progress("Loading lgtunit documentation...");
        await this.handleTestsCommand(request, context, stream, token);
        result.metadata.source = "tests";
      } else if (request.command === "docs") {
        stream.progress("Loading documentation guidelines...");
        await this.handleDocsCommand(request, context, stream, token);
        result.metadata.source = "docs";
      } else {
        stream.progress("Searching for answers...");
        await this.handleGeneralQuery(request, context, stream, token);
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
    context: vscode.ChatContext,
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
      await this.useLanguageModelWithHandbookContext(request, context, stream, token, query, results);

    } catch (error) {
      this.logger.warn("Failed to search Logtalk Handbook for handbook command:", error);
      // Note: DocumentationCache handles session-based warnings internally
    }
  }

  private async handleApisCommand(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
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
      await this.useLanguageModelWithApisContext(request, context, stream, token, query, results);

    } catch (error) {
      this.logger.warn("Failed to search Logtalk APIs for apis command:", error);
      // Note: DocumentationCache handles session-based warnings internally
    }
  }

  private async handleExamplesCommand(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    // Use the language model to provide examples and explanations
    await this.useLanguageModelForExamples(request, context, stream, token, query);
  }

  private async handleWorkspaceCommand(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    if (!query) {
      stream.markdown("Please provide a search term for workspace documentation.");
      stream.markdown("\n\n**Note:** This command searches documentation in the `xml_docs` folder of your workspace.");
      return;
    }

    const results = await this.getWorkspaceContext(query, 8);

    if (results.length === 0) {
      stream.markdown(`No results found in workspace documentation for "${query}".`);
      stream.markdown("\n\n**Possible reasons:**");
      stream.markdown("\n- The `Generate Project Documentation` or `Generate Documentation` commands have not yet been run");
      stream.markdown("\n- No documentation sections matched your search query");
      return;
    }

    // Use RAG with workspace documentation
    await this.useLanguageModelWithContext(request, context, stream, token, query, results);

  }

  private async handleTestsCommand(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    try {
      // Get the full lgtunit section from both the handbook and APIs
      const lgtunitHandbookSection = await this.documentationCache.getSection("lgtunit", "handbook");
      const lgtunitApisSection = await this.documentationCache.getSection("lgtunit", "apis");

      if (!lgtunitHandbookSection && !lgtunitApisSection) {
        stream.markdown("❌ **Error:** Could not find the lgtunit documentation in the Logtalk Handbook or APIs.");
        stream.markdown("\n\nPlease ensure the documentation is cached. You can try using the `/handbook` command to search for 'lgtunit' instead.");
        return;
      }

      // Combine both sections (if both exist)
      let combinedDocumentation = "";
      if (lgtunitHandbookSection) {
        combinedDocumentation += lgtunitHandbookSection + "\n\n";
      }
      if (lgtunitApisSection) {
        combinedDocumentation += lgtunitApisSection;
      }

      // Use RAG with the lgtunit documentation
      await this.useLanguageModelWithTestingContext(request, context, stream, token, query, combinedDocumentation);

    } catch (error) {
      this.logger.warn("Failed to load lgtunit documentation for tests command:", error);
      stream.markdown("❌ **Error:** Failed to load lgtunit documentation.");
    }
  }

  private async handleDocsCommand(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    try {
      // Get the Documenting section from the handbook and lgtdocp section from APIs
      const documentingHandbookSection = await this.documentationCache.getSection("Documenting", "handbook");
      const lgtdocpApisSection = await this.documentationCache.getSection("lgtdocp", "apis");

      if (!documentingHandbookSection && !lgtdocpApisSection) {
        stream.markdown("❌ **Error:** Could not find the documentation guidelines in the Logtalk Handbook or APIs.");
        stream.markdown("\n\nPlease ensure the documentation is cached. You can try using the `/handbook` command to search for 'Documenting' instead.");
        return;
      }

      // Combine both sections (if both exist)
      let combinedDocumentation = "";
      if (documentingHandbookSection) {
        combinedDocumentation += documentingHandbookSection + "\n\n";
      }
      if (lgtdocpApisSection) {
        combinedDocumentation += lgtdocpApisSection;
      }

      // Use RAG with the documentation guidelines
      await this.useLanguageModelWithDocumentingContext(request, context, stream, token, query, combinedDocumentation);

    } catch (error) {
      this.logger.warn("Failed to load documentation guidelines for docs command:", error);
      stream.markdown("❌ **Error:** Failed to load documentation guidelines.");
    }
  }

  private async handleGeneralQuery(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<void> {
    const query = request.prompt.trim();

    // Search Handbook, APIs, and workspace documentation separately for comprehensive coverage
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
    await this.useLanguageModelWithContext(request, context, stream, token, query, combinedResults);
  }

  /**
   * Search workspace documentation in xml_docs folder for relevant content.
   * Supports both HTML and Markdown files.
   * Searches all workspace folders in multi-root workspaces.
   * @param query The search query
   * @param maxResults Maximum number of results to return (default: 8)
   * @returns Array of formatted search results
   */
  private async getWorkspaceContext(query: string, maxResults: number = 8): Promise<string[]> {
    // Get all workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.logger.debug("No workspace folder found for workspace documentation search");
      return [];
    }

    // Find all HTML and Markdown files in xml_docs folders across all workspace folders
    const docFiles: string[] = [];
    const findDocFiles = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            findDocFiles(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.html' || ext === '.md' || ext === '.markdown') {
              docFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Error reading directory ${dir}:`, error);
      }
    };

    // Search all workspace folders for xml_docs directories
    for (const folder of workspaceFolders) {
      const workspaceRoot = folder.uri.fsPath;
      const xmlDocsPath = path.join(workspaceRoot, "xml_docs");

      // Check if xml_docs folder exists in this workspace folder
      if (fs.existsSync(xmlDocsPath)) {
        this.logger.debug(`Searching workspace documentation in: ${xmlDocsPath}`);
        findDocFiles(xmlDocsPath);
      } else {
        this.logger.debug(`xml_docs folder not found at: ${xmlDocsPath}`);
      }
    }

    if (docFiles.length === 0) {
      this.logger.debug("No HTML or Markdown files found in any workspace xml_docs folder");
      return [];
    }

    this.logger.debug(`Found ${docFiles.length} documentation files across all workspace folders`);

    // Extract sections from all documentation files
    const allSections: WorkspaceDocSection[] = [];

    for (const filePath of docFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.html') {
          // Extract sections from HTML
          const sections = this.extractHtmlSections(content, fileName, filePath);
          allSections.push(...sections);
        } else {
          // Extract sections from Markdown
          const sections = this.extractMarkdownSections(content, fileName, filePath);
          allSections.push(...sections);
        }
      } catch (error) {
        this.logger.warn(`Error reading file ${filePath}:`, error);
      }
    }

    if (allSections.length === 0) {
      this.logger.debug("No sections extracted from workspace documentation");
      return [];
    }

    this.logger.debug(`Extracted ${allSections.length} sections from workspace documentation`);

    // Configure Fuse.js for fuzzy search
    const fuseOptions: FuseOptions = {
      keys: [
        {
          name: 'header',
          weight: 0.7  // Give more weight to header matches
        },
        {
          name: 'content',
          weight: 0.3  // Less weight to content matches
        }
      ],
      threshold: 0.4,
      distance: 100,
      minMatchCharLength: 2,
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,
      findAllMatches: true
    };

    const fuse = new Fuse(allSections, fuseOptions);
    const fuseResults: FuseResult<WorkspaceDocSection>[] = fuse.search(query);

    this.logger.debug(`Fuse.js search completed for workspace docs, found ${fuseResults.length} matches`);

    // Process and format results
    const processedResults = fuseResults.map((result) => {
      const section = result.item;
      const score = 1 - (result.score || 0);

      this.logger.debug(`  Match: "${section.header}" from ${section.source} (score: ${score.toFixed(3)})`);

      return {
        score,
        content: `**From Workspace Documentation - ${section.source} - ${section.header}:**\n\n${section.content}\n`
      };
    });

    // Sort by score and limit results
    const sortedResults = processedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    this.logger.debug(`Returning top ${sortedResults.length} workspace documentation results`);

    return sortedResults.map(result => result.content);
  }

  /**
   * Extract sections from HTML content
   */
  private extractHtmlSections(html: string, fileName: string, filePath: string): WorkspaceDocSection[] {
    const sections: WorkspaceDocSection[] = [];

    // Simple HTML parsing - look for heading tags and their content
    // Match h1-h6 tags and capture content until next heading or end
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    const matches = [...html.matchAll(headingRegex)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const headerHtml = match[2];
      // Strip HTML tags from header
      const header = headerHtml.replace(/<[^>]*>/g, '').trim();

      // Find content between this heading and the next
      const startPos = match.index! + match[0].length;
      const endPos = i < matches.length - 1 ? matches[i + 1].index! : html.length;
      const contentHtml = html.substring(startPos, endPos);

      // Strip HTML tags from content but keep some structure
      const content = contentHtml
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<style[^>]*>.*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (header && content) {
        sections.push({
          header,
          content: content.substring(0, 1000), // Limit content length
          source: fileName,
          filePath
        });
      }
    }

    return sections;
  }

  /**
   * Extract sections from Markdown content
   */
  private extractMarkdownSections(markdown: string, fileName: string, filePath: string): WorkspaceDocSection[] {
    const sections: WorkspaceDocSection[] = [];
    const lines = markdown.split('\n');
    let currentSection: { header: string; content: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for markdown headers (### or more)
      const headerMatch = line.match(/^(#{3,})\s+(.+)$/);

      if (headerMatch) {
        // Save previous section if exists
        if (currentSection) {
          sections.push({
            header: currentSection.header,
            content: currentSection.content.trim(),
            source: fileName,
            filePath
          });
        }

        // Start new section
        currentSection = {
          header: headerMatch[2].trim(),
          content: ''
        };
      } else if (currentSection) {
        // Check if we hit a higher-level header (end of current section)
        const higherHeaderMatch = line.match(/^(#{1,2})\s+(.+)$/);
        if (higherHeaderMatch) {
          sections.push({
            header: currentSection.header,
            content: currentSection.content.trim(),
            source: fileName,
            filePath
          });
          currentSection = null;
        } else {
          // Add line to current section
          currentSection.content += line + '\n';
        }
      }
    }

    // Add the last section if exists
    if (currentSection) {
      sections.push({
        header: currentSection.header,
        content: currentSection.content.trim(),
        source: fileName,
        filePath
      });
    }

    return sections;
  }

  private async useLanguageModelForExamples(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string
  ): Promise<void> {
    try {
  // Resolve a concrete model to avoid placeholder ids like "auto"
  const model = await this.resolveConcreteModel(request.model, token);

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

      this.addChatHistoryToMessages(messages, context, 5);

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
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    documentationResults: string[]
  ): Promise<void> {
    try {
  // Resolve a concrete model to avoid placeholder ids like "auto"
  const model = await this.resolveConcreteModel(request.model, token);

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
      const docContext = documentationResults.length > 0
        ? `\n\nRelevant documentation context:\n${documentationResults.join('\n\n')}`
        : "";

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant. Answer questions about the Logtalk programming language using the provided documentation context as the source of truth when available.

User question: ${query}${docContext}

Please provide a helpful and accurate answer that:
1. If you reference specific Logtalk features, libraries, predicates, or concepts, try to include practical examples when appropriate
2. Format code examples using \`\`\`logtalk code blocks
5. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate
6. Never use Prolog terms like "module" or module/1 or module/2 directives
7. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
8. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
9. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
10. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
11. When explaining how to load a library, use a REPL query to load the library using the \`logtalk_load/1\` predicate
12. Lookup the \`logtalk_load/1\` call to load a library in the APIs documentation

Answer:`)
      ];

      this.addChatHistoryToMessages(messages, context, 5);

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
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    handbookResults: string[]
  ): Promise<void> {
    try {
  // Resolve a concrete model to avoid placeholder ids like "auto"
  const model = await this.resolveConcreteModel(request.model, token);

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
      const handbookContext = handbookResults.slice(0, 8).join('\n\n'); // Limit to top 8 results

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant. Answer the user's question about "${query}" using the provided Logtalk Handbook documentation context as the source of truth.

Context from Logtalk Handbook:
${handbookContext}

User Question: ${query}

Please provide a comprehensive answer that:
1. Directly addresses the user's question
2. References the relevant handbook sections
3. Includes practical examples when appropriate
4. Explains concepts clearly for both beginners and experienced users
5. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate
6. Never use Prolog terms like "module" or module/1 or module/2 directives
7. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
8. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
9. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
10. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
11. When explaining how to load a library, use a REPL query to load the library using the \`logtalk_load/1\` predicate
12. Lookup the \`logtalk_load/1\` call to load a library in the APIs documentation

Answer:`)
      ];

      this.addChatHistoryToMessages(messages, context, 5);

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
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    apisResults: string[]
  ): Promise<void> {
    try {
  // Resolve a concrete model to avoid placeholder ids like "auto"
  const model = await this.resolveConcreteModel(request.model, token);

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
      const apisContext = apisResults.slice(0, 8).join('\n\n'); // Limit to top 8 results

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant. Answer the user's question about "${query}" using the provided Logtalk APIs documentation context as the source of truth.

Context from Logtalk APIs:
${apisContext}

User Question: ${query}

Please provide a comprehensive answer that:
1. Explains the API/predicate/method functionality
2. Shows the correct syntax and parameters
3. Provides practical usage examples
4. Mentions any important notes about behavior or requirements
5. Suggests related APIs when relevant
6. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate
7. Never use Prolog terms like "module" or module/1 or module/2 directives
8. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
9. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
10. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
11. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
12. When explaining how to load a library, use a REPL query to load the library using the \`logtalk_load/1\` predicate
13. Lookup the \`logtalk_load/1\` call to load a library in the APIs documentation

Answer:`)
      ];

      this.addChatHistoryToMessages(messages, context, 5);

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

  private async useLanguageModelWithTestingContext(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    lgtunitSection: string
  ): Promise<void> {
    try {
      // Resolve a concrete model to avoid placeholder ids like "auto"
      const model = await this.resolveConcreteModel(request.model, token);

      if (!model) {
        // Fallback to showing lgtunit documentation only
        stream.markdown(`## lgtunit Testing Framework Documentation\n\n`);
        stream.markdown(lgtunitSection);
        return;
      }

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant specializing in testing with the lgtunit tool. Answer the user's question about "${query}" using the provided lgtunit documentation as the source of truth.

Context from Logtalk documentation - \`lgtunit\` tool:
${lgtunitSection}

User Question: ${query}

Please provide a comprehensive answer that:
1. Directly addresses the user's question about testing in Logtalk
2. References the relevant lgtunit documentation sections from both the Handbook and APIs
3. Includes practical test examples when appropriate
4. Explains testing concepts clearly for both beginners and experienced users
5. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate
6. Never use Prolog terms like "module" or module/1 or module/2 directives
7. When calling lgtunit predicates from tests, use super calls with the ^^/1 operator
8. When providing examples, use **either** explicit message-sending calls with the ::/2 operator **or** implicit message-sending calls with a uses/2 directive
9. The syntax for uses/2 directives is \`:- uses(Object, ListOfPredicates).\`
10. The syntax for explicit message-sending calls is \`Object::Predicate(...).\`
11. When providing REPL example queries for library predicates, always use explicit message-sending calls with the ::/2 operator
12. When explaining how to load the lgtunit library, use a REPL query to load the library using the \`logtalk_load(lgtunit(loader))\` predicate
13. Show how to structure test files and test objects properly
14. Show how to write a \`tester.lgt\` file to load and run tests
15. Explain how to run tests using the appropriate commands

Answer:`)
      ];

      this.addChatHistoryToMessages(messages, context, 5);

      const chatResponse = await model.sendRequest(messages, {}, token);

      stream.markdown(`## Logtalk Testing with lgtunit\n\n`);

      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }

      // Add reference to source documentation
      stream.markdown(`\n\n---\n\n**📚 Source**: Logtalk Handbook and APIs - \`lgtunit\` tool`);

    } catch (error) {
      this.logger.error("Error using language model with lgtunit context:", error);
      // Fallback to showing documentation only
      stream.markdown(`## lgtunit Testing Tool Documentation\n\n`);
      stream.markdown(lgtunitSection);
    }
  }

  private async useLanguageModelWithDocumentingContext(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    query: string,
    documentingSection: string
  ): Promise<void> {
    try {
      // Resolve a concrete model to avoid placeholder ids like "auto"
      const model = await this.resolveConcreteModel(request.model, token);

      if (!model) {
        // Fallback to showing documentation only
        stream.markdown(`## Logtalk Documentation Guidelines\n\n`);
        stream.markdown(documentingSection);
        return;
      }

      const messages = [
        vscode.LanguageModelChatMessage.User(`You are a Logtalk programming expert assistant specializing in code documentation. Answer the user's question about "${query}" using the provided documentation guidelines as the source of truth.

Context from Logtalk documentation - \`lgtdocp\` tool:
${documentingSection}

User Question: ${query}

Please provide a comprehensive answer that:
1. Directly addresses the user's question about documenting Logtalk code
2. References the relevant documentation sections from both the Handbook and APIs
3. Includes practical documentation examples when appropriate
4. Explains documentation concepts clearly for both beginners and experienced users
5. Always uses Logtalk nomenclature such as "library", "protocol", "objects", "categories" as appropriate
6. Never use Prolog terms like "module" or module/1 or module/2 directives
7. When providing examples, show proper info/1 and info/2 directive syntax
8. Explain the structure of entity and predicate documentation directives
9. Show how to use the lgtdoc tool to generate documentation
10. Explain the different documentation formats available (HTML, Markdown, XML, etc.)
11. Demonstrate best practices for writing clear and comprehensive documentation
12. When showing REPL examples for generating documentation, use the appropriate lgtdoc predicates

Answer:`)
      ];

      this.addChatHistoryToMessages(messages, context, 5);

      const chatResponse = await model.sendRequest(messages, {}, token);

      stream.markdown(`## Logtalk Code Documentation\n\n`);

      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }

      // Add reference to source documentation
      stream.markdown(`\n\n---\n\n**📚 Source**: Logtalk Handbook and APIs - \`lgtdoc\` tool`);

    } catch (error) {
      this.logger.error("Error using language model with documenting context:", error);
      // Fallback to showing documentation only
      stream.markdown(`## Logtalk Documentation Guidelines\n\n`);
      stream.markdown(documentingSection);
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
