using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Factory for creating Extended Events session manager instances.
/// </summary>
public class ExtendedEventsSessionManagerFactory : IExtendedEventsSessionManagerFactory
{
    private readonly ILoggerFactory _loggerFactory;

    public ExtendedEventsSessionManagerFactory(ILoggerFactory loggerFactory)
    {
        _loggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
    }

    public IExtendedEventsSessionManager Create(
        string connectionString,
        string sessionName,
        bool isPersistentSession)
    {
        var logger = _loggerFactory.CreateLogger<ExtendedEventsSessionManager>();
        return new ExtendedEventsSessionManager(connectionString, sessionName, isPersistentSession, logger);
    }
}

