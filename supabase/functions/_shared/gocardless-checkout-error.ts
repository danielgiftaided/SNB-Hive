const shortText = (value: unknown) => typeof value === "string"
  ? value.replace(/[\r\n\t]/g, " ").trim().slice(0, 240) : undefined;

export class GoCardlessCheckoutError extends Error {
  readonly details: {
    provider_status: number;
    provider_stage: string;
    provider_type?: string;
    provider_request_id?: string;
    provider_errors: { field?: string; reason?: string; message?: string }[];
  };

  constructor(path: string, status: number, payload: unknown, resuming = false) {
    const stage = path === "/billing_request_flows" ? "authorisation_flow" : "billing_request";
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    const info = error && typeof error === "object" ? error as Record<string, unknown> : {};
    // Keep only diagnostic fields: no raw provider response, request body,
    // credentials, bank details or arbitrary response metadata.
    const issues = (Array.isArray(info.errors) ? info.errors : []).slice(0, 3)
      .filter(item => item && typeof item === "object")
      .map(item => ({ field: shortText(item.field), reason: shortText(item.reason), message: shortText(item.message) }));
    const type = shortText(info.type);
    const summary = issues.map(item => [item.field, item.reason, item.message].filter(Boolean).join(": ")).join("; ")
      || type || shortText(info.message) || "No structured error details were returned";
    super(`GoCardless could not ${resuming ? "resume" : "create"} the ${stage === "billing_request" ? "payment request" : "payment authorisation page"} (HTTP ${status}): ${summary}`);
    this.name = "GoCardlessCheckoutError";
    this.details = { provider_status: status, provider_stage: `${resuming ? "resume_" : ""}${stage}`,
      provider_type: type, provider_request_id: shortText(info.request_id), provider_errors: issues };
  }
}
