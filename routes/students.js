const express = require("express");
const Student = require("../models/Student");
const Course = require("../models/Course");
const requireAuth = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function getOwnedCourse(courseId, lecturerId) {
  return Course.findOne({ _id: courseId, lecturer: lecturerId });
}

router.get("/course/:courseId", async (req, res) => {
  const course = await getOwnedCourse(req.params.courseId, req.lecturerId);
  if (!course) return res.status(404).json({ message: "Course not found" });
  const students = await Student.find({ course: course._id }).sort({ createdAt: 1 });
  res.json(students);
});

router.post("/course/:courseId", async (req, res) => {
  const course = await getOwnedCourse(req.params.courseId, req.lecturerId);
  if (!course) return res.status(404).json({ message: "Course not found" });
  const { matric = "", name = "", test = 0, assignment = 0, attendance = 0, exam = 0 } = req.body;
  const student = await Student.create({ course: course._id, matric, name, test, assignment, attendance, exam });
  res.status(201).json(student);
});

router.put("/:id", async (req, res) => {
  const student = await Student.findById(req.params.id).populate("course");
  if (!student || String(student.course.lecturer) !== req.lecturerId) {
    return res.status(404).json({ message: "Student not found" });
  }
  const fields = ["matric", "name", "test", "assignment", "attendance", "exam"];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) student[f] = req.body[f];
  });
  await student.save();
  res.json(student);
});

router.delete("/:id", async (req, res) => {
  const student = await Student.findById(req.params.id).populate("course");
  if (!student || String(student.course.lecturer) !== req.lecturerId) {
    return res.status(404).json({ message: "Student not found" });
  }
  await student.deleteOne();
  res.json({ message: "Student deleted" });
});

router.post("/course/:courseId/bulk", async (req, res) => {
  const course = await getOwnedCourse(req.params.courseId, req.lecturerId);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const rows = Array.isArray(req.body.students) ? req.body.students : [];
  const toInsert = [];
  let skipped = 0;

  rows.forEach((row) => {
    const matric = (row.matric || "").trim();
    const name = (row.name || "").trim();
    if (!matric || !name) {
      skipped += 1;
      return;
    }
    toInsert.push({
      course: course._id,
      matric,
      name,
      test: Math.max(0, Math.min(10, Number(row.test) || 0)),
      assignment: Math.max(0, Math.min(10, Number(row.assignment) || 0)),
      attendance: Math.max(0, Math.min(10, Number(row.attendance) || 0)),
      exam: Math.max(0, Math.min(70, Number(row.exam) || 0)),
    });
  });

  const created = toInsert.length ? await Student.insertMany(toInsert) : [];
  res.status(201).json({ imported: created.length, skipped, students: created });
});

module.exports = router;