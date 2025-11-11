namespace SQLStressTest.Service.Interfaces;

public interface ISqlConnectionFactory
{
    ISqlConnectionWrapper CreateConnection(string connectionString);
}

