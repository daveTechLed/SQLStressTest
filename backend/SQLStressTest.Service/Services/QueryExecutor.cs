using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for executing SQL queries with context_info and calculating data size.
/// Single Responsibility: Query execution orchestration.
/// </summary>
public class QueryExecutor
{
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly ContextInfoSetter _contextInfoSetter;
    private readonly QueryDataSizeCalculator _dataSizeCalculator;

    public QueryExecutor(
        ISqlConnectionFactory connectionFactory,
        ContextInfoSetter contextInfoSetter,
        QueryDataSizeCalculator dataSizeCalculator)
    {
        _connectionFactory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        _contextInfoSetter = contextInfoSetter ?? throw new ArgumentNullException(nameof(contextInfoSetter));
        _dataSizeCalculator = dataSizeCalculator ?? throw new ArgumentNullException(nameof(dataSizeCalculator));
    }

    /// <summary>
    /// Executes a query with context_info set and calculates the total data size returned.
    /// </summary>
    public async Task<long> ExecuteQueryWithContextInfoAsync(
        string connectionString,
        string query,
        int executionNumber,
        CancellationToken cancellationToken)
    {
        using var connection = _connectionFactory.CreateConnection(connectionString);
        await connection.OpenAsync();

        // Set context_info using the dedicated service
        await _contextInfoSetter.SetContextInfoAsync(connection, executionNumber);

        // Execute the actual query
        using var command = connection.CreateCommand(query);
        using var reader = await command.ExecuteReaderAsync();

        // Calculate data size using the dedicated service
        return await _dataSizeCalculator.CalculateDataSizeAsync(reader, cancellationToken);
    }
}

