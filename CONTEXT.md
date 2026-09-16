# رؤية رقمية (royaraqamia)

The public site and the product family it hosts. This glossary fixes the vocabulary
shared across the Blog, Certificates, Consultations and Training offerings, so the
same concept is not named three different ways in code, copy and the admin UI.

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

### Shared

**Admin**:
A signed-in user whose email is on the server-side allowlist. Admin is a property of a
person, not a role anyone can be granted from the UI.
_Avoid_: Moderator, staff, editor
