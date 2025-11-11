import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface ILogger {
    log(message: string, data?: any): void;
    error(message: string, error?: any): void;
    warn(message: string, data?: any): void;
    info(message: string, data?: any): void;
    showOutputChannel(): void;
}

export class Logger implements ILogger {
    private outputChannel: vscode.OutputChannel;
    private logFilePath: string | null = null;
    private channelName: string;

    constructor(channelName: string) {
        this.channelName = channelName;
        this.outputChannel = vscode.window.createOutputChannel(channelName);
        this.initializeLogFile();
    }

    private initializeLogFile(): void {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            let logsDir: string;

            if (workspaceFolder) {
                logsDir = path.join(workspaceFolder, 'logs');
            } else {
                // No workspace folder, use temp directory
                logsDir = path.join(os.tmpdir(), 'sql-stress-test-logs');
            }

            // Create logs directory if it doesn't exist
            fs.mkdirSync(logsDir, { recursive: true });

            const dateStr = new Date().toISOString().split('T')[0];
            const logFileName = `${this.channelName.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.log`;
            this.logFilePath = path.join(logsDir, logFileName);
        } catch (error) {
            // If we can't create logs directory, log to temp directory
            try {
                const fallbackDir = path.join(os.tmpdir(), 'sql-stress-test-logs');
                fs.mkdirSync(fallbackDir, { recursive: true });
                const dateStr = new Date().toISOString().split('T')[0];
                const logFileName = `${this.channelName.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.log`;
                this.logFilePath = path.join(fallbackDir, logFileName);
            } catch (fallbackError) {
                console.error('Failed to initialize log file:', fallbackError);
                this.logFilePath = null;
            }
        }
    }

    private writeToFile(level: string, message: string, data?: any): void {
        if (!this.logFilePath) {
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] [${level}] ${message}${data ? ` | ${JSON.stringify(data)}` : ''}`;
            fs.appendFileSync(this.logFilePath, logMessage + '\n', 'utf8');
        } catch (error) {
            // Silently fail if file write fails
            console.error(`Failed to write to log file: ${error}`);
        }
    }

    log(message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}${data ? ` | ${JSON.stringify(data)}` : ''}`;
        this.outputChannel.appendLine(logMessage);
        console.log(`[${this.channelName}] ${logMessage}`);
        this.writeToFile('LOG', message, data);
    }

    error(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        const errorDetails = error ? {
            message: error?.message || String(error),
            stack: error?.stack,
            name: error?.name,
            code: error?.code,
            statusCode: error?.statusCode,
            response: error?.response
        } : undefined;
        const logMessage = `[${timestamp}] ERROR: ${message}${errorDetails ? ` | Error: ${JSON.stringify(errorDetails, null, 2)}` : ''}`;
        this.outputChannel.appendLine(logMessage);
        console.error(`[${this.channelName}] ${logMessage}`);
        this.writeToFile('ERROR', message, errorDetails);
    }

    warn(message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] WARN: ${message}${data ? ` | ${JSON.stringify(data)}` : ''}`;
        this.outputChannel.appendLine(logMessage);
        console.warn(`[${this.channelName}] ${logMessage}`);
        this.writeToFile('WARN', message, data);
    }

    info(message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] INFO: ${message}${data ? ` | ${JSON.stringify(data)}` : ''}`;
        this.outputChannel.appendLine(logMessage);
        console.info(`[${this.channelName}] ${logMessage}`);
        this.writeToFile('INFO', message, data);
    }

    showOutputChannel(): void {
        this.outputChannel.show();
    }
}

