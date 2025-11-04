# Workspace Slash Command (`/workspace`)

## Overview

The `/workspace` slash command allows you to search and query workspace-specific documentation stored in the `xml_docs` folder. This command uses RAG (Retrieval-Augmented Generation) to provide context-aware answers based on your project's documentation.

## Usage

### Basic Syntax

```
@logtalk /workspace <your question or search query>
```

### Examples

**Search for specific topics:**
```
@logtalk /workspace how do I configure the database?
@logtalk /workspace authentication flow
@logtalk /workspace API endpoints
```

**Ask questions about your project:**
```
@logtalk /workspace what predicates are available for data validation?
@logtalk /workspace how do I implement custom rules?
@logtalk /workspace explain the project architecture
```

**Get help with specific features:**
```
@logtalk /workspace how to use the logging system?
@logtalk /workspace error handling best practices
@logtalk /workspace testing guidelines
```

## Setup

### 1. Create the `xml_docs` Folder

Create a folder named `xml_docs` at the root of your workspace:

```
your-workspace/
├── xml_docs/          ← Create this folder
│   ├── index.md
│   ├── api.html
│   └── guides/
│       └── getting-started.md
├── src/
└── ...
```

### 2. Add Documentation Files

Add HTML or Markdown files to the `xml_docs` folder. The command supports:
- `.html` files
- `.md` files
- `.markdown` files

Files can be organized in subdirectories for better structure.

### 3. Structure Your Documentation

For best results, structure your documentation with clear headings:

**Markdown Example:**

```markdown
# Project Documentation

## Overview

This project provides...

### Core Features

#### Feature 1: Data Processing

The data processing module handles...

#### Feature 2: Validation

The validation system ensures...
```

**HTML Example:**

```html
<!DOCTYPE html>
<html>
<head>
    <title>API Documentation</title>
</head>
<body>
    <h1>API Reference</h1>
    
    <h3>Authentication</h3>
    <p>The authentication system uses...</p>
    
    <h3>Endpoints</h3>
    <p>Available endpoints include...</p>
</body>
</html>
```

## How It Works

### 1. File Discovery

When you use the `/workspace` command, the system:
- Looks for the `xml_docs` folder in your workspace root
- Recursively scans for all HTML and Markdown files
- Reads and parses each file

### 2. Section Extraction

The system extracts sections from your documentation:
- **Markdown**: Sections are identified by level 3+ headers (`###`, `####`, etc.)
- **HTML**: Sections are identified by heading tags (`<h3>`, `<h4>`, etc.)

### 3. Fuzzy Search

Using Fuse.js, the system performs intelligent fuzzy search:
- Searches both section headers and content
- Weights headers more heavily (70%) than content (30%)
- Returns the most relevant sections

### 4. RAG (Retrieval-Augmented Generation)

The top matching sections are sent to the language model as context, which then:
- Understands your question
- Uses the workspace documentation as reference
- Generates a helpful, context-aware answer

## Response Examples

### When Documentation is Found

**User Query:**
```
@logtalk /workspace how do I validate user input?
```

**Response:**
```
Based on your workspace documentation, here's how to validate user input:

The validation system provides several predicates for input validation:

1. **validate/2** - Basic validation against a schema
   - Syntax: validate(+Data, +Schema)
   - Returns true if data matches schema

2. **validate_strict/2** - Strict validation with detailed errors
   - Syntax: validate_strict(+Data, +Schema)
   - Returns error details if validation fails

Example usage:
...
```

### When Documentation is Not Found

**User Query:**
```
@logtalk /workspace authentication
```

**Response:**
```
No results found in workspace documentation for "authentication".

**Possible reasons:**
- The `xml_docs` folder doesn't exist in your workspace
- No HTML or Markdown files found in `xml_docs`
- No sections matched your search query

**Tip:** Make sure you have documentation files in the `xml_docs` folder at the root of your workspace.
```

## Best Practices

### 1. Use Clear Headings

Structure your documentation with descriptive headings:

✅ **Good:**
```markdown
### User Authentication Flow
### Database Connection Setup
### Error Handling Guidelines
```

❌ **Avoid:**
```markdown
### Section 1
### Part A
### Notes
```

### 2. Include Examples

Add code examples and usage patterns:

```markdown
### validate/2 Predicate

**Syntax:**
```logtalk
validate(+Data, +Schema)
```

**Example:**
```logtalk
?- validate([name('John'), age(25)], user_schema).
true.
```
```

### 3. Keep Content Focused

Each section should focus on a specific topic:

✅ **Good:** One section per feature/concept
❌ **Avoid:** Long sections covering multiple unrelated topics

### 4. Update Regularly

Keep your workspace documentation up-to-date with your code:
- Document new features as you add them
- Update examples when APIs change
- Remove outdated information

## Comparison with Other Commands

| Command | Purpose | Documentation Source |
|---------|---------|---------------------|
| `/handbook` | Search Logtalk Handbook | Official Logtalk documentation |
| `/apis` | Search Logtalk APIs | Official Logtalk API reference |
| `/examples` | Get code examples | Logtalk examples repository |
| `/workspace` | Search workspace docs | Your project's xml_docs folder |
| (no command) | General query | All sources combined |

## Troubleshooting

### "No results found" Message

**Possible causes:**
1. The `xml_docs` folder doesn't exist
2. No HTML/Markdown files in the folder
3. Files don't contain level 3+ headers (Markdown) or h3+ tags (HTML)
4. Search query doesn't match any content

**Solutions:**
- Verify `xml_docs` folder exists at workspace root
- Check that files have proper heading structure
- Try broader search terms
- Check file extensions (must be .html, .md, or .markdown)

### Search Returns Irrelevant Results

**Solutions:**
- Use more specific search terms
- Add more descriptive headers to your documentation
- Organize content into focused sections
- Use keywords that match your query in headers

### Performance Issues

**If searches are slow:**
- Reduce the number of documentation files
- Split large files into smaller, focused files
- Remove unnecessary content from documentation

## Advanced Usage

### Combining with Other Commands

You can use multiple commands in sequence:

```
@logtalk /handbook what is a predicate?
@logtalk /workspace how do we use predicates in our project?
```

### Integration with General Queries

General queries (without a slash command) automatically search all sources, including workspace documentation.

## Future Enhancements

Planned improvements for the `/workspace` command:

1. **Caching** - Cache parsed documentation for faster searches
2. **File Watching** - Auto-refresh when documentation changes
3. **Configuration** - Customize the documentation folder path
4. **Multiple Folders** - Support searching multiple documentation locations
5. **Better HTML Parsing** - More accurate extraction from complex HTML

## Feedback

If you encounter issues or have suggestions for the `/workspace` command, please file an issue on the extension's GitHub repository.

