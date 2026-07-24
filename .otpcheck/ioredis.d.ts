declare module 'ioredis' {
  export class Redis {
    ttl(k: string): Promise<number>;
    incr(k: string): Promise<number>;
    expire(k: string, s: number): Promise<number>;
    set(k: string, v: string, ex: 'EX', s: number): Promise<'OK'>;
    quit(): Promise<'OK'>;
    disconnect(): void;
    on(ev: string, cb: (...a: any[]) => void): this;
    constructor(url: string, opts?: Record<string, unknown>);
  }
  export default Redis;
}
