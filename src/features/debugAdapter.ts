/**
 * Logtalk Debug Adapter
 *
 * This module implements a minimal Debug Adapter Protocol (DAP) handler
 * that translates VS Code debug commands (Step Over, Step Into, Step Out, Continue)
 * to terminal commands for the Logtalk debugger tool.
 *
 * The Logtalk debugger is a terminal-based, interactive debugger that uses
 * single-character commands at leashed ports:
 * - 'c' (creep) - Step Into: go on to the next port
 * - 's' (skip) - Step Over: skip tracing for the current goal
 * - 'l' (leap) - Continue: continue execution until the next breakpoint
 * - 'f' (fail) - forces backtracking
 * - 'r' (retry) - retry the current goal
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DebugProtocol } from '@vscode/debugprotocol';
import LogtalkTerminal from './terminal';
import { getLogger } from '../utils/logger';
import { SymbolUtils } from '../utils/symbols';
import { ArgumentUtils } from '../utils/argumentUtils';

const logger = getLogger();

/**
 * Interface representing the current debug state parsed from .debug_info file
 */
export interface DebugState {
    file: string;
    line: number;
    head: string;
}

/**
 * Singleton class to manage debug state across the extension
 * This allows the file watcher to update the state and the debug adapter to read it
 * Maintains a call stack of debug states
 */
export class DebugStateManager {
    private static _instance: DebugStateManager | undefined;
    private _stack: DebugState[] = [];
    private _onStateChanged = new vscode.EventEmitter<DebugState | undefined>();

    public readonly onStateChanged: vscode.Event<DebugState | undefined> = this._onStateChanged.event;

    private constructor() {}

    public static getInstance(): DebugStateManager {
        if (!DebugStateManager._instance) {
            DebugStateManager._instance = new DebugStateManager();
        }
        return DebugStateManager._instance;
    }

    /**
     * Get the current (top of stack) debug state
     */
    public get state(): DebugState | undefined {
        return this._stack.length > 0 ? this._stack[this._stack.length - 1] : undefined;
    }

    /**
     * Get the full call stack
     */
    public get stack(): DebugState[] {
        return this._stack;
    }

    /**
     * Push a new state onto the call stack
     */
    public updateState(state: DebugState | undefined): void {
        if (state) {
            this._stack.push(state);
            this._onStateChanged.fire(state);
            logger.debug(`Debug state pushed: ${state.file}:${state.line} - ${state.head} (stack depth: ${this._stack.length})`);
        }
    }

    /**
     * Clear the entire call stack
     */
    public clearState(): void {
        this._stack = [];
        this._onStateChanged.fire(undefined);
        logger.debug('Debug state stack cleared');
    }

    /**
     * Parse debug info from file content
     * Format: File:<path>;Line:<line>;Head:<head>
     */
    public static parseDebugInfo(content: string): DebugState | null {
        const match = content.match(/File:(.+);Line:(\d+);Head:(.+)/);
        if (!match) {
            return null;
        }

        let fileName = match[1].trim();
        // Handle Windows double-slash forms
        fileName = fileName.replace(/\\\\/g, '/').replace(/\\/g, '/');
        if (fileName.startsWith('//') && process.platform === 'win32') {
            fileName = fileName.substring(1);
        }

        return {
            file: fileName,
            line: parseInt(match[2]),
            head: match[3].trim()
        };
    }
}

/**
 * Logtalk Debug Session
 * Implements vscode.DebugAdapter to handle DAP messages
 */
export class LogtalkDebugSession implements vscode.DebugAdapter {

    // Some backends don't support unbuffered input, so we need to send a newline after each port command
    private static _enterPortCommand: string = LogtalkDebugSession.computeEnterPortCommand();
    private static _configListener: vscode.Disposable | undefined = LogtalkDebugSession.registerConfigListener();

    public static get enterPortCommand(): string {
        return LogtalkDebugSession._enterPortCommand;
    }

    private static computeEnterPortCommand(): string {
        const backend = vscode.workspace.getConfiguration('logtalk').get<string>('backend');
        return backend === 'ciao' || backend === 'sicstus' || backend === 'tau' || backend === 'xsb' || backend === 'yap' ? '\r' : '';
    }

