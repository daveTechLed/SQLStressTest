import * as signalR from '@microsoft/signalr';
import * as vscode from 'vscode';
import { ILogger, Logger } from './logger';

export interface PerformanceData {
    timestamp: number;
    cpuPercent: number;
}

export interface HeartbeatMessage {
    timestamp: number;
    status: 'connected' | 'disconnected';
}

export class WebSocketClient {
    private connection: signalR.HubConnection | null = null;
    private readonly baseUrl: string;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isConnecting = false;
    private isIntentionallyDisconnected = false;
    private logger: ILogger;

    private onPerformanceDataCallbacks: ((data: PerformanceData) => void)[] = [];
    private onHeartbeatCallbacks: ((message: HeartbeatMessage) => void)[] = [];

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
            this.connection.on('PerformanceData', (data: PerformanceData) => {
                this.logger.log('PerformanceData received', { 
                    timestamp: data.timestamp, 
                    cpuPercent: data.cpuPercent 
                });
                this.onPerformanceDataCallbacks.forEach(callback => callback(data));
            });

            this.connection.on('Heartbeat', (message: HeartbeatMessage) => {
                this.logger.log('Heartbeat received', { 
                    timestamp: message.timestamp, 
                    status: message.status 
                });
                this.onHeartbeatCallbacks.forEach(callback => callback(message));
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
            });

            this.logger.log('Attempting to start connection...');
            await this.connection.start();
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
        this.logger.log('Connection status check', { 
            connected, 
            state: this.connection?.state 
        });
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
}

