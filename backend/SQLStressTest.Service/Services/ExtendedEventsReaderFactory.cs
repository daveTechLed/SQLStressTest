using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Factory for creating ExtendedEventsReader instances.
/// Uses dependency injection and factory interfaces for proper separation of concerns.
/// </summary>
public class ExtendedEventsReaderFactory : IExtendedEventsReaderFactory
{
    private readonly IExtendedEventsSessionManagerFactory _sessionManagerFactory;
    private readonly IExtendedEventsProcessorFactory _processorFactory;
    private readonly IExtendedEventsReaderServiceFactory _readerServiceFactory;
    private readonly ILoggerFactory _loggerFactory;

    public ExtendedEventsReaderFactory(
        IExtendedEventsSessionManagerFactory sessionManagerFactory,
        IExtendedEventsProcessorFactory processorFactory,
        IExtendedEventsReaderServiceFactory readerServiceFactory,
        ILoggerFactory loggerFactory)
    {
        _sessionManagerFactory = sessionManagerFactory ?? throw new ArgumentNullException(nameof(sessionManagerFactory));
        _processorFactory = processorFactory ?? throw new ArgumentNullException(nameof(processorFactory));
        _readerServiceFactory = readerServiceFactory ?? throw new ArgumentNullException(nameof(readerServiceFactory));
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
    }

    public IExtendedEventsReader Create(
        string connectionString,
        string streamerConnectionString,
        CancellationToken cancellationToken,
        ConcurrentDictionary<string, List<IXEvent>> events,
        string? sessionName = null,
        bool isPersistentSession = false)
    {
        var sessionNameValue = sessionName ?? $"SQLStressTest_{DateTime.Now:yyyyMMddHHmmss}";
        
        // Create dependencies using factory interfaces (dependency inversion)
        var sessionManager = _sessionManagerFactory.Create(
            connectionString, 
            sessionNameValue, 
            isPersistentSession);
        
        var eventProcessor = _processorFactory.Create(events);
        
        var readerService = _readerServiceFactory.Create(
            streamerConnectionString,
            sessionNameValue,
            eventProcessor,
            cancellationToken);
        
        // Create logger for the reader
        var readerLogger = _loggerFactory.CreateLogger<ExtendedEventsReader>();
        
        // Create and return the reader
        return new ExtendedEventsReader(sessionManager, eventProcessor, readerService, readerLogger);
    }
}

