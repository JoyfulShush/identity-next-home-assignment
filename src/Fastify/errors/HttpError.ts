export class HttpError extends Error {
    public readonly statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = new.target.name;
        this.statusCode = statusCode;
    }
}