    private static registerConfigListener(): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('logtalk.backend')) {
                LogtalkDebugSession._enterPortCommand = LogtalkDebugSession.computeEnterPortCommand();
            }
        });
    }

    private sendMessage = new vscode.EventEmitter<DebugProtocol.ProtocolMessage>();
    readonly onDidSendMessage: vscode.Event<DebugProtocol.ProtocolMessage> = this.sendMessage.event;

    private sequence = 1;
    private isDebugging = false;

    // Reference to the debug state manager for accessing current debug info
    private debugStateManager = DebugStateManager.getInstance();

    // Scope reference IDs for variables
    private static readonly SCOPE_ARGUMENTS = 1;

    /**
     * Handle incoming DAP messages from VS Code
     */
    handleMessage(message: DebugProtocol.ProtocolMessage): void {
        if (message.type === 'request') {
            const request = message as DebugProtocol.Request;
            this.handleRequest(request);
        }
    }

    /**
     * Handle DAP requests
     */
    private handleRequest(request: DebugProtocol.Request): void {
        logger.debug(`Debug Adapter received request: ${request.command}`);

        switch (request.command) {
            case 'initialize':
                this.handleInitialize(request);
                break;
            case 'launch':
                this.handleLaunch(request);
                break;
            case 'attach':
                this.handleAttach(request);
                break;
            case 'disconnect':
                this.handleDisconnect(request);
                break;
            case 'terminate':
                this.handleTerminate(request);
                break;
            case 'continue':
                this.handleContinue(request);
                break;
            case 'next':  // Step Over
                this.handleNext(request);
                break;
            case 'stepIn':
                this.handleStepIn(request);
                break;
            case 'stepOut':
                this.handleStepOut(request);
                break;
            case 'pause':
                this.handlePause(request);
                break;
            case 'threads':
                this.handleThreads(request);
                break;
            case 'stackTrace':
                this.handleStackTrace(request);
                break;
            case 'scopes':
                this.handleScopes(request);
                break;
            case 'variables':
                this.handleVariables(request);
                break;
            case 'setBreakpoints':
                this.handleSetBreakpoints(request);
                break;
            case 'setFunctionBreakpoints':
                this.handleSetFunctionBreakpoints(request);
                break;
            case 'configurationDone':
                this.handleConfigurationDone(request);
                break;
            default:
                this.sendErrorResponse(request, `Unknown command: ${request.command}`);
        }
    }

    /**
     * Initialize the debug adapter
     */
    private handleInitialize(request: DebugProtocol.Request): void {
        const response: DebugProtocol.InitializeResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                supportsConfigurationDoneRequest: true,
                supportsFunctionBreakpoints: true,
                supportsConditionalBreakpoints: true,
                supportsHitConditionalBreakpoints: true,
                supportsLogPoints: true,
                supportsTerminateRequest: true,
                supportTerminateDebuggee: false,
                supportsStepBack: false,
                supportsSetVariable: false,
                supportsRestartFrame: false,
                supportsGotoTargetsRequest: false,
                supportsStepInTargetsRequest: false,
                supportsCompletionsRequest: false,
                supportsModulesRequest: false,
                supportsExceptionOptions: false,
                supportsValueFormattingOptions: false,
                supportsExceptionInfoRequest: false,
                supportsSingleThreadExecutionRequests: false
            }
        };
        this.sendMessage.fire(response);

        // Send initialized event
        const initializedEvent: DebugProtocol.InitializedEvent = {
            seq: this.sequence++,
            type: 'event',
            event: 'initialized'
        };
        this.sendMessage.fire(initializedEvent);
    }

    /**
     * Handle launch request - start debugging
     */
    private handleLaunch(request: DebugProtocol.Request): void {
        this.isDebugging = true;

        // Ensure the Logtalk terminal exists and start debugging
        LogtalkTerminal.createLogtalkTerm();
        LogtalkTerminal.sendString('logtalk_make(debug), vscode::debug.\r');

        this.sendResponse(request);

        // Focus the terminal after a short delay to override VS Code's default focus on debug console
        setTimeout(() => {
            LogtalkTerminal.focusTerminal();
        }, 100);
    }

    /**
     * Handle attach request - attach to existing debug session
     */
    private handleAttach(request: DebugProtocol.Request): void {
        this.isDebugging = true;

        // Just ensure the terminal exists, assume debugging is already active
        LogtalkTerminal.createLogtalkTerm();

        this.sendResponse(request);
    }

    /**
     * Handle disconnect request - end debug session
     */
    private handleDisconnect(request: DebugProtocol.Request): void {
        this.isDebugging = false;
        //LogtalkTerminal.sendString('vscode::nodebug.\r');
        this.sendResponse(request);
        this.sendTerminatedEvent();
    }

    /**
     * Handle terminate request - stop debugging
     */
    private handleTerminate(request: DebugProtocol.Request): void {
        this.isDebugging = false;
        LogtalkTerminal.sendString('logtalk_make(normal), vscode::nodebug.\r');
        this.sendResponse(request);
        this.sendTerminatedEvent();
    }

    /**
     * Send a terminated event to VS Code to end the debug session
     */
    private sendTerminatedEvent(): void {
        const event: DebugProtocol.TerminatedEvent = {
            seq: this.sequence++,
            type: 'event',
            event: 'terminated'
        };
        this.sendMessage.fire(event);
    }

    /**
     * Handle continue request - send 'l' (leap) to terminal
     * Leap continues execution until the next breakpoint
     */
    private handleContinue(request: DebugProtocol.Request): void {
        LogtalkTerminal.sendString('l' + LogtalkDebugSession.enterPortCommand);

        const response: DebugProtocol.ContinueResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                allThreadsContinued: true
            }
        };
        this.sendMessage.fire(response);

        // Send a stopped event after a short delay to re-enable stepping controls
        // The Logtalk debugger will stop at the next breakpoint or port
        setTimeout(() => this.sendStoppedEvent('breakpoint'), 100);
    }

    /**
     * Handle next (Step Over) request - send 's' (skip) to terminal
     * Skip skips tracing for the current goal
     */
    private handleNext(request: DebugProtocol.Request): void {
        LogtalkTerminal.sendString('s' + LogtalkDebugSession.enterPortCommand);
        this.sendResponse(request);

        // Send a stopped event after the step completes
        setTimeout(() => this.sendStoppedEvent('step'), 100);
    }

    /**
     * Handle stepIn request - send 'c' (creep) to terminal
     * Creep moves to the next port (step into)
     */
    private handleStepIn(request: DebugProtocol.Request): void {
        LogtalkTerminal.sendString('c' + LogtalkDebugSession.enterPortCommand);
        this.sendResponse(request);

        // Send a stopped event after the step completes
        setTimeout(() => this.sendStoppedEvent('step'), 100);
    }

    /**
     * Handle stepOut request - send 's' (skip) to terminal
     * Skip the current goal to effectively step out
     */
    private handleStepOut(request: DebugProtocol.Request): void {
        // Use 's' (skip) to skip the current goal
        // This is the closest equivalent to step out in the Logtalk debugger
        LogtalkTerminal.sendString('s' + LogtalkDebugSession.enterPortCommand);
        this.sendResponse(request);

        // Send a stopped event after the step completes
        setTimeout(() => this.sendStoppedEvent('step'), 100);
    }

    /**
     * Handle pause request - not directly supported
     * The Logtalk debugger pauses at leashed ports automatically
     */
    private handlePause(request: DebugProtocol.Request): void {
        // The Logtalk debugger pauses at breakpoints, not on demand
        this.sendResponse(request);
    }

    /**
     * Handle threads request - return a single thread
     * Logtalk debugging is single-threaded from DAP perspective
     */
    private handleThreads(request: DebugProtocol.Request): void {
        const response: DebugProtocol.ThreadsResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                threads: [
                    { id: 1, name: 'Logtalk' }
                ]
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Handle stack trace request
     * Uses the full debug state stack to provide file, line, and clause head information
     */
    private handleStackTrace(request: DebugProtocol.Request): void {
        const stack = this.debugStateManager.stack;

        let stackFrames: DebugProtocol.StackFrame[];

        if (stack.length > 0) {
            // Build stack frames from the debug state stack (most recent first)
            stackFrames = stack.slice().reverse().map((state, index) => ({
                id: index + 1,
                name: state.head,
                line: state.line,
                column: 1,
                source: {
                    name: path.basename(state.file),
                    path: state.file
                }
            }));
        } else {
            // No debug state yet - return minimal info
            stackFrames = [{
                id: 1,
                name: 'Logtalk Debugger',
                line: 0,
                column: 0
            }];
        }

        const response: DebugProtocol.StackTraceResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                stackFrames: stackFrames,
                totalFrames: stackFrames.length
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Handle scopes request - return scope with predicate/non-terminal indicator when we have debug state
     */
    private handleScopes(request: DebugProtocol.Request): void {
        const state = this.debugStateManager.state;

        let scopes: DebugProtocol.Scope[] = [];

        if (state && state.head) {
            // Compute the predicate/non-terminal indicator from the head
            const indicator = this.computeIndicatorFromHead(state.head, state.file, state.line);
            scopes = [{
                name: indicator,
                variablesReference: LogtalkDebugSession.SCOPE_ARGUMENTS,
                expensive: false
            }];
        }

        const response: DebugProtocol.ScopesResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                scopes: scopes
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Compute the predicate or non-terminal indicator from a clause head
     * For predicates: foo/3, for non-terminals: bar//2
     */
    private computeIndicatorFromHead(head: string, filePath: string, lineNumber: number): string {
        try {
            // Read the source file to determine if it's a predicate or non-terminal
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split(/\r?\n/);
                if (lineNumber >= 1 && lineNumber <= lines.length) {
                    const lineText = lines[lineNumber - 1];
                    // Check if this line contains a DCG rule (non-terminal)
                    if (lineText.includes('-->')) {
                        // It's a non-terminal - use // notation
                        const name = this.extractPredicateName(head);
                        const arity = this.countArguments(head);
                        return `${name}//${arity}`;
                    }
                }
            }
        } catch (error) {
            logger.debug(`Error determining indicator type: ${error}`);
        }

        // Default to predicate indicator
        const name = this.extractPredicateName(head);
        const arity = this.countArguments(head);
        return `${name}/${arity}`;
    }

    /**
     * Extract the predicate/non-terminal name from a head
     */
    private extractPredicateName(head: string): string {
        const openParen = head.indexOf('(');
        if (openParen === -1) {
            return head.trim();
        }
        return head.substring(0, openParen).trim();
    }

    /**
     * Count the number of arguments in a head
     */
    private countArguments(head: string): number {
        const openParen = head.indexOf('(');
        if (openParen === -1) {
            return 0;
        }

        const closeParen = ArgumentUtils.findMatchingCloseParen(head, openParen);
        if (closeParen === -1) {
            return 0;
        }

        const argsText = head.substring(openParen + 1, closeParen);
        if (argsText.trim() === '') {
            return 0;
        }

        const args = ArgumentUtils.parseArguments(argsText);
        return args.length;
    }

    /**
     * Handle variables request - return clause argument bindings
     *
     * This extracts argument names from the source code clause head and matches
     * them with the bound values from the .debug_info head.
     */
    private handleVariables(request: DebugProtocol.Request): void {
        const args = request.arguments as DebugProtocol.VariablesArguments;
        let variables: DebugProtocol.Variable[] = [];

        // Only process if this is the Arguments scope
        if (args.variablesReference === LogtalkDebugSession.SCOPE_ARGUMENTS) {
            variables = this.extractClauseVariables();
        }

        const response: DebugProtocol.VariablesResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                variables: variables
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Extract clause variables by comparing source clause head with debug info head
     *
     * The source clause head contains argument names (e.g., "foo(X, Y, Z)")
     * The debug info head contains bound values (e.g., "foo(1, 2, [a,b,c])")
     */
    private extractClauseVariables(): DebugProtocol.Variable[] {
        const state = this.debugStateManager.state;
        if (!state) {
            return [];
        }

        try {
            // Read the source file to get the clause head with argument names
            const sourceHeadArgs = this.extractArgumentNamesFromSource(state.file, state.line);

            // Parse the bound values from the debug info head
            const boundValues = this.extractArgumentValues(state.head);

            if (!sourceHeadArgs || !boundValues || sourceHeadArgs.length !== boundValues.length) {
                // Fallback: just show the debug head arguments without names
                return boundValues?.map((value, index) => ({
                    name: `arg${index + 1}`,
                    value: value,
                    variablesReference: 0
                })) || [];
            }

            // Match argument names with bound values
            return sourceHeadArgs.map((name, index) => ({
                name: name,
                value: boundValues[index],
                variablesReference: 0
            }));
        } catch (error) {
            logger.error(`Error extracting clause variables: ${error}`);
            return [];
        }
    }

    /**
     * Extract argument names from the source file clause head at the given line
     */
    private extractArgumentNamesFromSource(filePath: string, lineNumber: number): string[] | null {
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split(/\r?\n/);

            if (lineNumber < 1 || lineNumber > lines.length) {
                return null;
            }

            // Get the line (1-based index)
            const lineText = lines[lineNumber - 1];

            // Try to extract the clause head
            // First check if it's a predicate clause
            let head = SymbolUtils.extractCompletePredicateHead(lineText);

            // If not a predicate, check if it's a non-terminal (DCG rule)
            if (!head) {
                head = SymbolUtils.extractCompleteNonTerminalHead(lineText);
            }

            if (!head) {
                return null;
            }

            // Extract argument names from the head
            return this.extractArgumentNames(head);
        } catch (error) {
            logger.debug(`Error reading source file for argument names: ${error}`);
            return null;
        }
    }

    /**
     * Extract argument names from a clause head (e.g., "foo(X, Y, Z)" -> ["X", "Y", "Z"])
     */
    private extractArgumentNames(head: string): string[] {
        const openParen = head.indexOf('(');
        if (openParen === -1) {
            return []; // No arguments (zero-arity predicate)
        }

        const closeParen = ArgumentUtils.findMatchingCloseParen(head, openParen);
        if (closeParen === -1) {
            return [];
        }

        const argsText = head.substring(openParen + 1, closeParen);
        const args = ArgumentUtils.parseArguments(argsText);

        // Extract the variable name from each argument
        // For simple variables, this is just the variable itself
        // For compound terms, we extract the outermost variable or use the whole term
        return args.map(arg => this.extractVariableName(arg));
    }

    /**
     * Extract the variable name from an argument
     * If the argument is a simple variable, return it
     * If it's a compound term, return a descriptive name
     */
    private extractVariableName(arg: string): string {
        const trimmed = arg.trim();

        // Check if it's a simple variable (starts with uppercase or underscore)
        if (/^[A-Z_][A-Za-z0-9_]*$/.test(trimmed)) {
            return trimmed;
        }

        // For compound terms or lists, try to find the main variable
        // e.g., "Foo-Bar" might have variable names, "[H|T]" has H and T
        // Just return the argument as-is for display
        return trimmed;
    }

    /**
     * Extract argument values from the debug info head
     * (e.g., "foo(1, 2, [a,b,c])" -> ["1", "2", "[a,b,c]"])
     */
    private extractArgumentValues(head: string): string[] | null {
        const openParen = head.indexOf('(');
        if (openParen === -1) {
            return []; // No arguments
        }

        const closeParen = ArgumentUtils.findMatchingCloseParen(head, openParen);
        if (closeParen === -1) {
            return null;
        }

        const argsText = head.substring(openParen + 1, closeParen);
        return ArgumentUtils.parseArguments(argsText);
    }

    /**
     * Handle setBreakpoints request
     * Breakpoints are already handled by the extension via LogtalkTerminal.processBreakpoints
     */
    private handleSetBreakpoints(request: DebugProtocol.Request): void {
        const args = request.arguments as DebugProtocol.SetBreakpointsArguments;
        const breakpoints = (args.breakpoints || []).map((bp, index) => ({
            id: index + 1,
            verified: true,
            line: bp.line
        }));

        const response: DebugProtocol.SetBreakpointsResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                breakpoints: breakpoints
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Handle setFunctionBreakpoints request
     */
    private handleSetFunctionBreakpoints(request: DebugProtocol.Request): void {
        const args = request.arguments as DebugProtocol.SetFunctionBreakpointsArguments;
        const breakpoints = (args.breakpoints || []).map((_bp, index) => ({
            id: index + 1,
            verified: true
        }));

        const response: DebugProtocol.SetFunctionBreakpointsResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                breakpoints: breakpoints
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Handle configurationDone request
     * After configuration is done, send a stopped event to enable stepping controls
     */
    private handleConfigurationDone(request: DebugProtocol.Request): void {
        this.sendResponse(request);

        // Send a stopped event to put the debugger in "stopped" state
        // This enables the stepping controls in VS Code
        this.sendStoppedEvent('entry', 'Logtalk debugger ready');
    }

    /**
     * Send a stopped event to VS Code
     * This signals that the debugger has stopped and enables stepping controls
     */
    private sendStoppedEvent(reason: string, description?: string): void {
        const event: DebugProtocol.StoppedEvent = {
            seq: this.sequence++,
            type: 'event',
            event: 'stopped',
            body: {
                reason: reason,
                description: description,
                threadId: 1,
                allThreadsStopped: true
            }
        };
        this.sendMessage.fire(event);
    }

    /**
     * Send a simple success response
     */
    private sendResponse(request: DebugProtocol.Request): void {
        const response: DebugProtocol.Response = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true
        };
        this.sendMessage.fire(response);
    }

    /**
     * Send an error response
     */
    private sendErrorResponse(request: DebugProtocol.Request, message: string): void {
        const response: DebugProtocol.Response = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: false,
            message: message
        };
        this.sendMessage.fire(response);
    }

    /**
     * Dispose of the debug session
     */
    dispose(): void {
        this.sendMessage.dispose();
    }
}

/**
 * Debug Adapter Descriptor Factory
 * Creates inline debug adapter instances
 */
export class LogtalkDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(
        _session: vscode.DebugSession,
        _executable: vscode.DebugAdapterExecutable | undefined
    ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        // Return an inline implementation
        return new vscode.DebugAdapterInlineImplementation(new LogtalkDebugSession());
    }
}

