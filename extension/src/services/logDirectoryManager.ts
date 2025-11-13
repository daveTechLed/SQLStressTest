import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ILogger } from './logger';
import { PathResolver } from './pathResolver';

/**
 * Service responsible for managing log directory paths.
 * Single Responsibility: Log directory management only.
 */
export class LogDirectoryManager {
    constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly logger: ILogger,
        private readonly pathResolver: PathResolver
    ) {}

    /**
     * Get log directory for backend logs
     * Always uses project root logs directory to match backend's log location
     */
    getLogDirectory(): string {
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
}

