# School Database Design

## Tables

### students
Stores one row per student: `student_id` (primary key), `name` and `email`. The email is `UNIQUE` so two students can't share one, and both name and email are `NOT NULL` because every student needs them.

### courses
Stores one row per course: `course_id` (primary key), `title` and `credits`. Each course exists once, no matter how many students take it.

### enrolments
Stores the fact that a student is enrolled on a course. It has its own `enrolment_id` (primary key), a `student_id` and a `course_id` (both foreign keys, both `NOT NULL`) and a `grade`. The grade can be empty until it is awarded and must be between 0 and 100. A `UNIQUE (student_id, course_id)` rule stops the same student enrolling on the same course twice.

## Relationships

- **One student has many enrolments (one-to-many):** each enrolment belongs to exactly one student, but a student can have several enrolments.
- **One course has many enrolments (one-to-many):** each enrolment belongs to exactly one course, but a course can have many enrolments.
- **Students and courses are many-to-many:** a student can take many courses, and a course can have many students.

A **join table** (`enrolments`) is needed because a relational column holds a single value. We can't store a list of course ids inside a student row, or a list of student ids inside a course row, without breaking the rules of a clean table design. The join table turns one many-to-many relationship into two one-to-many relationships. It is also the natural place for data that belongs to the pair, such as the grade, because a grade belongs to a student *on* a course, not to the student or the course alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The `UNIQUE (student_id, course_id)` rule already creates an index that helps searches starting with the student. But "all students on one course" and "number of students per course" start from the course, so they would otherwise have to scan the whole table as it grows. An index on `course_id` makes those lookups fast.

## SQL or NoSQL?

I would choose SQL for this system. School data is structured and connected: students, courses and enrolments all link to each other, and the rules matter. A student's email must be unique, an enrolment must point to a real student and a real course, and nobody should be enrolled twice. A relational database enforces these rules itself with keys and constraints, and it makes questions like "which students are on this course?" or "who has no enrolments?" easy to answer with joins. NoSQL databases are better when data has no fixed shape or must be spread across many servers at huge scale, and a school's data doesn't need either, so SQL is the simpler and safer fit.