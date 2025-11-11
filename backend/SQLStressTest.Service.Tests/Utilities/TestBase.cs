using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Tests.Utilities;

public abstract class TestBase
{
    protected ConnectionConfig CreateTestConnectionConfig(
        string? server = null,
        string? database = null,
        bool integratedSecurity = true)
    {
        return new ConnectionConfig
        {
            Id = "test-conn-1",
            Name = "Test Server",
            Server = server ?? "localhost",
            Database = database ?? "master",
            IntegratedSecurity = integratedSecurity,
            Username = integratedSecurity ? null : "testuser",
            Password = integratedSecurity ? null : "testpass"
        };
    }
}

