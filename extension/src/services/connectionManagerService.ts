import { StorageService, ConnectionConfig } from './storage';
import { IConnectionManagerService } from './interfaces/IConnectionManagerService';
import { ILogger } from './logger';

/**
 * Service responsible for managing SQL Server connections.
 * Single Responsibility: Connection CRUD operations.
 */
export class ConnectionManagerService implements IConnectionManagerService {
    constructor(
        private readonly storageService: StorageService,
        private readonly logger: ILogger
    ) {}

    async loadConnections(): Promise<ConnectionConfig[]> {
        this.logger.log('Loading connections');
        return await this.storageService.loadConnections();
    }

    async addConnection(connection: ConnectionConfig): Promise<void> {
        this.logger.log('Adding connection', { id: connection.id, name: connection.name });
        await this.storageService.addConnection(connection);
        this.logger.log('Connection added successfully', { id: connection.id });
    }

    async updateConnection(id: string, connection: ConnectionConfig): Promise<void> {
        this.logger.log('Updating connection', { id, name: connection.name });
        await this.storageService.updateConnection(id, connection);
        this.logger.log('Connection updated successfully', { id });
    }

    async deleteConnection(id: string): Promise<void> {
        this.logger.log('Deleting connection', { id });
        await this.storageService.removeConnection(id);
        this.logger.log('Connection deleted successfully', { id });
    }

    async getConnectionById(id: string): Promise<ConnectionConfig | undefined> {
        this.logger.log('Getting connection by ID', { id });
        return await this.storageService.getConnection(id);
    }
}

