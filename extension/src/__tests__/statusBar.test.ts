import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StatusBar } from '../../statusBar';
import { WebSocketClient, HeartbeatMessage } from '../../services/websocketClient';
import * as vscode from 'vscode';

vi.mock('vscode', () => ({
    window: {
        createStatusBarItem: vi.fn(() => ({
            text: '',
            tooltip: '',
            show: vi.fn(),
            dispose: vi.fn()
        }))
    },
    StatusBarAlignment: {
        Right: 2
    }
}));

describe('StatusBar', () => {
    let statusBar: StatusBar;
    let mockWebSocketClient: any;
    let mockStatusBarItem: any;

    beforeEach(() => {
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            show: vi.fn(),
            dispose: vi.fn()
        };

        (vscode.window.createStatusBarItem as any).mockReturnValue(mockStatusBarItem);

        mockWebSocketClient = {
            onHeartbeat: vi.fn(),
            offHeartbeat: vi.fn(),
            isConnected: vi.fn().mockReturnValue(false)
        };

        statusBar = new StatusBar(mockWebSocketClient);
    });

    afterEach(() => {
        statusBar.dispose();
        vi.clearAllTimers();
    });

    describe('initialize', () => {
        it('should register heartbeat callback', () => {
            statusBar.initialize();

            expect(mockWebSocketClient.onHeartbeat).toHaveBeenCalled();
        });

        it('should show status bar item', () => {
            statusBar.initialize();

            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });
    });

    describe('updateStatus', () => {
        it('should update status bar with connected status', () => {
            statusBar.initialize();

            const message: HeartbeatMessage = {
                timestamp: Date.now(),
                status: 'connected'
            };

            // Get the callback that was registered
            const callback = mockWebSocketClient.onHeartbeat.mock.calls[0][0];
            callback(message);

            expect(mockStatusBarItem.text).toContain('Connected');
        });

        it('should update status bar with disconnected status', () => {
            statusBar.initialize();

            const message: HeartbeatMessage = {
                timestamp: Date.now(),
                status: 'disconnected'
            };

            const callback = mockWebSocketClient.onHeartbeat.mock.calls[0][0];
            callback(message);

            expect(mockStatusBarItem.text).toContain('Disconnected');
        });
    });

    describe('dispose', () => {
        it('should unregister callback and dispose status bar', () => {
            statusBar.initialize();
            statusBar.dispose();

            expect(mockWebSocketClient.offHeartbeat).toHaveBeenCalled();
            expect(mockStatusBarItem.dispose).toHaveBeenCalled();
        });
    });
});

