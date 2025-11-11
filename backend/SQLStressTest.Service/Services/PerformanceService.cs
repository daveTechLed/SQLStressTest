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

    public PerformanceService(ILogger<PerformanceService> logger)
    {
        _logger = logger;
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

                    _logger.LogDebug("Sending PerformanceData. Iteration: {Iteration}, CPU: {CpuPercent}, Timestamp: {Timestamp}, DataType: {Type}, DataTypeName: {TypeName}", 
                        iteration, 
                        data.CpuPercent, 
                        data.Timestamp,
                        data.GetType(),
                        data.GetType().FullName);

                    // Log the actual object being sent
                    _logger.LogDebug("PerformanceData object details: Type={Type}, Assembly={Assembly}, IsValueType={IsValueType}, IsPrimitive={IsPrimitive}",
                        data.GetType(),
                        data.GetType().Assembly.FullName,
                        data.GetType().IsValueType,
                        data.GetType().IsPrimitive);

                    // Send to all connected clients
                    try
                    {
                        _logger.LogDebug("About to call SendAsync with PerformanceData. Method: {Method}, Arguments: {ArgCount}, ArgTypes: {ArgTypes}",
                            "PerformanceData",
                            1,
                            data.GetType().FullName);
                        await hubContext.Clients.All.SendAsync("PerformanceData", data, _cancellationTokenSource.Token);
                        _logger.LogDebug("PerformanceData sent successfully. Iteration: {Iteration}", iteration);
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
                    
                    _logger.LogDebug("Sending Heartbeat. Timestamp: {Timestamp}, HeartbeatType: {Type}, HeartbeatTypeName: {TypeName}", 
                        heartbeat.Timestamp,
                        heartbeat.GetType(),
                        heartbeat.GetType().FullName);
                    
                    // Log the actual object being sent
                    _logger.LogDebug("Heartbeat object details: Type={Type}, Assembly={Assembly}, IsValueType={IsValueType}, IsPrimitive={IsPrimitive}",
                        heartbeat.GetType(),
                        heartbeat.GetType().Assembly.FullName,
                        heartbeat.GetType().IsValueType,
                        heartbeat.GetType().IsPrimitive);
                    
                    try
                    {
                        _logger.LogDebug("About to call SendAsync with Heartbeat. Method: {Method}, Arguments: {ArgCount}, ArgTypes: {ArgTypes}",
                            "Heartbeat",
                            1,
                            heartbeat.GetType().FullName);
                        await hubContext.Clients.All.SendAsync("Heartbeat", heartbeat, _cancellationTokenSource.Token);
                        _logger.LogDebug("Heartbeat sent successfully");
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

