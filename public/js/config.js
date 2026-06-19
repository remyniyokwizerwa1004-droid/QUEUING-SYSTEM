// ============================================================
//  Feature Flags
// ------------------------------------------------------------
//  Single source of truth for toggling not-yet-ready features.
//
//  authEnabled: false
//    Online Registration + Login are NOT ready for production yet.
//    While this is false, the Register/Login UI stays VISIBLE but is
//    inert (it shows a "coming soon" notice instead of submitting).
//    The live queue dashboard, "Join Queue", and admin controls all
//    keep working WITHOUT requiring login.
//
//    To re-enable real auth later, flip this to true. That is the ONLY
//    change required — all login/registration wiring is gated on this
//    flag and is otherwise left intact.
// ============================================================
const FEATURES = {
  authEnabled: false,
};

// Expose on window so it is reachable from every script regardless of load order.
window.FEATURES = FEATURES;
