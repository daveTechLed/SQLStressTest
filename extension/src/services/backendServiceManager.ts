import * as vscode from 'vscode';
import { ILogger } from './logger';
import { PathResolver } from './pathResolver';
import { PortFinder } from './portFinder';
import { HealthChecker } from './healthChecker';
import { ProcessManager } from './processManager';
import { LogDirectoryManager } from './logDirectoryManager';
import { IErrorDetectionService } from './interfaces/IErrorDetectionService';
import { IErrorNotificationService } from './interfaces/IErrorNotificationService';
import { ErrorDetectionService } from './errorDetectionService';
import { ErrorNotificationService } from './errorNotificationService';

export interface BackendServiceInfo {
    url: string;
    port: number;
    isRunning: boolean;
}

/**
 * Orchestrates backend service lifecycle using specialized services.
 * Single Responsibility: Coordination and orchestration only.
 */
export class BackendServiceManager {
    private readonly pathResolver: PathResolver;
    private readonly portFinder: PortFinder;
    private readonly healthChecker: HealthChecker;
    private readonly processManager: ProcessManager;
    private readonly logDirectoryManager: LogDirectoryManager;
    private readonly logger: ILogger;
    private readonly errorDetectionService: IErrorDetectionService;
    private readonly errorNotificationService: IErrorNotificationService;
    
    private backendUrl: string = '';
    private backendPort: number = 0;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private restartAttempts: number = 0;
    private readonly maxRestartAttempts: number = 3;
    private isShuttingDown: boolean = false;
    private startupCompleted: boolean = false;
    private startupError: Error | null = null;

    constructor(
        context: vscode.ExtensionContext,
        logger: ILogger,
        errorDetectionService?: IErrorDetectionService,
        errorNotificationService?: IErrorNotificationService
    ) {
        this.logger = logger;
        this.pathResolver = new PathResolver(context, logger);
        this.portFinder = new PortFinder(logger);
        this.healthChecker = new HealthChecker(logger);
        this.logDirectoryManager = new LogDirectoryManager(context, logger, this.pathResolver);
        this.processManager = new ProcessManager(context, logger, this.pathResolver, this.logDirectoryManager);
        this.errorDetectionService = errorDetectionService || new ErrorDetectionService(logger);
        this.errorNotificationService = errorNotificationService || new ErrorNotificationService(logger);
    }


