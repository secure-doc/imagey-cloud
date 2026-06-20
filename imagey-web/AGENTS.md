# Frontend Tests

The frontend tests (in `imagey-web`) can be executed with the command `npm run test`.

When adding new features or modifying existing logic, please adhere to the following testing strategy:

- **Playwright Pact Tests:** Extend the existing Playwright tests to cover the positive cases (e.g., successful interactions) and expected client-side errors (e.g., 400 Bad Request). These tests must generate Pact contracts to ensure API compatibility.
- **Error Tests:** Extend `errors.test.ts` (without Pact generation) to cover 500 server error cases or unexpected failures during the flow.

# Code Formatting

Use the command `npm run prettier` to format the codebase.

# MCP Servers

The Playwright MCP Server (`@modelcontextprotocol/server-playwright`) is configured in the `.agents/mcp.json` file at the root of the workspace. It can be used by the agent to visually inspect Playwright test results, navigate to generated local HTML dumps, and analyze browser behavior directly.
