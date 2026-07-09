const express    = require("express");
const jwt        = require("jsonwebtoken");
const Admin      = require("../models/Admin");
const Lecturer   = require("../models/Lecturer");
const Course     = require("../models/Course");
const Student    = require("../models/Student");
const requireAdmin = require("../middleware/adminAuth");
const { getGrade, getStatus } = require("../utils/grading");

const router = express.Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin-setup-key-2024";

function signAdminToken(admin) {
  return jwt.sign(
    { id: admin._id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ── Auth ──────────────────────────────────────────────────
// POST /api/admin/register  (requires ADMIN_SECRET in body)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, institution, secret } = req.body;
    if (secret !== ADMIN_SECRET) {
      return res.status(403).json({ message: "Invalid admin setup key" });
    }
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    const existing = await Admin.findOne({ email });
    if (existing) return res.status(409).json({ message: "Admin account already exists" });
    const admin = await Admin.create({ name, email, password, institution });
    const token = signAdminToken(admin);
    res.status(201).json({ token, admin, role: "admin" });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

// POST /api/admin/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = signAdminToken(admin);
    res.json({ token, admin, role: "admin" });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// GET /api/admin/me
router.get("/me", requireAdmin, async (req, res) => {
  const admin = await Admin.findById(req.adminId);
  if (!admin) return res.status(404).json({ message: "Admin not found" });
  res.json({ ...admin.toJSON(), role: "admin" });
});

// ── Overview ──────────────────────────────────────────────
// GET /api/admin/overview
router.get("/overview", requireAdmin, async (req, res) => {
  try {
    const [lecturerCount, courseCount, students] = await Promise.all([
      Lecturer.countDocuments(),
      Course.countDocuments(),
      Student.find(),
    ]);

    let pass = 0, fail = 0;
    const gradeCounts = { A:0, B:0, C:0, D:0, E:0, F:0 };

    students.forEach((s) => {
      const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt = Math.min(100, et + (s.ca||0));
      const grade = getGrade(gt);
      gradeCounts[grade] += 1;
      if (getStatus(gt) === "PASS") pass += 1;
      else fail += 1;
    });

    const passRate = students.length > 0 ? Math.round((pass / students.length) * 100) : 0;

    res.json({
      lecturerCount,
      courseCount,
      studentCount: students.length,
      pass, fail, passRate, gradeCounts,
    });
  } catch (err) {
    res.status(500).json({ message: "Overview failed", error: err.message });
  }
});

// ── Lecturers List ────────────────────────────────────────
// GET /api/admin/lecturers
router.get("/lecturers", requireAdmin, async (req, res) => {
  try {
    const lecturers = await Lecturer.find().sort({ createdAt: -1 });

    const results = await Promise.all(lecturers.map(async (l) => {
      const courses  = await Course.find({ lecturer: l._id });
      const cIds     = courses.map((c) => c._id);
      const students = await Student.find({ course: { $in: cIds } });

      let pass = 0, fail = 0;
      students.forEach((s) => {
        const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
        const gt = Math.min(100, et + (s.ca||0));
        if (getStatus(gt) === "PASS") pass += 1;
        else fail += 1;
      });

      return {
        _id:          l._id,
        name:         l.name,
        email:        l.email,
        department:   l.department,
        courseCount:  courses.length,
        studentCount: students.length,
        pass, fail,
        passRate: students.length > 0 ? Math.round((pass / students.length) * 100) : 0,
      };
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Lecturers fetch failed", error: err.message });
  }
});

// GET /api/admin/lecturers/:id/courses
router.get("/lecturers/:id/courses", requireAdmin, async (req, res) => {
  try {
    const courses = await Course.find({ lecturer: req.params.id }).sort({ createdAt: -1 });
    const results = await Promise.all(courses.map(async (c) => {
      const students = await Student.find({ course: c._id });
      let pass = 0, fail = 0;
      students.forEach((s) => {
        const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
        const gt = Math.min(100, et + (s.ca||0));
        if (getStatus(gt) === "PASS") pass += 1;
        else fail += 1;
      });
      return {
        _id: c._id, code: c.code, title: c.title,
        level: c.level, semester: c.semester, session: c.session,
        studentCount: students.length, pass, fail,
        passRate: students.length > 0 ? Math.round((pass / students.length) * 100) : 0,
      };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Courses fetch failed", error: err.message });
  }
});

// ── Departmental Summary ──────────────────────────────────
// GET /api/admin/departments
router.get("/departments", requireAdmin, async (req, res) => {
  try {
    const students = await Student.find();
    const deptMap  = {};

    students.forEach((s) => {
      const dept = (s.department || "Unspecified").trim() || "Unspecified";
      const et   = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt   = Math.min(100, et + (s.ca||0));
      const st   = getStatus(gt);

      if (!deptMap[dept]) deptMap[dept] = { department: dept, total:0, pass:0, fail:0 };
      deptMap[dept].total += 1;
      if (st === "PASS") deptMap[dept].pass += 1;
      else               deptMap[dept].fail += 1;
    });

    const departments = Object.values(deptMap).map((d) => ({
      ...d,
      passRate: d.total > 0 ? Math.round((d.pass / d.total) * 100) : 0,
      failRate: d.total > 0 ? Math.round((d.fail / d.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    res.json(departments);
  } catch (err) {
    res.status(500).json({ message: "Department analysis failed", error: err.message });
  }
});

// ── Failed Students ───────────────────────────────────────
// GET /api/admin/failed-students?department=&level=&session=
router.get("/failed-students", requireAdmin, async (req, res) => {
  try {
    const { department = "", level = "", session = "" } = req.query;

    const courseQuery = {};
    if (level)   courseQuery.level   = level;
    if (session) courseQuery.session = session;
    const courses = await Course.find(courseQuery).populate("lecturer", "name email department");

    const courseMap = {};
    courses.forEach((c) => { courseMap[c._id.toString()] = c; });

    const studentQuery = { course: { $in: courses.map((c) => c._id) } };
    if (department) studentQuery.department = new RegExp(department, "i");

    const students = await Student.find(studentQuery);
    const failed   = [];

    students.forEach((s) => {
      const et = Math.min(70,(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0)+(s.q6||0)+(s.q7||0)+(s.q8||0));
      const gt = Math.min(100, et + (s.ca||0));
      if (getStatus(gt) === "FAIL") {
        const course = courseMap[s.course.toString()];
        failed.push({
          matric:     s.matric,
          name:       s.name,
          department: s.department,
          programme:  s.programme,
          examTotal:  et,
          ca:         s.ca,
          grandTotal: gt,
          grade:      getGrade(gt),
          course: {
            code:     course?.code,
            title:    course?.title,
            level:    course?.level,
            semester: course?.semester,
            session:  course?.session,
          },
          lecturer: {
            name:  course?.lecturer?.name,
            email: course?.lecturer?.email,
          },
        });
      }
    });

    res.json({ total: failed.length, failedStudents: failed });
  } catch (err) {
    res.status(500).json({ message: "Failed students fetch error", error: err.message });
  }
});

// DELETE /api/admin/lecturers/:id — remove a lecturer + all their courses and students
router.delete("/lecturers/:id", requireAdmin, async (req, res) => {
  try {
    const lecturer = await Lecturer.findById(req.params.id);
    if (!lecturer) return res.status(404).json({ message: "Lecturer not found" });

    // Get all their courses
    const courses = await Course.find({ lecturer: lecturer._id });
    const courseIds = courses.map((c) => c._id);

    // Delete all students in those courses
    if (courseIds.length) await Student.deleteMany({ course: { $in: courseIds } });

    // Delete all courses
    await Course.deleteMany({ lecturer: lecturer._id });

    // Delete the lecturer
    await lecturer.deleteOne();

    res.json({ message: `Lecturer ${lecturer.name} and all their data deleted.` });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

module.exports = router;