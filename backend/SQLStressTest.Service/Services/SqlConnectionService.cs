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
    private readonly ConnectionTester _connectionTester;
    private readonly QueryRunner _queryRunner;
    private readonly QueryResultSerializer _resultSerializer;
    private readonly QueryResultStorageHandler _storageHandler;

    public SqlConnectionService(
        IConnectionStringBuilder connectionStringBuilder,
        ISqlConnectionFactory connectionFactory,
        IStorageService? storageService = null,
        ILogger<SqlConnectionService>? logger = null)
    {
        // Create loggers using a factory if logger is provided
        ILogger<ConnectionTester>? connectionTesterLogger = null;
        ILogger<QueryRunner>? queryRunnerLogger = null;
        ILogger<QueryResultStorageHandler>? storageHandlerLogger = null;

        if (logger != null)
        {
            var loggerFactory = Microsoft.Extensions.Logging.LoggerFactory.Create(builder => builder.AddConsole());
            connectionTesterLogger = loggerFactory.CreateLogger<ConnectionTester>();
            queryRunnerLogger = loggerFactory.CreateLogger<QueryRunner>();
            storageHandlerLogger = loggerFactory.CreateLogger<QueryResultStorageHandler>();
        }

        _connectionTester = new ConnectionTester(connectionStringBuilder, connectionFactory, connectionTesterLogger);
        _queryRunner = new QueryRunner(connectionStringBuilder, connectionFactory, queryRunnerLogger);
        _resultSerializer = new QueryResultSerializer();
        _storageHandler = new QueryResultStorageHandler(storageService, storageHandlerLogger);
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

