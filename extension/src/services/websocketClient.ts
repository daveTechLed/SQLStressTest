import * as signalR from '@microsoft/signalr';
import * as vscode from 'vscode';
import { ILogger, Logger } from './logger';
import { StorageService, QueryResult, PerformanceMetrics } from './storage';

export interface PerformanceData {
    timestamp: number;
    cpuPercent: number;
}

export interface HeartbeatMessage {
    timestamp: number;
    status: 'connected' | 'disconnected';
}

export interface ExtendedEventData {
    eventName: string;
    timestamp: string; // ISO date string
    executionId: string; // GUID
    executionNumber: number;
    eventFields: { [key: string]: any }; // Extensible dictionary for event-specific fields
    actions: { [key: string]: any }; // Actions captured with the event
}

export interface ExecutionBoundary {
    executionNumber: number;
    executionId: string; // GUID
    startTime: string; // ISO date string
    endTime?: string; // ISO date string (null if still running)
    isStart: boolean;
    timestampMs: number; // Unix timestamp in milliseconds
}

export interface ExecutionMetrics {
    executionNumber: number;
    executionId: string; // GUID
    dataSizeBytes: number;
    timestamp: string; // ISO date string
    timestampMs: number; // Unix timestamp in milliseconds
}

// Storage request/response interfaces matching backend DTOs
export interface StorageResponse<T = any> {
    success: boolean;
    error?: string;
    data?: T;
}

export interface ConnectionConfigDto {
    id: string;
    name: string;
    server: string;
    database?: string;
    username?: string;
    password?: string;
    integratedSecurity: boolean;
    port?: number;
}

export interface SaveConnectionRequest {
    connection: ConnectionConfigDto;
}

export interface UpdateConnectionRequest {
    id: string;
    connection: ConnectionConfigDto;
}

export interface DeleteConnectionRequest {
    id: string;
}

export interface LoadConnectionsRequest {
    // No parameters
}

export interface QueryResultDto {
    id: string;
    connectionId: string;
    query: string;
    executionTimeMs: number;
    executedAt: string; // ISO date string
    success: boolean;
    errorMessage?: string;
    rowsAffected?: number;
    resultData?: string;
}

export interface SaveQueryResultRequest {
    result: QueryResultDto;
}

export interface LoadQueryResultsRequest {
    connectionId: string;
}

export interface PerformanceMetricsDto {
    id: string;
    connectionId: string;
    timestamp: string; // ISO date string
    cpuPercent: number;
    memoryBytes: number;
    activeConnections: number;
    queryExecutionTimeMs: number;
}

export interface SavePerformanceMetricsRequest {
    metrics: PerformanceMetricsDto;
}

export interface TimeRangeDto {
    startTime?: string; // ISO date string
    endTime?: string; // ISO date string
}

export interface LoadPerformanceMetricsRequest {
    connectionId: string;
    timeRange: TimeRangeDto;
}

export class WebSocketClient {
    private connection: signalR.HubConnection | null = null;
    private readonly baseUrl: string;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isConnecting = false;
    private isIntentionallyDisconnected = false;
    private logger: ILogger;
    private pendingStorageService: StorageService | null = null;

    private onPerformanceDataCallbacks: ((data: PerformanceData) => void)[] = [];
    private onHeartbeatCallbacks: ((message: HeartbeatMessage) => void)[] = [];
    private onExtendedEventDataCallbacks: ((data: ExtendedEventData) => void)[] = [];
    private onExecutionBoundaryCallbacks: ((boundary: ExecutionBoundary) => void)[] = [];
    private onExecutionMetricsCallbacks: ((metrics: ExecutionMetrics) => void)[] = [];

    constructor(baseUrl?: string, logger?: ILogger) {
        // Default to localhost, can be configured via settings
        const config = vscode.workspace.getConfiguration('sqlStressTest');
        this.baseUrl = baseUrl || config.get<string>('backendUrl', 'http://localhost:5000');
        this.logger = logger || new Logger('SQL Stress Test - WebSocket');
        
        this.logger.log('WebSocketClient initialized', { baseUrl: this.baseUrl });
    }

