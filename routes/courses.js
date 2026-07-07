const express = require("express");
const Course  = require("../models/Course");
const Student = require("../models/Student");
const requireAuth = require("../middleware/auth");
const { getGrade, getStatus } = require("../utils/grading");

const router = express.Router();
router.use(requireAuth);

// GET /api/courses
router.get("/", async (req, res) => {
  const courses = await Course.find({ lecturer: req.lecturerId }).sort({ createdAt: 1 });
  res.json(courses);
});

// POST /api/courses — add a course
router.post("/", async (req, res) => {
  try {
    const { code, title, level = "", semester = "", session = "" } = req.body;
    if (!code || !title) return res.status(400).json({ message: "Code and title are required" });
    const course = await Course.create({ code, title, level, semester, session, lecturer: req.lecturerId });
    res.status(201).json(course);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You already have a course with this code" });
    }
    res.status(500).json({ message: "Could not create course", error: err.message });
  }
});

// PUT /api/courses/:id — update course details
router.put("/:id", async (req, res) => {
  try {
    const course = await Course.findOne({ _id: req.params.id, lecturer: req.lecturerId });
    if (!course) return res.status(404).json({ message: "Course not found" });
    const fields = ["code", "title", "level", "semester", "session"];
    fields.forEach((f) => { if (req.body[f] !== undefined) course[f] = req.body[f]; });
    await course.save();
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: "Could not update course", error: err.message });
  }
});

// DELETE /api/courses/:id — remove a course and its students
router.delete("/:id", async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, lecturer: req.lecturerId });
  if (!course) return res.status(404).json({ message: "Course not found" });
  await Student.deleteMany({ course: course._id });
  await course.deleteOne();
  res.json({ message: "Course deleted" });
});

// GET /api/courses/:id/summary — full result analysis
router.get("/:id/summary", async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, lecturer: req.lecturerId });
  if (!course) return res.status(404).json({ message: "Course not found" });

  const students = await Student.find({ course: course._id });
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  let pass = 0;
  let fail = 0;
  let sat  = 0;
  const failedStudents = [];

  students.forEach((s) => {
    const examTotal  = Math.min(70, s.q1+s.q2+s.q3+s.q4+s.q5+s.q6+s.q7+s.q8);
    const grandTotal = Math.min(100, examTotal + s.ca);
    const grade  = getGrade(grandTotal);
    const status = getStatus(grandTotal);

    if (examTotal > 0) sat += 1;
    gradeCounts[grade] += 1;

    if (status === "PASS") {
      pass += 1;
    } else {
      fail += 1;
      failedStudents.push({
        matric: s.matric,
        name: s.name,
        department: s.department,
        programme: s.programme,
        examTotal,
        ca: s.ca,
        grandTotal,
        grade,
      });
    }
  });

  const passRate = students.length > 0 ? Math.round((pass / students.length) * 100) : 0;

  res.json({
    totalStudents: students.length,
    totalSat: sat,
    pass,
    fail,
    passRate,
    gradeCounts,
    failedStudents,
  });
});

module.exports = router;