using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

public class SqlConnectionService : ISqlConnectionService
{
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly IStorageService? _storageService;
    private readonly ILogger<SqlConnectionService>? _logger;

    public SqlConnectionService(
        IConnectionStringBuilder connectionStringBuilder,
        ISqlConnectionFactory connectionFactory,
        IStorageService? storageService = null,
        ILogger<SqlConnectionService>? logger = null)
    {
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _storageService = storageService;
        _logger = logger;
    }

    public async Task<bool> TestConnectionAsync(ConnectionConfig config)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        var connectionString = _connectionStringBuilder.Build(config);

        try
        {
            using var connection = _connectionFactory.CreateConnection(connectionString);
            await connection.OpenAsync();
            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task<TestConnectionResponse> TestConnectionWithDetailsAsync(ConnectionConfig config)
    {
        if (config == null)
        {
            throw new ArgumentNullException(nameof(config));
        }

        var response = new TestConnectionResponse { Success = false };
        var connectionString = _connectionStringBuilder.Build(config);

        try
        {
            using var connection = _connectionFactory.CreateConnection(connectionString);
            await connection.OpenAsync();
            
            response.Success = true;
            response.ServerName = connection.DataSource;

            // Get server version
            try
            {
                using var versionCommand = connection.CreateCommand("SELECT @@VERSION");
                var version = await versionCommand.ExecuteScalarAsync();
                response.ServerVersion = version?.ToString();
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Failed to get server version");
                response.ServerVersion = "Unable to retrieve";
            }

            // Get authenticated user
            try
            {
                using var userCommand = connection.CreateCommand("SELECT SUSER_SNAME(), SYSTEM_USER, USER_NAME()");
                using var userReader = await userCommand.ExecuteReaderAsync();
                if (await userReader.ReadAsync())
                {
                    // SUSER_SNAME() = SQL Server login name (domain\user for Windows Auth)
                    // SYSTEM_USER = SQL Server login name
                    // USER_NAME() = Database user name
                    var sqlLogin = userReader.IsDBNull(0) ? null : userReader.GetValue(0)?.ToString();
                    var systemUser = userReader.IsDBNull(1) ? null : userReader.GetValue(1)?.ToString();
                    response.AuthenticatedUser = sqlLogin ?? systemUser ?? "Unknown";
                }
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Failed to get authenticated user");
                response.AuthenticatedUser = "Unable to retrieve";
            }

            // Get database list
            try
            {
                var databases = new List<string>();
                using var dbCommand = connection.CreateCommand("SELECT name FROM sys.databases WHERE state = 0 ORDER BY name"); // state 0 = ONLINE
                using var dbReader = await dbCommand.ExecuteReaderAsync();
                while (await dbReader.ReadAsync())
                {
                    if (!dbReader.IsDBNull(0))
                    {
                        databases.Add(dbReader.GetValue(0)?.ToString() ?? string.Empty);
                    }
                }
                response.Databases = databases;
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "Failed to get database list");
                response.Databases = new List<string>();
            }

            return response;
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "TestConnectionWithDetailsAsync failed");
            response.Success = false;
            response.Error = ex.Message;
            return response;
        }
    }

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

        // Save query result to storage (fire and forget - don't block response)
        if (_storageService != null && config != null)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    var resultDto = new QueryResultDto
                    {
                        Id = Guid.NewGuid().ToString(),
                        ConnectionId = config.Id ?? string.Empty,
                        Query = query,
                        ExecutionTimeMs = response.ExecutionTimeMs ?? 0,
                        ExecutedAt = DateTime.UtcNow,
                        Success = response.Success,
                        ErrorMessage = response.Error,
                        RowsAffected = response.Success && response.RowCount.HasValue ? response.RowCount.Value : null,
                        ResultData = response.Success && response.Rows != null 
                            ? System.Text.Json.JsonSerializer.Serialize(new { response.Columns, response.Rows })
                            : null
                    };

                    var saveResponse = await _storageService.SaveQueryResultAsync(resultDto);
                    if (!saveResponse.Success)
                    {
                        _logger?.LogWarning("Failed to save query result to storage. Error: {Error}", saveResponse.Error);
                    }
                    else
                    {
                        _logger?.LogDebug("Query result saved to storage. QueryId: {QueryId}, ConnectionId: {ConnectionId}", 
                            resultDto.Id, resultDto.ConnectionId);
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Error saving query result to storage");
                }
            });
        }

        return response;
    }
}

