/** One constructor shared by lifecycle services and low-level helpers. */
export class OwnerFailure extends Error {
  constructor(public code: string, public override cause: unknown) {
    super(`${code}: ${JSON.stringify(cause)}`);
  }
}
