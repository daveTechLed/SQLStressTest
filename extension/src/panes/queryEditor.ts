import * as vscode from 'vscode';
import { WebSocketClient } from '../services/websocketClient';
import { HttpClient } from '../services/httpClient';
import { StorageService } from '../services/storage';
import { ILogger, Logger } from '../services/logger';
import { QueryEditorWebviewManager } from './queryEditor/QueryEditorWebviewManager';
import { QueryExecutionHandler } from './queryEditor/QueryExecutionHandler';
import { StressTestHandler } from './queryEditor/StressTestHandler';
import { QueryEditorUI } from './queryEditor/QueryEditorUI';

export class QueryEditor {
    private webviewManager: QueryEditorWebviewManager;
    private queryExecutionHandler: QueryExecutionHandler;
    private stressTestHandler: StressTestHandler;
    private ui: QueryEditorUI;
    private httpClient: HttpClient;
    private storageService: StorageService;
    private logger: ILogger;
    private selectedConnectionId: string | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private websocketClient: WebSocketClient,
        logger?: ILogger
    ) {
        this.logger = logger || new Logger('SQL Stress Test - Query Editor');
        this.httpClient = new HttpClient(undefined, this.logger);
        this.storageService = new StorageService(context);
        
        // Create extracted services
        this.webviewManager = new QueryEditorWebviewManager(context, this.logger);
        this.queryExecutionHandler = new QueryExecutionHandler(this.httpClient, this.logger);
        this.stressTestHandler = new StressTestHandler(this.httpClient, this.logger);
        this.ui = new QueryEditorUI(context, this.logger);
        
        this.logger.log('QueryEditor initialized');
    }

    show(connectionId?: string): void {
        this.selectedConnectionId = connectionId;
        
        const panel = this.webviewManager.getPanel();
        if (panel) {
            this.webviewManager.reveal();
            // Update connection selection if panel already exists
            if (connectionId) {
                this.sendConnections();
            }
            return;
        }

        this.logger.log('Showing query editor panel', { connectionId });
        const newPanel = this.webviewManager.createPanel();
        newPanel.webview.html = this.ui.getWebviewContent(this.selectedConnectionId);

        // Handle messages from webview
        this.webviewManager.onDidReceiveMessage(async (message) => {
            this.logger.log('Message received from webview', { command: message.command });
            switch (message.command) {
                case 'executeQuery':
                    await this.queryExecutionHandler.executeQuery(message.connectionId, message.query, message.database);
                    break;
                case 'executeStressTest':
                    try {
                        const response = await this.stressTestHandler.executeStressTest(
                            message.connectionId,
                            message.query,
                            message.parallelExecutions,
                            message.totalExecutions,
                            message.database
                        );
                        this.webviewManager.postMessage({
                            command: 'stressTestResult',
                            data: response
                        });
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        this.webviewManager.postMessage({
                            command: 'stressTestResult',
                            data: {
                                success: false,
                                error: errorMessage
                            }
                        });
                    }
                    break;
                case 'stopStressTest':
                    this.stressTestHandler.stopStressTest();
                    this.webviewManager.postMessage({
                        command: 'stressTestStopped'
                    });
                    break;
                case 'getConnections':
                    await this.sendConnections();
                    break;
                case 'getDatabases':
                    await this.getDatabases(message.connectionId);
                    break;
            }
        });

        // Send initial connections
        this.sendConnections();
    }

    private async sendConnections(): Promise<void> {
        const panel = this.webviewManager.getPanel();
        if (!panel) {
            return;
        }

        const connections = await this.storageService.loadConnections();
        this.logger.log('Sending connections to webview', { count: connections.length, selectedConnectionId: this.selectedConnectionId });
        this.webviewManager.postMessage({
            command: 'connections',
            data: connections,
            selectedConnectionId: this.selectedConnectionId
        });
    }

    private async getDatabases(connectionId: string): Promise<void> {
        const panel = this.webviewManager.getPanel();
        if (!panel) {
            return;
        }

        this.logger.log('Fetching databases', { connectionId });
        
        try {
            const connections = await this.storageService.loadConnections();
            const connection = connections.find(c => c.id === connectionId);
            
            if (!connection) {
                this.logger.warn('Connection not found for database fetch', { connectionId });
                this.webviewManager.postMessage({
                    command: 'databases',
                    data: [],
                    error: 'Connection not found'
                });
                return;
            }

            // Test connection to get database list
            const testResult = await this.httpClient.testConnection(connection);
            
            if (testResult.success && testResult.databases) {
                this.logger.log('Databases fetched successfully', { 
                    connectionId, 
                    databaseCount: testResult.databases.length 
                });
                this.webviewManager.postMessage({
                    command: 'databases',
                    data: testResult.databases,
                    error: null
                });
            } else {
                this.logger.warn('Failed to fetch databases', { 
                    connectionId, 
                    error: testResult.error 
                });
                this.webviewManager.postMessage({
                    command: 'databases',
                    data: [],
                    error: testResult.error || 'Failed to fetch databases'
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Error fetching databases', error);
            this.webviewManager.postMessage({
                command: 'databases',
                data: [],
                error: errorMessage
            });
        }
    }

    dispose(): void {
        this.logger.log('Disposing query editor');
        this.webviewManager.dispose();
    }
}

