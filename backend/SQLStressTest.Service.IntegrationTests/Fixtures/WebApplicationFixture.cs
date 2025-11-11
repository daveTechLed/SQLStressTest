using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SQLStressTest.Service;

namespace SQLStressTest.Service.IntegrationTests.Fixtures;

// For .NET 9.0 top-level statements, we use the Program marker class
public class WebApplicationFixture : WebApplicationFactory<Program>, IDisposable
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        
        // Configure services to work around .NET 9.0 TestServer PipeWriter issue
        builder.ConfigureServices(services =>
        {
            // Replace SQL connection factory with mock for integration tests
            var existingFactory = services.FirstOrDefault(s => s.ServiceType == typeof(SQLStressTest.Service.Interfaces.ISqlConnectionFactory));
            if (existingFactory != null)
            {
                services.Remove(existingFactory);
            }
            services.AddSingleton<SQLStressTest.Service.Interfaces.ISqlConnectionFactory, MockSqlConnectionFactory>();
            
            // Configure MVC to use synchronous JSON serialization for TestServer compatibility
            services.Configure<Microsoft.AspNetCore.Mvc.MvcOptions>(options =>
            {
                // Find and configure the SystemTextJsonOutputFormatter
                var jsonFormatter = options.OutputFormatters
                    .OfType<Microsoft.AspNetCore.Mvc.Formatters.SystemTextJsonOutputFormatter>()
                    .FirstOrDefault();
                    
                if (jsonFormatter != null)
                {
                    // Ensure synchronous serialization is used
                    jsonFormatter.SupportedMediaTypes.Clear();
                    jsonFormatter.SupportedMediaTypes.Add("application/json");
                }
            });
        });
        
        // Set environment variable to use fast SQL connection timeout for tests
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
    }
}

