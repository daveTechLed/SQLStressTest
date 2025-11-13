// Performance Graph Module - Following SOLID Principles
// Exposes functions for testability and maintainability

(function() {
    'use strict';
    
    // Dependencies - injected for testability (Dependency Inversion Principle)
    const dependencies = {
        vscode: acquireVsCodeApi(),
        document: document,
        Chart: Chart,
        setTimeout: setTimeout
    };
    
    // State management - single source of truth
    const state = {
        chart: null,
        executionSummaries: [],
        testStartTime: null,
        boundaries: []
    };
    
    // Utility Functions - Pure functions, easily testable (Single Responsibility Principle)
    const TimeFormatter = {
        formatRelativeTime: function(ms, testStartTime) {
            if (!testStartTime) return '0s';
            const elapsed = (ms - testStartTime) / 1000;
            if (elapsed < 60) return Math.round(elapsed) + 's';
            const minutes = Math.floor(elapsed / 60);
            const seconds = Math.round(elapsed % 60);
            if (minutes < 60) return minutes + 'm ' + seconds + 's';
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return hours + 'h ' + mins + 'm';
        }
    };
    
    const StatisticsCalculator = {
        calculatePercentiles: function(values, percentiles = [50, 95, 99]) {
            const sorted = [...values].sort((a, b) => a - b);
            const result = {};
            percentiles.forEach(p => {
                const index = Math.ceil((p / 100) * sorted.length) - 1;
                result[p] = sorted[Math.max(0, index)] || 0;
            });
            return result;
        }
    };
    
    // Chart Operations - Separated concerns (Single Responsibility Principle)
    const ChartOperations = {
        createChart: function(canvas, config) {
            return new dependencies.Chart(canvas.getContext('2d'), config);
        },
        
        updateGradients: function(chart) {
            if (!chart || !chart.canvas) return;
            const chartCtx = chart.canvas.getContext('2d');
            chart.data.datasets.forEach((dataset) => {
                if (dataset.fill && dataset._originalColor) {
                    const color = dataset._originalColor;
                    const gradient = chartCtx.createLinearGradient(0, 0, 0, chart.canvas.height);
                    const rgbaColor = color.replace('rgb(', 'rgba(').replace(')', ', 0.3)');
                    gradient.addColorStop(0, rgbaColor);
                    gradient.addColorStop(1, rgbaColor.replace('0.3', '0.05'));
                    dataset.backgroundColor = gradient;
                }
            });
        },
        
        clearChart: function(chart) {
            if (!chart) return;
            chart.data.datasets = [];
            chart.options.plugins.annotation.annotations = [];
            chart.update('none');
        }
    };
    
    // UI Updates - Separated from business logic (Single Responsibility Principle)
    const UIUpdater = {
        updateStatistics: function(executionSummaries, testStartTime, doc) {
            const totalExecutions = executionSummaries.length;
            const statExecutions = doc.getElementById('statExecutions');
            if (statExecutions) statExecutions.textContent = totalExecutions;
            
            if (testStartTime && totalExecutions > 0) {
                const elapsed = (Date.now() - testStartTime) / 1000;
                const execRate = elapsed > 0 ? (totalExecutions / elapsed).toFixed(1) : '0.0';
                const statExecRate = doc.getElementById('statExecRate');
                const statTotalTime = doc.getElementById('statTotalTime');
                if (statExecRate) statExecRate.textContent = execRate;
                if (statTotalTime) statTotalTime.textContent = TimeFormatter.formatRelativeTime(Date.now(), testStartTime);
            }
            
            if (executionSummaries.length > 0) {
                const avgDurations = executionSummaries
                    .map(s => s.avgDuration)
                    .filter(d => d !== undefined);
                if (avgDurations.length > 0) {
                    const avg = avgDurations.reduce((a, b) => a + b, 0) / avgDurations.length;
                    const statAvgDuration = doc.getElementById('statAvgDuration');
                    if (statAvgDuration) statAvgDuration.textContent = Math.round(avg) + ' ms';
                }
            }
        },
        
        updateStatusBar: function(chart, doc) {
            if (chart && chart.scales && chart.scales.x) {
                const min = chart.scales.x.min;
                const max = chart.scales.x.max;
                const minTime = TimeFormatter.formatRelativeTime(min, state.testStartTime);
                const maxTime = TimeFormatter.formatRelativeTime(max, state.testStartTime);
                const timeRangeText = doc.getElementById('timeRangeText');
                if (timeRangeText) timeRangeText.textContent = `${minTime} - ${maxTime}`;
            }
        }
    };
    
    // Data Processing - Business logic separated (Single Responsibility Principle)
    const DataProcessor = {
        normalizeValue: function(value, min, max) {
            if (min === max) return 50;
            return ((value - min) / (max - min)) * 100;
        },
        
        calculateMetricRanges: function(executionSummaries) {
            const metricRanges = {};
            const metricKeys = ['avgDuration', 'avgLogicalReads', 'avgWrites', 'avgCpuTime', 'avgPhysicalReads', 'avgRowCount'];
            
            metricKeys.forEach(key => {
                const values = executionSummaries
                    .map(s => s[key])
                    .filter(v => v !== undefined && v !== null && !isNaN(v));
                
                if (values.length > 0) {
                    metricRanges[key] = {
                        min: Math.min(...values),
                        max: Math.max(...values),
                        percentiles: StatisticsCalculator.calculatePercentiles(values)
                    };
                }
            });
            
            return metricRanges;
        },
        
        createAveragedDataset: function(label, summaryAvgKey, color, executionSummaries, boundaries, metricRanges, hidden = false) {
            const dataPoints = [];
            const range = metricRanges[summaryAvgKey];
            
            if (!range) return {
                label: label,
                data: [],
                borderColor: color,
                backgroundColor: 'transparent',
                fill: false,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 5,
                spanGaps: false,
                hidden: hidden
            };
            
            const sortedSummaries = executionSummaries
                .filter(s => {
                    if (summaryAvgKey === 'avgDuration') return s.avgDuration !== undefined;
                    if (summaryAvgKey === 'avgLogicalReads') return s.avgLogicalReads !== undefined;
                    if (summaryAvgKey === 'avgWrites') return s.avgWrites !== undefined;
                    if (summaryAvgKey === 'avgCpuTime') return s.avgCpuTime !== undefined;
                    if (summaryAvgKey === 'avgPhysicalReads') return s.avgPhysicalReads !== undefined;
                    if (summaryAvgKey === 'avgRowCount') return s.avgRowCount !== undefined;
                    return false;
                })
                .sort((a, b) => a.executionNumber - b.executionNumber);
            
            sortedSummaries.forEach((summary, index) => {
                const avg = summary[summaryAvgKey];
                if (avg === undefined || avg === null) return;
                
                const normalizedValue = DataProcessor.normalizeValue(avg, range.min, range.max);
                
                // Determine percentile
                let percentile = null;
                if (range.percentiles) {
                    if (avg <= range.percentiles[50]) percentile = 50;
                    else if (avg <= range.percentiles[95]) percentile = 95;
                    else if (avg <= range.percentiles[99]) percentile = 99;
                }
                
                const startBoundary = boundaries.find(b => 
                    b.executionNumber === summary.executionNumber && b.isStart
                );
                const endBoundary = boundaries.find(b => 
                    b.executionNumber === summary.executionNumber && !b.isStart
                );
                
                const startTime = startBoundary?.timestampMs || summary.startTime;
                const endTime = endBoundary?.timestampMs || summary.endTime || 
                               (summary.events && summary.events.length > 0 ? Math.max(...summary.events.map(e => e.timestamp)) : startTime);
                
                if (index > 0 && dataPoints.length > 0) {
                    const lastPoint = dataPoints[dataPoints.length - 1];
                    if (startTime > lastPoint.x) {
                        dataPoints.push({
                            x: startTime - 1,
                            y: null,
                            executionNumber: summary.executionNumber
                        });
                    }
                }
                
                dataPoints.push({
                    x: startTime,
                    y: normalizedValue,
                    originalValue: avg,
                    executionNumber: summary.executionNumber,
                    min: range.min,
                    max: range.max,
                    percentile: percentile,
                    range: range
                });
                dataPoints.push({
                    x: endTime,
                    y: normalizedValue,
                    originalValue: avg,
                    executionNumber: summary.executionNumber,
                    min: range.min,
                    max: range.max,
                    percentile: percentile,
                    range: range
                });
            });
            
            const rgbaColor = color.replace('rgb(', 'rgba(').replace(')', ', 0.2)');
            
            return {
                label: label,
                data: dataPoints,
                borderColor: color,
                backgroundColor: rgbaColor,
                fill: true,
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 6,
                borderWidth: 2,
                spanGaps: false,
                hidden: hidden,
                _originalColor: color
            };
        }
    };
    
    // Chart Configuration Factory - Separated configuration (Single Responsibility Principle)
    const ChartConfigFactory = {
        getComputedColor: function(cssVar) {
            try {
                // Try to get computed color from body element
                const bodyStyle = window.getComputedStyle(dependencies.document.body);
                const bodyColor = bodyStyle.color;
                if (bodyColor && bodyColor !== 'rgba(0, 0, 0, 0)' && bodyColor !== 'transparent') {
                    return bodyColor;
                }
                
                // Fallback: create temp element
                const tempDiv = dependencies.document.createElement('div');
                tempDiv.style.color = cssVar;
                dependencies.document.body.appendChild(tempDiv);
                const computedColor = window.getComputedStyle(tempDiv).color;
                dependencies.document.body.removeChild(tempDiv);
                
                // If we got a valid color, return it; otherwise use white as fallback
                if (computedColor && computedColor !== 'rgba(0, 0, 0, 0)' && computedColor !== 'transparent') {
                    return computedColor;
                }
            } catch (e) {
                // Fall through to default
            }
            
            // Default fallback: use white for dark themes, black for light (but white is safer)
            return '#ffffff';
        },
        
        createConfig: function(formatRelativeTimeFn) {
            // Get computed text color from CSS variable
            const textColor = this.getComputedColor('var(--vscode-editor-foreground)');
            
            return {
                type: 'line',
                data: {
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 300,
                        easing: 'easeOutQuart'
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            onClick: function(e, legendItem) {
                                const index = legendItem.datasetIndex;
                                const meta = state.chart.getDatasetMeta(index);
                                meta.hidden = !meta.hidden;
                                state.chart.update();
                            },
                            onHover: function(e, legendItem) {
                                e.native.target.style.cursor = 'pointer';
                            },
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                font: {
                                    size: 12
                                },
                                color: textColor
                            }
                        },
                        tooltip: {
                            enabled: true,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: {
                                size: 13,
                                weight: 'bold'
                            },
                            bodyFont: {
                                size: 12
                            },
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            callbacks: {
                                title: function(context) {
                                    const dataPoint = context[0].raw;
                                    const executionNumber = dataPoint.executionNumber;
                                    const summary = state.executionSummaries.find(s => s.executionNumber === executionNumber);
                                    const relativeTime = formatRelativeTimeFn(dataPoint.x);
                                    
                                    if (summary) {
                                        return [
                                            `Execution #${executionNumber}`,
                                            `Time: ${relativeTime}`,
                                            `Duration: ${summary.avgDuration?.toFixed(2) || 'N/A'} ms (avg)`,
                                            `Range: ${summary.minDuration?.toFixed(2) || 'N/A'} - ${summary.maxDuration?.toFixed(2) || 'N/A'} ms`
                                        ];
                                    }
                                    return `Execution #${executionNumber} - ${relativeTime}`;
                                },
                                label: function(context) {
                                    const datasetLabel = context.dataset.label;
                                    const dataPoint = context.raw;
                                    const percentage = context.parsed.y;
                                    const originalValue = dataPoint.originalValue;
                                    
                                    if (originalValue !== undefined && originalValue !== null) {
                                        const range = dataPoint.range;
                                        const percentile = dataPoint.percentile;
                                        let label = `${datasetLabel}: ${originalValue?.toFixed(2) || 'N/A'}`;
                                        if (range) {
                                            label += ` (${percentage?.toFixed(1)}% of range)`;
                                        }
                                        if (percentile) {
                                            label += ` [P${percentile}]`;
                                        }
                                        return label;
                                    }
                                    return `${datasetLabel}: ${percentage?.toFixed(1)}%`;
                                },
                                afterBody: function(context) {
                                    const dataPoint = context[0].raw;
                                    const summary = state.executionSummaries.find(s => s.executionNumber === dataPoint.executionNumber);
                                    if (summary) {
                                        return [
                                            `Logical Reads: ${summary.avgLogicalReads?.toFixed(0) || 'N/A'}`,
                                            `Writes: ${summary.avgWrites?.toFixed(0) || 'N/A'}`,
                                            `CPU Time: ${summary.avgCpuTime?.toFixed(2) || 'N/A'} ms`
                                        ];
                                    }
                                    return [];
                                }
                            }
                        },
                        zoom: {
                            zoom: {
                                wheel: {
                                    enabled: true,
                                    speed: 0.1
                                },
                                pinch: {
                                    enabled: true
                                },
                                mode: 'x'
                            },
                            pan: {
                                enabled: true,
                                mode: 'x'
                            }
                        },
                        annotation: {
                            annotations: []
                        }
                    },
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            title: {
                                display: true,
                                text: 'Elapsed Time',
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                },
                                color: textColor
                            },
                            ticks: {
                                callback: function(value) {
                                    return formatRelativeTimeFn(value);
                                },
                                font: {
                                    size: 11
                                },
                                color: textColor
                            },
                            grid: {
                                color: 'rgba(128, 128, 128, 0.2)',
                                lineWidth: 1,
                                drawBorder: false
                            }
                        },
                        y: {
                            beginAtZero: true,
                            min: 0,
                            max: 100,
                            title: {
                                display: true,
                                text: 'Percentage (%)',
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                },
                                color: textColor
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                },
                                font: {
                                    size: 11
                                },
                                color: textColor
                            },
                            grid: {
                                color: 'rgba(128, 128, 128, 0.2)',
                                lineWidth: 1,
                                drawBorder: false
                            }
                        }
                    }
                }
            };
        }
    };
    
    // Main Application - Orchestrates all components (Single Responsibility Principle)
    const PerformanceGraphApp = {
        init: function() {
            const canvas = dependencies.document.getElementById('performanceChart');
            if (!canvas) return;
            
            const formatRelativeTimeFn = (ms) => TimeFormatter.formatRelativeTime(ms, state.testStartTime);
            const chartConfig = ChartConfigFactory.createConfig(formatRelativeTimeFn);
            state.chart = ChartOperations.createChart(canvas, chartConfig);
            
            this.setupEventListeners();
        },
        
        setupEventListeners: function() {
            const doc = dependencies.document;
            
            // Reset zoom
            const resetZoomBtn = doc.getElementById('resetZoomBtn');
            if (resetZoomBtn) {
                resetZoomBtn.addEventListener('click', () => {
                    if (state.chart) {
                        state.chart.resetZoom();
                        UIUpdater.updateStatusBar(state.chart, doc);
                    }
                });
            }
            
            // Export chart
            const exportBtn = doc.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    if (state.chart) {
                        const url = state.chart.toBase64Image();
                        const link = doc.createElement('a');
                        link.download = 'performance-graph-' + Date.now() + '.png';
                        link.href = url;
                        link.click();
                    }
                });
            }
            
            // Metric visibility toggles
            const updateMetricVisibility = () => {
                if (!state.chart) return;
                const showDuration = doc.getElementById('showDuration')?.checked || false;
                const showReads = doc.getElementById('showReads')?.checked || false;
                const showWrites = doc.getElementById('showWrites')?.checked || false;
                const showCpuTime = doc.getElementById('showCpuTime')?.checked || false;
                const showPhysicalReads = doc.getElementById('showPhysicalReads')?.checked || false;
                const showRowCount = doc.getElementById('showRowCount')?.checked || false;
                
                state.chart.data.datasets.forEach(dataset => {
                    dataset.hidden = !(
                        (dataset.label.includes('Duration') && showDuration) ||
                        (dataset.label.includes('Logical Reads') && showReads) ||
                        (dataset.label.includes('Writes') && showWrites) ||
                        (dataset.label.includes('CPU Time') && showCpuTime) ||
                        (dataset.label.includes('Physical Reads') && showPhysicalReads) ||
                        (dataset.label.includes('Row Count') && showRowCount)
                    );
                });
                state.chart.update();
            };
            
            ['showDuration', 'showReads', 'showWrites', 'showCpuTime', 'showPhysicalReads', 'showRowCount'].forEach(id => {
                const element = doc.getElementById(id);
                if (element) {
                    element.addEventListener('change', updateMetricVisibility);
                }
            });
            
            // Message handler
            window.addEventListener('message', (event) => {
                this.handleMessage(event.data);
            });
            
            // Update status bar on zoom/pan
            if (state.chart) {
                state.chart.options.onHover = function() {
                    UIUpdater.updateStatusBar(state.chart, doc);
                };
            }
        },
        
        handleMessage: function(message) {
            if (message.command === 'clearChart') {
                ChartOperations.clearChart(state.chart);
                state.executionSummaries = [];
                state.boundaries = [];
                state.testStartTime = null;
                UIUpdater.updateStatistics(state.executionSummaries, state.testStartTime, dependencies.document);
                UIUpdater.updateStatusBar(state.chart, dependencies.document);
                const statusText = dependencies.document.getElementById('statusText');
                if (statusText) statusText.textContent = 'Chart cleared';
                
                if (message.testStartTime) {
                    state.testStartTime = message.testStartTime;
                    if (statusText) statusText.textContent = 'Test started';
                }
                return;
            }
            
            if (message.command === 'updateExtendedEventsData') {
                const eventData = message.eventData || [];
                state.boundaries = message.boundaries || [];
                state.executionSummaries = message.summaries || [];
                
                if (message.testStartTime) {
                    state.testStartTime = message.testStartTime;
                }
                
                const metricRanges = DataProcessor.calculateMetricRanges(state.executionSummaries);
                
                const datasets = [];
                datasets.push(DataProcessor.createAveragedDataset('Duration (ms)', 'avgDuration', 'rgb(75, 192, 192)', state.executionSummaries, state.boundaries, metricRanges));
                datasets.push(DataProcessor.createAveragedDataset('Logical Reads', 'avgLogicalReads', 'rgb(255, 99, 132)', state.executionSummaries, state.boundaries, metricRanges));
                datasets.push(DataProcessor.createAveragedDataset('Writes', 'avgWrites', 'rgb(54, 162, 235)', state.executionSummaries, state.boundaries, metricRanges));
                datasets.push(DataProcessor.createAveragedDataset('CPU Time (ms)', 'avgCpuTime', 'rgb(255, 206, 86)', state.executionSummaries, state.boundaries, metricRanges));
                datasets.push(DataProcessor.createAveragedDataset('Physical Reads', 'avgPhysicalReads', 'rgb(153, 102, 255)', state.executionSummaries, state.boundaries, metricRanges, true));
                datasets.push(DataProcessor.createAveragedDataset('Row Count', 'avgRowCount', 'rgb(255, 159, 64)', state.executionSummaries, state.boundaries, metricRanges, true));
                
                state.chart.data.datasets = datasets;
                
                // Boundaries removed - no annotations
                state.chart.options.plugins.annotation.annotations = [];
                state.chart.update('none');
                
                dependencies.setTimeout(() => {
                    ChartOperations.updateGradients(state.chart);
                }, 100);
                
                UIUpdater.updateStatistics(state.executionSummaries, state.testStartTime, dependencies.document);
                UIUpdater.updateStatusBar(state.chart, dependencies.document);
                const statusText = dependencies.document.getElementById('statusText');
                if (statusText) statusText.textContent = `${state.executionSummaries.length} executions`;
            }
        }
    };
    
    // Initialize application
    PerformanceGraphApp.init();
    
    // Expose functions to window for testing (Interface Segregation Principle)
    // Only expose what's needed for testing, not internal implementation
    window.PerformanceGraphModule = {
        TimeFormatter: TimeFormatter,
        StatisticsCalculator: StatisticsCalculator,
        ChartOperations: ChartOperations,
        UIUpdater: UIUpdater,
        DataProcessor: DataProcessor,
        getState: function() {
            return {
                chart: state.chart,
                executionSummaries: [...state.executionSummaries],
                testStartTime: state.testStartTime,
                boundaries: [...state.boundaries]
            };
        },
        setState: function(newState) {
            if (newState.chart !== undefined) state.chart = newState.chart;
            if (newState.executionSummaries !== undefined) state.executionSummaries = newState.executionSummaries;
            if (newState.testStartTime !== undefined) state.testStartTime = newState.testStartTime;
            if (newState.boundaries !== undefined) state.boundaries = newState.boundaries;
        }
    };
})();
