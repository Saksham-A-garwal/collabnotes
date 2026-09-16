export {};

declare global {
  namespace Express {
    interface Request {
      // Set by authGuard from the verified access token's `sub` claim.
      userId?: string;
    }
  }
}
