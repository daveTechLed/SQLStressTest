using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Interfaces;

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
                    var data = new
                    {
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        cpuPercent = Math.Round(cpuPercent, 2)
                    };

                    _logger.LogDebug("Sending PerformanceData. Iteration: {Iteration}, CPU: {CpuPercent}, Timestamp: {Timestamp}", 
                        iteration, 
                        data.cpuPercent, 
                        data.timestamp);

                    // Send to all connected clients
                    await hubContext.Clients.All.SendAsync("PerformanceData", data, _cancellationTokenSource.Token);

                    // Send heartbeat every 2 seconds
                    var heartbeat = new
                    {
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        status = "connected"
                    };
                    
                    _logger.LogDebug("Sending Heartbeat. Timestamp: {Timestamp}", heartbeat.timestamp);
                    await hubContext.Clients.All.SendAsync("Heartbeat", heartbeat, _cancellationTokenSource.Token);

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

