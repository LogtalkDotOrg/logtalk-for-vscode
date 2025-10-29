"use strict";

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { getLogger } from "./logger";
import { Utils } from "./utils";
const Fuse: any = require("fuse.js");

// Type declarations for Fuse.js when using CommonJS require
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

export interface DocumentationData {
  handbook: string;
  apis: string;
  version: string;
  lastUpdated: Date;
}

interface DocumentationSection {
  header: string;
  content: string;
  source: string;
}

interface SearchResult {
  score: number;
  content: string;
  header: string;
  source: string;
}

/**
 * Manages caching of Logtalk documentation (Handbook and APIs).
 * Cache is version-aware and only expires when the Logtalk version changes
 * (detected by reading $LOGTALKHOME/VERSION.txt).
 */
export class DocumentationCache {
  private static instance: DocumentationCache;
  private cacheDir: string;
  private cacheFile: string;
  private cachedData: DocumentationData | null = null;
  private hasShownDownloadWarning: boolean = false;
  private logger = getLogger();

  private constructor(context: vscode.ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, "logtalk-docs");
    this.cacheFile = path.join(this.cacheDir, "documentation.json");
    this.ensureCacheDir();
  }

  public static getInstance(context: vscode.ExtensionContext): DocumentationCache {
    if (!DocumentationCache.instance) {
      DocumentationCache.instance = new DocumentationCache(context);
    }
    return DocumentationCache.instance;
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private async getLogtalkVersion(): Promise<string> {
    try {
      const section = vscode.workspace.getConfiguration("logtalk");
      const logtalkHome = section.get<string>("home.path");

      if (!logtalkHome) {
        throw new Error("LOGTALKHOME not configured in VSCode settings");
      }

      const versionFile = path.join(logtalkHome, "VERSION.txt");
      if (!fs.existsSync(versionFile)) {
        throw new Error("VERSION.txt not found in LOGTALKHOME directory");
      }

      const versionContent = fs.readFileSync(versionFile, "utf8").trim();
      // Remove version suffixes (e.g., "-stable", "-beta", "-alpha", "-rc1") for correct URL formation
      // Keep only the numeric version part (e.g., "3.92.0-stable" -> "3.92.0")
      const cleanVersion = versionContent.replace(/-[a-zA-Z0-9]+$/, '');

      if (versionContent !== cleanVersion) {
        this.logger.debug(`Logtalk version cleaned: "${versionContent}" -> "${cleanVersion}"`);
      }

      return cleanVersion;
    } catch (error) {
      this.logger.error("Error reading Logtalk version:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fallbackVersion = `${Utils.LOGTALK_MIN_VERSION_MAJOR}.${Utils.LOGTALK_MIN_VERSION_MINOR}.${Utils.LOGTALK_MIN_VERSION_PATCH}`;
      vscode.window.showWarningMessage(
        `Cannot detect Logtalk version: ${errorMessage}. ` +
        `Using minimum required version ${fallbackVersion} for documentation. ` +
        `Please ensure Logtalk is properly configured in VSCode settings.`
      );
      // Fallback to the minimum required version
      return fallbackVersion;
    }
  }

  private async fetchDocumentation(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const request = client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        let data = '';
        response.setEncoding('utf8');

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });
      });

      request.on('error', (error) => {
        this.logger.error(`Error fetching documentation from ${url}:`, error);
        reject(error);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  private loadCachedData(): DocumentationData | null {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
        data.lastUpdated = new Date(data.lastUpdated);
        return data;
      }
    } catch (error) {
      this.logger.error("Error loading cached documentation:", error);
    }
    return null;
  }

  private saveCachedData(data: DocumentationData): void {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error("Error saving cached documentation:", error);
    }
  }

  private isCacheValid(data: DocumentationData, currentVersion: string): boolean {
    // Cache is valid if version matches the current Logtalk version
    return data.version === currentVersion;
  }

  public async getDocumentation(): Promise<DocumentationData> {
    const currentVersion = await this.getLogtalkVersion();

    // Check if we have valid cached data
    if (!this.cachedData) {
      this.cachedData = this.loadCachedData();
    }

    if (this.cachedData && this.isCacheValid(this.cachedData, currentVersion)) {
      this.logger.info(`Using cached documentation for Logtalk version ${currentVersion}`);
      return this.cachedData;
    }

    // Log if we're updating due to version change
    if (this.cachedData && this.cachedData.version !== currentVersion) {
      this.logger.info(`Logtalk version changed from ${this.cachedData.version} to ${currentVersion}, updating documentation cache`);
      // Reset warning flag for new version
      this.hasShownDownloadWarning = false;
    } else if (!this.cachedData) {
      this.logger.info(`No cached documentation found, fetching for Logtalk version ${currentVersion}`);
    }

    // Try to get documentation from local files first, then fallback to download
    try {
      let handbook: string;
      let apis: string;

      // Check for local documentation files first
      const logtalkHome = process.env.LOGTALKHOME;
      let handbookFromLocal = false;
      let apisFromLocal = false;

      if (logtalkHome) {
        const localHandbookPath = path.join(logtalkHome, 'docs', 'handbook', `TheLogtalkHandbook-${currentVersion}.md`);
        const localApisPath = path.join(logtalkHome, 'docs', 'apis', `LogtalkAPIs-${currentVersion}.md`);

        this.logger.debug(`Checking for local Handbook documentation at: ${localHandbookPath}`);
        this.logger.debug(`Checking for local APIs documentation at: ${localApisPath}`);

        // Try to read local Handbook file
        try {
          if (fs.existsSync(localHandbookPath)) {
            handbook = fs.readFileSync(localHandbookPath, 'utf8');
            handbookFromLocal = true;
            this.logger.info(`Successfully loaded Handbook documentation from local file`);
          }
        } catch (localError) {
          this.logger.warn(`Failed to read local Handbook file: ${localError}`);
        }

        // Try to read local APIs file
        try {
          if (fs.existsSync(localApisPath)) {
            apis = fs.readFileSync(localApisPath, 'utf8');
            apisFromLocal = true;
            this.logger.info(`Successfully loaded APIs documentation from local file`);
          }
        } catch (localError) {
          this.logger.warn(`Failed to read local APIs file: ${localError}`);
        }
      } else {
        this.logger.debug(`LOGTALKHOME environment variable not set, skipping local file check`);
      }

      // Download any missing documentation from the web
      const downloadPromises: Promise<string>[] = [];

      if (!handbookFromLocal) {
        const handbookUrl = `https://logtalk.org/handbook/TheLogtalkHandbook-${currentVersion}.md`;
        this.logger.info(`Downloading Handbook documentation from: ${handbookUrl}`);
        downloadPromises.push(this.fetchDocumentation(handbookUrl));
      } else {
        downloadPromises.push(Promise.resolve(handbook!));
      }

      if (!apisFromLocal) {
        const apisUrl = `https://logtalk.org/apis/LogtalkAPIs-${currentVersion}.md`;
        this.logger.info(`Downloading APIs documentation from: ${apisUrl}`);
        downloadPromises.push(this.fetchDocumentation(apisUrl));
      } else {
        downloadPromises.push(Promise.resolve(apis!));
      }

      const [finalHandbook, finalApis] = await Promise.all(downloadPromises);

      // Use the results (either from local files or downloads)
      if (!handbookFromLocal) {
        handbook = finalHandbook;
      }
      if (!apisFromLocal) {
        apis = finalApis;
      }

      this.logger.info(`Documentation loaded - Handbook: ${handbookFromLocal ? 'local' : 'downloaded'}, APIs: ${apisFromLocal ? 'local' : 'downloaded'}`);

      const newData: DocumentationData = {
        handbook: handbook!,
        apis: apis!,
        version: currentVersion,
        lastUpdated: new Date()
      };

      this.cachedData = newData;
      this.saveCachedData(newData);

      return newData;
    } catch (error) {
      // If fetching fails and we have cached data from a previous version, use it
      if (this.cachedData) {
        this.logger.warn("Using cached documentation from previous version due to fetch error:", error);

        // Only show warning once per session
        if (!this.hasShownDownloadWarning) {
          this.hasShownDownloadWarning = true;
          vscode.window.showWarningMessage(
            `Failed to download Logtalk ${currentVersion} documentation. Using cached documentation from version ${this.cachedData.version}. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        return this.cachedData;
      }

      // No cached data available, show error and throw
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to fetch documentation and no cached data available:", error);

      // Only show warning once per session
      if (!this.hasShownDownloadWarning) {
        this.hasShownDownloadWarning = true;
        vscode.window.showWarningMessage(
          `Failed to download Logtalk documentation for version ${currentVersion}. ` +
          `The chat participant may not work properly. Please check your internet connection and try again. ` +
          `Error: ${errorMessage}`
        );
      }
      throw error;
    }
  }

  public async searchDocumentation(query: string, source?: 'handbook' | 'apis'): Promise<string[]> {
    const docs = await this.getDocumentation();
    const allSections: DocumentationSection[] = [];

    const searchInText = (text: string, sourceName: string) => {
      const lines = text.split('\n');
      // Use level 4 headings for APIs, level 3+ for Handbook
      const isApisSource = sourceName.includes('APIs');
      const sections = this.extractSubSections(lines, isApisSource);

      this.logger.debug(`Found ${sections.length} sections in ${sourceName}:`);
      if (this.logger.isLevelEnabled(4)) { // Only log details if debug level is enabled
        sections.forEach((section, index) => {
          this.logger.debug(`  ${index + 1}. ${section.header}`);
        });
      }

      // Add sections to the search pool with source information
      sections.forEach(section => {
        allSections.push({
          header: section.header,
          content: section.content,
          source: sourceName
        });
      });
    };

    if (!source || source === 'handbook') {
      searchInText(docs.handbook, 'Logtalk Handbook');
    }

    if (!source || source === 'apis') {
      searchInText(docs.apis, 'Logtalk APIs');
    }

    // Configure Fuse.js for fuzzy search on both header and content
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
      threshold: 0.4,  // Lower threshold = more strict matching (0.0 = exact, 1.0 = match anything)
      distance: 100,   // Maximum distance for a match
      minMatchCharLength: 2,  // Minimum character length for a match
      includeScore: true,
      includeMatches: true,
      ignoreLocation: true,  // Don't consider location of match in string
      findAllMatches: true
    };

    const fuse = new Fuse(allSections, fuseOptions);
    const fuseResults: FuseResult<DocumentationSection>[] = fuse.search(query);

    this.logger.debug(`Fuse.js search completed for query "${query}"`);
    this.logger.debug(`Total matching sections found: ${fuseResults.length}`);

    // Process Fuse.js results
    const processedResults: SearchResult[] = fuseResults.map((result) => {
      const section = result.item;
      const score = 1 - (result.score || 0); // Convert Fuse score (lower is better) to our score (higher is better)

      this.logger.debug(`  Match: "${section.header}" from ${section.source} (Fuse score: ${result.score?.toFixed(3)}, converted: ${score.toFixed(3)})`);

      return {
        score,
        content: `**From ${section.source} - ${section.header}:**\n\n${section.content}\n`,
        header: section.header,
        source: section.source
      };
    });

    // Sort by converted score (highest first) and limit to 8 results
    const sortedResults = processedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    this.logger.debug(`Returning top ${sortedResults.length} results:`);
    if (this.logger.isLevelEnabled(4)) { // Only log details if debug level is enabled
      sortedResults.forEach((result, index) => {
        this.logger.debug(`  ${index + 1}. ${result.header} from ${result.source} (score: ${result.score.toFixed(3)})`);
      });
    }

    return sortedResults.map((result) => result.content);
  }

  private extractSubSections(lines: string[], useLevel4ForApis: boolean = false): { header: string; content: string }[] {
    const sections: { header: string; content: string }[] = [];
    let currentSection: { header: string; content: string } | null = null;

    this.logger.debug(`Extracting sections from ${lines.length} lines of documentation (APIs level 4: ${useLevel4ForApis})...`);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for target headers based on source type
      let headerMatch: RegExpMatchArray | null = null;
      let higherHeaderMatch: RegExpMatchArray | null = null;

      if (useLevel4ForApis) {
        // For APIs: use level 4 headers (####) as sections
        headerMatch = line.match(/^(#{4})\s+(.+)$/);
        // Higher level headers (1-3) end the current section
        higherHeaderMatch = line.match(/^(#{1,3})\s+(.+)$/);
      } else {
        // For Handbook: use level 3+ headers (### or more) as sections
        headerMatch = line.match(/^(#{3,})\s+(.+)$/);
        // Higher level headers (1-2) end the current section
        higherHeaderMatch = line.match(/^(#{1,2})\s+(.+)$/);
      }

      if (headerMatch) {
        // Save previous section if exists
        if (currentSection) {
          sections.push(currentSection);
          this.logger.debug(`  Completed section: "${currentSection.header}" (${currentSection.content.split('\n').length} lines)`);
        }

        // Start new section
        const headerTitle = headerMatch[2].trim();
        this.logger.debug(`  Starting new section: "${headerTitle}"`);
        currentSection = {
          header: headerTitle,
          content: line + '\n'
        };
      } else if (currentSection) {
        // Check if we hit a higher-level header (end of current section)
        if (higherHeaderMatch) {
          sections.push(currentSection);
          this.logger.debug(`  Completed section: "${currentSection.header}" (${currentSection.content.split('\n').length} lines)`);
          currentSection = null;
        } else {
          // Add line to current section
          currentSection.content += line + '\n';
        }
      }
    }

    // Add the last section if exists
    if (currentSection) {
      sections.push(currentSection);
      this.logger.debug(`  Completed final section: "${currentSection.header}" (${currentSection.content.split('\n').length} lines)`);
    }

    this.logger.debug(`Extracted ${sections.length} total sections from documentation`);
    return sections;
  }



  public async checkForVersionUpdate(): Promise<{ hasUpdate: boolean; currentVersion: string; cachedVersion?: string }> {
    const currentVersion = await this.getLogtalkVersion();

    if (!this.cachedData) {
      this.cachedData = this.loadCachedData();
    }

    const hasUpdate = !this.cachedData || this.cachedData.version !== currentVersion;

    return {
      hasUpdate,
      currentVersion,
      cachedVersion: this.cachedData?.version
    };
  }

  public async refreshCache(): Promise<DocumentationData> {
    // Clear current cache and force refresh
    this.cachedData = null;
    return await this.getDocumentation();
  }

  public clearCache(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        fs.unlinkSync(this.cacheFile);
      }
      this.cachedData = null;
      // Reset warning flag when clearing cache
      this.hasShownDownloadWarning = false;
    } catch (error) {
      this.logger.error("Error clearing cache:", error);
    }
  }

  /**
   * Reset the download warning flag to allow showing the warning again
   */
  public resetDownloadWarning(): void {
    this.hasShownDownloadWarning = false;
  }

  /**
   * Get the full content of the Handbook documentation
   */
  public async getHandbookContent(): Promise<string> {
    const docs = await this.getDocumentation();
    return docs.handbook;
  }

  /**
   * Get the full content of the APIs documentation
   */
  public async getApisContent(): Promise<string> {
    const docs = await this.getDocumentation();
    return docs.apis;
  }

  /**
   * Get the full content of both Handbook and APIs documentation
   */
  public async getFullDocumentationContent(): Promise<{ handbook: string; apis: string }> {
    const docs = await this.getDocumentation();
    return {
      handbook: docs.handbook,
      apis: docs.apis
    };
  }
}
