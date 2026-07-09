const express = require("express");
const Course  = require("../models/Course");
const Student = require("../models/Student");
const requireAuth = require("../middleware/auth");
const { getGrade, getStatus } = require("../utils/grading");

const router = express.Router();
router.use(requireAuth);

// GET /api/analysis/carryover
// Returns all carry-over students grouped by level.
// A student is counted ONCE even if they failed multiple courses.
router.get("/carryover", async (req, res) => {
  try {
    const courses = await Course.find({ lecturer: req.lecturerId });
    if (!courses.length) return res.json({ totalCarryover: 0, byLevel: {} });

    const courseMap = {};
    courses.forEach((c) => { courseMap[c._id.toString()] = c; });

    const courseIds = courses.map((c) => c._id);
    const students  = await Student.find({ course: { $in: courseIds } });

    // carryoverMap: matric → { info, coursesFailed[] }
    const carryoverMap = {};

    students.forEach((s) => {
      const et = Math.min(70,
        (s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+
        (s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt = Math.min(100, et + (s.ca||0));

      if (gt < 40) { // failed
        const course = courseMap[s.course.toString()];
        const key = (s.matric || "").trim() || s._id.toString();

        if (!carryoverMap[key]) {
          carryoverMap[key] = {
            matric:      s.matric     || "",
            name:        s.name       || "",
            department:  s.department || "",
            programme:   s.programme  || "",
            level:       course?.level || "Unspecified",
            coursesFailed: [],
          };
        }
        carryoverMap[key].coursesFailed.push({
          code:       course?.code  || "",
          title:      course?.title || "",
          semester:   course?.semester || "",
          session:    course?.session  || "",
          examTotal:  et,
          ca:         s.ca || 0,
          grandTotal: gt,
          grade:      getGrade(gt),
        });
      }
    });

    // Group by level
    const byLevel = {};
    const LEVEL_ORDER = ["ND I", "ND II", "HND I", "HND II", "Unspecified"];

    Object.values(carryoverMap).forEach((student) => {
      const level = student.level || "Unspecified";
      if (!byLevel[level]) byLevel[level] = [];
      byLevel[level].push(student);
    });

    // Sort each level's students alphabetically by name
    Object.keys(byLevel).forEach((level) => {
      byLevel[level].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Build ordered result
    const ordered = {};
    LEVEL_ORDER.forEach((lvl) => { if (byLevel[lvl]) ordered[lvl] = byLevel[lvl]; });
    Object.keys(byLevel).forEach((lvl) => {
      if (!ordered[lvl]) ordered[lvl] = byLevel[lvl];
    });

    res.json({
      totalCarryover: Object.keys(carryoverMap).length,
      byLevel: ordered,
    });
  } catch (err) {
    res.status(500).json({ message: "Analysis failed", error: err.message });
  }
});

// GET /api/analysis/search?q=&department=&programme=&level=
// Searches across ALL courses for this lecturer
router.get("/search", async (req, res) => {
  try {
    const { q = "", department = "", programme = "", level = "" } = req.query;
    if (!q && !department && !programme && !level) {
      return res.json({ results: [] });
    }

    const courseQuery = { lecturer: req.lecturerId };
    if (level) courseQuery.level = level;
    const courses = await Course.find(courseQuery);
    if (!courses.length) return res.json({ results: [] });

    const courseMap = {};
    courses.forEach((c) => { courseMap[c._id.toString()] = c; });

    const studentQuery = { course: { $in: courses.map((c) => c._id) } };
    if (department) studentQuery.department = new RegExp(department, "i");
    if (programme)  studentQuery.programme  = new RegExp(programme, "i");
    if (q) {
      studentQuery.$or = [
        { name:   new RegExp(q, "i") },
        { matric: new RegExp(q, "i") },
      ];
    }

    const students = await Student.find(studentQuery).limit(200);

    const results = students.map((s) => {
      const course   = courseMap[s.course.toString()];
      const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt = Math.min(100, et + (s.ca||0));
      return {
        _id:        s._id,
        matric:     s.matric,
        name:       s.name,
        department: s.department,
        programme:  s.programme,
        examTotal:  et,
        ca:         s.ca,
        grandTotal: gt,
        grade:      getGrade(gt),
        status:     getStatus(gt),
        course: {
          _id:      course?._id,
          code:     course?.code,
          title:    course?.title,
          level:    course?.level,
          semester: course?.semester,
          session:  course?.session,
        },
      };
    });

    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: "Search failed", error: err.message });
  }
});

module.exports = router;