    async connect(): Promise<void> {
        if (this.isConnecting || this.connection?.state === signalR.HubConnectionState.Connected) {
            this.logger.log('Connect called but already connecting or connected', { 
                isConnecting: this.isConnecting, 
                state: this.connection?.state 
            });
            return;
        }

        this.isIntentionallyDisconnected = false; // Reset flag when connecting
        this.isConnecting = true;
        this.logger.log('Starting WebSocket connection', { url: `${this.baseUrl}/sqlhub` });

        try {
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl(`${this.baseUrl}/sqlhub`, {
                    skipNegotiation: false,
                    transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
                })
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: (retryContext) => {
                        const delay = retryContext.previousRetryCount < 3 ? 1000 : 5000;
                        this.logger.log('Reconnection attempt', { 
                            attempt: retryContext.previousRetryCount, 
                            delay 
                        });
                        return delay;
                    }
                })
                .configureLogging(signalR.LogLevel.Information)
                .build();

            // Register handlers
            // Reduced logging for PerformanceData - only log every 10th message
            let performanceDataCount = 0;
            this.connection.on('PerformanceData', (data: PerformanceData) => {
                performanceDataCount++;
                if (performanceDataCount % 10 === 0) {
                    this.logger.log('PerformanceData received', { 
                        count: performanceDataCount,
                        timestamp: data.timestamp, 
                        cpuPercent: data.cpuPercent 
                    });
                }
                this.onPerformanceDataCallbacks.forEach(callback => callback(data));
            });

            // Reduced logging for Heartbeat - only log every 10th message
            let heartbeatCount = 0;
            this.connection.on('Heartbeat', (message: HeartbeatMessage) => {
                heartbeatCount++;
                if (heartbeatCount % 10 === 0) {
                    this.logger.log('Heartbeat received', { 
                        count: heartbeatCount,
                        timestamp: message.timestamp, 
                        status: message.status 
                    });
                }
                this.onHeartbeatCallbacks.forEach(callback => callback(message));
            });

            // Extended Events handlers
            this.connection.on('ExtendedEventData', (data: ExtendedEventData) => {
                this.onExtendedEventDataCallbacks.forEach(callback => callback(data));
            });

            this.connection.on('ExecutionBoundary', (boundary: ExecutionBoundary) => {
                this.onExecutionBoundaryCallbacks.forEach(callback => callback(boundary));
            });

            this.connection.on('ExecutionMetrics', (metrics: ExecutionMetrics) => {
                this.onExecutionMetricsCallbacks.forEach(callback => callback(metrics));
            });

            this.connection.onclose(async (error) => {
                this.isConnecting = false;
                if (error) {
                    this.logger.error('WebSocket connection closed with error', error);
                } else {
                    this.logger.log('WebSocket connection closed normally');
                }
                
                // Attempt to reconnect if connection was closed unexpectedly
                // Only reconnect if we're not already disconnected intentionally
                if (!this.isIntentionallyDisconnected && 
                    this.connection && 
                    this.connection.state === signalR.HubConnectionState.Disconnected) {
                    this.logger.log('Connection closed unexpectedly, attempting to reconnect...');
                    // Wait a bit before reconnecting to avoid immediate retry loops
                    setTimeout(async () => {
                        try {
                            if (!this.isIntentionallyDisconnected &&
                                this.connection && 
                                this.connection.state === signalR.HubConnectionState.Disconnected &&
                                !this.isConnecting) {
                                await this.connect();
                            }
                        } catch (reconnectError) {
                            this.logger.error('Reconnection attempt failed', reconnectError);
                            // Schedule another reconnection attempt after a longer delay
                            setTimeout(async () => {
                                try {
                                    if (!this.isIntentionallyDisconnected &&
                                        this.connection && 
                                        this.connection.state === signalR.HubConnectionState.Disconnected &&
                                        !this.isConnecting) {
                                        await this.connect();
                                    }
                                } catch (retryError) {
                                    this.logger.error('Second reconnection attempt failed', retryError);
                                }
                            }, 5000);
                        }
                    }, 2000);
                }
            });

