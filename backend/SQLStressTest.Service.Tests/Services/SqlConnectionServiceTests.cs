using Moq;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;
using SQLStressTest.Service.Tests.Utilities;
using Xunit;

namespace SQLStressTest.Service.Tests.Services;

public class SqlConnectionServiceTests : TestBase
{
    private readonly Mock<IConnectionStringBuilder> _mockConnectionStringBuilder;
    private readonly Mock<ISqlConnectionFactory> _mockConnectionFactory;
    private readonly SqlConnectionService _service;

    public SqlConnectionServiceTests()
    {
        _mockConnectionStringBuilder = new Mock<IConnectionStringBuilder>();
        _mockConnectionFactory = new Mock<ISqlConnectionFactory>();
        _service = new SqlConnectionService(_mockConnectionStringBuilder.Object, _mockConnectionFactory.Object);
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenConnectionStringBuilderIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlConnectionService(null!, _mockConnectionFactory.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenConnectionFactoryIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlConnectionService(_mockConnectionStringBuilder.Object, null!));
    }

    [Fact]
    public async Task TestConnectionAsync_ThrowsArgumentNullException_WhenConfigIsNull()
    {
        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => _service.TestConnectionAsync(null!));
    }

    [Fact]
    public async Task ExecuteQueryAsync_ThrowsArgumentNullException_WhenConfigIsNull()
    {
        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => 
            _service.ExecuteQueryAsync(null!, "SELECT 1"));
    }

    [Fact]
    public async Task ExecuteQueryAsync_ThrowsArgumentException_WhenQueryIsNullOrEmpty()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        _mockConnectionStringBuilder.Setup(x => x.Build(It.IsAny<ConnectionConfig>()))
            .Returns("Server=localhost;Database=master;Integrated Security=true;");

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => 
            _service.ExecuteQueryAsync(config, null!));
        await Assert.ThrowsAsync<ArgumentException>(() => 
            _service.ExecuteQueryAsync(config, string.Empty));
        await Assert.ThrowsAsync<ArgumentException>(() => 
            _service.ExecuteQueryAsync(config, "   "));
    }

    [Fact]
    public async Task TestConnectionAsync_CallsConnectionStringBuilder()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var connectionString = "Server=localhost;Database=master;Integrated Security=true;";
        _mockConnectionStringBuilder.Setup(x => x.Build(It.IsAny<ConnectionConfig>()))
            .Returns(connectionString);
        
        var mockConnection = new Mock<ISqlConnectionWrapper>();
        mockConnection.Setup(x => x.OpenAsync()).Returns(Task.CompletedTask);
        _mockConnectionFactory.Setup(x => x.CreateConnection(connectionString))
            .Returns(mockConnection.Object);

        // Act
        var result = await _service.TestConnectionAsync(config);

        // Assert
        _mockConnectionStringBuilder.Verify(x => x.Build(config), Times.Once);
        _mockConnectionFactory.Verify(x => x.CreateConnection(connectionString), Times.Once);
        mockConnection.Verify(x => x.OpenAsync(), Times.Once);
        Assert.True(result);
    }

    [Fact]
    public async Task TestConnectionAsync_ReturnsFalse_WhenConnectionFails()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var connectionString = "Server=localhost;Database=master;Integrated Security=true;";
        _mockConnectionStringBuilder.Setup(x => x.Build(It.IsAny<ConnectionConfig>()))
            .Returns(connectionString);
        
        var mockConnection = new Mock<ISqlConnectionWrapper>();
        mockConnection.Setup(x => x.OpenAsync()).ThrowsAsync(new Exception("Connection failed"));
        _mockConnectionFactory.Setup(x => x.CreateConnection(connectionString))
            .Returns(mockConnection.Object);

        // Act
        var result = await _service.TestConnectionAsync(config);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task ExecuteQueryAsync_CallsConnectionStringBuilder()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        var connectionString = "Server=localhost;Database=master;Integrated Security=true;";
        _mockConnectionStringBuilder.Setup(x => x.Build(It.IsAny<ConnectionConfig>()))
            .Returns(connectionString);
        
        var mockConnection = new Mock<ISqlConnectionWrapper>();
        var mockCommand = new Mock<ISqlCommandWrapper>();
        var mockReader = new Mock<ISqlDataReaderWrapper>();
        
        mockConnection.Setup(x => x.OpenAsync()).Returns(Task.CompletedTask);
        mockConnection.Setup(x => x.CreateCommand("SELECT 1")).Returns(mockCommand.Object);
        mockCommand.Setup(x => x.ExecuteReaderAsync())
            .ReturnsAsync(mockReader.Object);
        
        mockReader.Setup(x => x.FieldCount).Returns(1);
        mockReader.Setup(x => x.GetName(0)).Returns("Column1");
        mockReader.Setup(x => x.ReadAsync()).ReturnsAsync(false);
        
        _mockConnectionFactory.Setup(x => x.CreateConnection(connectionString))
            .Returns(mockConnection.Object);

        // Act
        var result = await _service.ExecuteQueryAsync(config, "SELECT 1");

        // Assert
        _mockConnectionStringBuilder.Verify(x => x.Build(config), Times.Once);
        _mockConnectionFactory.Verify(x => x.CreateConnection(connectionString), Times.Once);
        mockConnection.Verify(x => x.OpenAsync(), Times.Once);
        mockConnection.Verify(x => x.CreateCommand("SELECT 1"), Times.Once);
        Assert.True(result.Success);
    }
}

