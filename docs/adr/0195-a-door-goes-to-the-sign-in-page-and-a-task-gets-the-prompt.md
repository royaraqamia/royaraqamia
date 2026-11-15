# A door goes to the sign-in page; a task inside the page gets the prompt

#1503 put one question in front of every guest control: press it where you are,
answer the dialogue, and the sign-in page carries your destination. That is right
for a control that interrupts something the visitor is already doing — follow,
message, compose, save a link, or the paid pill whose destination is the
subscribe form one decision away.

It is wrong for the two controls that _are_ the page's whole next step. The free
plan card's «ابدأ مجَّانًا» and the community feed's guest empty state have nothing
to interrupt: the visitor is not mid-task, they are looking at a page that
explains, in one sentence, that there is nothing here until they sign in. Pressing
the button then answers that sentence with a dialogue asking whether they want to
sign in — the button already said so, and the dialogue is a second press for an
answer nobody doubted.

The device-notification switch was the same mistake in a different shape. It is a
setting, and a guest has no account for the server to attach a device to, so the
only answer it could give was `unauthorized` — the row read «انتهت جلستك» to
someone who was never signed in.

## The decision

1. **A surface's own door goes to `/auth/login` directly**, with its destination
   in `?redirect=`: the free plan card returns to `/pricing`, the community guest
   empty state to `/community`. No dialogue on the way.

2. **The prompt stays for controls inside a task.** Follow, direct message, the
   composer, the link and news FABs, the shortener hint, the account rows and the
   paid plan pill keep `useSignInPrompt`. Their destination is a thing the visitor
   was doing, not the page they were reading, and going straight to the sign-in
   page from one of them loses the task they were in the middle of.

3. **A setting with no account behind it is a gated row, not a switch.** The
   account page draws the device-notification row as the same `AccountRow` as its
   neighbours for a guest — a button that opens the prompt with this page as the
   destination — and as the real switch for a member. It never renders a control
   whose only reachable state is "session expired".

4. **The rule follows the destination, not the component.** What decides is
   whether the press starts something or finishes the page: `redirect` to the
   thing they were doing → prompt; `redirect` to the page they are on → straight
   to sign-in.

## Consequences

- **Two assertions invert.** `pricing-view.test.tsx` no longer expects a dialogue
  from the free card, and the community feed's guest state is now covered by
  `community-results.test.tsx`, which asserts the link and its destination.
- **The account page still says the same thing twice on purpose.** A guest sees
  «إشعارات الجهاز» as a row; a member sees it as a switch. Both read one label,
  `DEVICE_NOTIFICATIONS_LABEL`, so the two cannot drift.
- **The prompt is not deprecated.** It remains the answer for every control whose
  press would otherwise throw away work in progress; the free card and the empty
  feed are the exceptions because they have no work in progress to throw away.
