import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('historicalMetricsView.js', () => {
    let vscodeApi;
    let postMessageSpy;
    let scriptContent;

    beforeEach(() => {
        // Mock acquireVsCodeApi
        postMessageSpy = vi.fn();
        vscodeApi = {
            postMessage: postMessageSpy
        };
        global.acquireVsCodeApi = vi.fn(() => vscodeApi);

        // Set up DOM
        document.body.innerHTML = `
            <div id="metricsContainer" class="metrics-container">
                <div class="empty-state">Waiting for stress test data...</div>
            </div>
        `;

        // Load and execute the script
        const scriptPath = join(__dirname, '../historicalMetricsView.js');
        scriptContent = readFileSync(scriptPath, 'utf8');
        
        // Remove the closing script tag if present
        const scriptWithoutTag = scriptContent.replace(/<\/script>\s*$/, '');
        
        // Execute in a way that exposes functions to window
        const scriptWithExports = `
            ${scriptWithoutTag}
            window.formatValue = formatValue;
            window.createCard = createCard;
        `;
        eval(scriptWithExports);
    });

    describe('formatValue', () => {
        it('should format bytes correctly', () => {
            const formatValue = window.formatValue;
            
            expect(formatValue(1024, 'bytes')).toBe('1.00 KB');
            expect(formatValue(1048576, 'bytes')).toBe('1.00 MB');
            expect(formatValue(512, 'bytes')).toBe('512 bytes');
        });

        it('should format milliseconds correctly', () => {
            const formatValue = window.formatValue;
            
            expect(formatValue(123.456, 'ms')).toBe('123.46 ms');
            expect(formatValue(0.5, 'ms')).toBe('0.50 ms');
        });

        it('should format other units as numbers', () => {
            const formatValue = window.formatValue;
            
            expect(formatValue(1234.56, 'count')).toBe('1,235');
        });
    });

    describe('createCard', () => {
        it('should create a regular metric card', () => {
            const createCard = window.createCard;
            const card = {
                label: 'Test Metric',
                current: 100,
                previous: 90,
                trend: 'up',
                unit: 'ms',
                min: 80,
                max: 120
            };

            const cardElement = createCard(card);

            expect(cardElement.className).toBe('metric-card');
            expect(cardElement.innerHTML).toContain('Test Metric');
            expect(cardElement.innerHTML).toContain('100.00 ms');
            expect(cardElement.innerHTML).toContain('↑');
        });

        it('should create a combined card with execution time and data size', () => {
            const createCard = window.createCard;
            const card = {
                label: 'Run #1',
                executionTime: {
                    current: 100,
                    previous: 90,
                    trend: 'up',
                    unit: 'ms',
                    min: 80,
                    max: 120
                },
                dataSize: {
                    current: 1024,
                    previous: 512,
                    trend: 'down',
                    unit: 'bytes',
                    min: 256,
                    max: 2048
                }
            };

            const cardElement = createCard(card);

            expect(cardElement.className).toBe('metric-card combined');
            expect(cardElement.innerHTML).toContain('Run #1');
            expect(cardElement.innerHTML).toContain('Execution Time');
            expect(cardElement.innerHTML).toContain('Data Size');
            expect(cardElement.innerHTML).toContain('100.00 ms');
            expect(cardElement.innerHTML).toContain('1.00 KB');
        });

        it('should show trend indicators correctly', () => {
            const createCard = window.createCard;
            
            const upCard = {
                label: 'Up',
                current: 100,
                previous: 90,
                trend: 'up',
                unit: 'ms'
            };
            const upElement = createCard(upCard);
            expect(upElement.innerHTML).toContain('↑');

            const downCard = {
                label: 'Down',
                current: 90,
                previous: 100,
                trend: 'down',
                unit: 'ms'
            };
            const downElement = createCard(downCard);
            expect(downElement.innerHTML).toContain('↓');

            const stableCard = {
                label: 'Stable',
                current: 100,
                previous: 100,
                trend: 'stable',
                unit: 'ms'
            };
            const stableElement = createCard(stableCard);
            expect(stableElement.innerHTML).toContain('→');
        });

        it('should calculate and display percentage change', () => {
            const createCard = window.createCard;
            const card = {
                label: 'Test',
                current: 110,
                previous: 100,
                trend: 'up',
                unit: 'ms'
            };

            const cardElement = createCard(card);

            expect(cardElement.innerHTML).toContain('+10.0%');
        });
    });

    describe('Message handling', () => {
        it('should update metrics container with cards', () => {
            const container = document.getElementById('metricsContainer');
            const cards = [
                {
                    label: 'Run #1',
                    current: 100,
                    trend: 'up',
                    unit: 'ms'
                }
            ];

            const event = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: cards
                }
            });
            window.dispatchEvent(event);

            expect(container.children.length).toBeGreaterThan(0);
            expect(container.innerHTML).toContain('Run #1');
        });

        it('should show empty state when no cards provided', () => {
            const container = document.getElementById('metricsContainer');

            const event = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: []
                }
            });
            window.dispatchEvent(event);

            expect(container.innerHTML).toContain('No metrics available');
        });

        it('should clear data on clearData command', () => {
            const container = document.getElementById('metricsContainer');

            const event = new MessageEvent('message', {
                data: {
                    command: 'clearData'
                }
            });
            window.dispatchEvent(event);

            expect(container.innerHTML).toContain('Waiting for stress test data...');
        });
    });

    describe('Historical runs persistence during batch runs', () => {
        it('should render all historical runs when multiple cards are sent', () => {
            const container = document.getElementById('metricsContainer');
            
            // Simulate first batch run - Run #1
            const run1Card = {
                label: 'Run #1',
                runId: 1,
                executionTime: {
                    current: 150,
                    previous: undefined,
                    trend: 'stable',
                    unit: 'ms',
                    min: 150,
                    max: 150
                },
                dataSize: {
                    current: 2048,
                    previous: undefined,
                    trend: 'stable',
                    unit: 'bytes',
                    min: 2048,
                    max: 2048
                }
            };

            const event1 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card]
                }
            });
            window.dispatchEvent(event1);

            // Verify Run #1 is rendered
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('Run #1');
            expect(container.innerHTML).toContain('150.00 ms');
            expect(container.innerHTML).toContain('2.00 KB');

            // Simulate second batch run - should show both Run #1 and Run #2
            const run2Card = {
                label: 'Run #2',
                runId: 2,
                executionTime: {
                    current: 200,
                    previous: 150,
                    trend: 'up',
                    unit: 'ms',
                    min: 200,
                    max: 200
                },
                dataSize: {
                    current: 4096,
                    previous: 2048,
                    trend: 'up',
                    unit: 'bytes',
                    min: 4096,
                    max: 4096
                }
            };

            const event2 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card, run2Card] // Both historical runs
                }
            });
            window.dispatchEvent(event2);

            // CRITICAL: Both runs should be visible
            // This test will FAIL if only the latest run is shown
            expect(container.children.length).toBe(2);
            expect(container.innerHTML).toContain('Run #1');
            expect(container.innerHTML).toContain('Run #2');
            expect(container.innerHTML).toContain('150.00 ms'); // Run #1
            expect(container.innerHTML).toContain('200.00 ms'); // Run #2
        });

        it('should preserve historical runs when a new batch starts', () => {
            const container = document.getElementById('metricsContainer');
            
            // First batch completes - creates Run #1
            const run1Card = {
                label: 'Run #1',
                runId: 1,
                executionTime: {
                    current: 100,
                    trend: 'stable',
                    unit: 'ms',
                    min: 100,
                    max: 100
                },
                dataSize: {
                    current: 1024,
                    trend: 'stable',
                    unit: 'bytes',
                    min: 1024,
                    max: 1024
                }
            };

            const event1 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card]
                }
            });
            window.dispatchEvent(event1);

            // Verify Run #1 is displayed
            expect(container.children.length).toBe(1);
            const initialRun1Count = (container.innerHTML.match(/Run #1/g) || []).length;
            expect(initialRun1Count).toBeGreaterThan(0);

            // New batch starts - should still show Run #1 (historical run)
            // This simulates the scenario where startStressTest() calls updateView()
            // with historical runs but no current run data yet
            const event2 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card] // Historical run should still be sent
                }
            });
            window.dispatchEvent(event2);

            // CRITICAL: Run #1 should still be visible after new batch starts
            // This test will FAIL if historical runs are cleared when a new batch starts
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('Run #1');
            expect(container.innerHTML).toContain('100.00 ms');
            expect(container.innerHTML).not.toContain('No metrics available');
        });

        it('should display all historical runs when starting a new batch after multiple completed batches', () => {
            const container = document.getElementById('metricsContainer');
            
            // Complete first batch - Run #1
            const run1Card = {
                label: 'Run #1',
                runId: 1,
                executionTime: {
                    current: 100,
                    trend: 'stable',
                    unit: 'ms',
                    min: 100,
                    max: 100
                },
                dataSize: {
                    current: 1024,
                    trend: 'stable',
                    unit: 'bytes',
                    min: 1024,
                    max: 1024
                }
            };

            const event1 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card]
                }
            });
            window.dispatchEvent(event1);

            // Complete second batch - Run #2
            const run2Card = {
                label: 'Run #2',
                runId: 2,
                executionTime: {
                    current: 200,
                    previous: 100,
                    trend: 'up',
                    unit: 'ms',
                    min: 200,
                    max: 200
                },
                dataSize: {
                    current: 2048,
                    previous: 1024,
                    trend: 'up',
                    unit: 'bytes',
                    min: 2048,
                    max: 2048
                }
            };

            const event2 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card, run2Card]
                }
            });
            window.dispatchEvent(event2);

            // Verify both runs are displayed
            expect(container.children.length).toBe(2);
            expect(container.innerHTML).toContain('Run #1');
            expect(container.innerHTML).toContain('Run #2');

            // Start third batch - should show both Run #1 and Run #2
            const event3 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card, run2Card] // Both historical runs
                }
            });
            window.dispatchEvent(event3);

            // CRITICAL: Both historical runs should be visible
            // This test will FAIL if only the latest run is shown
            expect(container.children.length).toBe(2);
            expect(container.innerHTML).toContain('Run #1');
            expect(container.innerHTML).toContain('Run #2');
            expect(container.innerHTML).toContain('100.00 ms'); // Run #1
            expect(container.innerHTML).toContain('200.00 ms'); // Run #2
        });

        it('should preserve historical runs when receiving updateMetrics with empty cards array after having historical runs', () => {
            const container = document.getElementById('metricsContainer');
            
            // First, display a historical run
            const run1Card = {
                label: 'Run #1',
                runId: 1,
                executionTime: {
                    current: 150,
                    trend: 'stable',
                    unit: 'ms',
                    min: 150,
                    max: 150
                },
                dataSize: {
                    current: 2048,
                    trend: 'stable',
                    unit: 'bytes',
                    min: 2048,
                    max: 2048
                }
            };

            const event1 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card]
                }
            });
            window.dispatchEvent(event1);

            // Verify Run #1 is displayed
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('Run #1');

            // Simulate a scenario where updateMetrics is called with empty array
            // This should NOT happen in normal flow (TypeScript fix prevents it), 
            // but if it does, JavaScript should preserve existing cards defensively
            const event2 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [] // Empty - but should preserve existing cards
                }
            });
            window.dispatchEvent(event2);

            // CRITICAL: Empty cards array should preserve existing historical runs
            // This is a defensive measure in case empty cards are sent due to edge cases
            expect(container.innerHTML).not.toContain('No metrics available');
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('Run #1'); // Historical run should be preserved
        });

        it('should preserve historical runs when receiving empty cards followed by cards with historical runs (simulating batch start bug)', () => {
            const container = document.getElementById('metricsContainer');
            
            // First batch completes - creates Run #1
            const run1Card = {
                label: 'Run #1',
                runId: 1,
                executionTime: {
                    current: 150,
                    trend: 'stable',
                    unit: 'ms',
                    min: 150,
                    max: 150
                },
                dataSize: {
                    current: 2048,
                    trend: 'stable',
                    unit: 'bytes',
                    min: 2048,
                    max: 2048
                }
            };

            const event1 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [run1Card]
                }
            });
            window.dispatchEvent(event1);

            // Verify Run #1 is displayed
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('Run #1');

            // Simulate bug scenario: new batch starts, updateView() is called
            // but current run has no data yet, so it sends empty cards
            // This would clear the historical runs in the UI
            const event2 = new MessageEvent('message', {
                data: {
                    command: 'updateMetrics',
                    cards: [] // BUG: This clears historical runs
                }
            });
            window.dispatchEvent(event2);

            // CRITICAL: This test will FAIL because empty cards clears historical runs
            // This demonstrates the bug - when a new batch starts and updateView() is called
            // before any data arrives, it sends empty cards which clears the display
            // The fix should be: don't send updateMetrics with empty cards if there are historical runs
            expect(container.innerHTML).not.toContain('No metrics available');
            expect(container.children.length).toBe(1);
            expect(container.innerHTML).toContain('Run #1'); // Historical run should still be visible
        });
    });
});

