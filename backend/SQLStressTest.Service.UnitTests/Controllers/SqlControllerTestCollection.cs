using Xunit;

namespace SQLStressTest.Service.Tests.Controllers;

/// <summary>
/// Test collection to prevent parallel execution of tests that share the static SqlController cache.
/// This ensures tests don't interfere with each other when accessing the static _cachedConnections field.
/// </summary>
[CollectionDefinition("SqlController Cache Tests")]
public class SqlControllerTestCollection
{
    // This class is used only to define the collection - no implementation needed
    // Tests in this collection will run sequentially, not in parallel
}

