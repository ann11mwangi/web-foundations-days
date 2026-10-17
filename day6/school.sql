-- school.sql: students, courses and enrolments (SQLite)

PRAGMA foreign_keys = ON;

-- 1. TABLES

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  title     TEXT NOT NULL,
  credits   INTEGER NOT NULL
);

CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL,
  course_id    INTEGER NOT NULL,
  grade        INTEGER CHECK (grade BETWEEN 0 AND 100),
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  FOREIGN KEY (course_id)  REFERENCES courses(course_id),
  UNIQUE (student_id, course_id)
);

-- 2. SAMPLE DATA

INSERT INTO students (name, email) VALUES
  ('Amina Wanjiru',  'amina@example.com'),
  ('Brian Otieno',   'brian@example.com'),
  ('Cynthia Mwangi', 'cynthia@example.com'),
  ('David Kamau',    'david@example.com');

INSERT INTO courses (title, credits) VALUES
  ('Web Development',        4),
  ('Databases',              3),
  ('Introduction to Python', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 90),
  (2, 3, NULL),
  (3, 2, 72),
  (3, 3, 88);

-- 3. QUERIES

-- Query 1: all courses for one student (by name)
SELECT c.title, c.credits, e.grade
FROM students s
JOIN enrolments e ON e.student_id = s.student_id
JOIN courses c    ON c.course_id  = e.course_id
WHERE s.name = 'Amina Wanjiru';

-- Query 2: all students on one course
SELECT s.name, s.email, e.grade
FROM courses c
JOIN enrolments e ON e.course_id  = c.course_id
JOIN students s   ON s.student_id = e.student_id
WHERE c.title = 'Databases';

-- Query 3: number of students per course
SELECT c.title, COUNT(e.enrolment_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON e.course_id = c.course_id
GROUP BY c.course_id, c.title;

-- Query 4: students who have no enrolments
SELECT s.student_id, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON e.student_id = s.student_id
WHERE e.enrolment_id IS NULL;

-- Query 5: update one enrolment's grade (Brian's grade in Introduction to Python)
UPDATE enrolments
SET grade = 95
WHERE student_id = (SELECT student_id FROM students WHERE name = 'Brian Otieno')
  AND course_id  = (SELECT course_id FROM courses WHERE title = 'Introduction to Python');

-- Check that the update worked
SELECT s.name, c.title, e.grade
FROM enrolments e
JOIN students s ON s.student_id = e.student_id
JOIN courses c  ON c.course_id  = e.course_id
WHERE s.name = 'Brian Otieno';