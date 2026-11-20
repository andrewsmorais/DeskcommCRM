export interface ApiSuccess<T> {
  data: T;
  meta?: {
    cursor?: string;
    has_more?: boolean;
    total?: number;
    request_id?: string;
    /** Capacidade de inscrever em follow-up, dita pelo servidor (GET de enrollments). */
    pode_inscrever?: boolean;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details: Record<string, unknown> | undefined,
    public readonly requestId: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}
