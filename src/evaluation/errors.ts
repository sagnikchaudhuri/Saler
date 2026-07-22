/** The evaluator was asked to work but is not available/configured. */
export class EvaluatorUnavailableError extends Error {
  constructor(message = 'The evaluation service is unavailable.') {
    super(message);
    this.name = 'EvaluatorUnavailableError';
  }
}
