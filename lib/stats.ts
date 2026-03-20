/**
 * Transmission statistics collector for monitoring send/receive performance
 */

export interface TransmissionMetrics {
  sentFrames: number;
  receivedFrames: number;
  sentBytes: number;
  receivedBytes: number;
  errorCount: number;
  encodeTimeMs: number;
  decodeTimeMs: number;
  lastSentAt?: number;
  lastReceivedAt?: number;
  lastError?: string;
  lastErrorAt?: number;
}

/**
 * Statistics collector for transmission monitoring
 */
export class TransmissionStats {
  private metrics: TransmissionMetrics = {
    sentFrames: 0,
    receivedFrames: 0,
    sentBytes: 0,
    receivedBytes: 0,
    errorCount: 0,
    encodeTimeMs: 0,
    decodeTimeMs: 0,
  };

  /**
   * Record a sent frame
   * @param bytes Number of bytes sent
   * @param encodeTimeMs Time taken to encode in milliseconds
   */
  recordSent(bytes: number, encodeTimeMs: number): void {
    this.metrics.sentFrames++;
    this.metrics.sentBytes += bytes;
    this.metrics.encodeTimeMs += encodeTimeMs;
    this.metrics.lastSentAt = Date.now();
  }

  /**
   * Record a received frame
   * @param bytes Number of bytes received
   * @param decodeTimeMs Time taken to decode in milliseconds
   */
  recordReceived(bytes: number, decodeTimeMs: number): void {
    this.metrics.receivedFrames++;
    this.metrics.receivedBytes += bytes;
    this.metrics.decodeTimeMs += decodeTimeMs;
    this.metrics.lastReceivedAt = Date.now();
  }

  /**
   * Record an error
   * @param error Error message
   */
  recordError(error: string): void {
    this.metrics.errorCount++;
    this.metrics.lastError = error;
    this.metrics.lastErrorAt = Date.now();
  }

  /**
   * Get current statistics
   * @returns Copy of current metrics
   */
  getStats(): TransmissionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get error rate as percentage
   * @returns Error rate (0-100)
   */
  getErrorRate(): number {
    const total = this.metrics.sentFrames + this.metrics.receivedFrames;
    if (total === 0) return 0;
    return (this.metrics.errorCount / total) * 100;
  }

  /**
   * Get average encode time per frame
   * @returns Average encode time in milliseconds
   */
  getAverageEncodeTime(): number {
    if (this.metrics.sentFrames === 0) return 0;
    return this.metrics.encodeTimeMs / this.metrics.sentFrames;
  }

  /**
   * Get average decode time per frame
   * @returns Average decode time in milliseconds
   */
  getAverageDecodeTime(): number {
    if (this.metrics.receivedFrames === 0) return 0;
    return this.metrics.decodeTimeMs / this.metrics.receivedFrames;
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.metrics = {
      sentFrames: 0,
      receivedFrames: 0,
      sentBytes: 0,
      receivedBytes: 0,
      errorCount: 0,
      encodeTimeMs: 0,
      decodeTimeMs: 0,
    };
  }
}