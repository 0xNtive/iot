/**
 * Transmission history log with circular buffer for tracking recent events
 */

export interface TransmissionEvent {
  /** Event type */
  type: 'sent' | 'received' | 'error';
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Frame type or error description */
  frameType?: string;
  /** Number of bytes */
  bytes?: number;
  /** Error message if type is 'error' */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Circular buffer for tracking transmission events
 */
export class TransmissionLog {
  private events: TransmissionEvent[] = [];
  private maxSize: number;
  private writeIndex = 0;
  private full = false;

  /**
   * Create transmission log with specified capacity
   * @param maxSize Maximum number of events to store
   */
  constructor(maxSize: number = 1000) {
    if (maxSize <= 0) {
      throw new Error('maxSize must be positive');
    }
    this.maxSize = maxSize;
    this.events = new Array(maxSize);
  }

  /**
   * Log a sent frame event
   * @param frameType Type of frame sent
   * @param bytes Number of bytes sent
   * @param metadata Optional additional data
   */
  logSent(frameType: string, bytes: number, metadata?: Record<string, any>): void {
    this.addEvent({
      type: 'sent',
      timestamp: Date.now(),
      frameType,
      bytes,
      metadata,
    });
  }

  /**
   * Log a received frame event
   * @param frameType Type of frame received
   * @param bytes Number of bytes received
   * @param metadata Optional additional data
   */
  logReceived(frameType: string, bytes: number, metadata?: Record<string, any>): void {
    this.addEvent({
      type: 'received',
      timestamp: Date.now(),
      frameType,
      bytes,
      metadata,
    });
  }

  /**
   * Log an error event
   * @param error Error message
   * @param metadata Optional additional data
   */
  logError(error: string, metadata?: Record<string, any>): void {
    this.addEvent({
      type: 'error',
      timestamp: Date.now(),
      error,
      metadata,
    });
  }

  /**
   * Add an event to the circular buffer
   * @param event Event to add
   */
  private addEvent(event: TransmissionEvent): void {
    this.events[this.writeIndex] = event;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    if (this.writeIndex === 0) {
      this.full = true;
    }
  }

  /**
   * Get all events in chronological order (oldest first)
   * @returns Array of events
   */
  getEvents(): TransmissionEvent[] {
    if (!this.full) {
      // Buffer not full, return events from start to writeIndex
      return this.events.slice(0, this.writeIndex);
    }

    // Buffer is full, return events in correct order
    const older = this.events.slice(this.writeIndex);
    const newer = this.events.slice(0, this.writeIndex);
    return [...older, ...newer];
  }

  /**
   * Get recent events (newest first)
   * @param count Maximum number of recent events to return
   * @returns Array of recent events
   */
  getRecent(count: number): TransmissionEvent[] {
    const allEvents = this.getEvents();
    return allEvents.slice(-count).reverse();
  }

  /**
   * Get events within a time range
   * @param startTime Start timestamp (inclusive)
   * @param endTime End timestamp (inclusive)
   * @returns Events within the time range
   */
  getEventsByTimeRange(startTime: number, endTime: number): TransmissionEvent[] {
    return this.getEvents().filter(
      event => event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  /**
   * Get events of specific type
   * @param type Event type to filter by
   * @returns Events of the specified type
   */
  getEventsByType(type: TransmissionEvent['type']): TransmissionEvent[] {
    return this.getEvents().filter(event => event.type === type);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.writeIndex = 0;
    this.full = false;
    this.events = new Array(this.maxSize);
  }

  /**
   * Get current size of the log
   * @returns Number of events currently stored
   */
  size(): number {
    return this.full ? this.maxSize : this.writeIndex;
  }

  /**
   * Check if the log is at maximum capacity
   * @returns true if the circular buffer is full
   */
  isFull(): boolean {
    return this.full;
  }
}