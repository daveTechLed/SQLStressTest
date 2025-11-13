import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('performanceGraph.js', () => {
    let vscodeApi;
    let postMessageSpy;
    let mockChart;
    let mockChartInstance;
    let scriptContent;

    beforeEach(() => {
        // Mock acquireVsCodeApi
        postMessageSpy = vi.fn();
        vscodeApi = {
            postMessage: postMessageSpy
        };
        global.acquireVsCodeApi = vi.fn(() => vscodeApi);

        // Mock Chart.js
        mockChartInstance = {
            data: { datasets: [] },
            options: {
                plugins: {
                    annotation: { annotations: [] }
                },
                scales: {
                    x: { min: 0, max: 100 },
                    y: { min: 0, max: 100 }
                },
                onHover: null
            },
            canvas: {
                height: 400,
                getContext: vi.fn(() => ({
                    createLinearGradient: vi.fn(() => ({
                        addColorStop: vi.fn()
                    }))
                }))
            },
            getDatasetMeta: vi.fn(() => ({ hidden: false })),
            update: vi.fn(),
            resetZoom: vi.fn(),
            toBase64Image: vi.fn(() => 'data:image/png;base64,test')
        };

        mockChart = vi.fn(() => mockChartInstance);
        global.Chart = mockChart;

        // Set up DOM
        document.body.innerHTML = `
            <div class="container">
                <div class="header">
                    <h2>Extended Events Performance Graph</h2>
                    <div>
                        <button class="btn btn-secondary" id="resetZoomBtn">Reset Zoom</button>
                        <button class="btn btn-secondary" id="exportBtn">Export</button>
                    </div>
                </div>
                <div class="stats-panel" id="statsPanel">
                    <div class="stat-card">
                        <div class="stat-label">Executions</div>
                        <div class="stat-value" id="statExecutions">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Executions/sec</div>
                        <div class="stat-value" id="statExecRate">0.0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Avg Duration</div>
                        <div class="stat-value" id="statAvgDuration">0 ms</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Total Time</div>
                        <div class="stat-value" id="statTotalTime">0s</div>
                    </div>
                </div>
                <div class="controls-panel">
                    <div class="metric-group">
                        <div class="metric-checkbox">
                            <input type="checkbox" id="showDuration" checked>
                            <label for="showDuration">Duration</label>
                        </div>
                        <div class="metric-checkbox">
                            <input type="checkbox" id="showReads" checked>
                            <label for="showReads">Logical Reads</label>
                        </div>
                        <div class="metric-checkbox">
                            <input type="checkbox" id="showWrites" checked>
                            <label for="showWrites">Writes</label>
                        </div>
                        <div class="metric-checkbox">
                            <input type="checkbox" id="showCpuTime" checked>
                            <label for="showCpuTime">CPU Time</label>
                        </div>
                        <div class="metric-checkbox">
                            <input type="checkbox" id="showPhysicalReads">
                            <label for="showPhysicalReads">Physical Reads</label>
                        </div>
                        <div class="metric-checkbox">
                            <input type="checkbox" id="showRowCount">
                            <label for="showRowCount">Row Count</label>
                        </div>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="performanceChart"></canvas>
                </div>
                <div class="status-bar">
                    <span id="statusText">Ready</span>
                    <span id="timeRangeText">-</span>
                </div>
            </div>
        `;

        // Mock canvas getContext
        const canvas = document.getElementById('performanceChart');
        canvas.getContext = vi.fn(() => ({
            createLinearGradient: vi.fn(() => ({
                addColorStop: vi.fn()
            }))
        }));

        // Load and execute the script
        const scriptPath = join(__dirname, '../performanceGraph.js');
        scriptContent = readFileSync(scriptPath, 'utf8');
        
        // Execute script - it will expose PerformanceGraphModule to window
        try {
            eval(scriptContent);
        } catch (error) {
            // If eval fails, log the error for debugging
            console.error('Script execution failed:', error);
            throw error;
        }
        
        // Verify module is exposed
        expect(window.PerformanceGraphModule).toBeDefined();
    });

    describe('TimeFormatter', () => {
        it('should format seconds correctly', () => {
            const testStartTime = Date.now() - 5000; // 5 seconds ago
            const result = window.PerformanceGraphModule.TimeFormatter.formatRelativeTime(Date.now(), testStartTime);
            expect(result).toBe('5s');
        });

        it('should format minutes and seconds', () => {
            const testStartTime = Date.now() - 125000; // 2 minutes 5 seconds ago
            const result = window.PerformanceGraphModule.TimeFormatter.formatRelativeTime(Date.now(), testStartTime);
            expect(result).toMatch(/2m \d+s/);
        });

        it('should return 0s when testStartTime is null', () => {
            const result = window.PerformanceGraphModule.TimeFormatter.formatRelativeTime(Date.now(), null);
            expect(result).toBe('0s');
        });
    });

    describe('StatisticsCalculator', () => {
        it('should calculate percentiles correctly', () => {
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
            const result = window.PerformanceGraphModule.StatisticsCalculator.calculatePercentiles(values);

            expect(result[50]).toBeDefined();
            expect(result[95]).toBeDefined();
            expect(result[99]).toBeDefined();
            expect(result[50]).toBeLessThanOrEqual(result[95]);
            expect(result[95]).toBeLessThanOrEqual(result[99]);
        });

        it('should handle empty array', () => {
            const result = window.PerformanceGraphModule.StatisticsCalculator.calculatePercentiles([]);

            expect(result[50]).toBe(0);
            expect(result[95]).toBe(0);
            expect(result[99]).toBe(0);
        });
    });

    describe('Chart initialization', () => {
        it('should create chart on load', () => {
            expect(mockChart).toHaveBeenCalled();
            const state = window.PerformanceGraphModule.getState();
            expect(state.chart).toBeDefined();
        });

        it('should have correct chart configuration', () => {
            if (mockChart.mock.calls.length > 0) {
                const chartConfig = mockChart.mock.calls[0][1];
                expect(chartConfig.type).toBe('line');
                expect(chartConfig.options.responsive).toBe(true);
                expect(chartConfig.options.maintainAspectRatio).toBe(false);
            }
        });
    });

    describe('Button interactions', () => {
        it('should reset zoom when resetZoomBtn is clicked', () => {
            const resetZoomBtn = document.getElementById('resetZoomBtn');
            resetZoomBtn.click();

            expect(mockChartInstance.resetZoom).toHaveBeenCalled();
        });

        it('should export chart when exportBtn is clicked', () => {
            const exportBtn = document.getElementById('exportBtn');
            const createElementSpy = vi.spyOn(document, 'createElement');
            const clickSpy = vi.fn();
            
            createElementSpy.mockReturnValue({
                download: '',
                href: '',
                click: clickSpy
            });

            exportBtn.click();

            expect(mockChartInstance.toBase64Image).toHaveBeenCalled();
            expect(createElementSpy).toHaveBeenCalledWith('a');
            expect(clickSpy).toHaveBeenCalled();
        });
    });

    describe('Metric visibility toggles', () => {
        it('should toggle metric visibility when checkbox changes', () => {
            const showDuration = document.getElementById('showDuration');
            const datasets = [
                { label: 'Duration (ms)', hidden: false },
                { label: 'Logical Reads', hidden: false }
            ];
            mockChartInstance.data.datasets = datasets;

            showDuration.checked = false;
            showDuration.dispatchEvent(new Event('change'));

            expect(mockChartInstance.update).toHaveBeenCalled();
        });
    });

    describe('Message handling', () => {
        it('should clear chart on clearChart command', () => {
            const statusText = document.getElementById('statusText');
            const testStartTime = Date.now();

            const event = new MessageEvent('message', {
                data: {
                    command: 'clearChart',
                    testStartTime: testStartTime
                }
            });
            window.dispatchEvent(event);

            expect(mockChartInstance.data.datasets).toEqual([]);
            expect(mockChartInstance.update).toHaveBeenCalledWith('none');
            expect(statusText.textContent).toBe('Test started');
            
            const state = window.PerformanceGraphModule.getState();
            expect(state.testStartTime).toBe(testStartTime);
            expect(state.executionSummaries).toEqual([]);
            expect(state.boundaries).toEqual([]);
        });

        it('should update chart with extended events data', () => {
            const executionSummaries = [
                {
                    executionNumber: 1,
                    startTime: Date.now() - 1000,
                    endTime: Date.now(),
                    avgDuration: 100,
                    minDuration: 90,
                    maxDuration: 110,
                    avgLogicalReads: 1000,
                    avgWrites: 500,
                    avgCpuTime: 50,
                    events: []
                }
            ];
            const boundaries = [
                {
                    executionNumber: 1,
                    isStart: true,
                    timestampMs: Date.now() - 1000
                },
                {
                    executionNumber: 1,
                    isStart: false,
                    timestampMs: Date.now()
                }
            ];

            const event = new MessageEvent('message', {
                data: {
                    command: 'updateExtendedEventsData',
                    eventData: [],
                    boundaries: boundaries,
                    summaries: executionSummaries,
                    testStartTime: Date.now() - 2000
                }
            });
            window.dispatchEvent(event);

            expect(mockChartInstance.data.datasets.length).toBeGreaterThan(0);
            expect(mockChartInstance.update).toHaveBeenCalled();
        });

        it('should update statistics panel', () => {
            const statExecutions = document.getElementById('statExecutions');
            
            const executionSummaries = [
                { avgDuration: 100 },
                { avgDuration: 200 },
                { avgDuration: 150 }
            ];
            const testStartTime = Date.now() - 1000;

            // Trigger update by dispatching updateExtendedEventsData
            const event = new MessageEvent('message', {
                data: {
                    command: 'updateExtendedEventsData',
                    eventData: [],
                    boundaries: [],
                    summaries: executionSummaries,
                    testStartTime: testStartTime
                }
            });
            window.dispatchEvent(event);

            // Statistics should be updated
            expect(statExecutions.textContent).toBe('3');
            
            const state = window.PerformanceGraphModule.getState();
            expect(state.executionSummaries.length).toBe(3);
        });
    });

    describe('UIUpdater', () => {
        it('should update statistics correctly', () => {
            const executionSummaries = [
                { avgDuration: 100 },
                { avgDuration: 200 }
            ];
            const testStartTime = Date.now() - 2000; // 2 seconds ago
            
            window.PerformanceGraphModule.UIUpdater.updateStatistics(
                executionSummaries,
                testStartTime,
                document
            );

            const statExecutions = document.getElementById('statExecutions');
            const statExecRate = document.getElementById('statExecRate');
            expect(statExecutions.textContent).toBe('2');
            expect(statExecRate.textContent).toBeDefined();
        });
    });
});

