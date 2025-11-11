using Microsoft.Data.SqlClient;
using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

public class SqlConnectionWrapper : ISqlConnectionWrapper
{
    private readonly SqlConnection _connection;

    public SqlConnectionWrapper(string connectionString)
    {
        _connection = new SqlConnection(connectionString);
    }

    public Task OpenAsync() => _connection.OpenAsync();

    public ISqlCommandWrapper CreateCommand(string query)
    {
        return new SqlCommandWrapper(new SqlCommand(query, _connection));
    }

    public void Dispose() => _connection.Dispose();
}

public class SqlCommandWrapper : ISqlCommandWrapper
{
    private readonly SqlCommand _command;

    public SqlCommandWrapper(SqlCommand command)
    {
        _command = command;
    }

    public Task<ISqlDataReaderWrapper> ExecuteReaderAsync()
    {
        return Task.FromResult<ISqlDataReaderWrapper>(new SqlDataReaderWrapper(_command.ExecuteReader()));
    }

    public void Dispose() => _command.Dispose();
}

public class SqlDataReaderWrapper : ISqlDataReaderWrapper
{
    private readonly SqlDataReader _reader;

    public SqlDataReaderWrapper(SqlDataReader reader)
    {
        _reader = reader;
    }

    public int FieldCount => _reader.FieldCount;
    public string GetName(int i) => _reader.GetName(i);
    public bool IsDBNull(int i) => _reader.IsDBNull(i);
    public object? GetValue(int i) => _reader.GetValue(i);
    public Task<bool> ReadAsync() => _reader.ReadAsync();

    public void Dispose() => _reader.Dispose();
}

