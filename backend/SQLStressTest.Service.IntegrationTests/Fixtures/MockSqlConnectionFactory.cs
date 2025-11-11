using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.IntegrationTests.Fixtures;

public class MockSqlConnectionFactory : ISqlConnectionFactory
{
    public ISqlConnectionWrapper CreateConnection(string connectionString)
    {
        return new MockSqlConnectionWrapper(connectionString);
    }
}

public class MockSqlConnectionWrapper : ISqlConnectionWrapper
{
    private readonly string _connectionString;
    private bool _isOpen = false;

    public MockSqlConnectionWrapper(string connectionString)
    {
        _connectionString = connectionString;
    }

    public Task OpenAsync()
    {
        // Simulate connection failure for invalid servers/ports
        if (_connectionString.Contains("127.0.0.1") && _connectionString.Contains(",1"))
        {
            throw new Exception("Connection refused - invalid port");
        }
        
        if (_connectionString.Contains("invalid-server"))
        {
            throw new Exception("Server not found");
        }
        
        _isOpen = true;
        return Task.CompletedTask;
    }

    public ISqlCommandWrapper CreateCommand(string query)
    {
        if (!_isOpen)
        {
            throw new InvalidOperationException("Connection is not open");
        }
        return new MockSqlCommandWrapper(query);
    }

    public void Dispose()
    {
        _isOpen = false;
    }
}

public class MockSqlCommandWrapper : ISqlCommandWrapper
{
    private readonly string _query;

    public MockSqlCommandWrapper(string query)
    {
        _query = query;
    }

    public Task<ISqlDataReaderWrapper> ExecuteReaderAsync()
    {
        return Task.FromResult<ISqlDataReaderWrapper>(new MockSqlDataReaderWrapper(_query));
    }

    public void Dispose()
    {
    }
}

public class MockSqlDataReaderWrapper : ISqlDataReaderWrapper
{
    private readonly string _query;
    private int _rowIndex = -1;
    private readonly List<Dictionary<string, object?>> _data;

    public MockSqlDataReaderWrapper(string query)
    {
        _query = query;
        _data = new List<Dictionary<string, object?>>();
        
        // Return mock data for SELECT queries
        if (query.Trim().StartsWith("SELECT", StringComparison.OrdinalIgnoreCase))
        {
            _data.Add(new Dictionary<string, object?> { { "Result", 1 } });
        }
    }

    public int FieldCount => _data.Count > 0 ? _data[0].Count : 0;

    public string GetName(int i)
    {
        if (_data.Count > 0 && i < _data[0].Count)
        {
            return _data[0].Keys.ElementAt(i);
        }
        return $"Column{i}";
    }

    public bool IsDBNull(int i) => false;

    public object? GetValue(int i)
    {
        if (_rowIndex >= 0 && _rowIndex < _data.Count && i < _data[_rowIndex].Count)
        {
            return _data[_rowIndex].Values.ElementAt(i);
        }
        return null;
    }

    public Task<bool> ReadAsync()
    {
        _rowIndex++;
        return Task.FromResult(_rowIndex < _data.Count);
    }

    public void Dispose()
    {
    }
}

