namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for user info retriever.
/// </summary>
public interface IUserInfoRetriever
{
    Task<string> GetAuthenticatedUserAsync(ISqlConnectionWrapper connection);
}

