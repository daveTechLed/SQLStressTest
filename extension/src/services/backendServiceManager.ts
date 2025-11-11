import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { ILogger } from './logger';
import * as http from 'http';

export interface BackendServiceInfo {
    url: string;
    port: number;
    isRunning: boolean;
}

export class BackendServiceManager {
    private backendProcess: ChildProcess | null = null;
    private readonly extensionContext: vscode.ExtensionContext;
    private readonly logger: ILogger;
    private backendUrl: string = '';
    private backendPort: number = 0;
    // Port range for finding available ports (reasonable block: 5000-5100)
    private readonly minPort: number = 5000;
    private readonly maxPort: number = 5100;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private restartAttempts: number = 0;
    private readonly maxRestartAttempts: number = 3;
    private isShuttingDown: boolean = false;
    private startupCompleted: boolean = false;
    private startupError: Error | null = null;

    constructor(context: vscode.ExtensionContext, logger: ILogger) {
        this.extensionContext = context;
        this.logger = logger;
    }

    /**
     * Get the platform-specific backend executable path
     */
    private getBackendExecutablePath(): string | null {
        const platform = os.platform();
        const arch = os.arch();
        
        // Map platform/arch to VS Code extension platform identifiers
        let platformDir: string;
        if (platform === 'win32') {
            platformDir = 'win32-x64';
        } else if (platform === 'darwin') {
            if (arch === 'arm64') {
                platformDir = 'darwin-arm64';
            } else {
                platformDir = 'darwin-x64';
            }
        } else if (platform === 'linux') {
            platformDir = 'linux-x64';
        } else {
            this.logger.error(`Unsupported platform: ${platform} ${arch}`);
            return null;
        }

        // Get extension path and construct backend executable path
        const extensionPath = this.extensionContext.extensionPath;
        const backendPath = path.join(extensionPath, 'resources', 'backend', platformDir);
        
        // Determine executable name based on platform
        const executableName = platform === 'win32' 
            ? 'SQLStressTest.Service.exe' 
            : 'SQLStressTest.Service';
        
        const fullPath = path.join(backendPath, executableName);
        
        // Check if executable exists
        if (!fs.existsSync(fullPath)) {
            this.logger.warn(`Backend executable not found at: ${fullPath}`);
            
            // Development fallback: try to use dotnet run if in development
            // This allows development without needing to build executables first
            const devFallback = this.getDevelopmentFallbackPath();
            if (devFallback) {
                this.logger.info(`Using development fallback: ${devFallback}`);
                return devFallback;
            }
            
            this.logger.error(`Backend executable not found and no development fallback available`);
            return null;
        }

        // On Unix systems, ensure executable has execute permissions
        if (platform !== 'win32') {
            try {
                fs.chmodSync(fullPath, 0o755);
            } catch (error) {
                this.logger.warn(`Failed to set executable permissions: ${error}`);
            }
        }

        return fullPath;
    }

    /**
     * Find project root by walking up directory tree from extension path
     * Looks for masterun.ps1 or .git folder to identify project root
     * @param startPath Starting path to search from (typically extensionPath)
     * @returns Project root path or null if not found
     */
    private findProjectRoot(startPath: string): string | null {
        let currentPath = path.resolve(startPath);
        const maxDepth = 10; // Prevent infinite loops
        let depth = 0;

        this.logger.info('Searching for project root', { startPath, currentPath });

        while (depth < maxDepth) {
            // Check for project root markers
            const masterScript = path.join(currentPath, 'masterun.ps1');
            const gitFolder = path.join(currentPath, '.git');

            this.logger.log('Checking path for project root', {
                path: currentPath,
                hasMasterScript: fs.existsSync(masterScript),
                hasGitFolder: fs.existsSync(gitFolder)
            });

            if (fs.existsSync(masterScript) || fs.existsSync(gitFolder)) {
                this.logger.info('Found project root', {
                    projectRoot: currentPath,
                    depth,
                    marker: fs.existsSync(masterScript) ? 'masterun.ps1' : '.git'
                });
                return currentPath;
            }

            // Move up one directory
            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) {
                // Reached filesystem root
                this.logger.warn('Reached filesystem root without finding project root', {
                    lastChecked: currentPath
                });
                break;
            }
            currentPath = parentPath;
            depth++;
        }

