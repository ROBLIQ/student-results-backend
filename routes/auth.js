const express = require("express");
const jwt = require("jsonwebtoken");
const Lecturer = require("../models/Lecturer");
const requireAuth = require("../middleware/auth");

const router = express.Router();

function signToken(lecturer) {
  return jwt.sign({ id: lecturer._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    const existing = await Lecturer.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    const lecturer = await Lecturer.create({ name, email, password, department });
    const token = signToken(lecturer);
    res.status(201).json({ token, lecturer });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const lecturer = await Lecturer.findOne({ email });
    if (!lecturer || !(await lecturer.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = signToken(lecturer);
    res.json({ token, lecturer });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const lecturer = await Lecturer.findById(req.lecturerId);
  if (!lecturer) return res.status(404).json({ message: "Lecturer not found" });
  res.json(lecturer);
});

router.put("/profile", requireAuth, async (req, res) => {
  try {
    const { name, email, department } = req.body;
    const lecturer = await Lecturer.findById(req.lecturerId);
    if (!lecturer) return res.status(404).json({ message: "Lecturer not found" });
    if (name !== undefined) lecturer.name = name;
    if (email !== undefined) lecturer.email = email;
    if (department !== undefined) lecturer.department = department;
    await lecturer.save();
    res.json(lecturer);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "That email is already in use" });
    }
    res.status(500).json({ message: "Could not update profile", error: err.message });
  }
});

module.exports = router;