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
import { DebugProtocol } from '@vscode/debugprotocol';
import LogtalkTerminal from './terminal';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/**
 * Logtalk Debug Session
 * Implements vscode.DebugAdapter to handle DAP messages
 */
export class LogtalkDebugSession implements vscode.DebugAdapter {

    // Some backends don't support unbuffered input, so we need to send a newline after each port command
    public static enterPortCommand: string = (() => {
        const backend = vscode.workspace.getConfiguration('logtalk').get<string>('backend');
        return backend === 'ciao' || backend === 'sicstus' || backend === 'tau' || backend === 'xsb' || backend === 'yap' ? '\r' : '';
    })();

    private sendMessage = new vscode.EventEmitter<DebugProtocol.ProtocolMessage>();
    readonly onDidSendMessage: vscode.Event<DebugProtocol.ProtocolMessage> = this.sendMessage.event;

    private sequence = 1;
    private isDebugging = false;

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
     * We don't have access to the actual stack, return minimal info
     */
    private handleStackTrace(request: DebugProtocol.Request): void {
        const response: DebugProtocol.StackTraceResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                stackFrames: [
                    {
                        id: 1,
                        name: 'Logtalk Debugger',
                        line: 0,
                        column: 0
                    }
                ],
                totalFrames: 1
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Handle scopes request - return empty scopes
     */
    private handleScopes(request: DebugProtocol.Request): void {
        const response: DebugProtocol.ScopesResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                scopes: []
            }
        };
        this.sendMessage.fire(response);
    }

    /**
     * Handle variables request - return empty variables
     */
    private handleVariables(request: DebugProtocol.Request): void {
        const response: DebugProtocol.VariablesResponse = {
            seq: this.sequence++,
            type: 'response',
            request_seq: request.seq,
            command: request.command,
            success: true,
            body: {
                variables: []
            }
        };
        this.sendMessage.fire(response);
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
        // Check if there's already an active Logtalk debug session
        // Logtalk only supports a single debugging session at a time
        if (vscode.debug.activeDebugSession?.type === 'logtalk') {
            // Return undefined to cancel the new session - existing session continues
            return undefined;
        }

        // If no launch.json or empty config, provide a default
        if (!config.type && !config.request && !config.name) {
            return {
                type: 'logtalk',
                request: 'launch',
                name: 'Logtalk Debug'
            };
        }
        return config;
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

