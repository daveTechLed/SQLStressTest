using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Orchestrates Extended Events reading using specialized services.
/// Single Responsibility: Coordination and orchestration only.
/// </summary>
public class ExtendedEventsReader : IDisposable
{
    private readonly ExtendedEventsSessionManager _sessionManager;
    private readonly ExtendedEventsProcessor _eventProcessor;
    private readonly ExtendedEventsReaderService _readerService;
    private readonly ILogger<ExtendedEventsReader>? _logger;
    private bool _isDisposed;
    private Task? _readTask;

    public ExtendedEventsReader(
        string connectionString, 
        string streamerConnectionString,
        CancellationToken cancellationToken,
        ConcurrentDictionary<string, List<IXEvent>> events,
        ILogger<ExtendedEventsReader>? logger = null,
        string? sessionName = null,
        bool isPersistentSession = false,
        SignalRMessageSender? messageSender = null,
        ExtendedEventConverter? eventConverter = null)
    {
        var sessionNameValue = sessionName ?? $"SQLStressTest_{DateTime.Now:yyyyMMddHHmmss}";
        
        // Create loggers for sub-services
        ILogger<ExtendedEventsSessionManager>? sessionManagerLogger = null;
        ILogger<ExtendedEventsProcessor>? eventProcessorLogger = null;
        ILogger<ExtendedEventsReaderService>? readerServiceLogger = null;

        if (logger != null)
        {
            var loggerFactory = Microsoft.Extensions.Logging.LoggerFactory.Create(builder => builder.AddConsole());
            sessionManagerLogger = loggerFactory.CreateLogger<ExtendedEventsSessionManager>();
            eventProcessorLogger = loggerFactory.CreateLogger<ExtendedEventsProcessor>();
            readerServiceLogger = loggerFactory.CreateLogger<ExtendedEventsReaderService>();
        }

        _sessionManager = new ExtendedEventsSessionManager(
            connectionString, 
            sessionNameValue, 
            isPersistentSession, 
            sessionManagerLogger);
        
        _eventProcessor = new ExtendedEventsProcessor(events, eventProcessorLogger, messageSender, eventConverter);
        
        _readerService = new ExtendedEventsReaderService(
            streamerConnectionString,
            sessionNameValue,
            _eventProcessor,
            cancellationToken,
            readerServiceLogger);
        
        _logger = logger;
    }

    public async Task StartSessionAsync()
    {
        await _sessionManager.StartSessionAsync();
        _readerService.InitializeReader();
    }

    public async Task StopSessionAsync()
    {
        await _sessionManager.StopSessionAsync();
    }

    public Task StartReadingAsync()
    {
        _readTask = _readerService.StartReadingAsync();
        return _readTask;
    }

    public string SessionName => _sessionManager.SessionName;

    public void Dispose()
            {
        Dispose(true);
        GC.SuppressFinalize(this);
        }

    protected virtual void Dispose(bool disposing)
    {
        if (!_isDisposed)
        {
            if (disposing)
            {
                try
                {
                    _logger?.LogInformation("Disposing ExtendedEventsReader");
                    
                    // Wait for read task to complete if it's running
                    if (_readTask != null && !_readTask.IsCompleted)
                    {
                        _logger?.LogDebug("Waiting for read task to complete");
                        Task.Run(async () => await StopSessionAsync()).Wait(TimeSpan.FromSeconds(5));
                    }
                    else
                    {
                        Task.Run(async () => await StopSessionAsync()).Wait(TimeSpan.FromSeconds(5));
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Error during ExtendedEventsReader disposal");
                }
            }

            _isDisposed = true;
        }
    }
}

