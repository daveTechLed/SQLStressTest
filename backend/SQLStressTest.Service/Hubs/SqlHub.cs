using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Hubs;

public class SqlHub : Hub
{
    private readonly ILogger<SqlHub> _logger;

    public SqlHub(ILogger<SqlHub> logger)
    {
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connecting to SqlHub. ConnectionId: {ConnectionId}, User: {User}, Context: {Context}", 
            Context.ConnectionId, 
            Context.User?.Identity?.Name ?? "Anonymous",
            Context.GetHttpContext()?.Request?.Headers?.ToString() ?? "No context");

        try
        {
            await base.OnConnectedAsync();
            
            // Use strongly-typed DTO to enable source-generated serialization (no reflection needed)
            var heartbeat = new HeartbeatMessage
            {
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Status = "connected"
            };
            
            _logger.LogInformation("Sending initial heartbeat to connection {ConnectionId}. Timestamp: {Timestamp}, HeartbeatType: {Type}, HeartbeatTypeName: {TypeName}", 
                Context.ConnectionId, 
                heartbeat.Timestamp,
                heartbeat.GetType(),
                heartbeat.GetType().FullName);
            
            // Log the actual object being sent
            _logger.LogDebug("Heartbeat object details: Type={Type}, Assembly={Assembly}, IsValueType={IsValueType}, IsPrimitive={IsPrimitive}",
                heartbeat.GetType(),
                heartbeat.GetType().Assembly.FullName,
                heartbeat.GetType().IsValueType,
                heartbeat.GetType().IsPrimitive);
            
            try
            {
                await Clients.Caller.SendAsync("Heartbeat", heartbeat);
                _logger.LogInformation("Heartbeat sent successfully to connection {ConnectionId}", Context.ConnectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send heartbeat to connection {ConnectionId}. Heartbeat type: {Type}, Exception type: {ExceptionType}", 
                    Context.ConnectionId, 
                    heartbeat.GetType().FullName,
                    ex.GetType().FullName);
                throw;
            }
            
            _logger.LogInformation("Client connected successfully. ConnectionId: {ConnectionId}", Context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnConnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnecting from SqlHub. ConnectionId: {ConnectionId}", Context.ConnectionId);
        
        if (exception != null)
        {
            _logger.LogError(exception, "Client disconnected with error. ConnectionId: {ConnectionId}, Error: {ErrorMessage}", 
                Context.ConnectionId, 
                exception.Message);
        }
        
        try
        {
            await base.OnDisconnectedAsync(exception);
            _logger.LogInformation("Client disconnected successfully. ConnectionId: {ConnectionId}", Context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnDisconnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }
}

