namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Factory interface for creating Extended Events reader service instances.
/// </summary>
public interface IExtendedEventsReaderServiceFactory
{
    IExtendedEventsReaderService Create(
        string streamerConnectionString,
        string sessionName,
        IExtendedEventsProcessor eventProcessor,
        CancellationToken cancellationToken);
}

