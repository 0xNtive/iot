export { SonicPixel } from './wavepx.js';
export { AudioManager, waveformsToWav } from './audio.js';
export { GGWaveTransport } from './transport.js';
export { encodeFrame, decodeFrame } from './protocol.js';
export { packBits, unpackBits, packValues, unpackValues } from './bitpack.js';
export { rleEncode, rleDecode, rleEncodeGray, rleDecodeGray, quantize, dequantize } from './rle.js';
export { encodeChunkedImage, encodeChunkedGrayImage, encodeChunkedPaletteImage, decodeChunkFrame, ChunkAssembler } from './chunked.js';
export { quantizeColors, encodePaletteImage, decodePaletteImage, type RGB, type PaletteImage } from './palette.js';
export { createQrMessage } from './qr.js';
export { ditherImage, type DitherAlgorithm } from './dither.js';
export {
  encodeGameFrame, decodeGameFrame, GAME_FRAME_TYPE,
  GameSubtype, ShotResult,
  type GameMessage, type SetupMessage, type ShotMessage, type ResultMessage, type WinMessage,
} from './game-protocol.js';
export {
  createGameState, canPlaceShip, placeShip, toggleOrientation,
  allShipsPlaced, computePlacementHash, confirmReady,
  receiveSetup, receiveShot, recordResult, checkWin, declareWin, switchTurn,
  GRID_SIZE, SHIP_SIZES,
  type GameState, type Ship, type CellState, type GamePhase,
} from './game-state.js';
export {
  FrameType,
  ECLevel,
  SonicProtocol,
  SonicState,
  type QrMessage,
  type ImgMessage,
  type TxtMessage,
  type ChunkedImgMessage,
  type SonicMessage,
  type SonicPixelConfig,
  type QrSendOptions,
} from './types.js';
export {
  MAX_PAYLOAD,
  PROTOCOL_VERSION,
  QR_VERSIONS,
  MAX_IMG_DIMENSION,
  MAX_TEXT_BYTES,
} from './constants.js';
export { deflateCompress, deflateDecompress, isCompressionAvailable } from './deflate.js';
export { encodeBlocks, FountainDecoder, type EncodedBlock } from './fountain.js';
export {
  TRANSFER_FRAME_TYPE, TransferSubtype,
  encodeTransferFrame, decodeTransferFrame, computeCrc32,
  type TransferMessage, type SynMessage, type SynAckMessage,
  type DataMessage, type DoneMessage, type AbortMessage,
} from './transfer-protocol.js';
export { TransferSenderSession, TransferReceiverSession } from './transfer-session.js';
