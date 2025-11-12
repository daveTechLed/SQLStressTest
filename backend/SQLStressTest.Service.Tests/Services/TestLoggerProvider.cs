using Microsoft.Extensions.Logging;
using Moq;

namespace SQLStressTest.Service.Tests.Services;

public class TestLoggerProvider : ILoggerProvider
{
    private readonly ILogger _logger;

    public TestLoggerProvider(ILogger logger)
    {
        _logger = logger;
    }

    public ILogger CreateLogger(string categoryName)
    {
        return _logger;
    }

    public void Dispose()
    {
    }
}

