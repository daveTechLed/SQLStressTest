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
    getLogFilePath(): string | null;
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
            // Try to find project root (where masterun.ps1 or .git exists)
            // This ensures logs go to the same place as backend logs
            let logsDir: string;
            let projectRoot: string | null = null;
            
            // Method 1: Try to find project root from compiled extension location
            // When running, __dirname will be: extension/out/services/logger.js
            // Project root is: extension/../ (3 levels up)
            const extensionOutPath = __dirname; // e.g., /path/to/extension/out/services
            const possibleProjectRoot = path.resolve(extensionOutPath, '..', '..', '..');
            
            // Check if this is the project root
            if (fs.existsSync(path.join(possibleProjectRoot, 'masterun.ps1')) || 
                fs.existsSync(path.join(possibleProjectRoot, '.git'))) {
                projectRoot = possibleProjectRoot;
            } else {
                // Method 2: Walk up from current directory to find project root
                let currentPath = extensionOutPath;
                for (let i = 0; i < 6; i++) {
                    const masterScript = path.join(currentPath, 'masterun.ps1');
                    const gitFolder = path.join(currentPath, '.git');
                    if (fs.existsSync(masterScript) || fs.existsSync(gitFolder)) {
                        projectRoot = currentPath;
                        break;
                    }
                    const parent = path.dirname(currentPath);
                    if (parent === currentPath) break;
                    currentPath = parent;
                }
            }
            
            if (projectRoot) {
                logsDir = path.join(projectRoot, 'logs');
            } else {
                // Fallback to workspace folder
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceFolder) {
                logsDir = path.join(workspaceFolder, 'logs');
            } else {
                    // Last resort: use temp directory
                logsDir = path.join(os.tmpdir(), 'sql-stress-test-logs');
                }
            }

            // Create logs directory if it doesn't exist
            fs.mkdirSync(logsDir, { recursive: true });

            // Generate unique log file name with timestamp for each execution
            // Format: sql-stress-test---extension-YYYYMMDD-HHMMSS.log (matching backend format)
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
            const logFileName = `${this.channelName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.log`;
            this.logFilePath = path.join(logsDir, logFileName);
            
            // Write initial log entry
            this.writeToFile('INFO', `Logger initialized. Log file: ${this.logFilePath}`);
        } catch (error) {
            // If we can't create logs directory, log to temp directory
            try {
                const fallbackDir = path.join(os.tmpdir(), 'sql-stress-test-logs');
                fs.mkdirSync(fallbackDir, { recursive: true });
                const dateStr = new Date().toISOString().split('T')[0];
                const logFileName = `${this.channelName.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.log`;
                this.logFilePath = path.join(fallbackDir, logFileName);
                this.writeToFile('WARN', `Using fallback log directory: ${this.logFilePath}`);
            } catch (fallbackError) {
                console.error('Failed to initialize log file:', fallbackError);
                this.logFilePath = null;
            }
        }
        
        // Clean up old log files (keep only last 50 execution logs)
        if (this.logFilePath) {
            try {
                const logDir = path.dirname(this.logFilePath);
                const logPrefix = `${this.channelName.toLowerCase().replace(/\s+/g, '-')}-`;
                const oldLogFiles = fs.readdirSync(logDir)
                    .filter(f => f.startsWith(logPrefix) && f.endsWith('.log'))
                    .map(f => path.join(logDir, f))
                    .filter(f => {
                        try {
                            return fs.statSync(f).isFile();
                        } catch {
                            return false;
                        }
                    })
                    .sort((a, b) => {
                        try {
                            return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
                        } catch {
                            return 0;
                        }
                    })
                    .slice(50); // Keep only last 50
                
                for (const oldFile of oldLogFiles) {
                    try {
                        fs.unlinkSync(oldFile);
                    } catch {
                        // Ignore errors when deleting old log files
                    }
                }
            } catch {
                // Ignore errors during log cleanup
            }
        }
    }
    
    /**
     * Get the log file path (for external access)
     */
    getLogFilePath(): string | null {
        return this.logFilePath;
    }

    private writeToFile(level: string, message: string, data?: any): void {
        if (!this.logFilePath) {
            return;
        }

        try {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] [${level}] ${message}${data ? ` | ${JSON.stringify(data, null, 2)}` : ''}`;
            fs.appendFileSync(this.logFilePath, logMessage + '\n', 'utf8');
        } catch (error) {
            // Try to log the error, but don't throw
            try {
                const errorMsg = `Failed to write to log file: ${error}`;
                console.error(`[${this.channelName}] ${errorMsg}`);
                // Try to write to a fallback location
                const fallbackPath = path.join(require('os').tmpdir(), 'sql-stress-test-log-error.txt');
                fs.appendFileSync(fallbackPath, `${new Date().toISOString()} ${errorMsg}\n`, 'utf8');
            } catch {
                // If even that fails, silently continue
            }
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

