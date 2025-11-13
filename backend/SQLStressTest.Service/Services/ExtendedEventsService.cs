using System.Collections.Concurrent;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Controllers;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Hosted service that manages the Extended Events reader lifecycle.
/// Starts at application startup and shuts down cleanly on application shutdown.
/// </summary>
public class ExtendedEventsService : IHostedService, IDisposable
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly IStorageService? _storageService;
    private readonly ILogger<ExtendedEventsService> _logger;
    private readonly IExtendedEventsReaderFactory _readerFactory;
    private readonly ExtendedEventsStore _eventsStore;
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private IExtendedEventsReader? _eventsReader;
    private Task? _monitoringTask;
    private bool _isDisposed;

    public ExtendedEventsService(
        IConnectionStringBuilder connectionStringBuilder,
        IStorageService? storageService,
        ILogger<ExtendedEventsService> logger,
        IExtendedEventsReaderFactory readerFactory,
        ExtendedEventsStore eventsStore)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _storageService = storageService;
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _readerFactory = readerFactory ?? throw new ArgumentNullException(nameof(readerFactory));
        _eventsStore = eventsStore ?? throw new ArgumentNullException(nameof(eventsStore));
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("ExtendedEventsService starting...");
        
        // Start monitoring task that will wait for connections and start the reader
        _monitoringTask = Task.Run(async () => await MonitorAndStartReaderAsync(_cancellationTokenSource.Token), cancellationToken);
        
        _logger.LogInformation("ExtendedEventsService started");
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("ExtendedEventsService stopping...");
        
        // Cancel the monitoring task
        _cancellationTokenSource.Cancel();
        
        // Wait for monitoring task to complete (with timeout)
        if (_monitoringTask != null)
        {
            try
            {
                await Task.WhenAny(_monitoringTask, Task.Delay(TimeSpan.FromSeconds(5), cancellationToken));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error waiting for monitoring task to complete");
            }
        }
        
        // Stop and dispose the Extended Events reader
        if (_eventsReader != null)
        {
            try
            {
                _logger.LogInformation("Stopping Extended Events reader...");
                
                // Cancel the cancellation token to signal the read loop to stop
                _cancellationTokenSource.Cancel();
                
                // Wait a bit for the read loop to exit gracefully
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                
                // Dispose the reader (this will stop the session)
                _eventsReader.Dispose();
                _eventsReader = null;
                _logger.LogInformation("Extended Events reader stopped");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping Extended Events reader");
            }
        }
        
        _logger.LogInformation("ExtendedEventsService stopped");
    }

    private async Task MonitorAndStartReaderAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Extended Events monitoring task started. Waiting for connections...");
        
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                // Check if reader is already running
                if (_eventsReader != null)
                {
                    // Reader is running, just wait and check periodically
                    await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                    continue;
                }
                
                // Try to get a connection from the cache
                ConnectionConfig? connectionConfig = null;
                
                var cacheLock = SqlController.GetCacheLock();
                lock (cacheLock)
                {
                    var cachedConnections = SqlController.GetCachedConnections();
                    if (cachedConnections != null && cachedConnections.Count > 0)
                    {
                        // Use the first available connection
                        var firstConnection = cachedConnections[0];
                        connectionConfig = new ConnectionConfig
                        {
                            Id = firstConnection.Id,
                            Name = firstConnection.Name,
                            Server = firstConnection.Server,
                            Database = firstConnection.Database,
                            Username = firstConnection.Username,
                            Password = firstConnection.Password,
                            IntegratedSecurity = firstConnection.IntegratedSecurity,
                            Port = firstConnection.Port
                        };
                        
                        _logger.LogInformation("Found connection in cache: {ConnectionId} ({ConnectionName})", 
                            connectionConfig.Id, connectionConfig.Name);
                    }
                }
                
                // If we have a connection, start the Extended Events reader
                if (connectionConfig != null)
                {
                    try
                    {
                        await StartExtendedEventsReaderAsync(connectionConfig, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to start Extended Events reader for connection {ConnectionId}. Will retry later.", 
                            connectionConfig.Id);
                        // Wait before retrying
                        await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
                    }
                }
                else
                {
                    // No connection available yet, wait and check again
                    _logger.LogDebug("No connections available yet. Waiting...");
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Extended Events monitoring task cancelled");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Extended Events monitoring task");
                await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
            }
        }
        
        _logger.LogInformation("Extended Events monitoring task ended");
    }

    private async Task StartExtendedEventsReaderAsync(ConnectionConfig connectionConfig, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting Extended Events reader for connection: {ConnectionId} ({ConnectionName})", 
            connectionConfig.Id, connectionConfig.Name);
        
        try
        {
            // Build connection strings
            var connectionString = _connectionStringBuilder.Build(connectionConfig);
            var extendedEventsConnectionString = _connectionStringBuilder.BuildForExtendedEvents(connectionConfig);
            
            // Use shared events dictionary from ExtendedEventsStore
            var events = _eventsStore.Events;
            
            // Create and start the Extended Events reader with a persistent session
            // Use a fixed session name so it persists across restarts
            const string persistentSessionName = "SQLStressTest_Persistent";
            _eventsReader = _readerFactory.Create(
                connectionString,
                extendedEventsConnectionString,
                cancellationToken,
                events,
                sessionName: persistentSessionName,
                isPersistentSession: true);
            
            await _eventsReader.StartSessionAsync();
            
            // Add a small delay to ensure the session is fully available before starting to read
            await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
            
            await _eventsReader.StartReadingAsync();
            
            _logger.LogInformation("Extended Events reader started successfully. Session: {SessionName}", 
                _eventsReader.SessionName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start Extended Events reader");
            _eventsReader?.Dispose();
            _eventsReader = null;
            throw;
        }
    }

    public void Dispose()
    {
        if (!_isDisposed)
        {
            _cancellationTokenSource?.Cancel();
            _cancellationTokenSource?.Dispose();
            _eventsReader?.Dispose();
            _isDisposed = true;
        }
    }
}

