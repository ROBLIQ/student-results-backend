require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes     = require("./routes/auth");
const courseRoutes   = require("./routes/courses");
const studentRoutes  = require("./routes/students");
const analysisRoutes = require("./routes/analysis");
const adminRoutes    = require("./routes/admin");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth",     authRoutes);
app.use("/api/courses",  courseRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/admin",    adminRoutes);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});