# Workspace Context Search Implementation

## Overview

The `getWorkspaceContext()` method has been implemented in the `LogtalkChatParticipant` class to enable searching workspace-specific documentation located in the `xml_docs` folder.

A new `/workspace` slash command has been added to the Logtalk chat participant that uses this method for RAG (Retrieval-Augmented Generation).

## Features

### Search Capabilities
- **Location**: Searches the `xml_docs` folder in the workspace root
- **File Types**: Supports both HTML and Markdown files (`.html`, `.md`, `.markdown`)
- **Recursive Search**: Recursively searches all subdirectories within `xml_docs`
- **Fuzzy Search**: Uses Fuse.js for intelligent fuzzy matching

### Search Configuration

The method uses the same Fuse.js configuration as the existing documentation search:

```typescript
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
```

## Method Signature

```typescript
private async getWorkspaceContext(query: string, maxResults: number = 6): Promise<string[]>
```

### Parameters
- `query`: The search query string
- `maxResults`: Maximum number of results to return (default: 6)

### Returns
- Array of formatted search result strings

## Implementation Details

### HTML Section Extraction

The `extractHtmlSections()` method:
1. Finds all heading tags (h1-h6) in the HTML
2. Extracts the header text by stripping HTML tags
3. Captures content between headings
4. Strips HTML tags from content while preserving text
5. Limits content to 1000 characters per section

### Markdown Section Extraction

The `extractMarkdownSections()` method:
1. Looks for level 3+ headers (`###` or more)
2. Captures content until the next header or end of section
3. Stops at higher-level headers (level 1-2)
4. Preserves the full content of each section

### Result Formatting

Results are formatted as:
```
**From Workspace Documentation - {fileName} - {header}:**

{content}
```

## Slash Command Usage

### Using the `/workspace` Command

The easiest way to use workspace documentation search is through the `/workspace` slash command in the Logtalk chat participant:

1. Open the Copilot chat panel
2. Type `@logtalk /workspace` followed by your search query
3. The assistant will search your workspace documentation and provide relevant answers

**Examples:**

```
@logtalk /workspace how do I use predicates?
@logtalk /workspace database connection
@logtalk /workspace authentication flow
```

**Features:**
- Searches only workspace documentation (xml_docs folder)
- Uses RAG to provide context-aware answers
- Shows helpful error messages if documentation is not found
- Provides tips for setting up workspace documentation

## Programmatic Usage

### Basic Usage

```typescript
// Search workspace documentation for "predicates"
const results = await this.getWorkspaceContext("predicates", 8);

// Results will contain up to 8 sections from workspace docs
// that best match the query "predicates"
```

### Integration into General Query Handler

Here's an example of how to integrate workspace context into the general query handler:

```typescript
private async handleGeneralQuery(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  const query = request.prompt.trim();

  // Search Handbook, APIs, and workspace documentation
  let handbookResults: string[] = [];
  let apisResults: string[] = [];
  let workspaceResults: string[] = [];

  try {
    this.logger.debug("Searching Handbook documentation for general query...");
    handbookResults = await this.documentationCache.searchDocumentation(query, 'handbook');
    this.logger.debug(`Found ${handbookResults.length} Handbook results`);

    this.logger.debug("Searching APIs documentation for general query...");
    apisResults = await this.documentationCache.searchDocumentation(query, 'apis');
    this.logger.debug(`Found ${apisResults.length} APIs results`);

    // Search workspace documentation
    this.logger.debug("Searching workspace documentation for general query...");
    workspaceResults = await this.getWorkspaceContext(query, 6);
    this.logger.debug(`Found ${workspaceResults.length} workspace results`);
  } catch (error) {
    this.logger.warn("Failed to search documentation for general query:", error);
  }

  // Combine results from all sources
  const combinedResults: string[] = [];

  // Add top results from each source
  if (handbookResults.length > 0) {
    combinedResults.push(...handbookResults.slice(0, 3));
  }

  if (apisResults.length > 0) {
    combinedResults.push(...apisResults.slice(0, 3));
  }

  if (workspaceResults.length > 0) {
    combinedResults.push(...workspaceResults.slice(0, 2));
  }

  // Use the language model with combined search results context
  await this.useLanguageModelWithContext(request, stream, token, query, combinedResults);
}
```

## Integration Points

The method can be integrated into:
1. **General query handling** - Include workspace-specific context alongside Handbook and APIs
2. **Custom slash commands** - Create a `/workspace` command for workspace documentation only
3. **Enhanced RAG workflows** - Combine workspace docs with official documentation
4. **Examples command** - Include workspace examples in the `/examples` command

## Error Handling

The method gracefully handles:
- Missing workspace folders (returns empty array)
- Missing `xml_docs` folder (returns empty array with debug log)
- File read errors (logs warning and continues)
- Directory read errors (logs warning and continues)
- Empty documentation files (returns empty array)

## Logging

The method uses the extension's logger utility with appropriate log levels:
- **Debug**: Search progress, file counts, section counts
- **Warn**: File/directory read errors

## Future Enhancements

Potential improvements:
1. Cache workspace documentation to avoid re-reading files on every search
2. Watch for file changes in `xml_docs` and invalidate cache
3. Support additional file formats (PDF, plain text)
4. Add configuration options for search parameters
5. Provide workspace documentation refresh command

