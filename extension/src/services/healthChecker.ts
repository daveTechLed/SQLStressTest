import * as http from 'http';
import { ILogger } from './logger';

/**
 * Service responsible for checking backend health.
 * Single Responsibility: Health checking only.
 */
export class HealthChecker {
    constructor(private readonly logger: ILogger) {}

    /**
     * Check backend health by making a simple HTTP request
     * Uses a GET request to root or a non-existent endpoint - we just need to verify the server responds
     */
    async checkHealth(backendUrl: string): Promise<boolean> {
        return new Promise((resolve) => {
            // Use root path or a simple endpoint that accepts GET
            // We're just checking if the server is responding, not testing the actual endpoint
            const request = http.get(`${backendUrl}/`, { timeout: 1000 }, (res) => {
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
     * Wait for backend to be ready by checking health endpoint
     */
    async waitForBackendReady(
        backendUrl: string,
        isProcessRunning: () => boolean,
        maxWaitTime: number = 30000
    ): Promise<void> {
        const startTime = Date.now();
        const checkInterval = 500; // Check every 500ms
        let lastError: Error | null = null;

        return new Promise((resolve, reject) => {
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
                    const isReady = await this.checkHealth(backendUrl);
                    if (isReady) {
                        this.logger.info(`Backend is ready on ${backendUrl}`);
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
}

