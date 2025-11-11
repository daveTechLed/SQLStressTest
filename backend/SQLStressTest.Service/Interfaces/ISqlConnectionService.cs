using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

public interface ISqlConnectionService
{
    Task<bool> TestConnectionAsync(ConnectionConfig config);
    Task<QueryResponse> ExecuteQueryAsync(ConnectionConfig config, string query);
}

