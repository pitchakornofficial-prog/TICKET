export function testDatabaseUrl(value = process.env.TEST_DATABASE_URL): string {
  const connectionString = value ?? 'postgresql://ticket:ticket_test_local@127.0.0.1:55433/ticket_test';
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.pathname !== '/ticket_test'
    || url.search) {
    throw new Error('Integration tests require a loopback ticket_test database without URL options');
  }
  return connectionString;
}
