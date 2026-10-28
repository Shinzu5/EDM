/**
 * Minimal type declarations for `simple-hl7` (v3.x), which ships no
 * TypeScript types. Lives in @medidata/shared so every workspace (apps/api
 * etc.) can reference it via its tsconfig `include` without duplicating shims.
 *
 * Covers the subset of the API used by the platform: parsing HL7 v2.x
 * pipe-delimited messages into Message/Segment/Field trees, and building
 * messages. Loosely typed by design — extend as the integrations grow.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'simple-hl7' {
  export class Field {
    value: string;
    components: Field[];
    subComponents: Field[];
    getField(index: number): Field | undefined;
    getComponent(index: number): string | undefined;
    toString(): string;
  }

  export class Segment {
    name: string;
    fields: Field[];
    getField(index: number): Field | undefined;
    toString(): string;
  }

  export class EscapeSequence {
    encode(input: string): string;
    decode(input: string): string;
  }

  export class Message {
    header: Segment;
    segments: Segment[];
    addSegment(segment: Segment): void;
    getSegments(name: string): Segment[];
    getSegment(name: string): Segment | undefined;
    toString(): string;
  }

  export class Parser {
    constructor(options?: Record<string, unknown>);
    parse(input: string): Message;
  }

  export class Builder {
    constructor(msc?: Record<string, unknown>);
    addSegment(segment: Segment): void;
    build(): string;
  }

  export class Application {
    constructor(name: string, options?: Record<string, unknown>);
    use(
      ...handlers: Array<(err: Error | null, msg: Message, next: () => void) => void>
    ): void;
    parse(input: string): void;
  }

  export class Server {
    constructor(options?: Record<string, unknown>);
    use(
      ...handlers: Array<(err: Error | null, msg: Message, next: () => void) => void>
    ): void;
    listen(port: number, host?: string, callback?: () => void): void;
    close(callback?: () => void): void;
  }

  interface SimpleHl7 {
    Parser: typeof Parser;
    Message: typeof Message;
    Segment: typeof Segment;
    Field: typeof Field;
    Builder: typeof Builder;
    Application: typeof Application;
    Server: typeof Server;
    EscapeSequence: typeof EscapeSequence;
  }

  const hl7: SimpleHl7;
  export default hl7;
}
