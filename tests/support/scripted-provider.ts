// Test-only seam for Omise, Resend and R2. No production credentials or HTTP.
// Each call consumes an explicit outcome; an unscripted call fails closed.
export function scriptedProvider<Request, Response>() {
  const requests: Request[] = [];
  const outcomes: Array<() => Promise<Response>> = [];
  return {
    requests,
    respond(response: Response) { outcomes.push(async () => response); },
    fail(error: Error) { outcomes.push(async () => { throw error; }); },
    async call(request: Request): Promise<Response> {
      requests.push(structuredClone(request));
      const outcome = outcomes.shift();
      if (!outcome) throw new Error('No scripted provider outcome');
      return outcome();
    },
  };
}
