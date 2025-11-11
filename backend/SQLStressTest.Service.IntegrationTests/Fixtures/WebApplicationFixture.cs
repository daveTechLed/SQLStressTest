using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Formatters;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
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
            
            // Configure MVC to work around .NET 9.0 TestServer PipeWriter issue
            // TestServer's PipeWriter doesn't implement UnflushedBytes, so we need to
            // ensure synchronous serialization is used by configuring the formatter
            services.PostConfigure<Microsoft.AspNetCore.Mvc.MvcOptions>(options =>
            {
                // Replace SystemTextJsonOutputFormatter with one that uses synchronous writing
                var existingFormatter = options.OutputFormatters
                    .OfType<SystemTextJsonOutputFormatter>()
                    .FirstOrDefault();
                    
                if (existingFormatter != null)
                {
                    var index = options.OutputFormatters.IndexOf(existingFormatter);
                    
                    // Get the JsonSerializerOptions from the existing formatter using reflection
                    // SystemTextJsonOutputFormatter has a SerializerOptions property
                    var serializerOptionsProperty = existingFormatter.GetType().GetProperty("SerializerOptions");
                    var serializerOptions = serializerOptionsProperty?.GetValue(existingFormatter) as System.Text.Json.JsonSerializerOptions
                        ?? new System.Text.Json.JsonSerializerOptions();
                    
                    options.OutputFormatters.RemoveAt(index);
                    
                    // Use a custom formatter that uses synchronous serialization for TestServer
                    var syncFormatter = new TestServerCompatibleJsonOutputFormatter(serializerOptions);
                    options.OutputFormatters.Insert(0, syncFormatter); // Insert at beginning for priority
                }
            });
        });
        
        // Set environment variable to use fast SQL connection timeout for tests
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
    }
}

