import { ConnectionConfig } from '../storage';

/**
 * Interface for managing SQL Server connections.
 * Single Responsibility: Connection CRUD operations.
 */
export interface IConnectionManagerService {
    /**
     * Load all connections from storage.
     */
    loadConnections(): Promise<ConnectionConfig[]>;

    /**
     * Add a new connection.
     */
    addConnection(connection: ConnectionConfig): Promise<void>;

    /**
     * Update an existing connection.
     */
    updateConnection(id: string, connection: ConnectionConfig): Promise<void>;

    /**
     * Delete a connection by ID.
     */
    deleteConnection(id: string): Promise<void>;

    /**
     * Get a connection by ID.
     */
    getConnectionById(id: string): Promise<ConnectionConfig | undefined>;
}

