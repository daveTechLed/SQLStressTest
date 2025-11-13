using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Factory for creating Extended Events processor instances.
/// </summary>
public class ExtendedEventsProcessorFactory : IExtendedEventsProcessorFactory
{
    private readonly ILoggerFactory _loggerFactory;
    private readonly SignalRMessageSender? _messageSender;
    private readonly ExtendedEventConverter? _eventConverter;

    public ExtendedEventsProcessorFactory(
        ILoggerFactory loggerFactory,
        SignalRMessageSender? messageSender = null,
        ExtendedEventConverter? eventConverter = null)
    {
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
        _messageSender = messageSender;
        _eventConverter = eventConverter;
    }

    public IExtendedEventsProcessor Create(ConcurrentDictionary<string, List<IXEvent>> events)
    {
        var logger = _loggerFactory.CreateLogger<ExtendedEventsProcessor>();
        return new ExtendedEventsProcessor(events, logger, _messageSender, _eventConverter);
    }
}

