using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Utilities;
using SQLStressTest.Service.Tests.Utilities;
using Xunit;

namespace SQLStressTest.Service.Tests.Utilities;

public class ConnectionStringBuilderTests : TestBase
{
    private readonly IConnectionStringBuilder _builder;

    public ConnectionStringBuilderTests()
    {
        _builder = new ConnectionStringBuilder();
    }

    [Fact]
    public void Build_IncludesServer()
    {
        // Arrange
        var config = CreateTestConnectionConfig(server: "testserver");

        // Act
        var connectionString = _builder.Build(config);

        // Assert
        Assert.Contains("testserver", connectionString);
    }

    [Fact]
    public void Build_IncludesPort_WhenPortIsSpecified()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        config.Port = 1433;

        // Act
        var connectionString = _builder.Build(config);

        // Assert
        Assert.Contains("1433", connectionString);
    }

    [Fact]
    public void Build_IncludesDatabase()
    {
        // Arrange
        var config = CreateTestConnectionConfig(database: "testdb");

        // Act
        var connectionString = _builder.Build(config);

        // Assert
        Assert.Contains("testdb", connectionString);
    }

    [Fact]
    public void Build_IncludesIntegratedSecurity_WhenTrue()
    {
        // Arrange
        var config = CreateTestConnectionConfig(integratedSecurity: true);

        // Act
        var connectionString = _builder.Build(config);

        // Assert
        Assert.Contains("Integrated Security", connectionString);
    }

    [Fact]
    public void Build_IncludesUsernameAndPassword_WhenIntegratedSecurityIsFalse()
    {
        // Arrange
        var config = CreateTestConnectionConfig(integratedSecurity: false);
        config.Username = "testuser";
        config.Password = "testpass";

        // Act
        var connectionString = _builder.Build(config);

        // Assert
        Assert.Contains("testuser", connectionString);
        Assert.Contains("testpass", connectionString);
    }

    [Fact]
    public void Build_DefaultsToMaster_WhenDatabaseNotSpecified()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        config.Database = null;

        // Act
        var connectionString = _builder.Build(config);

        // Assert
        Assert.Contains("master", connectionString);
    }
}

