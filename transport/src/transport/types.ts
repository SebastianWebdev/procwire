export type Unsubscribe = () => void;

export type TransportState = "disconnected" | "connecting" | "connected" | "error";

export type TransportEvent = "connect" | "disconnect" | "error" | "data";

export type TransportEvents = {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  data: (data: Buffer) => void;
};

export type DataHandler = (data: Buffer) => void;

export interface Transport {
  readonly state: TransportState;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  write(data: Buffer): Promise<void>;
  onData(handler: DataHandler): Unsubscribe;

  on<TEvent extends TransportEvent>(event: TEvent, handler: TransportEvents[TEvent]): Unsubscribe;
}