    /**
     * Start the backend service
     */
    async start(): Promise<BackendServiceInfo> {
        this.logger.info('BackendServiceManager.start() called');
        console.log('[BackendServiceManager] start() method called');
        
        if (this.processManager.isRunning()) {
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
        let executablePath = this.pathResolver.getBackendExecutablePath();
        this.logger.info('Executable path lookup result', { path: executablePath || 'NOT FOUND' });
        console.log('[BackendServiceManager] Executable path result:', executablePath);
        
        if (!executablePath) {
            const errorMsg = 'Backend executable not found. Please ensure the extension is properly installed.';
            this.logger.error(errorMsg);
            console.error('[BackendServiceManager]', errorMsg);
            throw new Error(errorMsg);
        }
        
        // In development (F5), prefer dotnet run over bundled executable
        // Note: We need to check extensionContext, but pathResolver doesn't expose it
        // For now, use a simpler check
        const isF5Development = process.env.VSCODE_INJECTION === '1' || 
                                process.env.VSCODE_PID !== undefined;
        
        if (isF5Development && executablePath !== 'dotnet') {
            this.logger.info('F5 development mode detected, using dotnet run instead of bundled executable', {
                executablePath,
                extensionPath: this.pathResolver.getProjectRoot()
            });
            const devFallback = this.pathResolver.getDevelopmentFallbackPath();
            if (devFallback) {
                executablePath = devFallback;
                this.logger.info('Switched to development mode (dotnet run)');
            }
        }
        
        this.logger.info('Backend executable found', { path: executablePath, isF5Development });
        console.log('[BackendServiceManager] Executable found:', executablePath);

        // Find available port in reasonable range
        let attempts = 0;
        const maxPortAttempts = 3;
        while (attempts < maxPortAttempts) {
            this.backendPort = await this.portFinder.findAvailablePort();
            // Double-check the port is still available right before starting
            if (await this.portFinder.isPortAvailable(this.backendPort)) {
                break;
            }
            attempts++;
            this.logger.warn(`Port ${this.backendPort} became unavailable, trying again (attempt ${attempts}/${maxPortAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
        }
        
        if (attempts >= maxPortAttempts) {
            throw new Error(`Could not find an available port after ${maxPortAttempts} attempts. Please free up ports in range 5000-5100.`);
        }
        
        this.backendUrl = `http://localhost:${this.backendPort}`;
        this.logger.info(`Selected port ${this.backendPort} for backend service`);

        this.logger.info(`Starting backend service on port ${this.backendPort}`, {
            executable: executablePath,
            port: this.backendPort
        });

        // Reset startup tracking
        this.startupCompleted = false;
        this.startupError = null;

        // Start the process
        const backendProcess = await this.processManager.startProcess(executablePath, this.backendUrl, this.backendPort);
        const isDevelopmentMode = executablePath === 'dotnet';

        // Handle process exit
        backendProcess.on('exit', (code, signal) => {
            const stdoutBuffer = this.processManager.getStdoutBuffer();
            const stderrBuffer = this.processManager.getStderrBuffer();
            
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
            
            // Log full stderr if process exited with error
            if (code !== 0 && stderrBuffer.length > 0) {
                const fullError = stderrBuffer;
                const lastError = stderrBuffer.slice(-500);
                this.logger.error(`Backend stderr (full output): ${fullError}`);
                console.error(`[BackendServiceManager] Backend stderr (last 500 chars): ${lastError}`);
            }
            
            // Log full stdout for debugging
            if (stdoutBuffer.length > 0) {
                const fullOutput = stdoutBuffer;
                const lastOutput = stdoutBuffer.slice(-500);
                this.logger.info(`Backend stdout (full output): ${fullOutput}`);
                console.log(`[BackendServiceManager] Backend stdout (last 500 chars): ${lastOutput}`);
            }
            
            // Detect Extended Events failure (critical service)
            const extendedEventsError = this.errorDetectionService.detectExtendedEventsFailure(stdoutBuffer, stderrBuffer);
            if (extendedEventsError) {
                this.errorNotificationService.notifyExtendedEventsFailure(extendedEventsError, this.logger);
                this.restartAttempts = this.maxRestartAttempts; // Don't attempt restart for critical failures
                return; // Exit early, don't attempt restart
            }
            
            // Detect macOS Gatekeeper kill
            const isGatekeeperKill = this.errorDetectionService.detectGatekeeperKill(
                code,
                signal,
                stdoutBuffer,
                stderrBuffer,
                isDevelopmentMode
            );
            
            if (isGatekeeperKill) {
                this.logger.warn('Backend executable appears to have been killed by macOS Gatekeeper (unsigned executable). Consider using development mode (dotnet run) instead.');
                console.warn('[BackendServiceManager] Backend executable was killed by macOS security. This is likely because the executable is not code-signed. In development, use dotnet run instead.');
            }

            // Detect premature exit
            const prematureExitError = this.errorDetectionService.detectPrematureExit(
                code,
                signal,
                this.startupCompleted,
                this.isShuttingDown
            );
            
            if (prematureExitError) {
                prematureExitError.isGatekeeperKill = isGatekeeperKill;
                const errorMsg = isGatekeeperKill
                    ? `Backend executable was killed by macOS Gatekeeper (unsigned executable). Use development mode (dotnet run) instead.`
                    : prematureExitError.errorMessage;
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
                            this.errorNotificationService.notifyRestartFailure(
                                err?.message || String(err),
                                this.restartAttempts,
                                this.maxRestartAttempts
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
                this.errorNotificationService.notifyStartupFailure(
                    this.startupError?.message || 'Unknown error',
                    this.restartAttempts,
                    this.maxRestartAttempts
                );
            }
        });

        // Handle process errors
        backendProcess.on('error', (error) => {
            const spawnError = this.errorDetectionService.detectSpawnFailure(error);
            if (spawnError) {
                this.logger.error('Failed to start backend process', {
                    error: spawnError.errorMessage,
                    code: spawnError.code,
                    errno: spawnError.errno,
                    syscall: spawnError.syscall,
                    path: spawnError.path
                });
                this.startupError = error;
                
                // Don't auto-restart on process spawn errors
                if (!this.isShuttingDown) {
                    this.restartAttempts = this.maxRestartAttempts;
                    this.errorNotificationService.notifySpawnFailure(spawnError);
                }
            }
        });

        // Wait for backend to be ready
        try {
            await this.healthChecker.waitForBackendReady(
                this.backendUrl,
                () => this.processManager.isRunning()
            );
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
                processRunning: this.processManager.isRunning()
            });
            
            // If process is still running, kill it
            if (this.processManager.isRunning()) {
                this.logger.info('Terminating backend process that failed to become ready');
                await this.processManager.stopProcess();
            }
            
            // The exit handler will handle restart logic
            throw error;
        }
    }

    /**
     * Start periodic health checks
     */
    private startHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            if (this.processManager.isRunning()) {
                const isHealthy = await this.healthChecker.checkHealth(this.backendUrl);
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

        await this.processManager.stopProcess();
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
        return this.processManager.isRunning();
    }

    /**
     * Dispose resources
     */
    async dispose(): Promise<void> {
        await this.stop();
    }
}

