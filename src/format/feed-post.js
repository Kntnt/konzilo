// A post made from an incoming feed's item (ADR 0079), as its source file says it is one: the keys
// the feed reader writes, and the account it pushes with, which alone may change such a post. This
// module imports nothing, so that the editor's code in the browser reads it as the intake does.

// The source file's key that marks a post made from a feed: { item, version, dropped }, the item's
// ID in its feed, what tells that the item has changed, and the body elements the item held that
// the post's type does not take, where it held any. The key goes when the feed is removed, and the
// post is then a post like any other.
export const FEED_ITEM = 'feed';

// The key of the address of the original, the item's link, which the source file and the content
// file both hold, and a template reads; it stays when the feed is removed.
export const ORIGINAL_ADDRESS = 'originalAddress';

// The login of the machine account the feed reader pushes with, which the seed makes.
export const FEED_READER = 'feed-reader';

// Whether a post's fields, as its source file holds them, are those of a post made from a feed.
export const isFeedPost = (fields) => fields !== null && typeof fields === 'object' && fields[FEED_ITEM] !== undefined && fields[FEED_ITEM] !== null;
