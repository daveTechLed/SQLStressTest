import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HistoricalMetricsView } from '../../panes/historicalMetricsView';
import * as vscode from 'vscode';
import { ExtendedEventData, ExecutionBoundary, ExecutionMetrics } from '../../services/websocketClient';

vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(),
        createStatusBarItem: vi.fn(),
        createTreeView: vi.fn(),
        createOutputChannel: vi.fn(() => ({
            append: vi.fn(),
            appendLine: vi.fn(),
            show: vi.fn(),
            dispose: vi.fn()
        })),
        showInputBox: vi.fn(),
        showQuickPick: vi.fn(),
        showInformationMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showWarningMessage: vi.fn(),
        withProgress: vi.fn()
    },
    workspace: {
        getConfiguration: vi.fn(),
        workspaceState: {
            get: vi.fn(),
            update: vi.fn()
        }
    },
    commands: {
        registerCommand: vi.fn()
    },
    ViewColumn: {
        One: 1,
        Two: 2,
        Three: 3
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2
    }
}));

describe('HistoricalMetricsView', () => {
    let view: HistoricalMetricsView;
    let mockContext: vscode.ExtensionContext;
    let mockWebSocketClient: any;
    let mockPanel: any;

    beforeEach(() => {
        mockContext = {
            extensionPath: '/mock/extension/path',
            workspaceState: {
                get: vi.fn(),
                update: vi.fn()
            }
        } as vscode.ExtensionContext;

        mockPanel = {
            webview: {
                html: '',
                postMessage: vi.fn(),
                onDidReceiveMessage: vi.fn(() => ({
                    dispose: vi.fn()
                }))
            },
            reveal: vi.fn(),
            dispose: vi.fn(),
            onDidDispose: vi.fn(() => ({
                dispose: vi.fn()
            }))
        };

        (vscode.window.createWebviewPanel as any).mockReturnValue(mockPanel);

        mockWebSocketClient = {
            onExtendedEventData: vi.fn(),
            offExtendedEventData: vi.fn(),
            onExecutionBoundary: vi.fn(),
            offExecutionBoundary: vi.fn(),
            onExecutionMetrics: vi.fn(),
            offExecutionMetrics: vi.fn()
        };

        view = new HistoricalMetricsView(mockContext, mockWebSocketClient);
    });

    afterEach(() => {
        if (view) {
            view.dispose();
        }
    });

    describe('show', () => {
        it('should create webview panel', () => {
            view.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'historicalMetrics',
                'Historical Metrics',
                vscode.ViewColumn.Three,
                expect.any(Object)
            );
        });

        it('should register callbacks for ExtendedEventData, ExecutionBoundary, and ExecutionMetrics', () => {
            view.show();

            expect(mockWebSocketClient.onExtendedEventData).toHaveBeenCalled();
            expect(mockWebSocketClient.onExecutionBoundary).toHaveBeenCalled();
            expect(mockWebSocketClient.onExecutionMetrics).toHaveBeenCalled();
        });

        it('should reveal existing panel if already shown', () => {
            view.show();
            view.show();

            expect(mockPanel.reveal).toHaveBeenCalled();
        });
    });

    describe('startStressTest', () => {
        it('should start new run without clearing historical runs', () => {
            view.show();
            view.startStressTest();

            // Should not send clearData - we want to keep historical runs visible
            const clearDataCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'clearData'
            );
            expect(clearDataCalls.length).toBe(0);
            
            // Should update view to show all runs
            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            expect(updateCalls.length).toBeGreaterThan(0);
        });
    });

    describe('data handling', () => {
        it('should process ExtendedEventData and update view', () => {
            view.show();
            view.startStressTest();

            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];
            const data: ExtendedEventData = {
                eventName: 'sql_batch_completed',
                timestamp: new Date().toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: {
                    duration: 100,
                    row_count: 50
                },
                actions: {}
            };

            callback(data);

            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });

        it('should ignore non-sql_batch_completed events', () => {
            view.show();
            view.startStressTest();

            // Clear calls from startStressTest
            mockPanel.webview.postMessage.mockClear();

            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];
            const data: ExtendedEventData = {
                eventName: 'other_event',
                timestamp: new Date().toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: {},
                actions: {}
            };

            callback(data);

            // Should not update view for non-batch-completed events
            const postMessageCalls = mockPanel.webview.postMessage.mock.calls;
            const updateCalls = postMessageCalls.filter((call: any[]) => 
                call[0]?.command === 'updateMetrics'
            );
            expect(updateCalls.length).toBe(0);
        });

        it('should process ExecutionBoundary', () => {
            view.show();
            view.startStressTest();

            const callback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const boundary: ExecutionBoundary = {
                executionNumber: 1,
                executionId: 'test-id',
                startTime: new Date().toISOString(),
                isStart: true,
                timestampMs: Date.now()
            };

            callback(boundary);

            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });

        it('should process ExecutionMetrics', () => {
            view.show();
            view.startStressTest();

            const callback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const metrics: ExecutionMetrics = {
                executionNumber: 1,
                executionId: 'test-id',
                dataSizeBytes: 1024,
                timestamp: new Date().toISOString(),
                timestampMs: Date.now()
            };

            callback(metrics);

            expect(mockPanel.webview.postMessage).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should unregister all callbacks', () => {
            view.show();
            view.dispose();

            expect(mockWebSocketClient.offExtendedEventData).toHaveBeenCalled();
            expect(mockWebSocketClient.offExecutionBoundary).toHaveBeenCalled();
            expect(mockWebSocketClient.offExecutionMetrics).toHaveBeenCalled();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });

    describe('historical runs persistence during batch runs', () => {
        it('should preserve historical runs when starting a new batch run', () => {
            view.show();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const metricsCallback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const eventCallback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];

            // First batch run
            view.startStressTest();
            const baseTime1 = Date.now();
            
            // Add execution data for first run
            boundaryCallback({ 
                executionNumber: 1, 
                executionId: 'batch1-exec1', 
                startTime: new Date(baseTime1).toISOString(), 
                isStart: true, 
                timestampMs: baseTime1 
            });
            eventCallback({ 
                eventName: 'sql_batch_completed', 
                timestamp: new Date(baseTime1).toISOString(), 
                executionId: 'batch1-exec1', 
                executionNumber: 1, 
                eventFields: { duration: 150 }, 
                actions: {} 
            });
            metricsCallback({ 
                executionNumber: 1, 
                executionId: 'batch1-exec1', 
                dataSizeBytes: 2048, 
                timestamp: new Date(baseTime1).toISOString(), 
                timestampMs: baseTime1 
            });
            boundaryCallback({ 
                executionNumber: 1, 
                executionId: 'batch1-exec1', 
                endTime: new Date(baseTime1 + 150).toISOString(), 
                isStart: false, 
                timestampMs: baseTime1 + 150 
            });

            // Stop first batch - this should create a historical run
            view.stopStressTest();

            // Clear mock calls to track only the second batch
            mockPanel.webview.postMessage.mockClear();

            // Start second batch run - historical runs should still be visible
            // This calls updateView() immediately, which should show historical runs even though current run has no data yet
            view.startStressTest();

            // Get all updateMetrics calls after starting the second batch
            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );

            // Should have at least one updateMetrics call
            expect(updateCalls.length).toBeGreaterThan(0);

            // CRITICAL: The FIRST updateMetrics call after startStressTest should include historical runs
            // This is the call that happens immediately when startStressTest() calls updateView()
            // If this sends empty cards, the historical runs will be cleared in the UI
            const firstUpdateAfterStart = updateCalls[0][0];
            
            // This test will FAIL if historical runs are being cleared on batch start
            expect(firstUpdateAfterStart.cards).toBeDefined();
            expect(firstUpdateAfterStart.cards.length).toBeGreaterThan(0);
            
            // Should have a card for Run #1 from the first batch
            const run1Card = firstUpdateAfterStart.cards.find((c: any) => c.label === 'Run #1' && c.runId === 1);
            expect(run1Card).toBeDefined();
            expect(run1Card).not.toBeNull();
            expect(run1Card.executionTime?.current).toBe(150);
            expect(run1Card.dataSize?.current).toBe(2048);
        });

        it('should show all historical runs when starting a new batch after multiple completed batches', () => {
            view.show();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const metricsCallback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const eventCallback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];

            // Complete first batch
            view.startStressTest();
            const baseTime1 = Date.now();
            boundaryCallback({ executionNumber: 1, executionId: 'batch1', startTime: new Date(baseTime1).toISOString(), isStart: true, timestampMs: baseTime1 });
            eventCallback({ eventName: 'sql_batch_completed', timestamp: new Date(baseTime1).toISOString(), executionId: 'batch1', executionNumber: 1, eventFields: { duration: 100 }, actions: {} });
            metricsCallback({ executionNumber: 1, executionId: 'batch1', dataSizeBytes: 1024, timestamp: new Date(baseTime1).toISOString(), timestampMs: baseTime1 });
            boundaryCallback({ executionNumber: 1, executionId: 'batch1', endTime: new Date(baseTime1 + 100).toISOString(), isStart: false, timestampMs: baseTime1 + 100 });
            view.stopStressTest();

            // Complete second batch
            view.startStressTest();
            const baseTime2 = Date.now();
            boundaryCallback({ executionNumber: 1, executionId: 'batch2', startTime: new Date(baseTime2).toISOString(), isStart: true, timestampMs: baseTime2 });
            eventCallback({ eventName: 'sql_batch_completed', timestamp: new Date(baseTime2).toISOString(), executionId: 'batch2', executionNumber: 1, eventFields: { duration: 200 }, actions: {} });
            metricsCallback({ executionNumber: 1, executionId: 'batch2', dataSizeBytes: 2048, timestamp: new Date(baseTime2).toISOString(), timestampMs: baseTime2 });
            boundaryCallback({ executionNumber: 1, executionId: 'batch2', endTime: new Date(baseTime2 + 200).toISOString(), isStart: false, timestampMs: baseTime2 + 200 });
            view.stopStressTest();

            // Clear mock calls
            mockPanel.webview.postMessage.mockClear();

            // Start third batch - should show both Run #1 and Run #2
            view.startStressTest();

            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );

            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            
            // Should have cards for both historical runs
            expect(lastUpdate.cards).toBeDefined();
            expect(lastUpdate.cards.length).toBeGreaterThanOrEqual(2);
            
            const run1Card = lastUpdate.cards.find((c: any) => c.runId === 1);
            const run2Card = lastUpdate.cards.find((c: any) => c.runId === 2);
            
            expect(run1Card).toBeDefined();
            expect(run2Card).toBeDefined();
            expect(run1Card.executionTime?.current).toBe(100);
            expect(run2Card.executionTime?.current).toBe(200);
        });
    });

    describe('per-run card functionality', () => {
        it('should create a card for each stress test run', () => {
            view.show();
            view.startStressTest();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const metricsCallback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const eventCallback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];

            const now = Date.now();

            // Send complete data for one execution
            boundaryCallback({
                executionNumber: 1,
                executionId: 'test-id',
                startTime: new Date(now).toISOString(),
                isStart: true,
                timestampMs: now
            });

            eventCallback({
                eventName: 'sql_batch_completed',
                timestamp: new Date(now).toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: { duration: 100, row_count: 50 },
                actions: {}
            });

            metricsCallback({
                executionNumber: 1,
                executionId: 'test-id',
                dataSizeBytes: 1024,
                timestamp: new Date(now).toISOString(),
                timestampMs: now
            });

            boundaryCallback({
                executionNumber: 1,
                executionId: 'test-id',
                endTime: new Date(now + 100).toISOString(),
                isStart: false,
                timestampMs: now + 100
            });

            // Finalize the run
            view.stopStressTest();

            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            
            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            
            // Should have a card for Run #1
            const runCard = lastUpdate.cards.find((c: any) => c.label === 'Run #1');
            expect(runCard).toBeDefined();
            expect(runCard.runId).toBe(1);
            expect(runCard.executionTime).toBeDefined();
            expect(runCard.dataSize).toBeDefined();
            expect(runCard.executionTime?.min).toBeDefined();
            expect(runCard.executionTime?.max).toBeDefined();
        });

        it('should create multiple cards for multiple runs', () => {
            view.show();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const metricsCallback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const eventCallback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];

            // First run
            view.startStressTest();
            const baseTime1 = Date.now();
            for (let i = 1; i <= 3; i++) {
                const execTime = baseTime1 + (i * 100);
                boundaryCallback({ executionNumber: i, executionId: `test-id-1-${i}`, startTime: new Date(execTime).toISOString(), isStart: true, timestampMs: execTime });
                eventCallback({ eventName: 'sql_batch_completed', timestamp: new Date(execTime).toISOString(), executionId: `test-id-1-${i}`, executionNumber: i, eventFields: { duration: 100 + i }, actions: {} });
                metricsCallback({ executionNumber: i, executionId: `test-id-1-${i}`, dataSizeBytes: 1024 + i, timestamp: new Date(execTime).toISOString(), timestampMs: execTime });
                boundaryCallback({ executionNumber: i, executionId: `test-id-1-${i}`, endTime: new Date(execTime + 50).toISOString(), isStart: false, timestampMs: execTime + 50 });
            }
            view.stopStressTest();

            // Second run
            view.startStressTest();
            const baseTime2 = Date.now();
            for (let i = 1; i <= 3; i++) {
                const execTime = baseTime2 + (i * 100);
                boundaryCallback({ executionNumber: i, executionId: `test-id-2-${i}`, startTime: new Date(execTime).toISOString(), isStart: true, timestampMs: execTime });
                eventCallback({ eventName: 'sql_batch_completed', timestamp: new Date(execTime).toISOString(), executionId: `test-id-2-${i}`, executionNumber: i, eventFields: { duration: 200 + i }, actions: {} });
                metricsCallback({ executionNumber: i, executionId: `test-id-2-${i}`, dataSizeBytes: 2048 + i, timestamp: new Date(execTime).toISOString(), timestampMs: execTime });
                boundaryCallback({ executionNumber: i, executionId: `test-id-2-${i}`, endTime: new Date(execTime + 50).toISOString(), isStart: false, timestampMs: execTime + 50 });
            }
            view.stopStressTest();

            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            
            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            
            // Should have cards for both runs
            expect(lastUpdate.cards.length).toBe(2);
            const run1Card = lastUpdate.cards.find((c: any) => c.label === 'Run #1');
            const run2Card = lastUpdate.cards.find((c: any) => c.label === 'Run #2');
            expect(run1Card).toBeDefined();
            expect(run2Card).toBeDefined();
            
            // Run #2 should compare to Run #1
            expect(run2Card.executionTime?.previous).toBe(run1Card.executionTime?.current);
        });

        it('should handle Execution Time without Data Size', () => {
            view.show();
            view.startStressTest();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const eventCallback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];

            const now = Date.now();

            boundaryCallback({
                executionNumber: 1,
                executionId: 'test-id',
                startTime: new Date(now).toISOString(),
                isStart: true,
                timestampMs: now
            });

            eventCallback({
                eventName: 'sql_batch_completed',
                timestamp: new Date(now).toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: { duration: 100, row_count: 50 },
                actions: {}
            });

            boundaryCallback({
                executionNumber: 1,
                executionId: 'test-id',
                endTime: new Date(now + 100).toISOString(),
                isStart: false,
                timestampMs: now + 100
            });

            view.stopStressTest();

            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            
            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            
            const runCard = lastUpdate.cards.find((c: any) => c.label === 'Run #1');
            expect(runCard).toBeDefined();
            expect(runCard.executionTime).toBeDefined();
            // Data size might be undefined if no ExecutionMetrics received
        });
    });

    describe('data flow edge cases', () => {
        it('should process ExtendedEventData even when stress test is NOT active', () => {
            view.show();
            // Note: NOT calling startStressTest()

            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];
            const data: ExtendedEventData = {
                eventName: 'sql_batch_completed',
                timestamp: new Date().toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: {
                    duration: 100,
                    row_count: 50
                },
                actions: {}
            };

            callback(data);

            // Data should be processed and updateMetrics should be called
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ command: 'updateMetrics' })
            );
        });

        it('should process ExtendedEventData with different event field names', () => {
            view.show();
            view.startStressTest();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];
            const now = Date.now();

            // Send start boundary
            boundaryCallback({
                executionNumber: 1,
                executionId: 'test-id',
                startTime: new Date(now).toISOString(),
                isStart: true,
                timestampMs: now
            });

            // Send event with total_duration field name
            const data: ExtendedEventData = {
                eventName: 'sql_batch_completed',
                timestamp: new Date(now).toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: {
                    // Try different possible field names
                    total_duration: 100,
                    row_count: 50
                },
                actions: {}
            };

            callback(data);

            // Send end boundary to complete the summary
            boundaryCallback({
                executionNumber: 1,
                executionId: 'test-id',
                endTime: new Date(now + 100).toISOString(),
                isStart: false,
                timestampMs: now + 100
            });

            view.stopStressTest();

            // Should create card for Run #1 with Execution Time
            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            expect(lastUpdate.cards).toBeDefined();
            const runCard = lastUpdate.cards.find((c: any) => c.label === 'Run #1');
            expect(runCard).toBeDefined();
            expect(runCard.executionTime).toBeDefined();
        });

        it('should update view when ExecutionBoundary is received before ExtendedEventData', () => {
            view.show();
            view.startStressTest();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const metricsCallback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const baseTime = Date.now();

            // Send multiple executions
            for (let i = 1; i <= 3; i++) {
                const execTime = baseTime + (i * 1000);
                
                // Send boundary first (start)
                boundaryCallback({
                    executionNumber: i,
                    executionId: `test-id-${i}`,
                    startTime: new Date(execTime).toISOString(),
                    isStart: true,
                    timestampMs: execTime
                });

                // Send metrics
                metricsCallback({
                    executionNumber: i,
                    executionId: `test-id-${i}`,
                    dataSizeBytes: 1024 + i,
                    timestamp: new Date(execTime).toISOString(),
                    timestampMs: execTime
                });

                // Send boundary (end)
                boundaryCallback({
                    executionNumber: i,
                    executionId: `test-id-${i}`,
                    endTime: new Date(execTime + 100).toISOString(),
                    isStart: false,
                    timestampMs: execTime + 100
                });
            }

            view.stopStressTest();

            // This should create a run with dataSizeBytes
            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            expect(lastUpdate.cards).toBeDefined();
            expect(lastUpdate.cards.length).toBeGreaterThan(0);
            const runCard = lastUpdate.cards.find((c: any) => c.label === 'Run #1');
            expect(runCard).toBeDefined();
            expect(runCard.dataSize).toBeDefined();
        });

        it('should have execution summaries after receiving all data types', () => {
            view.show();
            view.startStressTest();

            const boundaryCallback = mockWebSocketClient.onExecutionBoundary.mock.calls[0][0];
            const metricsCallback = mockWebSocketClient.onExecutionMetrics.mock.calls[0][0];
            const eventCallback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];

            const baseTime = Date.now();

            // Send multiple executions
            for (let i = 1; i <= 3; i++) {
                const execTime = baseTime + (i * 1000);
                
                // Send start boundary
                boundaryCallback({
                    executionNumber: i,
                    executionId: `test-id-${i}`,
                    startTime: new Date(execTime).toISOString(),
                    isStart: true,
                    timestampMs: execTime
                });

                // Send event data
                eventCallback({
                    eventName: 'sql_batch_completed',
                    timestamp: new Date(execTime).toISOString(),
                    executionId: `test-id-${i}`,
                    executionNumber: i,
                    eventFields: {
                        duration: 100 + i,
                        row_count: 50
                    },
                    actions: {}
                });

                // Send metrics
                metricsCallback({
                    executionNumber: i,
                    executionId: `test-id-${i}`,
                    dataSizeBytes: 1024 + i,
                    timestamp: new Date(execTime).toISOString(),
                    timestampMs: execTime
                });

                // Send end boundary
                boundaryCallback({
                    executionNumber: i,
                    executionId: `test-id-${i}`,
                    endTime: new Date(execTime + 100).toISOString(),
                    isStart: false,
                    timestampMs: execTime + 100
                });
            }

            view.stopStressTest();

            // Verify updateMetrics was called with complete data
            const updateCalls = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            
            expect(updateCalls.length).toBeGreaterThan(0);
            const lastUpdate = updateCalls[updateCalls.length - 1][0];
            
            expect(lastUpdate.cards).toBeDefined();
            expect(lastUpdate.cards.length).toBeGreaterThan(0);
            // Should have card for Run #1 with both execution time and data size
            const runCard = lastUpdate.cards.find((c: any) => c.label === 'Run #1');
            expect(runCard).toBeDefined();
            expect(runCard.executionTime).toBeDefined();
            expect(runCard.dataSize).toBeDefined();
            expect(runCard.executionTime?.min).toBeDefined();
            expect(runCard.executionTime?.max).toBeDefined();
        });

        it('should process data when panel is shown but stress test started later', () => {
            view.show();
            
            // Data arrives before stress test starts
            const callback = mockWebSocketClient.onExtendedEventData.mock.calls[0][0];
            callback({
                eventName: 'sql_batch_completed',
                timestamp: new Date().toISOString(),
                executionId: 'test-id',
                executionNumber: 1,
                eventFields: { duration: 100, row_count: 50 },
                actions: {}
            });

            // Verify data was processed (updateMetrics should have been called)
            const updateCallsBeforeStart = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            expect(updateCallsBeforeStart.length).toBeGreaterThan(0);

            // Then stress test starts (this will clear the data, but that's expected for a new test)
            view.startStressTest();

            // After startStressTest, updateView is called which will send updateMetrics (even if empty)
            const updateCallsAfterStart = mockPanel.webview.postMessage.mock.calls.filter(
                (call: any[]) => call[0]?.command === 'updateMetrics'
            );
            expect(updateCallsAfterStart.length).toBeGreaterThan(updateCallsBeforeStart.length);
        });
    });
});

