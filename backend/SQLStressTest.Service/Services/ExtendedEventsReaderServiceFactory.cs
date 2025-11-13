using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Factory for creating Extended Events reader service instances.
/// </summary>
public class ExtendedEventsReaderServiceFactory : IExtendedEventsReaderServiceFactory
{
    private readonly ILoggerFactory _loggerFactory;

    public ExtendedEventsReaderServiceFactory(ILoggerFactory loggerFactory)
    {
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
    }

    public IExtendedEventsReaderService Create(
        string streamerConnectionString,
        string sessionName,
        IExtendedEventsProcessor eventProcessor,
        CancellationToken cancellationToken)
    {
        var logger = _loggerFactory.CreateLogger<ExtendedEventsReaderService>();
        return new ExtendedEventsReaderService(streamerConnectionString, sessionName, eventProcessor, cancellationToken, logger);
    }
}

