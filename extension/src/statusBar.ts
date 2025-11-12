import * as vscode from 'vscode';
import { WebSocketClient, HeartbeatMessage } from './services/websocketClient';
import { ILogger, Logger } from './services/logger';

export class StatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private heartbeatCallback: ((message: HeartbeatMessage) => void) | null = null;
    private updateTimer: NodeJS.Timeout | null = null;
    private logger: ILogger;
    private lastHeartbeatTime: number = 0;
    private lastReconnectAttempt: number = 0;

    constructor(private websocketClient: WebSocketClient, logger?: ILogger) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            'sqlStressTest.heartbeat',
            vscode.StatusBarAlignment.Right,
            100
        );
        this.logger = logger || new Logger('SQL Stress Test - StatusBar');
        
        this.logger.log('StatusBar initialized');
    }

    initialize(): void {
        this.logger.log('Initializing StatusBar');
        
        // Reduced heartbeat callback logging - only log state changes
        let lastStatus: string = '';
        this.heartbeatCallback = (message: HeartbeatMessage) => {
            // Only log when status changes
            if (message.status !== lastStatus) {
                this.logger.log('Heartbeat callback triggered - status changed', { 
                    timestamp: message.timestamp, 
                    status: message.status,
                    previousStatus: lastStatus
                });
                lastStatus = message.status;
            }
            this.updateStatus(message);
        };

        this.websocketClient.onHeartbeat(this.heartbeatCallback);
        this.updateStatus({ timestamp: Date.now(), status: 'disconnected' });

        // Update every 2 seconds
        let statusCheckCount = 0;
        this.updateTimer = setInterval(() => {
            const isConnected = this.websocketClient.isConnected();
            const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime;
            
            // Only log periodic status checks every 10th time to reduce noise
            statusCheckCount++;
            if (statusCheckCount % 10 === 0) {
                this.logger.log('Periodic status check', { 
                    count: statusCheckCount,
                    isConnected, 
                    timeSinceLastHeartbeat,
                    lastHeartbeatTime: this.lastHeartbeatTime 
                });
            }
            
            if (!isConnected) {
                this.logger.log('Connection lost, updating status to disconnected');
                this.updateStatus({ timestamp: Date.now(), status: 'disconnected' });
                // Attempt to reconnect if not already connecting and haven't tried recently
                const timeSinceLastReconnect = Date.now() - this.lastReconnectAttempt;
                if (timeSinceLastReconnect > 5000) { // Only try every 5 seconds
                    this.lastReconnectAttempt = Date.now();
                    this.logger.log('Attempting reconnect from status bar');
                    this.websocketClient.connect().catch((err) => {
                        this.logger.error('Reconnection attempt failed', err);
                    });
                }
            } else if (timeSinceLastHeartbeat > 5000) {
                this.logger.log('No heartbeat received for 5+ seconds, marking as disconnected');
                this.updateStatus({ timestamp: Date.now(), status: 'disconnected' });
                // Attempt to reconnect if heartbeat is stale and haven't tried recently
                const timeSinceLastReconnect = Date.now() - this.lastReconnectAttempt;
                if (timeSinceLastReconnect > 5000) { // Only try every 5 seconds
                    this.lastReconnectAttempt = Date.now();
                    this.logger.log('Attempting reconnect after stale heartbeat');
                    this.websocketClient.connect().catch((err) => {
                        this.logger.error('Reconnection attempt after stale heartbeat failed', err);
                    });
                }
            }
        }, 2000);
    }

    private updateStatus(message: HeartbeatMessage): void {
        this.lastHeartbeatTime = message.timestamp;
        const time = new Date(message.timestamp).toLocaleTimeString();
        const status = message.status === 'connected' ? '$(pulse) Connected' : '$(error) Disconnected';
        this.statusBarItem.text = `${status} | ${time}`;
        this.statusBarItem.tooltip = `Backend connection status. Last heartbeat: ${time}`;
        this.statusBarItem.show();
        
        // Reduced status update logging - only log when status changes
        // this.logger.log('Status updated', { 
        //     status: message.status, 
        //     timestamp: message.timestamp,
        //     displayTime: time 
        // });
    }

    dispose(): void {
        if (this.heartbeatCallback) {
            this.websocketClient.offHeartbeat(this.heartbeatCallback);
        }
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }
        this.statusBarItem.dispose();
    }
}

