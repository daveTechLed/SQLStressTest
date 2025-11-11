namespace SQLStressTest.Service.Interfaces;

public interface ISqlConnectionWrapper : IDisposable
{
    Task OpenAsync();
    ISqlCommandWrapper CreateCommand(string query);
}

public interface ISqlCommandWrapper : IDisposable
{
    Task<ISqlDataReaderWrapper> ExecuteReaderAsync();
}

public interface ISqlDataReaderWrapper : IDisposable
{
    int FieldCount { get; }
    string GetName(int i);
    bool IsDBNull(int i);
    object? GetValue(int i);
    Task<bool> ReadAsync();
}

