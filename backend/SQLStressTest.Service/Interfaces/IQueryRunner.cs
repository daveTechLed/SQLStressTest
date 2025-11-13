using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for query runner.
/// </summary>
public interface IQueryRunner
{
    Task<QueryResponse> ExecuteQueryAsync(ConnectionConfig config, string query);
}

