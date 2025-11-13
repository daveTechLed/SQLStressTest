import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ILogger } from './logger';

/**
 * Service responsible for resolving file system paths for backend executables and project roots.
 * Single Responsibility: Path resolution only.
 */
export class PathResolver {
    constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly logger: ILogger
    ) {}

    /**
     * Get the platform-specific backend executable path
     */
    getBackendExecutablePath(): string | null {
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
     */
    findProjectRoot(startPath: string): string | null {
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
    getProjectRoot(): string | null {
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
    getDevelopmentFallbackPath(): string | null {
        // Use the robust project root detection
        const projectRoot = this.getProjectRoot();
        if (!projectRoot) {
            return null;
        }
        
        const backendProjectPath = path.join(projectRoot, 'backend', 'SQLStressTest.Service', 'SQLStressTest.Service.csproj');
        
        // Check if backend project exists
        if (fs.existsSync(backendProjectPath)) {
            // Return 'dotnet' as a special marker - we'll handle this in process manager
            return 'dotnet';
        }
        
        return null;
    }
}

