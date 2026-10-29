// Workers runtime module (worker.ts only; the Node server never loads it).
declare module "cloudflare:email" {
  export class EmailMessage {
    constructor(from: string, to: string, raw: string | ReadableStream);
    readonly from: string;
    readonly to: string;
  }
}
