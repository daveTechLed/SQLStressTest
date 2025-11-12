using SQLStressTest.Service.Models;
using Xunit;

namespace SQLStressTest.Service.Tests.Models;

public class StressTestResponseTests
{
    [Fact]
    public void Constructor_InitializesProperties()
    {
        // Act
        var response = new StressTestResponse();

        // Assert
        Assert.False(response.Success);
        Assert.Null(response.TestId);
        Assert.Null(response.Error);
        Assert.Null(response.Message);
    }

    [Fact]
    public void CanSetSuccessResponse()
    {
        // Arrange
        var testId = Guid.NewGuid().ToString();

        // Act
        var response = new StressTestResponse
        {
            Success = true,
            TestId = testId,
            Message = "Test completed successfully"
        };

        // Assert
        Assert.True(response.Success);
        Assert.Equal(testId, response.TestId);
        Assert.Equal("Test completed successfully", response.Message);
        Assert.Null(response.Error);
    }

    [Fact]
    public void CanSetErrorResponse()
    {
        // Act
        var response = new StressTestResponse
        {
            Success = false,
            Error = "Connection failed"
        };

        // Assert
        Assert.False(response.Success);
        Assert.Equal("Connection failed", response.Error);
    }
}

