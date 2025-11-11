import * as vscode from 'vscode';
import { StorageService, ConnectionConfig } from '../services/storage';
import { HttpClient } from '../services/httpClient';
import { WebSocketClient } from '../services/websocketClient';
import { ILogger, Logger } from '../services/logger';

export class SqlServerExplorer implements vscode.TreeDataProvider<ServerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ServerTreeItem | undefined | null | void> = new vscode.EventEmitter<ServerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ServerTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private storageService: StorageService;
    private httpClient: HttpClient;
    private connections: ConnectionConfig[] = [];
    private logger: ILogger;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - SQL Explorer');
        this.storageService = new StorageService(context);
        this.httpClient = new HttpClient(undefined, this.logger);
        this.logger.log('SqlServerExplorer initialized');
        this.loadConnections();
    }

    private async loadConnections(): Promise<void> {
        this.connections = await this.storageService.loadConnections();
        this.logger.log('Connections loaded', { count: this.connections.length });
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ServerTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ServerTreeItem): Promise<ServerTreeItem[]> {
        if (!element) {
            // Root level - show all servers
            return this.connections.map(conn => new ServerTreeItem(
                conn.name,
                conn.server,
                conn.id,
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        if (element.contextValue === 'server') {
            // Server level - show databases (placeholder for now)
            return [
                new ServerTreeItem('Databases', '', '', vscode.TreeItemCollapsibleState.None, 'database')
            ];
        }

        return [];
    }

    async addServer(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter server name',
            placeHolder: 'My SQL Server'
        });

        if (!name) {
            return;
        }

        const server = await vscode.window.showInputBox({
            prompt: 'Enter server address',
            placeHolder: 'localhost'
        });

        if (!server) {
            return;
        }

        const database = await vscode.window.showInputBox({
            prompt: 'Enter database name (optional)',
            placeHolder: 'master'
        });

        const useIntegrated = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            { placeHolder: 'Use Windows Authentication?' }
        );

        let username: string | undefined;
        let password: string | undefined;

        if (useIntegrated === 'No') {
            username = await vscode.window.showInputBox({
                prompt: 'Enter username'
            });

            if (username) {
                password = await vscode.window.showInputBox({
                    prompt: 'Enter password',
                    password: true
                });
            }
        }

        const connection: ConnectionConfig = {
            id: `conn_${Date.now()}`,
            name,
            server,
            database,
            username,
            password,
            integratedSecurity: useIntegrated === 'Yes'
        };

        await this.storageService.addConnection(connection);
        this.logger.log('Connection added', { name: connection.name, server: connection.server });
        await this.loadConnections();
    }

    async removeServer(item: ServerTreeItem): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to remove ${item.label}?`,
            'Yes',
            'No'
        );

        if (result === 'Yes') {
            await this.storageService.removeConnection(item.connectionId);
            this.logger.log('Connection removed', { name: item.label, connectionId: item.connectionId });
            await this.loadConnections();
        }
    }

    async editServer(item: ServerTreeItem): Promise<void> {
        const connection = await this.storageService.getConnection(item.connectionId);
        if (!connection) {
            this.logger.error('Connection not found for edit', { connectionId: item.connectionId });
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        this.logger.log('Edit server requested', { name: connection.name, connectionId: item.connectionId });
        // For now, just show a message - full edit UI can be added later
        vscode.window.showInformationMessage(`Edit server: ${connection.name}`);
    }

    async testConnection(item: ServerTreeItem): Promise<void> {
        const connection = await this.storageService.getConnection(item.connectionId);
        if (!connection) {
            this.logger.error('Connection not found for test', { connectionId: item.connectionId });
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        this.logger.log('Testing connection', { name: connection.name, server: connection.server });
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Testing connection...',
                cancellable: false
            },
            async () => {
                const result = await this.httpClient.testConnection(connection);
                if (result.success) {
                    this.logger.log('Connection test successful', { name: connection.name });
                    vscode.window.showInformationMessage(`Connection to ${connection.name} successful!`);
                } else {
                    this.logger.error('Connection test failed', { name: connection.name, error: result.error });
                    vscode.window.showErrorMessage(`Connection failed: ${result.error || 'Unknown error'}`);
                }
            }
        );
    }

    dispose(): void {
        // Cleanup if needed
    }
}

class ServerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly server: string,
        public readonly connectionId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string = 'server'
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label} - ${this.server}`;
        this.description = this.server;
    }
}

