# رؤيَة رقَميَّة (royaraqamia)

The public site and the product family it hosts. This glossary fixes the vocabulary
shared across the Blog, Certificates, Consultations, Training and Client Work offerings,
so the same concept is not named three different ways in code, copy and the admin UI.

## Language

### Training

**Training**:
The teaching offering as a whole, and the namespace the site exposes it under.
A Training may contain more than one Course; today it contains one.
_Avoid_: Academy, bootcamp, school

**Course**:
A single taught programme that a student applies to — the thing with a title, a
trainer, a price and a duration.
_Avoid_: Class, workshop, programme, module

**Application**:
A prospective student's request to join a Course. It is a lead: it reserves no seat
and involves no payment.
_Avoid_: Registration, enrollment, booking, signup

**Application Status**:
Where an Application sits in the operator's follow-up. `enrolled` records a human
decision to accept the applicant; it does not mean a seat was allocated or paid for.
_Avoid_: Booking status, payment status, order status

**Reference Code**:
The short human-readable identifier an applicant quotes on WhatsApp. It identifies an
Application and is deliberately not a secret.
_Avoid_: Tracking number, ticket, booking ref

### Certificates

**Certificate**:
Proof that a named student completed a named course.
_Avoid_: Diploma, credential, badge

**Certificate Code**:
The public identifier a Certificate is looked up by. Anyone holding it may verify the
Certificate.
_Avoid_: Verification ID, serial

### Consultations

**Consultation Booking**:
An anonymous, unpaid request for one or more Availability Slots. Unlike an
Application it holds scarce inventory until an operator confirms or rejects it, but
it requires no account and takes no payment.
_Avoid_: Appointment, meeting, session, application

**Availability Slot**:
A single bookable window of time. Only one active Booking may hold a Slot.
_Avoid_: Time slot, timeslot, meeting time

**Booking Reference**:
The short code (`CONS-2026-A7K2M9QX`) a booker quotes on WhatsApp. It plays the same
role as an Application's Reference Code and is likewise not a secret.
_Avoid_: Booking ID, ticket, tracking number

### Client Work

**Client**:
The person or company on the other side of a Project Request or a Retainer. Distinct from
a User: a Client needs no account.
_Avoid_: Customer, buyer, account

**Project Request**:
A prospective Client's request to have a project built — a lead with its own reference
code and no payment.
_Sold as_: طلب بناء مشروع
_Avoid_: Project inquiry, build application, order

**Retainer**:
A monthly arrangement in which royaraqamia maintains, fixes, improves or manages a
Client's own projects for a fixed monthly fee. It begins as a lead and becomes an
arrangement only when an operator activates it.
_Sold as_: التَّوظيف الشَّهري
_Avoid_: Employment, employee, salary, subscription, maintenance contract

### Showcase

**Portfolio Item**:
A published sample of royaraqamia's work, shown on the site as a showcase.
_Avoid_: Project, case study, work sample

### Shared

**Admin**:
A signed-in user whose email is on the server-side allowlist. Admin is a property of a
person, not a role anyone can be granted from the UI.
_Avoid_: Moderator, staff, editor

**Admin Console**:
The area under `/admin` that an Admin signs into to operate across the product family.
It is the single door to every operator-facing surface.
_Avoid_: Dashboard, backoffice, admin panel, CMS

### Rendering

**Heavy effect**:
A visual effect whose cost is paid on every frame or every scroll frame — blur, glow, motion,
3D transforms. Distinct from a static style, which is paid once when it is first rastered.
_Avoid_: Expensive style, fancy effect, glass effect

**Decorative effect**:
A Heavy effect that a non-per-frame alternative can replace without losing its function — a
backdrop blur that an opaque fill serves just as well.
_Avoid_: Cosmetic effect, eye candy

**Functional effect**:
An effect whose job — feedback, legibility or accessibility — cannot be delivered without it,
such as a loading shimmer, a focus ring or a dialog's enter/exit.
_Avoid_: Necessary animation, real effect
