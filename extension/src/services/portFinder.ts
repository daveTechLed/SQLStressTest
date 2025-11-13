import * as http from 'http';
import { ILogger } from './logger';

/**
 * Service responsible for finding available ports.
 * Single Responsibility: Port management only.
 */
export class PortFinder {
    constructor(
        private readonly logger: ILogger,
        private readonly minPort: number = 5000,
        private readonly maxPort: number = 5100
    ) {}

    /**
     * Find an available port in the configured port range
     * Searches from minPort to maxPort to find a free port
     */
    async findAvailablePort(): Promise<number> {
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
    isPortAvailable(port: number): Promise<boolean> {
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
}

