const express = require("express");
const Student = require("../models/Student");
const Course  = require("../models/Course");
const requireAuth = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const SCORE_FIELDS = ["matric", "q1","q2","q3","q4","q5","q6","q7","q8","q9","ca"];

function clamp(v, max) { return Math.max(0, Math.min(max, Number(v) || 0)); }

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
  const { matric="", q1=0,q2=0,q3=0,q4=0,q5=0,q6=0,q7=0,q8=0,q9=0,ca=0 } = req.body;
  const student = await Student.create({
    course: course._id, matric, q1,q2,q3,q4,q5,q6,q7,q8,q9,ca
  });
  res.status(201).json(student);
});

router.put("/:id", async (req, res) => {
  const student = await Student.findById(req.params.id).populate("course");
  if (!student || String(student.course.lecturer) !== req.lecturerId) {
    return res.status(404).json({ message: "Student not found" });
  }
  SCORE_FIELDS.forEach((f) => {
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
    if (!matric) { skipped += 1; return; }
    // Accept both qu1-qu9 and q1-q9 column names in CSV
    toInsert.push({
      course: course._id, matric,
      q1: clamp(row.qu1 ?? row.q1, 999),
      q2: clamp(row.qu2 ?? row.q2, 999),
      q3: clamp(row.qu3 ?? row.q3, 999),
      q4: clamp(row.qu4 ?? row.q4, 999),
      q5: clamp(row.qu5 ?? row.q5, 999),
      q6: clamp(row.qu6 ?? row.q6, 999),
      q7: clamp(row.qu7 ?? row.q7, 999),
      q8: clamp(row.qu8 ?? row.q8, 999),
      q9: clamp(row.qu9 ?? row.q9, 999),
      ca: clamp(row.ca, 30),
    });
  });

  const created = toInsert.length ? await Student.insertMany(toInsert) : [];
  res.status(201).json({ imported: created.length, skipped, students: created });
});

module.exports = router;