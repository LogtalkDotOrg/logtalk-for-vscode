# Workspace Context Search - Example Usage

This document demonstrates how the `getWorkspaceContext()` method works with example workspace documentation.

## Example Workspace Structure

```
workspace-root/
├── xml_docs/
│   ├── index.html
│   ├── predicates.md
│   ├── api/
│   │   ├── core.html
│   │   └── utilities.md
│   └── examples/
│       └── getting-started.md
└── src/
    └── ...
```

## Example HTML File (xml_docs/index.html)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Project Documentation</title>
</head>
<body>
    <h1>Project Overview</h1>
    <p>This is the main documentation for the project.</p>
    
    <h3>Getting Started</h3>
    <p>To get started with this project, follow these steps...</p>
    
    <h3>Core Predicates</h3>
    <p>The core predicates include process/1, validate/2, and transform/3.</p>
    
    <h4>process/1</h4>
    <p>The process/1 predicate handles data processing...</p>
</body>
</html>
```

## Example Markdown File (xml_docs/predicates.md)

```markdown
# Predicates Reference

## Overview

This document describes all available predicates in the project.

### Data Processing

#### process/1

Processes input data and returns results.

**Syntax:**
```logtalk
process(+Data)
```

**Arguments:**
- Data: Input data to process

**Example:**
```logtalk
?- process([1, 2, 3]).
true.
```

### Validation

#### validate/2

Validates data against a schema.

**Syntax:**
```logtalk
validate(+Data, +Schema)
```
```

## How the Search Works

### Query: "process predicate"

When searching for "process predicate", the method will:

1. **Find all documentation files** in `xml_docs/`:
   - `index.html`
   - `predicates.md`
   - `api/core.html`
   - `api/utilities.md`
   - `examples/getting-started.md`

2. **Extract sections** from each file:
   - From `index.html`:
     - "Getting Started" section
     - "Core Predicates" section
     - "process/1" section
   - From `predicates.md`:
     - "Data Processing" section
     - "process/1" section
     - "Validation" section
     - "validate/2" section

3. **Perform fuzzy search** using Fuse.js:
   - Searches both headers and content
   - Weights headers more heavily (0.7) than content (0.3)
   - Returns sections that best match "process predicate"

4. **Return formatted results**:
   ```
   **From Workspace Documentation - index.html - process/1:**
   
   The process/1 predicate handles data processing...
   
   **From Workspace Documentation - predicates.md - process/1:**
   
   Processes input data and returns results.
   
   **Syntax:**
   ```logtalk
   process(+Data)
   ```
   
   **Arguments:**
   - Data: Input data to process
   
   **Example:**
   ```logtalk
   ?- process([1, 2, 3]).
   true.
   ```
   ```

## Expected Results

For the query "process predicate", the method would return approximately:

1. **Best match**: "process/1" section from `predicates.md` (header + content match)
2. **Second match**: "process/1" section from `index.html` (header match)
3. **Third match**: "Core Predicates" section from `index.html` (content match)
4. **Fourth match**: "Data Processing" section from `predicates.md` (content match)

## Testing the Implementation

To test the implementation:

1. Create an `xml_docs` folder in your workspace
2. Add some HTML or Markdown files with documentation
3. Call the method from the chat participant:
   ```typescript
   const results = await this.getWorkspaceContext("your search query", 6);
   console.log(results);
   ```

## Integration Example

Here's how to integrate workspace context into a chat command:

```typescript
private async handleWorkspaceCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  const query = request.prompt.trim();
  
  if (!query) {
    stream.markdown("Please provide a search term for workspace documentation.");
    return;
  }

  try {
    const results = await this.getWorkspaceContext(query, 6);

    if (results.length === 0) {
      stream.markdown(`No results found in workspace documentation for "${query}".`);
      stream.markdown("\n**Note:** Make sure you have documentation files in the `xml_docs` folder.");
      return;
    }

    // Use RAG with workspace documentation
    await this.useLanguageModelWithContext(request, stream, token, query, results);

  } catch (error) {
    this.logger.warn("Failed to search workspace documentation:", error);
    stream.markdown(`❌ **Error:** ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

## Performance Considerations

- **File Reading**: Files are read synchronously on each search
- **Section Extraction**: HTML parsing is simple regex-based (fast but basic)
- **Fuzzy Search**: Fuse.js is efficient for moderate amounts of data
- **Recommended**: For large documentation sets, consider implementing caching

## Future Improvements

1. **Caching**: Cache parsed sections to avoid re-reading files
2. **File Watching**: Invalidate cache when files change
3. **Better HTML Parsing**: Use a proper HTML parser for more accurate extraction
4. **Configuration**: Allow users to configure the search folder path
5. **Multiple Folders**: Support searching multiple documentation folders

