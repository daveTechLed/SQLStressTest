import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ILogger } from './logger';
import { PathResolver } from './pathResolver';
import { LogDirectoryManager } from './logDirectoryManager';
import { IProcessSpawner } from './interfaces/IProcessSpawner';
import { ProcessSpawner } from './processSpawner';

/**
 * Service responsible for managing backend process lifecycle.
 * Single Responsibility: Process management only.
 */
export class ProcessManager {
    private backendProcess: ChildProcess | null = null;
    private stdoutBuffer = '';
    private stderrBuffer = '';
    private readonly processSpawner: IProcessSpawner;

    constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly logger: ILogger,
        private readonly pathResolver: PathResolver,
        private readonly logDirectoryManager: LogDirectoryManager,
        processSpawner?: IProcessSpawner
    ) {
        this.processSpawner = processSpawner || new ProcessSpawner();
    }

    /**
     * Start the backend process
     */
    async startProcess(
        executablePath: string,
        backendUrl: string,
        backendPort: number
    ): Promise<ChildProcess> {
        // Get extension log directory
        const logDir = this.logDirectoryManager.getLogDirectory();
        this.logger.info('Backend logs will be written to', { logDirectory: logDir });
        
        // Determine if we're using dotnet run (development fallback)
        const isDevelopmentMode = executablePath === 'dotnet';
        let command: string;
        let args: string[];
        let cwd: string;
        
        if (isDevelopmentMode) {
            // Development mode: use dotnet run
            const projectRoot = this.pathResolver.getProjectRoot();
            if (!projectRoot) {
                throw new Error('Could not determine project root for development mode');
            }
            
            const backendProjectPath = path.join(projectRoot, 'backend', 'SQLStressTest.Service');
            
            // Check if backend project exists
            if (!fs.existsSync(path.join(backendProjectPath, 'SQLStressTest.Service.csproj'))) {
                const altBackendPath = path.resolve(projectRoot, 'backend', 'SQLStressTest.Service');
                if (fs.existsSync(path.join(altBackendPath, 'SQLStressTest.Service.csproj'))) {
                    cwd = altBackendPath;
                } else {
                    throw new Error(`Backend project not found for development mode. Checked: ${backendProjectPath} and ${altBackendPath}`);
                }
            } else {
                cwd = backendProjectPath;
            }
            
            this.logger.info('Development mode: using backend project directory', {
                backendProjectPath: cwd,
                projectRoot
            });
            
            command = 'dotnet';
            args = [
                'run',
                '--configuration', 'Debug',
                '--',
                '--urls', backendUrl,
                '--environment', 'Development'
            ];
        } else {
            // Production mode: use bundled executable
            command = executablePath;
            args = [
                '--urls', backendUrl,
                '--environment', 'Production'
            ];
            
            // Set working directory to project root so backend can find masterun.ps1 or .git
            const projectRoot = this.pathResolver.getProjectRoot();
            
            if (projectRoot) {
                cwd = projectRoot;
                this.logger.info('Using project root as working directory for backend', { 
                    projectRoot,
                    executable: executablePath
                });
            } else {
                // Fallback to executable directory if project root not found
                cwd = path.dirname(executablePath);
                this.logger.warn('Project root not found, using executable directory as working directory', {
                    executableDir: cwd,
                    extensionPath: this.extensionContext.extensionPath,
                    workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });
            }
        }

        this.logger.info(`Starting backend with command: ${command} ${args.join(' ')}`, {
            command,
            args,
            cwd,
            isDevelopmentMode
        });

        // Reset buffers
        this.stdoutBuffer = '';
        this.stderrBuffer = '';

        this.backendProcess = this.processSpawner.spawn(command, args, {
            cwd: cwd,
            env: {
                ...process.env,
                ASPNETCORE_URLS: backendUrl,
                ASPNETCORE_ENVIRONMENT: isDevelopmentMode ? 'Development' : 'Production',
                LOG_DIR: logDir
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Handle stdout - write to both logger and console
        this.backendProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            this.stdoutBuffer += output;
            const trimmed = output.trim();
            if (trimmed) {
                this.logger.log(`[Backend STDOUT] ${trimmed}`);
                console.log(`[Backend STDOUT] ${trimmed}`);
            }
        });

        // Handle stderr - write to both logger and console
        this.backendProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            this.stderrBuffer += output;
            const trimmed = output.trim();
            if (trimmed) {
                this.logger.error(`[Backend STDERR] ${trimmed}`);
                console.error(`[Backend STDERR] ${trimmed}`);
            }
        });

        return this.backendProcess;
    }

    /**
     * Get the current process
     */
    getProcess(): ChildProcess | null {
        return this.backendProcess;
    }

    /**
     * Check if process is running
     */
    isRunning(): boolean {
        return this.backendProcess !== null && !this.backendProcess.killed;
    }

    /**
     * Stop the backend process
     */
    async stopProcess(): Promise<void> {
        if (this.backendProcess && !this.backendProcess.killed) {
            this.logger.info('Stopping backend service');
            
            return new Promise((resolve) => {
                if (!this.backendProcess) {
                    resolve();
                    return;
                }

                const timeout = setTimeout(() => {
                    if (this.backendProcess && !this.backendProcess.killed) {
                        this.logger.warn('Backend did not exit gracefully, forcing termination');
                        this.backendProcess.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);

                this.backendProcess.once('exit', () => {
                    clearTimeout(timeout);
                    this.backendProcess = null;
                    this.logger.info('Backend service stopped');
                    resolve();
                });

                // Try graceful shutdown first
                if (process.platform === 'win32') {
                    this.backendProcess.kill();
                } else {
                    this.backendProcess.kill('SIGTERM');
                }
            });
        }
    }

    /**
     * Get stdout buffer
     */
    getStdoutBuffer(): string {
        return this.stdoutBuffer;
    }

    /**
     * Get stderr buffer
     */
    getStderrBuffer(): string {
        return this.stderrBuffer;
    }

    /**
     * Clear buffers
     */
    clearBuffers(): void {
        this.stdoutBuffer = '';
        this.stderrBuffer = '';
    }
}

