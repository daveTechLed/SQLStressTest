using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for reading Extended Events from the stream.
/// Single Responsibility: Event reading only.
/// </summary>
public class ExtendedEventsReaderService
{
    private readonly string _streamerConnectionString;
    private readonly string _sessionName;
    private readonly ExtendedEventsProcessor _eventProcessor;
    private readonly CancellationToken _cancellationToken;
    private readonly ILogger<ExtendedEventsReaderService>? _logger;
    private XELiveEventStreamer? _reader;

    public ExtendedEventsReaderService(
        string streamerConnectionString,
        string sessionName,
        ExtendedEventsProcessor eventProcessor,
        CancellationToken cancellationToken,
        ILogger<ExtendedEventsReaderService>? logger = null)
    {
        _streamerConnectionString = streamerConnectionString ?? throw new ArgumentNullException(nameof(streamerConnectionString));
        _sessionName = sessionName ?? throw new ArgumentNullException(nameof(sessionName));
        _eventProcessor = eventProcessor ?? throw new ArgumentNullException(nameof(eventProcessor));
        _cancellationToken = cancellationToken;
        _logger = logger;
    }

    /// <summary>
    /// Initializes the XEvent reader.
    /// </summary>
    public void InitializeReader()
    {
        // Use streamer connection string (without TrustServerCertificate) for XELiveEventStreamer
        // which uses System.Data.SqlClient internally and doesn't support TrustServerCertificate keyword
        _reader = new XELiveEventStreamer(_streamerConnectionString, _sessionName);
    }

    /// <summary>
    /// Starts reading events in a background task.
    /// </summary>
    public Task StartReadingAsync()
    {
        if (_reader == null)
        {
            throw new InvalidOperationException("Reader must be initialized before reading events");
        }

        return Task.Run(async () => await ReadEventsLoopAsync(), _cancellationToken);
    }

    private async Task ReadEventsLoopAsync()
    {
        if (_reader == null)
        {
            _logger?.LogError("Cannot read events: reader is null");
            return;
        }

        try
        {
            _logger?.LogInformation("Starting Extended Events read loop");
            
            while (!_cancellationToken.IsCancellationRequested)
            {
                var readTask = _reader.ReadEventStream(
                    () =>
                    {
                        _logger?.LogDebug("Connected to Extended Events session");
                        return Task.CompletedTask;
                    },
                    xevent =>
                    {
                        _eventProcessor.ProcessEvent(xevent);
                        return Task.CompletedTask;
                    },
                    _cancellationToken);

                await readTask;
                _logger?.LogDebug("Exited ReadEventStream, continuing loop");
            }
        }
        catch (OperationCanceledException)
        {
            _logger?.LogInformation("Extended Events read loop cancelled");
        }
        catch (Exception sqlEx) when (sqlEx is System.Data.SqlClient.SqlException sqlException && sqlException.Number == 25727)
        {
            // Error 25727: "The Extended Events session has either been stopped or dropped and can no longer be accessed"
            _logger?.LogInformation("Extended Events session stopped or dropped. Read loop exiting gracefully. SessionName: {SessionName}", _sessionName);
        }
        catch (Exception sqlEx) when (sqlEx is System.Data.SqlClient.SqlException sqlException && sqlException.Number == 25728)
        {
            // Error 25728: "The Extended Events session could not be found"
            _logger?.LogWarning("Extended Events session not found. SessionName: {SessionName}", _sessionName);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error in Extended Events read loop");
        }
    }
}

