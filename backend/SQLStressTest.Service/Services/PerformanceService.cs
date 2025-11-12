using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

public class PerformanceService : IPerformanceService
{
    private readonly Random _random = new();
    private CancellationTokenSource? _cancellationTokenSource;
    private bool _isStreaming = false;
    private readonly ILogger<PerformanceService> _logger;
    private readonly IStorageService? _storageService;
    private readonly Queue<PerformanceMetricsDto> _metricsBuffer = new();
    private readonly object _bufferLock = new();
    private const int BATCH_SIZE = 10; // Save metrics in batches
    private const int BUFFER_MAX_SIZE = 100; // Max buffer size before forced save

    public PerformanceService(
        ILogger<PerformanceService> logger,
        IStorageService? storageService = null)
    {
        _logger = logger;
        _storageService = storageService;
    }

    public async Task StartStreamingAsync(IHubContext<SqlHub> hubContext)
    {
        if (_isStreaming)
        {
            _logger.LogWarning("PerformanceService streaming already started, ignoring duplicate start request");
            return;
        }

        _logger.LogInformation("Starting PerformanceService streaming");
        _isStreaming = true;
        _cancellationTokenSource = new CancellationTokenSource();

        await Task.Run(async () =>
        {
            _logger.LogInformation("PerformanceService streaming loop started");
            int iteration = 0;
            
            while (!_cancellationTokenSource.Token.IsCancellationRequested)
            {
                try
                {
                    iteration++;
                    
                    // Generate dummy CPU% data (between 0 and 100)
                    var cpuPercent = _random.NextDouble() * 100;
                    // Use strongly-typed DTO to enable source-generated serialization (no reflection needed)
                    var data = new PerformanceData
                    {
                        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        CpuPercent = Math.Round(cpuPercent, 2)
                    };

                    // Performance data logging reduced to Trace level to reduce noise
                    // Only log every 10th iteration at Debug level
                    if (iteration % 10 == 0)
                    {
                        _logger.LogDebug("Sending PerformanceData. Iteration: {Iteration}, CPU: {CpuPercent}", 
                            iteration, 
                            data.CpuPercent);
                    }

                    // Send to all connected clients
                    try
                    {
                    await hubContext.Clients.All.SendAsync("PerformanceData", data, _cancellationTokenSource.Token);
                        
                        // Buffer metrics for batch saving (if storage service available)
                        if (_storageService != null)
                        {
                            var metrics = new PerformanceMetricsDto
                            {
                                Id = Guid.NewGuid().ToString(),
                                ConnectionId = "default", // TODO: Get actual connection ID from context
                                Timestamp = DateTime.UtcNow,
                                CpuPercent = data.CpuPercent,
                                MemoryBytes = 0, // TODO: Get actual memory usage
                                ActiveConnections = 1, // TODO: Get actual connection count
                                QueryExecutionTimeMs = 0 // TODO: Get actual query execution time
                            };
                            
                            lock (_bufferLock)
                            {
                                _metricsBuffer.Enqueue(metrics);
                                
                                // Save in batches or if buffer is full
                                if (_metricsBuffer.Count >= BATCH_SIZE || _metricsBuffer.Count >= BUFFER_MAX_SIZE)
                                {
                                    var batch = new List<PerformanceMetricsDto>();
                                    while (batch.Count < BATCH_SIZE && _metricsBuffer.Count > 0)
                                    {
                                        batch.Add(_metricsBuffer.Dequeue());
                                    }
                                    
                                    // Save batch asynchronously (fire and forget)
                                    _ = Task.Run(async () =>
                                    {
                                        foreach (var metric in batch)
                                        {
                                            try
                                            {
                                                var saveResponse = await _storageService.SavePerformanceMetricsAsync(metric);
                                                if (!saveResponse.Success)
                                                {
                                                    // Only log as ERROR if it's an unexpected failure
                                                    // "No SignalR connection available" is expected when no client is connected
                                                    if (saveResponse.Error?.Contains("No SignalR connection available") == true)
                                                    {
                                                        _logger.LogDebug("Cannot save performance metrics: No SignalR connection (expected when no client connected). MetricId: {MetricId}", metric.Id);
                                                    }
                                                    else
                                                    {
                                                        _logger.LogWarning("Failed to save performance metrics. Error: {Error}, MetricId: {MetricId}", saveResponse.Error, metric.Id);
                                                    }
                                                }
                                            }
                                            catch (Exception ex)
                                            {
                                                // Only log as ERROR for unexpected exceptions
                                                _logger.LogError(ex, "Unexpected error saving performance metric. MetricId: {MetricId}", metric.Id);
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send PerformanceData. Iteration: {Iteration}, Data type: {Type}, Exception type: {ExceptionType}, StackTrace: {StackTrace}", 
                            iteration,
                            data.GetType().FullName,
                            ex.GetType().FullName,
                            ex.StackTrace);
                        throw;
                    }

                    // Send heartbeat every 2 seconds
                    // Use strongly-typed DTO to enable source-generated serialization (no reflection needed)
                    var heartbeat = new HeartbeatMessage
                    {
                        Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        Status = "connected"
                    };
                    
                    // Heartbeat logging reduced to reduce noise
                    // Only log every 10th heartbeat at Debug level
                    if (iteration % 10 == 0)
                    {
                        _logger.LogDebug("Sending Heartbeat. Iteration: {Iteration}, Timestamp: {Timestamp}", 
                            iteration,
                            heartbeat.Timestamp);
                    }
                    
                    try
                    {
                    await hubContext.Clients.All.SendAsync("Heartbeat", heartbeat, _cancellationTokenSource.Token);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to send Heartbeat. Heartbeat type: {Type}, Exception type: {ExceptionType}, StackTrace: {StackTrace}", 
                            heartbeat.GetType().FullName,
                            ex.GetType().FullName,
                            ex.StackTrace);
                        throw;
                    }

                    // Wait 1-2 seconds before next update
                    var delay = _random.Next(1000, 2000);
                    await Task.Delay(delay, _cancellationTokenSource.Token);
                }
                catch (OperationCanceledException)
                {
                    _logger.LogInformation("PerformanceService streaming cancelled");
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in performance streaming. Iteration: {Iteration}, Error: {ErrorMessage}", 
                        iteration, 
                        ex.Message);
                    await Task.Delay(1000, _cancellationTokenSource.Token);
                }
            }
            
            _logger.LogInformation("PerformanceService streaming loop ended");
        }, _cancellationTokenSource.Token);
        
        _logger.LogInformation("PerformanceService streaming started successfully");
    }

    public void StopStreaming()
    {
        _logger.LogInformation("Stopping PerformanceService streaming");
        _isStreaming = false;
        _cancellationTokenSource?.Cancel();
        _cancellationTokenSource?.Dispose();
        _cancellationTokenSource = null;
        _logger.LogInformation("PerformanceService streaming stopped");
    }
}

