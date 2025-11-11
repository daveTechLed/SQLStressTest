using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

public class SqlConnectionFactory : ISqlConnectionFactory
{
    public ISqlConnectionWrapper CreateConnection(string connectionString)
    {
        return new SqlConnectionWrapper(connectionString);
    }
}

