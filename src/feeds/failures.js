// Why a read of an incoming feed failed (ADR 0079), by the kind the service keeps as the feed's last
// failure, which the feed reader gives, and the editor's *Feeds* and *Publishing* pages say in
// words. This module imports nothing, so that the editor's code in the browser reads it as the
// service does.

export const FEED_FAILURES = Object.freeze({
  // It could not be reached, or a redirect led nowhere or too far.
  UNREACHABLE: 'unreachable',
  // It did not answer within the wait.
  TIMEOUT: 'timeout',
  // It answered with a status other than 2xx, which the failure holds.
  STATUS: 'status',
  // Its answer was larger than the most a feed may be.
  TOO_LARGE: 'too-large',
  // Its address, or one a redirect led to, is on a private network.
  NOT_PUBLIC: 'not-public',
  // Its answer is no RSS 2.0 or Atom feed.
  NOT_A_FEED: 'not-a-feed',
  // The site no longer has the type its items become.
  NO_TYPE: 'no-type',
  // Its posts could not be saved in the source repository.
  NOT_SAVED: 'not-saved',
});
