/** An error a route turns straight into a JSON response. Lives alone so pure server modules can throw it without pulling in next/server. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