        this.logger.warn('Project root not found by walking directory tree', {
            startPath,
            maxDepth,
            lastChecked: currentPath
        });

        return null;
    }

    /**
     * Get project root with fallbacks
     * Tries: 1) Walking from extension path, 2) Workspace folder, 3) null
     */
    private getProjectRoot(): string | null {
        const extensionPath = this.extensionContext.extensionPath;
        
        // Method 1: Walk up from extension path
        const foundRoot = this.findProjectRoot(extensionPath);
        if (foundRoot) {
            return foundRoot;
        }

        // Method 2: Try workspace folder as fallback
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceFolder) {
            // Verify workspace folder has project markers
            const masterScript = path.join(workspaceFolder, 'masterun.ps1');
            const gitFolder = path.join(workspaceFolder, '.git');
            if (fs.existsSync(masterScript) || fs.existsSync(gitFolder)) {
                this.logger.info('Using workspace folder as project root', {
                    workspaceFolder,
                    marker: fs.existsSync(masterScript) ? 'masterun.ps1' : '.git'
                });
                return workspaceFolder;
            }
        }

        this.logger.error('Could not determine project root', {
            extensionPath,
            workspaceFolder
        });

        return null;
    }

    /**
     * Get development fallback path for backend
     * Looks for backend in development build location or uses dotnet run
     */
    private getDevelopmentFallbackPath(): string | null {
        // Use the robust project root detection
        const projectRoot = this.getProjectRoot();
        if (!projectRoot) {
            return null;
        }
        
        const backendProjectPath = path.join(projectRoot, 'backend', 'SQLStressTest.Service', 'SQLStressTest.Service.csproj');
        
        // Check if backend project exists
        if (fs.existsSync(backendProjectPath)) {
            // Return 'dotnet' as a special marker - we'll handle this in start()
            return 'dotnet';
        }
        
        return null;
    }

    /**
     * Find an available port in the configured port range
     * Searches from minPort to maxPort to find a free port
     */
    private async findAvailablePort(): Promise<number> {
        this.logger.info(`Searching for available port in range ${this.minPort}-${this.maxPort}`);
        
        // Try ports in the range sequentially
        for (let port = this.minPort; port <= this.maxPort; port++) {
            if (await this.isPortAvailable(port)) {
                this.logger.info(`Found available port: ${port}`);
                return port;
            }
        }
        
        // If no port found in range, throw error
        throw new Error(
            `No available port found in range ${this.minPort}-${this.maxPort}. ` +
            `Please free up a port in this range or check for other running instances.`
        );
    }

    /**
     * Check if a port is available
     * Creates a temporary server to test if the port can be bound
     */
    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = http.createServer();
            const timeout = setTimeout(() => {
                server.close();
                resolve(false);
            }, 1000); // 1 second timeout
            
            server.listen(port, '127.0.0.1', () => {
                clearTimeout(timeout);
                server.once('close', () => resolve(true));
                server.close();
            });
            server.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }

    /**
     * Start the backend service
     */
    async start(): Promise<BackendServiceInfo> {
        this.logger.info('BackendServiceManager.start() called');
        console.log('[BackendServiceManager] start() method called');
        
        if (this.backendProcess && !this.backendProcess.killed) {
            this.logger.warn('Backend service is already running');
            console.log('[BackendServiceManager] Backend already running');
            return {
                url: this.backendUrl,
                port: this.backendPort,
                isRunning: true
            };
        }

        this.logger.info('Getting backend executable path...');
        console.log('[BackendServiceManager] Getting executable path...');
        let executablePath = this.getBackendExecutablePath();
        this.logger.info('Executable path lookup result', { path: executablePath || 'NOT FOUND' });
        console.log('[BackendServiceManager] Executable path result:', executablePath);
        
        if (!executablePath) {
            const errorMsg = 'Backend executable not found. Please ensure the extension is properly installed.';
            this.logger.error(errorMsg);
            console.error('[BackendServiceManager]', errorMsg);
            throw new Error(errorMsg);
        }
        
        // In development (F5), prefer dotnet run over bundled executable
        // Bundled executables may be unsigned and killed by macOS Gatekeeper
        const isF5Development = process.env.VSCODE_INJECTION === '1' || 
                                process.env.VSCODE_PID !== undefined ||
                                this.extensionContext.extensionPath.includes('/extension/out');
        
        if (isF5Development && executablePath !== 'dotnet') {
            this.logger.info('F5 development mode detected, using dotnet run instead of bundled executable', {
                executablePath,
                extensionPath: this.extensionContext.extensionPath
            });
            const devFallback = this.getDevelopmentFallbackPath();
            if (devFallback) {
                executablePath = devFallback;
                this.logger.info('Switched to development mode (dotnet run)');
            }
        }
        
        this.logger.info('Backend executable found', { path: executablePath, isF5Development });
        console.log('[BackendServiceManager] Executable found:', executablePath);

        // Find available port in reasonable range
        // Try multiple times to avoid race conditions
        let attempts = 0;
        const maxPortAttempts = 3;
        while (attempts < maxPortAttempts) {
            this.backendPort = await this.findAvailablePort();
            // Double-check the port is still available right before starting
            if (await this.isPortAvailable(this.backendPort)) {
                break;
            }
            attempts++;
            this.logger.warn(`Port ${this.backendPort} became unavailable, trying again (attempt ${attempts}/${maxPortAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
        }
        
        if (attempts >= maxPortAttempts) {
            throw new Error(`Could not find an available port after ${maxPortAttempts} attempts. Please free up ports in range ${this.minPort}-${this.maxPort}.`);
        }
        
        this.backendUrl = `http://localhost:${this.backendPort}`;
        this.logger.info(`Selected port ${this.backendPort} for backend service`);

        this.logger.info(`Starting backend service on port ${this.backendPort}`, {
            executable: executablePath,
            port: this.backendPort
        });

        // Get extension log directory
        const logDir = this.getLogDirectory();
        this.logger.info('Backend logs will be written to', { logDirectory: logDir });
        
        // Determine if we're using dotnet run (development fallback)
        const isDevelopmentMode = executablePath === 'dotnet';
        let command: string;
        let args: string[];
        let cwd: string;
        
        if (isDevelopmentMode) {
            // Development mode: use dotnet run
            const projectRoot = this.getProjectRoot();
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
                '--urls', this.backendUrl,
                '--environment', 'Development'
            ];
        } else {
            // Production mode: use bundled executable
            command = executablePath;
            args = [
                '--urls', this.backendUrl,
                '--environment', 'Production'
            ];
            
            // Set working directory to project root so backend can find masterun.ps1 or .git
            // This allows the backend to locate the logs directory correctly
            const projectRoot = this.getProjectRoot();
            
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

        this.backendProcess = spawn(command, args, {
            cwd: cwd,
            env: {
                ...process.env,
                ASPNETCORE_URLS: this.backendUrl,
                ASPNETCORE_ENVIRONMENT: isDevelopmentMode ? 'Development' : 'Production',
                // Set log directory via environment variable if backend supports it
                LOG_DIR: logDir
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Capture all output for debugging
        let stdoutBuffer = '';
        let stderrBuffer = '';

        // Handle stdout - write to both logger and console
        this.backendProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            stdoutBuffer += output;
            const trimmed = output.trim();
            if (trimmed) {
                // Write to logger (goes to Output Panel and log file)
                this.logger.log(`[Backend STDOUT] ${trimmed}`);
                // Also write to console for Developer Console
                console.log(`[Backend STDOUT] ${trimmed}`);
            }
        });

        // Handle stderr - write to both logger and console
        this.backendProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            stderrBuffer += output;
            const trimmed = output.trim();
            if (trimmed) {
                // Write to logger (goes to Output Panel and log file)
                this.logger.error(`[Backend STDERR] ${trimmed}`);
                // Also write to console for Developer Console
                console.error(`[Backend STDERR] ${trimmed}`);
            }
        });

        // Reset startup tracking
        this.startupCompleted = false;
        this.startupError = null;

        // Handle process exit
        this.backendProcess.on('exit', (code, signal) => {
            this.logger.warn(`Backend process exited`, { 
                code, 
                signal, 
                startupCompleted: this.startupCompleted,
                restartAttempts: this.restartAttempts,
                url: this.backendUrl,
                port: this.backendPort,
                stdoutLength: stdoutBuffer.length,
                stderrLength: stderrBuffer.length,
                isDevelopmentMode,
                executablePath
            });
            
            // Log full stderr if process exited with error (write to log file)
            if (code !== 0 && stderrBuffer.length > 0) {
                const fullError = stderrBuffer;
                const lastError = stderrBuffer.slice(-500);
                // Log full error to file via logger (includes full buffer)
                this.logger.error(`Backend stderr (full output): ${fullError}`);
                // Also log last 500 chars for console visibility
                console.error(`[BackendServiceManager] Backend stderr (last 500 chars): ${lastError}`);
            }
            
            // Log full stdout for debugging (write to log file)
            if (stdoutBuffer.length > 0) {
                const fullOutput = stdoutBuffer;
                const lastOutput = stdoutBuffer.slice(-500);
                // Log full output to file via logger (includes full buffer)
                this.logger.info(`Backend stdout (full output): ${fullOutput}`);
                // Also log last 500 chars for console visibility
                console.log(`[BackendServiceManager] Backend stdout (last 500 chars): ${lastOutput}`);
            }
            
            // Detect macOS Gatekeeper kill (SIGKILL with code 137 or null)
            // This happens when an unsigned executable is rejected by macOS
            const isGatekeeperKill = (signal === 'SIGKILL' && (code === null || code === 137)) && 
                                     !isDevelopmentMode && 
                                     stdoutBuffer.length === 0 && 
                                     stderrBuffer.length === 0;
            
            if (isGatekeeperKill) {
                this.logger.warn('Backend executable appears to have been killed by macOS Gatekeeper (unsigned executable). Consider using development mode (dotnet run) instead.');
                console.warn('[BackendServiceManager] Backend executable was killed by macOS security. This is likely because the executable is not code-signed. In development, use dotnet run instead.');
            }
            
            const processExited = this.backendProcess;
            this.backendProcess = null;

            // If process exited before startup completed, it's a failure
            if (!this.startupCompleted && !this.isShuttingDown) {
                const errorMsg = isGatekeeperKill
                    ? `Backend executable was killed by macOS Gatekeeper (unsigned executable). Use development mode (dotnet run) instead.`
                    : `Backend process exited with code ${code} before startup completed`;
                this.startupError = new Error(errorMsg);
                this.logger.error('Backend process exited before startup completed', { 
                    code, 
                    signal,
                    url: this.backendUrl,
                    port: this.backendPort,
                    isGatekeeperKill
                });
            }

            // Auto-restart if not intentionally shut down and within retry limits
            if (!this.isShuttingDown && this.restartAttempts < this.maxRestartAttempts) {
                this.restartAttempts++;
                this.logger.info(`Attempting to restart backend (attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);
                setTimeout(() => {
                    this.start().catch((err) => {
                        this.logger.error('Failed to restart backend', err);
                        if (this.restartAttempts >= this.maxRestartAttempts) {
                            vscode.window.showErrorMessage(
                                `Backend service failed to start after ${this.maxRestartAttempts} attempts. Error: ${err?.message || String(err)}. Please check the logs.`
                            );
                        }
                    });
                }, 2000);
            } else if (this.restartAttempts >= this.maxRestartAttempts && !this.isShuttingDown) {
                this.logger.error(`Backend failed to start after ${this.maxRestartAttempts} attempts`, {
                    lastError: this.startupError?.message,
                    url: this.backendUrl,
                    port: this.backendPort
                });
                const errorMsg = this.startupError 
                    ? `Backend service failed to start after ${this.maxRestartAttempts} attempts. Last error: ${this.startupError.message}. Please check the logs.`
                    : `Backend service failed to start after ${this.maxRestartAttempts} attempts. Please check the logs.`;
                vscode.window.showErrorMessage(errorMsg);
            }
        });

        // Handle process errors (e.g., executable not found, permission denied)
        this.backendProcess.on('error', (error) => {
            this.logger.error('Failed to start backend process', {
                error: error.message,
                code: (error as any).code,
                errno: (error as any).errno,
                syscall: (error as any).syscall,
                path: (error as any).path
            });
            this.backendProcess = null;
            this.startupError = error;
            
            // Don't auto-restart on process spawn errors - these are usually configuration issues
            if (!this.isShuttingDown) {
                this.restartAttempts = this.maxRestartAttempts; // Prevent further retries
                vscode.window.showErrorMessage(
                    `Failed to start backend process: ${error.message}. Please check that the backend executable exists and has proper permissions.`
                );
            }
        });

        // Wait for backend to be ready with better error handling
        try {
            await this.waitForBackendReady();
            this.startupCompleted = true;
            
            // Start health check monitoring
            this.startHealthCheck();

            this.restartAttempts = 0; // Reset on successful start

            this.logger.info('Backend service started successfully', {
                url: this.backendUrl,
                port: this.backendPort
            });

            return {
                url: this.backendUrl,
                port: this.backendPort,
                isRunning: true
            };
        } catch (error: any) {
            this.startupCompleted = false;
            this.startupError = error;
            this.logger.error('Backend failed to become ready', {
                error: error?.message || String(error),
                port: this.backendPort,
                url: this.backendUrl,
                processRunning: this.backendProcess !== null && !this.backendProcess.killed
            });
            
            // If process is still running, kill it
            if (this.backendProcess && !this.backendProcess.killed) {
                this.logger.info('Terminating backend process that failed to become ready');
                this.backendProcess.kill();
            }
            
            // The exit handler will handle restart logic
            throw error;
        }
    }

    /**
     * Wait for backend to be ready by checking health endpoint
     */
    private async waitForBackendReady(maxWaitTime: number = 30000): Promise<void> {
        const startTime = Date.now();
        const checkInterval = 500; // Check every 500ms
        let lastError: Error | null = null;

        return new Promise((resolve, reject) => {
            // Check if process is still running
            const isProcessRunning = () => {
                return this.backendProcess !== null && !this.backendProcess.killed;
            };

            const checkHealth = async () => {
                // Check if process exited
                if (!isProcessRunning()) {
                    const errorMsg = lastError 
                        ? `Backend process exited before becoming ready. Last error: ${lastError.message}`
                        : 'Backend process exited before becoming ready';
                    reject(new Error(errorMsg));
                    return;
                }

                if (Date.now() - startTime > maxWaitTime) {
                    const errorMsg = lastError
                        ? `Backend failed to start within ${maxWaitTime}ms timeout. Last error: ${lastError.message}`
                        : `Backend failed to start within ${maxWaitTime}ms timeout`;
                    reject(new Error(errorMsg));
                    return;
                }

                try {
                    const isReady = await this.checkHealth();
                    if (isReady) {
                        this.logger.info(`Backend is ready on ${this.backendUrl}`);
                        resolve();
                    } else {
                        setTimeout(checkHealth, checkInterval);
                    }
                } catch (error: any) {
                    lastError = error;
                    // Continue checking unless process has exited
                    if (isProcessRunning()) {
                        setTimeout(checkHealth, checkInterval);
                    } else {
                        reject(new Error(`Backend process exited: ${error?.message || String(error)}`));
                    }
                }
            };

            // Start checking after a short delay to give process time to start
            setTimeout(checkHealth, 1000);
        });
    }

    /**
     * Check backend health by making a simple HTTP request
     * Uses a GET request to root or a non-existent endpoint - we just need to verify the server responds
     */
    private async checkHealth(): Promise<boolean> {
        return new Promise((resolve) => {
            // Use root path or a simple endpoint that accepts GET
            // We're just checking if the server is responding, not testing the actual endpoint
            const request = http.get(`${this.backendUrl}/`, { timeout: 1000 }, (res) => {
                // Any response (200, 404, etc.) means the server is up and running
                resolve(res.statusCode !== undefined);
            });

            request.on('error', () => {
                resolve(false);
            });

            request.on('timeout', () => {
                request.destroy();
                resolve(false);
            });
        });
    }

    /**
     * Start periodic health checks
     */
    private startHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            if (this.backendProcess && !this.backendProcess.killed) {
                const isHealthy = await this.checkHealth();
                if (!isHealthy) {
                    this.logger.warn('Backend health check failed');
                    // Process exit handler will handle restart
                }
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Stop the backend service
     */
    async stop(): Promise<void> {
        this.isShuttingDown = true;

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

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
     * Get the backend URL
     */
    getBackendUrl(): string {
        return this.backendUrl;
    }

    /**
     * Check if backend is running
     */
    isRunning(): boolean {
        return this.backendProcess !== null && !this.backendProcess.killed;
    }

    /**
     * Get log directory for backend logs
     * Always uses project root logs directory to match backend's log location
     */
    private getLogDirectory(): string {
        // Try to find project root (where masterun.ps1 or .git exists)
        const extensionPath = this.extensionContext.extensionPath;
        // Extension path is: /path/to/SQLStressTest/extension
        // Project root is: /path/to/SQLStressTest (one level up)
        let projectRoot = path.resolve(extensionPath, '..');
        
        // Verify this is the project root by checking for masterun.ps1 or .git
        const hasMasterScript = fs.existsSync(path.join(projectRoot, 'masterun.ps1'));
        const hasGitFolder = fs.existsSync(path.join(projectRoot, '.git'));
        
        if (hasMasterScript || hasGitFolder) {
            const projectLogsDir = path.join(projectRoot, 'logs');
            // Ensure directory exists
            try {
                fs.mkdirSync(projectLogsDir, { recursive: true });
                this.logger.info('Using project root logs directory for backend', { 
                    projectRoot,
                    logDirectory: projectLogsDir 
                });
                return projectLogsDir;
            } catch (error) {
                this.logger.error('Failed to create project logs directory', { 
                    error,
                    projectRoot,
                    attemptedPath: projectLogsDir 
                });
            }
        } else {
            // Try walking up to find project root
            let currentPath = projectRoot;
            for (let i = 0; i < 3; i++) {
                const masterScript = path.join(currentPath, 'masterun.ps1');
                const gitFolder = path.join(currentPath, '.git');
                if (fs.existsSync(masterScript) || fs.existsSync(gitFolder)) {
                    projectRoot = currentPath;
                    const projectLogsDir = path.join(projectRoot, 'logs');
                    try {
                        fs.mkdirSync(projectLogsDir, { recursive: true });
                        this.logger.info('Found project root by walking up directory tree', { 
                            projectRoot,
                            logDirectory: projectLogsDir 
                        });
                        return projectLogsDir;
                    } catch (error) {
                        this.logger.error('Failed to create project logs directory after finding root', { error });
                    }
                    break;
                }
                const parent = path.dirname(currentPath);
                if (parent === currentPath) break;
                currentPath = parent;
            }
        }
        
        // Fallback to workspace folder (should also be project root in most cases)
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceFolder) {
            const workspaceLogsDir = path.join(workspaceFolder, 'logs');
            try {
                fs.mkdirSync(workspaceLogsDir, { recursive: true });
                this.logger.warn('Using workspace folder logs directory (project root not found)', { 
                    workspaceFolder,
                    logDirectory: workspaceLogsDir 
                });
                return workspaceLogsDir;
            } catch (error) {
                this.logger.error('Failed to create workspace logs directory', { error });
            }
        }
        
        // Last resort: use temp directory (should never happen in normal operation)
        const tempLogsDir = path.join(require('os').tmpdir(), 'sql-stress-test-logs');
        try {
            fs.mkdirSync(tempLogsDir, { recursive: true });
            this.logger.error('Using temp directory for logs (project root and workspace not found)', { 
                tempDirectory: tempLogsDir,
                extensionPath,
                attemptedProjectRoot: path.resolve(extensionPath, '..')
            });
            return tempLogsDir;
        } catch (error) {
            this.logger.error('Failed to create temp logs directory', { error });
            // Absolute last resort
            return require('os').tmpdir();
        }
    }

    /**
     * Dispose resources
     */
    async dispose(): Promise<void> {
        await this.stop();
    }
}

