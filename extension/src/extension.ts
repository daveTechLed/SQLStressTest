import * as vscode from 'vscode';
import { SqlServerExplorer } from './panes/sqlExplorer';
import { PerformanceGraph } from './panes/performanceGraph';
import { QueryEditor } from './panes/queryEditor';
import { StatusBar } from './statusBar';
import { WebSocketClient } from './services/websocketClient';
import { BackendServiceManager } from './services/backendServiceManager';
import { Logger } from './services/logger';
import { StorageService } from './services/storage';

let sqlExplorer: SqlServerExplorer;
let performanceGraph: PerformanceGraph | undefined;
let queryEditor: QueryEditor | undefined;
let statusBar: StatusBar;
let websocketClient: WebSocketClient;
let backendServiceManager: BackendServiceManager;
let logger: Logger;
let storageService: StorageService;

export async function activate(context: vscode.ExtensionContext) {
    // Initialize logger first so all messages are captured
    logger = new Logger('SQL Stress Test - Extension');
    
    // Log activation start (this will go to both console and log file)
    logger.info('Extension activating...');
    console.log('[SQL Stress Test] Extension activating...');
    
    // Log the log file location
    const logFilePath = logger.getLogFilePath();
    if (logFilePath) {
        logger.info('Log file location', { path: logFilePath });
        console.log('[SQL Stress Test] Log file:', logFilePath);
    } else {
        logger.warn('Log file not initialized - logs will only appear in Output Panel and Console');
        console.warn('[SQL Stress Test] WARNING: Log file not initialized');
    }
    
    logger.info('Extension activation started');
    
    // Initialize backend service manager
    logger.info('Initializing BackendServiceManager...');
    console.log('[SQL Stress Test] Creating BackendServiceManager...');
    backendServiceManager = new BackendServiceManager(context, logger);
    logger.info('BackendServiceManager initialized');
    console.log('[SQL Stress Test] BackendServiceManager created');
    
    // Start backend service
    try {
        logger.info('Starting backend service...');
        console.log('[SQL Stress Test] Calling backendServiceManager.start()...');
        const backendInfo = await backendServiceManager.start();
        logger.info('Backend service started', { url: backendInfo.url, port: backendInfo.port });
        console.log('[SQL Stress Test] Backend service started successfully', backendInfo);
        
        // Initialize services with backend URL
        websocketClient = new WebSocketClient(backendInfo.url, logger);
        statusBar = new StatusBar(websocketClient, logger);
        
        // Initialize storage service
        storageService = new StorageService(context);
        
        // Initialize SQL Server Explorer
        sqlExplorer = new SqlServerExplorer(context, websocketClient, logger);
        
        // CRITICAL: Register the tree data provider with VS Code
        // Without this registration, VS Code doesn't know about the tree view,
        // so refresh events won't trigger UI updates
        const treeView = vscode.window.createTreeView('sqlServerExplorer', {
            treeDataProvider: sqlExplorer
        });
        context.subscriptions.push(treeView);
        context.subscriptions.push(sqlExplorer);

        // Register tree view selection listener to open query editor and performance graph
        treeView.onDidChangeSelection(async (e) => {
            if (e.selection && e.selection.length > 0) {
                const selectedItem = e.selection[0];
                // Ensure queryEditor and performanceGraph are initialized
                if (!queryEditor) {
                    queryEditor = new QueryEditor(context, websocketClient, logger);
                }
                if (!performanceGraph) {
                    performanceGraph = new PerformanceGraph(context, websocketClient, logger);
                }
                await sqlExplorer.handleServerSelection(selectedItem, queryEditor, performanceGraph);
            }
        });
    } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const errorStack = error?.stack || 'No stack trace';
        
        console.error('[SQL Stress Test] ERROR: Failed to start backend service', error);
        console.error('[SQL Stress Test] Error message:', errorMessage);
        console.error('[SQL Stress Test] Error stack:', errorStack);
        
        logger.error('Failed to start backend service', {
            message: errorMessage,
            stack: errorStack,
            error: error
        });
        
        vscode.window.showErrorMessage(
            `Failed to start backend service: ${errorMessage}. Please check the logs.`
        );
        
        // Show output channel immediately
        logger.showOutputChannel();
        
        // Fallback: try to connect to default localhost URL if backend is already running
        logger.info('Attempting to connect to default backend URL as fallback...');
        console.log('[SQL Stress Test] Attempting fallback connection...');
        websocketClient = new WebSocketClient(undefined, logger);
        statusBar = new StatusBar(websocketClient, logger);
        
        // Initialize storage service
        storageService = new StorageService(context);
        
        sqlExplorer = new SqlServerExplorer(context, websocketClient, logger);
        
        // CRITICAL: Register the tree data provider with VS Code
        // Without this registration, VS Code doesn't know about the tree view,
        // so refresh events won't trigger UI updates
        const treeView = vscode.window.createTreeView('sqlServerExplorer', {
            treeDataProvider: sqlExplorer
        });
        context.subscriptions.push(treeView);
        context.subscriptions.push(sqlExplorer);

        // Register tree view selection listener to open query editor and performance graph
        treeView.onDidChangeSelection(async (e) => {
            if (e.selection && e.selection.length > 0) {
                const selectedItem = e.selection[0];
                // Ensure queryEditor and performanceGraph are initialized
                if (!queryEditor) {
                    queryEditor = new QueryEditor(context, websocketClient, logger);
                }
                if (!performanceGraph) {
                    performanceGraph = new PerformanceGraph(context, websocketClient, logger);
                }
                await sqlExplorer.handleServerSelection(selectedItem, queryEditor, performanceGraph);
            }
        });
    }
    
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
        vscode.commands.registerCommand('sqlStressTest.showPerformanceGraph', (connectionId?: string) => {
            if (!performanceGraph) {
                performanceGraph = new PerformanceGraph(context, websocketClient, logger);
            }
            performanceGraph.show(connectionId);
            performanceGraph.startStressTest();
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
    // Wait a moment for backend to fully start before connecting
    setTimeout(() => {
    websocketClient.connect().then(() => {
        // Register storage handlers after connection is established
        logger.info('Registering storage handlers...');
        websocketClient.registerStorageHandlers(storageService);
        logger.info('Storage handlers registered');
    }).catch((err: any) => {
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
    }, 2000); // Wait 2 seconds for backend to be ready
    
    // Initialize status bar
    statusBar.initialize();
}

export async function deactivate() {
    websocketClient?.disconnect();
    performanceGraph?.dispose();
    queryEditor?.dispose();
    statusBar?.dispose();
    await backendServiceManager?.dispose();
}

