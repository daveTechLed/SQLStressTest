using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Orchestrates Extended Events reading using specialized services.
/// Single Responsibility: Coordination and orchestration only.
/// </summary>
public class ExtendedEventsReader : IExtendedEventsReader
{
    private readonly IExtendedEventsSessionManager _sessionManager;
    private readonly IExtendedEventsProcessor _eventProcessor;
    private readonly IExtendedEventsReaderService _readerService;
    private readonly ILogger<ExtendedEventsReader>? _logger;
    private bool _isDisposed;
    private Task? _readTask;

    public ExtendedEventsReader(
        IExtendedEventsSessionManager sessionManager,
        IExtendedEventsProcessor eventProcessor,
        IExtendedEventsReaderService readerService,
        ILogger<ExtendedEventsReader>? logger = null)
    {
        _sessionManager = sessionManager ?? throw new ArgumentNullException(nameof(sessionManager));
        _eventProcessor = eventProcessor ?? throw new ArgumentNullException(nameof(eventProcessor));
        _readerService = readerService ?? throw new ArgumentNullException(nameof(readerService));
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

