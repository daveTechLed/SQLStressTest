import * as vscode from 'vscode';

export interface ConnectionConfig {
    id: string;
    name: string;
    server: string;
    database?: string;
    username?: string;
    password?: string;
    integratedSecurity?: boolean;
    port?: number;
}

const STORAGE_KEY = 'sqlStressTest.connections';

export class StorageService {
    constructor(private context: vscode.ExtensionContext) {}

    async saveConnections(connections: ConnectionConfig[]): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY, connections);
    }

    async loadConnections(): Promise<ConnectionConfig[]> {
        const connections = this.context.workspaceState.get<ConnectionConfig[]>(STORAGE_KEY, []);
        return connections;
    }

    async addConnection(connection: ConnectionConfig): Promise<void> {
        const connections = await this.loadConnections();
        connections.push(connection);
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

