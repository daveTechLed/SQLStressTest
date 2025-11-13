namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for calculating data size of query results.
/// Single Responsibility: Data size calculation only.
/// </summary>
public class DataSizeCalculator
{
    /// <summary>
    /// Calculates the size in bytes of a value based on its type.
    /// </summary>
    public long CalculateValueSize(object value)
    {
        return value switch
        {
            string str => System.Text.Encoding.UTF8.GetByteCount(str),
            byte[] bytes => bytes.Length,
            Guid guid => guid.ToByteArray().Length,
            DateTime dt => sizeof(long), // DateTime is stored as ticks (long)
            DateTimeOffset dto => sizeof(long) + sizeof(long), // Ticks + offset
            decimal dec => sizeof(decimal),
            double d => sizeof(double),
            float f => sizeof(float),
            long l => sizeof(long),
            int i => sizeof(int),
            short s => sizeof(short),
            byte b => sizeof(byte),
            bool bl => sizeof(bool),
            char c => sizeof(char),
            _ => System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(value).Length // Fallback: serialize to JSON and get size
        };
    }
}

