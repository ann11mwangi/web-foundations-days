# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- 10 million registered users.
- 10% of them are active each day, so there are **1,000,000 daily active users (DAU)**.
- Each active user uploads **1 photo per day**.
- Each active user views **50 feed pages per day**.
- An average photo is **2 MB**, and each photo also gets a **50 KB thumbnail**.
- One day has 86,400 seconds.
- Peak traffic is **5×** the average.
- 1 TB = 1,000,000 MB (decimal units, to keep the arithmetic simple).
- Storage numbers count one copy of each file. Real storage will be higher because of backups and replication.

## 2. Estimates

### Uploads per second
- Uploads per day: 1,000,000 × 1 = 1,000,000
- Average: 1,000,000 / 86,400 ≈ **12 uploads per second**
- Peak: 12 × 5 ≈ **58 uploads per second**
- Upload bandwidth: about 23 MB/s on average and about 116 MB/s at peak (at 2 MB per photo).

### Feed views per second
- Feed views per day: 1,000,000 × 50 = 50,000,000
- Average: 50,000,000 / 86,400 ≈ **579 feed views per second**
- Peak: 579 × 5 ≈ **2,894 feed views per second**

### Photo storage per year
- Original photos: 1,000,000 × 2 MB = 2 TB per day, so 2 × 365 = **730 TB per year**
- Thumbnails: 1,000,000 × 50 KB = 50 GB per day, so about **18.25 TB per year**
- **Total: about 748 TB per year (roughly 0.75 PB)**

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 50 feed views for every 1 upload (50,000,000 reads against 1,000,000 writes a day), a ratio of 50 to 1.

What this means for the design:
- Spend most of the effort making **reads fast and cheap**: use a CDN and a cache so most requests never reach the database.
- Add a **read replica** so the many reads are spread away from the primary database, which only needs to handle the writes.
- Writes are low in number but large in size (2 MB each), so uploads should be handled in a way that does not slow down the feed.
- Example of the effect: if the cache answers about 90% of feed requests (an assumption), the database sees only about 290 reads per second at peak instead of 2,894.

## 4. Why photos should not be stored in the database

- Photos are large files. 748 TB a year would make the database huge, slow to back up, slow to restore and very expensive to run.
- Databases are built for small, structured rows that can be searched and joined. They are not built to stream large binary files.
- Every photo read would use up database connections and memory that the feed queries need.

Photos go into **object storage** instead. It is cheap, practically unlimited, and designed for large files. The database stores only the **metadata**: photo id, owner, caption, upload time and the storage key (the location of the file). Photos are then delivered to users through the CDN.

## 5. Architecture diagram

```
                 +-------------------+
                 |  Users (app/web)  |
                 +---------+---------+
                           |
              +------------+------------+
              |                         |
   photos and |                         | API calls
   thumbnails |                         | (feed, upload)
              v                         v
        +-----------+          +-----------------+
        |    CDN    |          |  Load Balancer  |
        +-----+-----+          +--------+--------+
              |                         |
   cache miss |            +------------+------------+
              |            |            |            |
              |            v            v            v
              |       +---------+  +---------+  +---------+
              |       |   App   |  |   App   |  |   App   |
              |       | Server 1|  | Server 2|  | Server N|
              |       +----+----+  +----+----+  +----+----+
              |            |            |            |
              |            +------------+------------+
              |                         |
              |            +------------+------------+
              |            |            |            |
              |            v            v            v
              |       +---------+  +---------+  +---------+
              |       |  Cache  |  | Primary |  |  Queue  |
              |       | (Redis) |  |   DB    |  +----+----+
              |       +---------+  +----+----+       |
              |                         | replicates v
              |                         v      +-----------+
              |                    +---------+ | Thumbnail |
              |                    |  Read   | |  Worker   |
              |                    | Replica | +-----+-----+
              |                    +---------+       |
              |                                      |
              v                                      v
        +------------------------------------------------------+
        |                    Object Storage                    |
        |         (original photos + 50 KB thumbnails)         |
        +------------------------------------------------------+
```

Notes on the diagram:
- The CDN fetches photos from Object Storage when it does not have them yet (a cache miss).
- The app servers also write the original photo straight into Object Storage during an upload (step 4 of the upload flow). That line is left out to keep the diagram readable.
- The app servers read feed data from the Cache first, then from the Read Replica, and send writes to the Primary DB.

## 6. What each component does

- **CDN:** it solves slow photo loading for faraway users by keeping copies of photos and thumbnails on servers close to them, which also takes load off our own servers.
- **Load balancer:** it solves the problem of one server being overwhelmed or failing by spreading requests across many app servers and skipping any that are down.
- **App servers:** they solve the problem of running the app's logic (login, feed building, uploads) at scale, because they hold no user data and so we can simply add more of them.
- **Cache:** it solves repeated slow database reads by keeping popular data, such as feeds and photo details, in fast memory.
- **Primary database:** it solves the need for one reliable source of truth for users, follows, photo metadata and comments, and it handles all writes.
- **Read replica:** it solves read overload on the primary database by serving a copy of the data to the many read queries.
- **Object storage:** it solves the problem of storing hundreds of terabytes of photos cheaply and safely, since a database is the wrong place for large files.
- **Queue:** it solves slow uploads by letting the app server hand off slow work (like making thumbnails) and reply to the user immediately.
- **Thumbnail worker:** it solves the cost of image processing by creating the 50 KB thumbnails in the background, so feeds load small images quickly.

## 7. Upload flow

1. The user picks a photo in the app and taps upload. The app sends the request, with the user's login token, to the **load balancer**.
2. The load balancer forwards it to a healthy **app server**.
3. The app server checks that the user is logged in, that the file is a valid image type (such as JPEG or PNG) and that it is under the size limit.
4. The app server saves the **original photo in object storage** and gets back a storage key.
5. The app server inserts a row in the **primary database**: photo id, user id, storage key, caption, upload time and thumbnail status "pending".
6. The app server puts a **"create thumbnail" job** on the **queue**, containing the photo id and storage key.
7. The app server immediately replies "Upload successful" to the user. It does not wait for the thumbnail.
8. A **thumbnail worker** takes the job from the queue, downloads the original from object storage and creates a 50 KB thumbnail.
9. The worker saves the thumbnail in object storage and updates the database row to "thumbnail ready". If the job fails, it goes back on the queue and is retried.
10. The cached feeds of the user's followers are refreshed or expire, so the new photo appears in their feeds. Its thumbnail is delivered through the CDN.

## 8. Trade-offs

1. **Cache: speed vs fresh data.** Caching feeds makes them fast and protects the database, but a follower might not see a new photo for a few seconds until the cache is refreshed or expires. We accept this because a feed that is a few seconds old is fine for a photo app. A short expiry time and clearing the cache on new uploads keep the delay small.
2. **Read replica: scale vs consistency.** A read replica lets us handle many more reads, but it can lag behind the primary by a moment. A user might upload a photo and not see it on their own profile straight away. To reduce this, we can read the user's own recent photos from the primary database.
3. **Queue and worker: fast uploads vs delayed thumbnails.** The user gets a quick "success" reply, but the thumbnail is not ready for a short time, so the app must show a placeholder. It also adds extra parts (the queue and workers) to run and monitor.
4. **CDN and object storage: speed and low cost vs running costs.** Photo delivery becomes fast and cheap per photo, but we pay for storage and for data leaving the CDN, and at about 748 TB a year that bill grows quickly. Moving old photos to cheaper storage after some months could reduce the cost.