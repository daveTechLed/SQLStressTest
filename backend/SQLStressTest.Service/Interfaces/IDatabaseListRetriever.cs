namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for database list retriever.
/// </summary>
public interface IDatabaseListRetriever
{
    Task<List<string>> GetDatabaseListAsync(ISqlConnectionWrapper connection);
}

