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

// GET /api/analysis/level-summary
// Returns statistics grouped by level for the logged-in lecturer
router.get("/level-summary", async (req, res) => {
  try {
    const courses = await Course.find({ lecturer: req.lecturerId });
    if (!courses.length) return res.json({ byLevel: {} });

    const LEVEL_ORDER = ["ND I", "ND II", "HND I", "HND II"];
    const courseMap = {};
    courses.forEach((c) => { courseMap[c._id.toString()] = c; });

    const courseIds = courses.map((c) => c._id);
    const students  = await Student.find({ course: { $in: courseIds } });

    // Build per-course stats first
    const courseStats = {};
    courses.forEach((c) => {
      courseStats[c._id.toString()] = {
        code: c.code, title: c.title,
        level: c.level || "Unspecified",
        semester: c.semester, session: c.session,
        students: 0, passed: 0, failed: 0,
      };
    });

    // Track carry-over: matric -> set of levels where they failed
    const carryoverByLevel = {};

    students.forEach((s) => {
      const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt = Math.min(100, et + (s.ca||0));
      const status = getStatus(gt);
      const cs = courseStats[s.course.toString()];
      if (!cs) return;
      cs.students += 1;
      if (status === "PASS") cs.passed += 1;
      else {
        cs.failed += 1;
        // Track carry-over by level
        const lvl = cs.level;
        if (!carryoverByLevel[lvl]) carryoverByLevel[lvl] = new Set();
        carryoverByLevel[lvl].add((s.matric || "").trim() || s._id.toString());
      }
    });

    // Group by level
    const byLevel = {};
    Object.values(courseStats).forEach((cs) => {
      const lvl = cs.level || "Unspecified";
      if (!byLevel[lvl]) {
        byLevel[lvl] = {
          level: lvl,
          totalCourses: 0, totalRegistrations: 0,
          passed: 0, failed: 0, courses: [],
        };
      }
      const lvlData = byLevel[lvl];
      lvlData.totalCourses      += 1;
      lvlData.totalRegistrations += cs.students;
      lvlData.passed             += cs.passed;
      lvlData.failed             += cs.failed;
      cs.passRate = cs.students > 0 ? Math.round((cs.passed / cs.students) * 100) : 0;
      lvlData.courses.push(cs);
    });

    // Compute pass/fail rates and carry-over per level
    Object.keys(byLevel).forEach((lvl) => {
      const d = byLevel[lvl];
      const total = d.passed + d.failed;
      d.passRate      = total > 0 ? Math.round((d.passed / total) * 100) : 0;
      d.failRate      = total > 0 ? Math.round((d.failed / total) * 100) : 0;
      d.carryoverCount = carryoverByLevel[lvl]?.size || 0;
      // Sort courses by code
      d.courses.sort((a, b) => a.code.localeCompare(b.code));
    });

    // Return in standard level order
    const ordered = {};
    LEVEL_ORDER.forEach((lvl) => { if (byLevel[lvl]) ordered[lvl] = byLevel[lvl]; });
    Object.keys(byLevel).forEach((lvl) => { if (!ordered[lvl]) ordered[lvl] = byLevel[lvl]; });

    res.json({ byLevel: ordered });
  } catch (err) {
    res.status(500).json({ message: "Level summary failed", error: err.message });
  }
});

// ── Report Generation ────────────────────────────────────────
// GET /api/analysis/report/options
// Returns all unique semesters, sessions, departments for the filter dropdowns
router.get("/report/options", async (req, res) => {
  try {
    const courses  = await Course.find({ lecturer: req.lecturerId });
    const students = await Student.find({ course: { $in: courses.map((c) => c._id) } });

    const semesters   = [...new Set(courses.map((c) => c.semester).filter(Boolean))].sort();
    const sessions    = [...new Set(courses.map((c) => c.session).filter(Boolean))].sort();
    const departments = [...new Set(students.map((s) => s.department).filter(Boolean))].sort();

    res.json({ semesters, sessions, departments });
  } catch (err) {
    res.status(500).json({ message: "Options fetch failed", error: err.message });
  }
});

// GET /api/analysis/report?type=semester|session|department&semester=&session=&department=
router.get("/report", async (req, res) => {
  try {
    const { type, semester = "", session = "", department = "" } = req.query;
    if (!type) return res.status(400).json({ message: "Report type is required" });

    // Build course filter
    const courseQuery = { lecturer: req.lecturerId };
    if (semester)   courseQuery.semester = semester;
    if (session)    courseQuery.session  = session;

    const courses = await Course.find(courseQuery).sort({ code: 1 });
    if (!courses.length) return res.json({ type, filters: { semester, session, department }, summary: null, courses: [] });

    const courseMap = {};
    courses.forEach((c) => { courseMap[c._id.toString()] = c; });

    // Build student filter
    const studentQuery = { course: { $in: courses.map((c) => c._id) } };
    if (department) studentQuery.department = new RegExp(department, "i");

    const students = await Student.find(studentQuery);

    // Per-course stats
    const courseStats = {};
    courses.forEach((c) => {
      courseStats[c._id.toString()] = {
        _id: c._id, code: c.code, title: c.title,
        level: c.level, semester: c.semester, session: c.session,
        totalStudents: 0, passed: 0, failed: 0,
        gradeCounts: { A:0, B:0, C:0, D:0, E:0, F:0 },
        failedStudents: [],
      };
    });

    const carryoverSet = new Set();

    students.forEach((s) => {
      const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt = Math.min(100, et + (s.ca||0));
      const grade  = getGrade(gt);
      const status = getStatus(gt);
      const cs = courseStats[s.course.toString()];
      if (!cs) return;

      cs.totalStudents += 1;
      cs.gradeCounts[grade] += 1;
      if (status === "PASS") {
        cs.passed += 1;
      } else {
        cs.failed += 1;
        carryoverSet.add((s.matric || "").trim() || s._id.toString());
        cs.failedStudents.push({
          matric: s.matric, name: s.name, department: s.department, programme: s.programme,
          examTotal: et, ca: s.ca, grandTotal: gt, grade,
        });
      }
    });

    // Overall summary
    let totalStudents = 0, totalPassed = 0, totalFailed = 0;
    const overallGrades = { A:0, B:0, C:0, D:0, E:0, F:0 };

    const courseList = Object.values(courseStats).map((cs) => {
      cs.passRate = cs.totalStudents > 0 ? Math.round((cs.passed / cs.totalStudents) * 100) : 0;
      totalStudents += cs.totalStudents;
      totalPassed   += cs.passed;
      totalFailed   += cs.failed;
      Object.keys(cs.gradeCounts).forEach((g) => { overallGrades[g] += cs.gradeCounts[g]; });
      return cs;
    });

    const overallPassRate = totalStudents > 0 ? Math.round((totalPassed / totalStudents) * 100) : 0;

    res.json({
      type,
      filters: { semester, session, department },
      summary: {
        totalCourses:  courses.length,
        totalStudents, totalPassed, totalFailed,
        passRate: overallPassRate,
        failRate: totalStudents > 0 ? Math.round((totalFailed / totalStudents) * 100) : 0,
        carryoverCount: carryoverSet.size,
        gradeCounts: overallGrades,
      },
      courses: courseList,
    });
  } catch (err) {
    res.status(500).json({ message: "Report generation failed", error: err.message });
  }
});

module.exports = router;