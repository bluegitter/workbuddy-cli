'use strict';
class SnapshotPublisher { constructor(snapshotSink) { this.snapshotSink = snapshotSink; } setSnapshotSink(snapshotSink) { this.snapshotSink = snapshotSink; } publish(snapshot) { try { this.snapshotSink?.publishSnapshot(snapshot); } catch {} } dispose() { this.snapshotSink?.dispose?.(); this.snapshotSink = undefined; } }
module.exports = Object.freeze({ SnapshotPublisher });
