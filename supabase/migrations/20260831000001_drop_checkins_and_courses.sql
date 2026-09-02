-- Migration: Drop unused tables (Checkins and Courses related)
DROP TABLE IF EXISTS Checkins CASCADE;
DROP TABLE IF EXISTS UserProgress CASCADE;
DROP TABLE IF EXISTS Quizzes CASCADE;
DROP TABLE IF EXISTS CourseChunks CASCADE;
DROP TABLE IF EXISTS Courses CASCADE;

DROP FUNCTION IF EXISTS match_course_chunks(vector, text, int);