using Moq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Controllers;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Tests.Utilities;
using Xunit;

namespace SQLStressTest.Service.Tests.Controllers;

public class SqlControllerTests : TestBase
{
    private readonly Mock<ISqlConnectionService> _mockSqlConnectionService;
    private readonly Mock<IConnectionStringBuilder> _mockConnectionStringBuilder;
    private readonly Mock<ILogger<SqlController>> _mockLogger;
    private readonly SqlController _controller;

    public SqlControllerTests()
    {
        _mockSqlConnectionService = new Mock<ISqlConnectionService>();
        _mockConnectionStringBuilder = new Mock<IConnectionStringBuilder>();
        _mockLogger = new Mock<ILogger<SqlController>>();
        _controller = new SqlController(_mockSqlConnectionService.Object, _mockConnectionStringBuilder.Object, _mockLogger.Object);
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenSqlConnectionServiceIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlController(null!, _mockConnectionStringBuilder.Object, _mockLogger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenConnectionStringBuilderIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlController(_mockSqlConnectionService.Object, null!, _mockLogger.Object));
    }

    [Fact]
    public void Constructor_ThrowsArgumentNullException_WhenLoggerIsNull()
    {
        // Act & Assert
        Assert.Throws<ArgumentNullException>(() => 
            new SqlController(_mockSqlConnectionService.Object, _mockConnectionStringBuilder.Object, null!));
    }

    [Fact]
    public async Task TestConnection_ReturnsBadRequest_WhenConfigIsNull()
    {
        // Act
        var result = await _controller.TestConnection(null!);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<TestConnectionResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task TestConnection_ReturnsOk_WithSuccessTrue_WhenConnectionSucceeds()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        _mockSqlConnectionService.Setup(x => x.TestConnectionAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(true);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        Assert.Null(response.Error);
    }

    [Fact]
    public async Task TestConnection_ReturnsOk_WithSuccessFalse_WhenConnectionFails()
    {
        // Arrange
        var config = CreateTestConnectionConfig();
        _mockSqlConnectionService.Setup(x => x.TestConnectionAsync(It.IsAny<ConnectionConfig>()))
            .ReturnsAsync(false);

        // Act
        var result = await _controller.TestConnection(config);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var response = Assert.IsType<TestConnectionResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenRequestIsNull()
    {
        // Act
        var result = await _controller.ExecuteQuery(null!);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenConnectionIdIsEmpty()
    {
        // Arrange
        var request = new QueryRequest
        {
            ConnectionId = string.Empty,
            Query = "SELECT 1"
        };

        // Act
        var result = await _controller.ExecuteQuery(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_ReturnsBadRequest_WhenQueryIsEmpty()
    {
        // Arrange
        var request = new QueryRequest
        {
            ConnectionId = "test-conn",
            Query = string.Empty
        };

        // Act
        var result = await _controller.ExecuteQuery(request);

        // Assert
        var badRequestResult = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(400, badRequestResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(badRequestResult.Value);
        Assert.NotNull(response);
        Assert.False(response!.Success);
        Assert.NotNull(response.Error);
    }

    [Fact]
    public async Task ExecuteQuery_CallsSqlConnectionService()
    {
        // Arrange
        var request = new QueryRequest
        {
            ConnectionId = "test-conn",
            Query = "SELECT 1"
        };

        var expectedResponse = new QueryResponse
        {
            Success = true,
            RowCount = 1
        };

        _mockSqlConnectionService.Setup(x => x.ExecuteQueryAsync(
            It.IsAny<ConnectionConfig>(),
            It.IsAny<string>()))
            .ReturnsAsync(expectedResponse);

        // Act
        var result = await _controller.ExecuteQuery(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(200, okResult.StatusCode);
        var response = Assert.IsType<QueryResponse>(okResult.Value);
        Assert.NotNull(response);
        Assert.True(response!.Success);
        _mockSqlConnectionService.Verify(x => x.ExecuteQueryAsync(
            It.IsAny<ConnectionConfig>(),
            request.Query), Times.Once);
    }
}

