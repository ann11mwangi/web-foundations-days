# TicketHub Design

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part design framework: requirements, estimates, API, data model, architecture and trade-offs.

## 1. Requirements

### Functional requirements
- Users can register and log in.
- Users can browse events and see event details.
- Users can view the seat map of an event with each seat's availability.
- Users can hold seats for a short time (5 minutes) while they pay.
- Users can pay for held seats and receive their tickets.
- Users can view their tickets and receive a confirmation email.
- For a very popular sale, users wait in a virtual waiting room and are let in fairly.

### Non-functional requirements
- **Correctness (most important):** a seat must never be sold to two people, and a user must never be charged twice for one purchase.
- **Speed:** browsing pages load in under 300 ms, and a seat hold answers in under 1 second, even during a big sale.
- **Fairness:** first come, first served. Nobody can jump the line, and one person cannot grab all the seats (a limit of 6 seats per purchase, with limits on repeated requests to slow down bots).
- **Availability:** 99.9% uptime. During a big sale the site must stay up, so it slows people down in a waiting room instead of crashing.
- **Scalability:** it must cope with a sudden spike, and it must be able to add servers before a sale.
- **Durability:** a paid order is never lost.
- **Security:** HTTPS everywhere, passwords stored as hashes, and card details handled by the payment provider, never stored by us.

## 2. Estimates

### Assumptions
- 2 million registered users.
- Normal day: 50,000 visitors view 10 pages each, and 5,000 tickets are sold.
- Big sale: 200,000 people try to buy 20,000 seats within the first 10 minutes (600 seconds).
- One day has 86,400 seconds, and normal peak traffic is 5× the average.
- In the big sale each buyer makes about 5 requests (join the line, view seats, hold, pay, check the result), and half of the people arrive in the first minute.

### Normal traffic
- Page views: 50,000 × 10 = 500,000 per day, which is about **6 per second on average and 29 per second at peak**.
- Ticket sales: 5,000 per day, which is about **0.06 per second (one ticket every 17 seconds), or 0.3 per second at peak**.

### Big sale
- People arriving: 200,000 / 600 seconds = about **333 people per second** on average.
- Requests: 200,000 × 5 = 1,000,000 in 10 minutes, which is about **1,667 per second on average**. In the first minute, 100,000 people × 5 requests / 60 seconds is about **8,333 requests per second**.
- Ticket sales: 20,000 in 10 minutes, which is about **33 per second**.
- Only **10%** of the people trying (20,000 of 200,000) can succeed, so 9 out of 10 will be told the show is sold out.

### Comparison

| Measure | Normal day | Big sale | Difference |
|---|---|---|---|
| Requests per second (peak) | about 29 | about 8,333 | about 290× more |
| Tickets sold per second | 0.06 | 33 | about 575× more |
| Tickets sold in total | 5,000 per day | 20,000 in 10 minutes | 4× a normal day, in 10 minutes |

**What this means:** a normal day is easy for a small system. The design has to be built around the big sale, which has hundreds of times more traffic for a few minutes. Most of that traffic is reading (seat maps and availability), but a few thousand people compete at once for the same 20,000 seats, so correctness matters most there.

## 3. API

Base URL: `https://api.tickethub.example/v1`. All requests and responses are JSON, and the user's token is sent as `Authorization: Bearer <token>`.

| Method | Path | Description | Success status |
|--------|------|-------------|----------------|
| GET | `/events` | Browse events (supports `q`, `date` and `page`) | 200 OK |
| GET | `/events/{id}` | Get details of one event | 200 OK |
| GET | `/events/{id}/seats` | View the seat map with each seat's status | 200 OK |
| POST | `/events/{id}/queue` | Join the waiting room for a sale | 202 Accepted |
| POST | `/events/{id}/holds` | Hold one or more seats for 5 minutes | 201 Created |
| DELETE | `/holds/{id}` | Release held seats | 204 No Content |
| POST | `/orders` | Pay for a hold and receive tickets | 201 Created |
| GET | `/me/tickets` | View my tickets | 200 OK |

### Example: hold seats

`POST /events/7/holds`

```json
{ "seatIds": [1201, 1202] }
```

Response `201 Created`:

```json
{
  "holdId": "h_8f3a",
  "seatIds": [1201, 1202],
  "expiresAt": "2026-12-01T10:05:00Z"
}
```

If a seat was taken first, the response is `409 Conflict`:

```json
{
  "error": {
    "code": "SEAT_TAKEN",
    "message": "Seat 1202 was just taken. Please choose another seat.",
    "seatIds": [1202]
  }
}
```

### Example: pay for a hold

`POST /orders` with the header `Idempotency-Key: 7c9e5b1a-3d2f` (a unique code the app makes for each purchase attempt):

```json
{ "holdId": "h_8f3a", "paymentToken": "tok_abc123" }
```

Response `201 Created`:

```json
{
  "orderId": 9001,
  "status": "paid",
  "tickets": [
    { "ticketId": 5501, "seat": "A-1-1" },
    { "ticketId": 5502, "seat": "A-1-2" }
  ]
}
```

### Error codes

| Status | When it happens |
|--------|-----------------|
| 400 Bad Request | Missing or invalid data, or more than 6 seats requested |
| 401 Unauthorized | The user is not logged in |
| 402 Payment Required | The payment was declined |
| 404 Not Found | The event, hold or order does not exist |
| 409 Conflict | The seat was already held or sold by someone else |
| 410 Gone | The hold expired before the user paid |
| 429 Too Many Requests | Too many requests from one user or address, or the user must wait in the queue |
| 503 Service Unavailable | The system is overloaded and asks the user to try again shortly |

## 4. Data model

### Tables
- **users:** id, name, email (unique), password_hash, created_at.
- **events:** id, name, venue, starts_at, on_sale_at.
- **seats:** one row per seat for each event: id, event_id, section, row_label, seat_number, price_cents, status (`available`, `held` or `sold`), held_by, held_until.
- **orders:** id, user_id, event_id, total_cents, status (`pending`, `paid` or `failed`), idempotency_key (unique), created_at.
- **tickets:** id, order_id, seat_id (unique). One row for each seat that was sold.

### Relationships
- One user has many orders (one-to-many).
- One event has many seats (one-to-many) and many orders (one-to-many).
- One order has many tickets (one-to-many).
- Each seat has at most one ticket: the `UNIQUE` rule on `tickets.seat_id` makes this one-to-one at most. A seat can be held by one user at a time through `held_by`.
- `tickets` connects orders and seats, so an order can cover several seats while each seat can only ever belong to one order.

### CREATE TABLE statements (SQLite)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  venue      VARCHAR(200) NOT NULL,
  starts_at  TEXT NOT NULL,
  on_sale_at TEXT NOT NULL
);