/**
 * Debug Configuration Provider
 * Provides default debug configurations without requiring launch.json
 */
export class LogtalkDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
     * Provide initial debug configurations for launch.json
     */
    provideDebugConfigurations(
        _folder: vscode.WorkspaceFolder | undefined,
        _token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
        return [
            {
                type: 'logtalk',
                request: 'launch',
                name: 'Logtalk Debug'
            }
        ];
    }

    /**
     * Resolve a debug configuration before starting
     * This allows starting debugging without a launch.json
     */
    resolveDebugConfiguration(
        _folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // If there's already an active Logtalk debug session, cancel a new one
        if (vscode.debug.activeDebugSession?.type === 'logtalk') {
            return undefined;
        }

        // Lazily create a workspace launch.json with the fixed Logtalk
        // configuration if it does not exist. This ensures the Run & Debug
        // dropdown shows "Logtalk Debug" when the user first starts debugging.
        try {
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0) {
                const wsPath = folders[0].uri.fsPath;
                const vscodeDir = path.join(wsPath, '.vscode');
                const launchPath = path.join(vscodeDir, 'launch.json');
                if (!fs.existsSync(launchPath)) {
                    if (!fs.existsSync(vscodeDir)) {
                        fs.mkdirSync(vscodeDir);
                    }
                    const launch = {
                        version: '0.2.0',
                        configurations: [
                            {
                                type: 'logtalk',
                                request: 'launch',
                                name: 'Logtalk Debug',
                                internalConsoleOptions: 'neverOpen'
                            }
                        ]
                    };
                    fs.writeFileSync(launchPath, JSON.stringify(launch, null, 2), 'utf8');
                }
            }
        } catch (e) {
            // ignore errors
        }

        // Always return the fixed, default Logtalk configuration.
        return {
            type: 'logtalk',
            request: 'launch',
            name: 'Logtalk Debug'
        };
    }

    /**
     * Resolve debug configuration with substituted variables
     */
    resolveDebugConfigurationWithSubstitutedVariables(
        _folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        return config;
    }
}

