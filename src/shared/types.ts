/** 25-character flattened board string */
export type Board = string;

/** 5x5 array of single characters */
export type Grid = string[][];

/** 'r' or 'b' */
export type Side = 'r' | 'b';

/** Cardinal direction */
export type Dir = 'n' | 's' | 'e' | 'w';

/** Game state sent from server to client */
export interface GameMessage {
  board: Board;
  redPlayer: string;
  bluPlayer: string;
  whoseTurn: Side | '';
  winner: Side | null;
  history: string[];
  validSteps: Record<string, string>;
  playingAs: Side;
}

/** Client -> server: join a game room */
export interface JoinMessage {
  gameKey: string;
}

/** Client -> server: make a move */
export interface MoveMessage {
  gameKey: string;
  step: string;
}

/** WebSocket message envelope */
export type WsMessage =
  | { type: 'update'; data: GameMessage }
  | { type: 'join'; data: JoinMessage }
  | { type: 'move'; data: MoveMessage };
