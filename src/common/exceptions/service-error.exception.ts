export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
