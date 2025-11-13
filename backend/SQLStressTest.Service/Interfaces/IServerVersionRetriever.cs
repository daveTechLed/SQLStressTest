namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for server version retriever.
/// </summary>
public interface IServerVersionRetriever
{
    Task<string?> GetServerVersionAsync(ISqlConnectionWrapper connection);
}

