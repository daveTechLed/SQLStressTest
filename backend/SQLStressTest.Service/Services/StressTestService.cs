using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Orchestrates stress test execution using specialized services.
/// Single Responsibility: Coordination and orchestration only.
/// </summary>
public class StressTestService : IStressTestService
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly QueryExecutor _queryExecutor;
    private readonly SignalRMessageSender _messageSender;
    private readonly ExtendedEventProcessor _eventProcessor;
    private readonly ExtendedEventsStore _eventsStore;
    private readonly ILogger<StressTestService> _logger;
    private readonly ILoggerFactory _loggerFactory;

    public StressTestService(
        IConnectionStringBuilder connectionStringBuilder,
        QueryExecutor queryExecutor,
        SignalRMessageSender messageSender,
        ExtendedEventProcessor eventProcessor,
        ExtendedEventsStore eventsStore,
        ILogger<StressTestService> logger,
        ILoggerFactory loggerFactory)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _queryExecutor = queryExecutor ?? throw new ArgumentNullException(nameof(queryExecutor));
        _messageSender = messageSender ?? throw new ArgumentNullException(nameof(messageSender));
        _eventProcessor = eventProcessor ?? throw new ArgumentNullException(nameof(eventProcessor));
        _eventsStore = eventsStore ?? throw new ArgumentNullException(nameof(eventsStore));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
    }

    public async Task<StressTestResponse> ExecuteStressTestAsync(
        ConnectionConfig config,
        string query,
        int parallelExecutions,
        int totalExecutions,
        CancellationToken cancellationToken = default)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        if (string.IsNullOrWhiteSpace(query))
        {
            throw new ArgumentException("Query cannot be null or empty", nameof(query));
        }

        var testId = Guid.NewGuid().ToString();
        _logger.LogInformation("Starting stress test. TestId: {TestId}, ParallelExecutions: {ParallelExecutions}, TotalExecutions: {TotalExecutions}",
            testId, parallelExecutions, totalExecutions);

        var connectionString = _connectionStringBuilder.Build(config);
        
        // Use shared events dictionary from ExtendedEventsStore (managed by ExtendedEventsService)
        var events = _eventsStore.Events;

        try
        {
            // Execute queries in parallel
            var executionGuids = new ConcurrentDictionary<int, Guid>();
            var executionStartTimes = new ConcurrentDictionary<int, DateTime>();
            var executionDataSizes = new ConcurrentDictionary<int, long>();

            var parallelOptions = new ParallelOptions
            {
                MaxDegreeOfParallelism = parallelExecutions,
                CancellationToken = cancellationToken
            };

            await Parallel.ForEachAsync(
                Enumerable.Range(1, totalExecutions),
                parallelOptions,
                async (executionNumber, ct) =>
                {
                    var executionId = Guid.NewGuid();
                    executionGuids[executionNumber] = executionId;
                    var startTime = DateTime.UtcNow;
                    executionStartTimes[executionNumber] = startTime;

                    // Send execution boundary (start)
                    await _messageSender.SendExecutionBoundaryAsync(executionNumber, executionId, startTime, true, ct);

                    try
                    {
                        // Set context_info before executing query and calculate data size
                        var dataSizeBytes = await _queryExecutor.ExecuteQueryWithContextInfoAsync(connectionString, query, executionNumber, ct);
                        executionDataSizes[executionNumber] = dataSizeBytes;

                        var endTime = DateTime.UtcNow;
                        
                        // Send execution boundary (end) with data size
                        await _messageSender.SendExecutionBoundaryAsync(executionNumber, executionId, endTime, false, ct);
                        
                        // Send execution metrics including data size
                        await _messageSender.SendExecutionMetricsAsync(executionNumber, executionId, dataSizeBytes, ct);

                        // Process and stream events for this execution
                        await _eventProcessor.ProcessAndStreamEventsAsync(executionId, executionNumber, events, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error executing query for execution {ExecutionNumber}", executionNumber);
                        var endTime = DateTime.UtcNow;
                        await _messageSender.SendExecutionBoundaryAsync(executionNumber, executionId, endTime, false, ct);
                    }
                });

            // Wait a bit for any remaining events to be captured
            await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);

            // Process any remaining events
            foreach (var kvp in executionGuids)
            {
                var contextInfoKey = $"SQLSTRESSTEST_{kvp.Key}";
                if (events.TryGetValue(contextInfoKey, out var executionEvents) && executionEvents != null)
                {
                    await _eventProcessor.ProcessAndStreamEventsAsync(kvp.Value, kvp.Key, events, cancellationToken);
                }
            }

            _logger.LogInformation("Stress test completed. TestId: {TestId}", testId);

            return new StressTestResponse
            {
                Success = true,
                TestId = testId,
                Message = $"Stress test completed: {totalExecutions} executions with {parallelExecutions} parallel"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during stress test execution. TestId: {TestId}", testId);
            return new StressTestResponse
            {
                Success = false,
                TestId = testId,
                Error = ex.Message
            };
        }
    }

}

