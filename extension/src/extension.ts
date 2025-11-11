import * as vscode from 'vscode';
import { SqlServerExplorer } from './panes/sqlExplorer';
import { PerformanceGraph } from './panes/performanceGraph';
import { QueryEditor } from './panes/queryEditor';
import { StatusBar } from './statusBar';
import { WebSocketClient } from './services/websocketClient';
import { Logger } from './services/logger';

let sqlExplorer: SqlServerExplorer;
let performanceGraph: PerformanceGraph | undefined;
let queryEditor: QueryEditor | undefined;
let statusBar: StatusBar;
let websocketClient: WebSocketClient;
let logger: Logger;

export function activate(context: vscode.ExtensionContext) {
    // Initialize logger
    logger = new Logger('SQL Stress Test - Extension');
    
    // Initialize services
    websocketClient = new WebSocketClient(undefined, logger);
    statusBar = new StatusBar(websocketClient, logger);
    
    // Initialize SQL Server Explorer
    sqlExplorer = new SqlServerExplorer(context, websocketClient, logger);
    context.subscriptions.push(sqlExplorer);
    
    // Register commands
    const commands = [
        vscode.commands.registerCommand('sqlStressTest.addServer', () => sqlExplorer.addServer()),
        vscode.commands.registerCommand('sqlStressTest.removeServer', (item) => sqlExplorer.removeServer(item)),
        vscode.commands.registerCommand('sqlStressTest.editServer', (item) => sqlExplorer.editServer(item)),
        vscode.commands.registerCommand('sqlStressTest.testConnection', (item) => sqlExplorer.testConnection(item)),
        vscode.commands.registerCommand('sqlStressTest.refreshExplorer', () => sqlExplorer.refresh()),
        vscode.commands.registerCommand('sqlStressTest.openPerformanceGraph', () => {
            if (!performanceGraph) {
                performanceGraph = new PerformanceGraph(context, websocketClient, logger);
            }
            performanceGraph.show();
        }),
        vscode.commands.registerCommand('sqlStressTest.openQueryEditor', () => {
            if (!queryEditor) {
                queryEditor = new QueryEditor(context, websocketClient, logger);
            }
            queryEditor.show();
        })
    ];
    
    context.subscriptions.push(...commands);
    
    // Connect WebSocket with detailed error handling
    websocketClient.connect().catch((err: any) => {
        const errorMessage = err?.message || String(err);
        const statusCode = err?.statusCode || err?.code || err?.response?.status;
        
        logger.error('WebSocket connection failed', {
            message: errorMessage,
            statusCode,
            error: err
        });
        
        if (statusCode === 403) {
            vscode.window.showErrorMessage(
                `WebSocket connection failed with 403 Forbidden. Check backend CORS configuration. Error: ${errorMessage}`
            );
        } else {
            vscode.window.showErrorMessage(`Failed to connect to backend: ${errorMessage}`);
        }
        
        // Show output channel for detailed logs
        logger.showOutputChannel();
    });
    
    // Initialize status bar
    statusBar.initialize();
}

export function deactivate() {
    websocketClient?.disconnect();
    performanceGraph?.dispose();
    queryEditor?.dispose();
    statusBar?.dispose();
}

