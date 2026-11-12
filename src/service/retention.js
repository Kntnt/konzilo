// Each form's submissions kept for its retention, and spam for seven days (ADR 0045), by a timed
// duty of the service in its role for editors (ADR 0044), which forgets what is older at its start
// and then every minute, so that what grew too old while it was stopped is gone once it starts.

// The days a form's submissions are kept until an Admin sets others on the *Mail* page, and the
// most and the fewest an Admin may set.
export const RETENTION_DAYS = 30;
export const RETENTION_LEAST = 1;
export const RETENTION_MOST = 3650;

// The days spam is kept, or its form's retention where that is shorter.
export const SPAM_DAYS = 7;

const DAY = 24 * 60 * 60_000;

// The duty. `store`: as store.js opens it, which holds each form's retention where an Admin has
// set one. A form the site no longer declares keeps its submissions for the retention it had.
//
// Gives { run() }, which forgets each form's submissions sent longer ago than its retention, and
// its spam sent longer ago than seven days, and gives how many it forgot.
export function retentionDuty({ store, now = () => new Date() }) {
  return {
    run() {
      const at = now().getTime();
      const kept = store.formSettings();
      let forgotten = 0;
      for (const form of store.formsHeld()) {
        const days = kept[form]?.retention ?? RETENTION_DAYS;
        forgotten += store.expire(form, { before: new Date(at - days * DAY), spamBefore: new Date(at - Math.min(days, SPAM_DAYS) * DAY) });
      }
      // What an earlier run, or an erasure, forgot while a reading held it back.
      store.settle();
      return forgotten;
    },
  };
}