            this.connection.onreconnecting((error) => {
                this.logger.log('WebSocket reconnecting', { error: error?.message });
            });

            this.connection.onreconnected((connectionId) => {
                this.logger.log('WebSocket reconnected', { connectionId });
                // Register storage handlers if they weren't registered yet (e.g., if connection was lost before initial registration)
                if (this.pendingStorageService && this.connection) {
                    this.logger.log('Registering storage handlers after reconnection');
                    this.registerStorageHandlersInternal(this.pendingStorageService);
                    this.pendingStorageService = null; // Clear the pending reference
                }
            });

            this.logger.log('Attempting to start connection...');
            await this.connection.start();
            
            // Register storage handlers immediately after connection is established
            // This ensures handlers are ready before backend calls LoadConnections in OnConnectedAsync
            if (this.pendingStorageService) {
                this.logger.log('Registering storage handlers now that connection is established');
                this.registerStorageHandlersInternal(this.pendingStorageService);
                this.pendingStorageService = null; // Clear the pending reference
            }
            
            this.isConnecting = false;
            this.logger.log('WebSocket connection established successfully', { 
                connectionId: this.connection.connectionId,
                state: this.connection.state 
            });
        } catch (error: any) {
            this.isConnecting = false;
            this.logger.error('Failed to connect WebSocket', error);
            
            // Check for 403 specifically
            if (error?.statusCode === 403 || error?.code === 403 || error?.response?.status === 403) {
                this.logger.error('403 Forbidden error detected', error);
                vscode.window.showErrorMessage(
                    `WebSocket connection failed with 403 Forbidden. Check CORS configuration on backend. URL: ${this.baseUrl}/sqlhub`
                );
            }
            
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.logger.log('Disconnecting WebSocket');
        this.isIntentionallyDisconnected = true;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.connection) {
            try {
                await this.connection.stop();
                this.logger.log('WebSocket disconnected successfully');
            } catch (error) {
                this.logger.error('Error during disconnect', error);
            }
            this.connection = null;
        }
    }

    isConnected(): boolean {
        const connected = this.connection?.state === signalR.HubConnectionState.Connected;
        // Reduced logging - only log when state changes or at debug level
        // this.logger.log('Connection status check', { 
        //     connected, 
        //     state: this.connection?.state 
        // });
        return connected;
    }

    showOutputChannel(): void {
        this.logger.showOutputChannel();
    }

    onPerformanceData(callback: (data: PerformanceData) => void): void {
        this.onPerformanceDataCallbacks.push(callback);
    }

    offPerformanceData(callback: (data: PerformanceData) => void): void {
        const index = this.onPerformanceDataCallbacks.indexOf(callback);
        if (index >= 0) {
            this.onPerformanceDataCallbacks.splice(index, 1);
        }
    }

    onHeartbeat(callback: (message: HeartbeatMessage) => void): void {
        this.onHeartbeatCallbacks.push(callback);
    }

    offHeartbeat(callback: (message: HeartbeatMessage) => void): void {
        const index = this.onHeartbeatCallbacks.indexOf(callback);
        if (index >= 0) {
            this.onHeartbeatCallbacks.splice(index, 1);
        }
    }

    onExtendedEventData(callback: (data: ExtendedEventData) => void): void {
        this.onExtendedEventDataCallbacks.push(callback);
    }

    offExtendedEventData(callback: (data: ExtendedEventData) => void): void {
        const index = this.onExtendedEventDataCallbacks.indexOf(callback);
        if (index >= 0) {
            this.onExtendedEventDataCallbacks.splice(index, 1);
        }
    }

    onExecutionBoundary(callback: (boundary: ExecutionBoundary) => void): void {
        this.onExecutionBoundaryCallbacks.push(callback);
    }

    offExecutionBoundary(callback: (boundary: ExecutionBoundary) => void): void {
        const index = this.onExecutionBoundaryCallbacks.indexOf(callback);
        if (index >= 0) {
            this.onExecutionBoundaryCallbacks.splice(index, 1);
        }
    }

    onExecutionMetrics(callback: (metrics: ExecutionMetrics) => void): void {
        this.onExecutionMetricsCallbacks.push(callback);
    }

    offExecutionMetrics(callback: (metrics: ExecutionMetrics) => void): void {
        const index = this.onExecutionMetricsCallbacks.indexOf(callback);
        if (index >= 0) {
            this.onExecutionMetricsCallbacks.splice(index, 1);
        }
    }

    /**
     * Register storage operation handlers that the backend can invoke
     * @param storageService The storage service to use for operations
     */
    registerStorageHandlers(storageService: StorageService): void {
        // Store the storage service reference even if connection doesn't exist yet
        this.pendingStorageService = storageService;
        
        // If connection exists, register handlers immediately
        if (this.connection) {
            this.registerStorageHandlersInternal(storageService);
        } else {
            this.logger.log('Storage service stored for registration when connection is established');
        }
    }

    /**
     * Internal method to actually register the storage handlers on the connection
     * @param storageService The storage service to use for operations
     */
    private registerStorageHandlersInternal(storageService: StorageService): void {
        if (!this.connection) {
            this.logger.error('Cannot register storage handlers: connection is null');
            return;
        }

        // Connection handlers
        this.connection.on('SaveConnection', async (request: SaveConnectionRequest): Promise<StorageResponse> => {
            try {
                this.logger.log('SaveConnection request received from backend', { 
                    connectionId: request.connection.id,
                    connectionName: request.connection.name,
                    server: request.connection.server 
                });
                await storageService.addConnection(request.connection);
                this.logger.log('SaveConnection completed successfully', { 
                    connectionId: request.connection.id,
                    connectionName: request.connection.name 
                });
                return { success: true };
            } catch (error: any) {
                this.logger.error('SaveConnection failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        this.connection.on('LoadConnections', async (request: LoadConnectionsRequest): Promise<StorageResponse<ConnectionConfigDto[]>> => {
            try {
                this.logger.log('LoadConnections request received');
                const connections = await storageService.loadConnections();
                // Convert to DTO format (integratedSecurity is required in DTO)
                const dtoConnections: ConnectionConfigDto[] = connections.map(c => ({
                    id: c.id,
                    name: c.name,
                    server: c.server,
                    database: c.database,
                    username: c.username,
                    password: c.password,
                    integratedSecurity: c.integratedSecurity ?? false,
                    port: c.port
                }));
                return { success: true, data: dtoConnections };
            } catch (error: any) {
                this.logger.error('LoadConnections failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        this.connection.on('UpdateConnection', async (request: UpdateConnectionRequest): Promise<StorageResponse> => {
            try {
                this.logger.log('UpdateConnection request received', { id: request.id });
                await storageService.updateConnection(request.id, request.connection);
                return { success: true };
            } catch (error: any) {
                this.logger.error('UpdateConnection failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        this.connection.on('DeleteConnection', async (request: DeleteConnectionRequest): Promise<StorageResponse> => {
            try {
                this.logger.log('DeleteConnection request received', { id: request.id });
                await storageService.removeConnection(request.id);
                return { success: true };
            } catch (error: any) {
                this.logger.error('DeleteConnection failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        // Query result handlers
        this.connection.on('SaveQueryResult', async (request: SaveQueryResultRequest): Promise<StorageResponse> => {
            try {
                this.logger.log('SaveQueryResult request received', { connectionId: request.result.connectionId });
                const result = {
                    ...request.result,
                    executedAt: new Date(request.result.executedAt)
                };
                await storageService.saveQueryResult(result);
                return { success: true };
            } catch (error: any) {
                this.logger.error('SaveQueryResult failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        this.connection.on('LoadQueryResults', async (request: LoadQueryResultsRequest): Promise<StorageResponse<QueryResultDto[]>> => {
            try {
                this.logger.log('LoadQueryResults request received', { connectionId: request.connectionId });
                const results = await storageService.loadQueryResults(request.connectionId);
                // Convert Date objects to ISO strings for serialization
                const dtoResults: QueryResultDto[] = results.map((r: QueryResult) => ({
                    id: r.id,
                    connectionId: r.connectionId,
                    query: r.query,
                    executionTimeMs: r.executionTimeMs,
                    executedAt: r.executedAt.toISOString(),
                    success: r.success,
                    errorMessage: r.errorMessage,
                    rowsAffected: r.rowsAffected,
                    resultData: r.resultData
                }));
                return { success: true, data: dtoResults };
            } catch (error: any) {
                this.logger.error('LoadQueryResults failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        // Performance metrics handlers
        this.connection.on('SavePerformanceMetrics', async (request: SavePerformanceMetricsRequest): Promise<StorageResponse> => {
            try {
                this.logger.log('SavePerformanceMetrics request received', { connectionId: request.metrics.connectionId });
                const metrics = {
                    ...request.metrics,
                    timestamp: new Date(request.metrics.timestamp)
                };
                await storageService.savePerformanceMetrics(metrics);
                return { success: true };
            } catch (error: any) {
                this.logger.error('SavePerformanceMetrics failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        this.connection.on('LoadPerformanceMetrics', async (request: LoadPerformanceMetricsRequest): Promise<StorageResponse<PerformanceMetricsDto[]>> => {
            try {
                this.logger.log('LoadPerformanceMetrics request received', { 
                    connectionId: request.connectionId,
                    timeRange: request.timeRange 
                });
                const timeRange = {
                    startTime: request.timeRange.startTime ? new Date(request.timeRange.startTime) : undefined,
                    endTime: request.timeRange.endTime ? new Date(request.timeRange.endTime) : undefined
                };
                const metrics = await storageService.loadPerformanceMetrics(request.connectionId, timeRange);
                // Convert Date objects to ISO strings for serialization
                const dtoMetrics: PerformanceMetricsDto[] = metrics.map((m: PerformanceMetrics) => ({
                    id: m.id,
                    connectionId: m.connectionId,
                    timestamp: m.timestamp.toISOString(),
                    cpuPercent: m.cpuPercent,
                    memoryBytes: m.memoryBytes,
                    activeConnections: m.activeConnections,
                    queryExecutionTimeMs: m.queryExecutionTimeMs
                }));
                return { success: true, data: dtoMetrics };
            } catch (error: any) {
                this.logger.error('LoadPerformanceMetrics failed', error);
                return { success: false, error: error.message || 'Unknown error' };
            }
        });

        this.logger.log('Storage handlers registered successfully');
    }

    /**
     * Notify the backend that a connection was saved in VS Code storage.
     * This triggers the backend to reload connections so its cache stays in sync.
     * @param connectionId The ID of the connection that was saved
     */
    async notifyConnectionSaved(connectionId: string): Promise<void> {
        if (!this.connection || this.connection.state !== signalR.HubConnectionState.Connected) {
            this.logger.error('=== CANNOT NOTIFY BACKEND: SIGNALR NOT CONNECTED ===');
            this.logger.error('Connection state', {
                connectionId,
                state: this.connection?.state,
                isConnected: this.connection?.state === signalR.HubConnectionState.Connected
            });
            return;
        }

        try {
            this.logger.info('=== SENDING BACKEND NOTIFICATION ===');
            this.logger.info('Invoking NotifyConnectionSaved', { 
                connectionId,
                signalRState: this.connection.state,
                connectionId_backend: this.connection.connectionId
            });
            
            const startTime = Date.now();
            await this.connection.invoke('NotifyConnectionSaved', connectionId);
            const duration = Date.now() - startTime;
            
            this.logger.info('=== BACKEND NOTIFICATION SUCCESS ===');
            this.logger.info('Backend notified successfully', { 
                connectionId,
                durationMs: duration
            });
        } catch (error: any) {
            // Log but don't throw - save operation should succeed even if notification fails
            this.logger.error('=== BACKEND NOTIFICATION ERROR ===');
            this.logger.error('Failed to notify backend of connection save', { 
                error: error?.message || String(error),
                errorStack: error?.stack,
                errorName: error?.name,
                connectionId 
            });
        }
    }
}

