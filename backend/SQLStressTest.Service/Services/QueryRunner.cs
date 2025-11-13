using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for executing queries and reading results.
/// Single Responsibility: Query execution and result reading only.
/// </summary>
public class QueryRunner
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly ILogger<QueryRunner>? _logger;

    public QueryRunner(
        IConnectionStringBuilder connectionStringBuilder,
        ISqlConnectionFactory connectionFactory,
        ILogger<QueryRunner>? logger = null)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _logger = logger;
    }

    /// <summary>
    /// Executes a query and returns the results.
    /// </summary>
    public async Task<QueryResponse> ExecuteQueryAsync(ConnectionConfig config, string query)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        if (string.IsNullOrWhiteSpace(query))
        {
            throw new ArgumentException("Query cannot be null or empty", nameof(query));
        }

        var response = new QueryResponse { Success = false };
        var connectionString = _connectionStringBuilder.Build(config);
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            using var connection = _connectionFactory.CreateConnection(connectionString);
            await connection.OpenAsync();

            using var command = connection.CreateCommand(query);
            using var reader = await command.ExecuteReaderAsync();

            var columns = new List<string>();
            var rows = new List<List<object?>>();

            // Get column names
            for (int i = 0; i < reader.FieldCount; i++)
            {
                columns.Add(reader.GetName(i));
            }

            // Read rows
            while (await reader.ReadAsync())
            {
                var row = new List<object?>();
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    row.Add(reader.IsDBNull(i) ? null : reader.GetValue(i));
                }
                rows.Add(row);
            }

            stopwatch.Stop();

            response.Success = true;
            response.Columns = columns;
            response.Rows = rows;
            response.RowCount = rows.Count;
            response.ExecutionTimeMs = stopwatch.ElapsedMilliseconds;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            response.Success = false;
            response.Error = ex.Message;
            response.ExecutionTimeMs = stopwatch.ElapsedMilliseconds;
        }

        return response;
    }
}

