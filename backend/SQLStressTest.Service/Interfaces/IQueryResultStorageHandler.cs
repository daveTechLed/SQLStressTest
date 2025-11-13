using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for query result storage handler.
/// </summary>
public interface IQueryResultStorageHandler
{
    void SaveQueryResultAsync(ConnectionConfig config, string query, QueryResponse response, string? resultDataJson);
}

