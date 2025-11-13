using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for calculating data size from query result readers.
/// Single Responsibility: Data size calculation from query results only.
/// </summary>
public class QueryDataSizeCalculator
{
    private readonly DataSizeCalculator _dataSizeCalculator;

    public QueryDataSizeCalculator(DataSizeCalculator dataSizeCalculator)
    {
        _dataSizeCalculator = dataSizeCalculator ?? throw new ArgumentNullException(nameof(dataSizeCalculator));
    }

    /// <summary>
    /// Calculates the total data size in bytes from a query result reader.
    /// Reads all rows and calculates the size of each value.
    /// </summary>
    /// <param name="reader">The data reader containing query results</param>
    /// <param name="cancellationToken">Cancellation token (checked but not passed to reader methods)</param>
    /// <returns>Total data size in bytes</returns>
    public async Task<long> CalculateDataSizeAsync(
        ISqlDataReaderWrapper reader,
        CancellationToken cancellationToken = default)
    {
        long totalDataSizeBytes = 0;

        // Read all rows to ensure query completes and calculate data size
        while (await reader.ReadAsync())
        {
            // Check cancellation before processing row
            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            // Calculate data size for this row
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (!reader.IsDBNull(i))
                {
                    var value = reader.GetValue(i);
                    if (value != null)
                    {
                        // Calculate size based on value type
                        totalDataSizeBytes += _dataSizeCalculator.CalculateValueSize(value);
                    }
                }
            }
        }

        return totalDataSizeBytes;
    }
}

