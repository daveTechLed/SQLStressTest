import * as vscode from 'vscode';
import { ConnectionConfig } from './storage';

const STORAGE_KEY_CONNECTIONS = 'sqlStressTest.connections';

/**
 * Service responsible for managing connection storage.
 * Single Responsibility: Connection storage operations only.
 */
export class ConnectionStorageService {
    constructor(private context: vscode.ExtensionContext) {}

    async saveConnections(connections: ConnectionConfig[]): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY_CONNECTIONS, connections);
    }

    async loadConnections(): Promise<ConnectionConfig[]> {
        const connections = this.context.workspaceState.get<ConnectionConfig[]>(STORAGE_KEY_CONNECTIONS, []);
        return connections;
    }

    async addConnection(connection: ConnectionConfig): Promise<void> {
        const connections = await this.loadConnections();
        // Check if connection already exists (by ID)
        const existingIndex = connections.findIndex(c => c.id === connection.id);
        if (existingIndex >= 0) {
            // Update existing connection
            connections[existingIndex] = connection;
        } else {
            // Add new connection
            connections.push(connection);
        }
        await this.saveConnections(connections);
    }

    async removeConnection(id: string): Promise<void> {
        const connections = await this.loadConnections();
        const filtered = connections.filter(c => c.id !== id);
        await this.saveConnections(filtered);
    }

    async updateConnection(id: string, connection: ConnectionConfig): Promise<void> {
        const connections = await this.loadConnections();
        const index = connections.findIndex(c => c.id === id);
        if (index >= 0) {
            connections[index] = connection;
            await this.saveConnections(connections);
        }
    }

    async getConnection(id: string): Promise<ConnectionConfig | undefined> {
        const connections = await this.loadConnections();
        return connections.find(c => c.id === id);
    }
}