CREATE TABLE seats (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL,
  section     VARCHAR(20) NOT NULL,
  row_label   VARCHAR(10) NOT NULL,
  seat_number INTEGER NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  status      VARCHAR(10) NOT NULL DEFAULT 'available'
              CHECK (status IN ('available', 'held', 'sold')),
  held_by     INTEGER,
  held_until  TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (held_by)  REFERENCES users(id),
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE orders (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  event_id        INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL CHECK (total_cents >= 0),
  status          VARCHAR(10) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed')),
  idempotency_key VARCHAR(64) NOT NULL UNIQUE,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE tickets (
  id       INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  seat_id  INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
```

The index on `seats (event_id, status)` makes the seat map fast, and the index on `orders (user_id, created_at DESC)` makes "my tickets" fast.

## 5. How the design prevents two people buying the same seat

Double-booking is stopped in several layers, and the database is the final judge at every layer.

**1. Holding a seat is one atomic update.** The app does not first check whether the seat is free and then update it, because two people could both pass that check at the same moment. Instead, one SQL statement does both in a single step:

```sql
UPDATE seats
SET status = 'held',
    held_by = :user_id,
    held_until = datetime('now', '+5 minutes')
WHERE id = :seat_id
  AND (status = 'available'
       OR (status = 'held' AND held_until < datetime('now')));
```

The database locks the seat's row while it updates it, so two simultaneous requests are handled one after the other. The first changes 1 row and wins. The second finds the seat already held, changes **0 rows**, and the app answers `409 Conflict`. Seats that are still held, or already sold, can never be taken.

**2. Holds expire.** A hold lasts 5 minutes (`held_until`). Once it passes, the seat can be held by someone else, and a background worker also releases expired holds so the seat map stays accurate. When a user starts paying, the hold is extended by a couple of minutes so it cannot expire halfway through the payment. If the payment fails, the seats are released.

**3. The purchase is one transaction.** Finishing an order runs as a single all-or-nothing transaction: check that the seats are still held by this user and not expired, insert the order, insert one ticket per seat, and set the seats to `sold`. If any step fails, everything is rolled back.

**4. A database constraint is the safety net.** `tickets.seat_id` is `UNIQUE`. Even if there were a bug in the code, the database would refuse to create a second ticket for the same seat, and the whole transaction would roll back. I tested this: the second insert fails with a "UNIQUE constraint failed" error.

**5. No double charging.** Each purchase attempt has an `idempotency_key`, which is `UNIQUE` in `orders`. If a user double-clicks "Pay" or the network retries the request, the second attempt is recognised as the same purchase and is not charged again.

**6. The cache never decides.** The seat map shown to users can come from a cache that is a second or two old, which is fine for display. But the cache is never used to decide whether a seat is free. Only the database does that, at the moment of the hold.

**Example:** Amina and Brian both click seat A-1-1 in the same instant. The database processes one update first, so Amina gets `201 Created` and Brian gets `409 SEAT_TAKEN`, so he picks another seat. Nobody is charged for a seat they did not get.

## 6. Architecture

```
                 +-------------------+
                 |  Client (browser) |
                 +---------+---------+
                           |
                           v
                    +-------------+
                    |     DNS     |
                    +------+------+
                           |
              +------------+------------+
              |                         |
 static files |                         | API calls
              v                         v
        +-----------+          +-----------------+
        |    CDN    |          |  Load Balancer  |
        +-----------+          +--------+--------+
                                        |
                                        v
                               +-----------------+
                               |  Waiting Room   |  lets only a limited number
                               +--------+--------+  of buyers in at a time
                                        |
                           +------------+------------+
                           |            |            |
                           v            v            v
                      +---------+  +---------+  +---------+
                      |   App   |  |   App   |  |   App   |
                      | Server 1|  | Server 2|  | Server 3|
                      +----+----+  +----+----+  +----+----+
                           |            |            |
                           +------------+------------+
                                        |
                           +------------+------------+
                           |            |            |
                           v            v            v
                      +---------+  +---------+  +---------+
                      |  Cache  |  | Primary |  | Message |
                      | (Redis) |  |   DB    |  |  Queue  |
                      +---------+  +----+----+  +----+----+
                                        |            |
                                        v            v
                                   +---------+ +-----------+
                                   |  Read   | |  Workers  |
                                   | Replica | +-----------+
                                   +---------+
```

Not drawn: the app servers call an external **payment provider** to take payments.

### What each component does
- **Client:** it shows the events and seat map to users and sends their requests to the API.
- **DNS:** it solves the problem of finding our servers by turning the name tickethub.example into the right address.
- **CDN:** it solves slow, overloaded page loads by serving images, scripts and event pages from servers close to users, so those requests never reach our own servers.
- **Load balancer:** it solves the problem of one server being overwhelmed or failing by spreading requests across servers and skipping any that are down, and it can limit how many requests one user or address sends.
- **Waiting room:** it solves the problem of 200,000 people hitting the system at once by letting only a limited number of buyers in at a time, in the order they arrived.
- **App servers:** they run the ticketing logic (holds, orders, validation), and because they store no data we can add more of them before a sale.
- **Cache:** it solves repeated database reads by keeping event details and a recent copy of the seat map in fast memory.
- **Primary database:** it solves the need for one reliable place that decides who gets each seat, and it handles every hold and purchase.
- **Read replica:** it solves read overload on the primary by serving browsing and "my tickets" queries from a copy of the data.
- **Message queue:** it solves slow purchases by letting the app server hand off slow work and reply to the user straight away.
- **Workers:** they solve the problem of slow background jobs by sending confirmation emails, creating tickets and releasing expired holds outside the purchase path.
- **Payment provider (external):** it solves the problem of handling card payments safely, so we never store card details.

### How it survives the big sale
- **The CDN absorbs most of the traffic.** Pages, images and scripts never reach our servers, which removes a large share of the roughly 8,333 requests per second.
- **The waiting room protects the database.** Instead of 200,000 people at once, only a controlled number (for example 2,000) are inside at a time, so the database sees a steady flow of holds and purchases. Everyone else sees "you are in line", in order of arrival.
- **The cache serves browsing.** Event details and the seat map are cached and refreshed every second or two. When the show sells out, a "sold out" flag in the cache answers late arrivals instantly without touching the database.
- **The app servers are added before the sale.** The sale time is known in advance, so we add servers (and load test) before it starts.
- **The database only does the essential work.** It handles holds and purchases, which are locked per seat, so people choosing different seats do not block each other. At most 20,000 tickets are sold, about 33 per second.
- **Slow work is moved out.** Emails and ticket creation go through the queue, so a slow email service cannot delay a purchase.
- **Bots are slowed down.** Request limits per user and address, plus a limit of 6 seats per purchase, keep resellers from grabbing the seats.
- **No single point of failure.** There are several app servers, and the database has a standby copy that can take over if the primary fails.

## 7. Trade-offs

1. **Waiting room: protection and fairness vs a worse experience.** The waiting room keeps the system alive and the sale fair, but users have to wait, and some people will wait a long time only to find the show sold out. We accept this because a crashed site would be worse for everybody.
2. **Hold time of 5 minutes: fewer failed payments vs seats tied up.** A longer hold gives people time to pay, but it locks seats that nobody may end up buying, which slows the sale. A shorter hold frees seats faster but rushes users. Five minutes is a middle choice.
3. **Cached seat map: speed vs accuracy.** The cached seat map can show a seat as free for a second or two after it was taken, so a user may click it and get a `409`. We accept this because the database makes the real decision, and the cache saves the database from thousands of reads per second.
4. **One primary database: correctness vs write scaling.** Having one place that decides each seat keeps the design simple and correct, but all writes go through one machine. The waiting room keeps the load within what it can handle, and if needed later we could split events across several databases.