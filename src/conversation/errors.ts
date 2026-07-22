// Typed errors so the engine can distinguish failure modes and show safe,
// user-facing messages (never leaking internals or secrets).

/** A provider was asked to work but is not available/configured. */
export class ProviderUnavailableError extends Error {
  constructor(message = 'The conversation service is unavailable.') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/** A provider returned something that isn't a usable reply. */
export class InvalidProviderResponseError extends Error {
  constructor(message = 'The conversation service returned an invalid response.') {
    super(message);
    this.name = 'InvalidProviderResponseError';
  }
}
