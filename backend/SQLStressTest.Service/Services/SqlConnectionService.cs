using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Orchestrates SQL connection operations using specialized services.
/// Single Responsibility: Coordination and orchestration only.
/// </summary>
public class SqlConnectionService : ISqlConnectionService
{
    private readonly IConnectionTester _connectionTester;
    private readonly IQueryRunner _queryRunner;
    private readonly IQueryResultSerializer _resultSerializer;
    private readonly IQueryResultStorageHandler _storageHandler;

    public SqlConnectionService(
        IConnectionTester connectionTester,
        IQueryRunner queryRunner,
        IQueryResultSerializer resultSerializer,
        IQueryResultStorageHandler storageHandler)
    {
        _connectionTester = connectionTester ?? throw new ArgumentNullException(nameof(connectionTester));
        _queryRunner = queryRunner ?? throw new ArgumentNullException(nameof(queryRunner));
        _resultSerializer = resultSerializer ?? throw new ArgumentNullException(nameof(resultSerializer));
        _storageHandler = storageHandler ?? throw new ArgumentNullException(nameof(storageHandler));
    }

    public async Task<bool> TestConnectionAsync(ConnectionConfig config)
    {
        return await _connectionTester.TestConnectionAsync(config);
    }

    public async Task<TestConnectionResponse> TestConnectionWithDetailsAsync(ConnectionConfig config)
    {
        return await _connectionTester.TestConnectionWithDetailsAsync(config);
    }

    public async Task<QueryResponse> ExecuteQueryAsync(ConnectionConfig config, string query)
    {
        var response = await _queryRunner.ExecuteQueryAsync(config, query);

        // Serialize result data if successful
        string? resultDataJson = null;
        if (response.Success && response.Rows != null)
        {
            resultDataJson = _resultSerializer.BuildResultDataJson(response.Columns, response.Rows);
        }

        // Save to storage (fire and forget)
        _storageHandler.SaveQueryResultAsync(config, query, response, resultDataJson);

        return response;
    }
}

