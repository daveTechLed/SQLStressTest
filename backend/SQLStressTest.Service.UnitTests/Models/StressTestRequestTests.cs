using SQLStressTest.Service.Models;
using System.ComponentModel.DataAnnotations;
using Xunit;

namespace SQLStressTest.Service.Tests.Models;

public class StressTestRequestTests
{
    [Fact]
    public void Constructor_InitializesProperties()
    {
        // Act
        var request = new StressTestRequest();

        // Assert
        Assert.Equal(string.Empty, request.ConnectionId);
        Assert.Equal(string.Empty, request.Query);
        Assert.Equal(1, request.ParallelExecutions);
        Assert.Equal(1, request.TotalExecutions);
    }

    [Fact]
    public void Validation_RequiresConnectionId()
    {
        // Arrange
        var request = new StressTestRequest
        {
            Query = "SELECT 1"
        };

        // Act
        var results = ValidateModel(request);
        var connectionIdError = results.FirstOrDefault(r => r.MemberNames.Contains("ConnectionId"));

        // Assert
        Assert.NotNull(connectionIdError);
    }

    [Fact]
    public void Validation_RequiresQuery()
    {
        // Arrange
        var request = new StressTestRequest
        {
            ConnectionId = "test-conn"
        };

        // Act
        var results = ValidateModel(request);
        var queryError = results.FirstOrDefault(r => r.MemberNames.Contains("Query"));

        // Assert
        Assert.NotNull(queryError);
    }

    [Fact]
    public void Validation_EnforcesParallelExecutionsRange()
    {
        // Arrange
        var request = new StressTestRequest
        {
            ConnectionId = "test-conn",
            Query = "SELECT 1",
            ParallelExecutions = 0 // Below minimum
        };

        // Act
        var results = ValidateModel(request);
        var parallelError = results.FirstOrDefault(r => r.MemberNames.Contains("ParallelExecutions"));

        // Assert
        Assert.NotNull(parallelError);
    }

    [Fact]
    public void Validation_EnforcesTotalExecutionsRange()
    {
        // Arrange
        var request = new StressTestRequest
        {
            ConnectionId = "test-conn",
            Query = "SELECT 1",
            TotalExecutions = 0 // Below minimum
        };

        // Act
        var results = ValidateModel(request);
        var totalError = results.FirstOrDefault(r => r.MemberNames.Contains("TotalExecutions"));

        // Assert
        Assert.NotNull(totalError);
    }

    private static IList<ValidationResult> ValidateModel(object model)
    {
        var validationResults = new List<ValidationResult>();
        var ctx = new ValidationContext(model, null, null);
        Validator.TryValidateObject(model, ctx, validationResults, true);
        return validationResults;
    }
}

